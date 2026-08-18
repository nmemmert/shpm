import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac', '.opus', '.wma']);

// Genre keywords → mood (case-insensitive substring match, first hit wins)
const UPBEAT_KEYS = ['rock', 'pop', 'dance', 'electronic', 'hip hop', 'hip-hop', 'r&b', 'rnb',
                     'reggae', 'funk', 'disco', 'punk', 'metal', 'latin', 'techno', 'house',
                     'edm', 'trap', 'country'];
const DREAMY_KEYS = ['ambient', 'classical', 'chill', 'lounge', 'jazz', 'new age', 'folk',
                     'acoustic', 'meditation', 'sleep', 'indie folk', 'singer-songwriter', 'blues',
                     'orchestral', 'soundtrack', 'cinematic'];

function classifyMood(bpm, genre) {
  if (bpm != null) {
    if (bpm >= 120) return 'upbeat';
    if (bpm >= 80)  return 'cinematic';
    return 'dreamy';
  }
  if (genre) {
    const g = genre.toLowerCase();
    if (UPBEAT_KEYS.some(k => g.includes(k))) return 'upbeat';
    if (DREAMY_KEYS.some(k => g.includes(k))) return 'dreamy';
    return 'cinematic';
  }
  return 'general'; // no tags — all moods can use
}

function* walkDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkDir(full);
    else if (AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) yield full;
  }
}

export let musicScanActive = false;

export function initMusicTable(db) {
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS music (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath   TEXT NOT NULL UNIQUE,
      title      TEXT,
      artist     TEXT,
      album      TEXT,
      bpm        REAL,
      genre      TEXT,
      duration   REAL,
      mood       TEXT NOT NULL DEFAULT 'general',
      scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_music_mood ON music(mood);
  `);
}

export async function scanMusicLibrary(musicDir, db) {
  if (musicScanActive) return 0;
  musicScanActive = true;
  initMusicTable(db);

  const hasTrack = db.raw.prepare('SELECT 1 FROM music WHERE filepath = ? LIMIT 1');
  const insert   = db.raw.prepare(`
    INSERT OR IGNORE INTO music (filepath, title, artist, album, bpm, genre, duration, mood)
    VALUES (@filepath, @title, @artist, @album, @bpm, @genre, @duration, @mood)
  `);

  let added = 0;
  try {
    for (const fp of walkDir(path.resolve(musicDir))) {
      if (hasTrack.get(fp)) continue;
      try {
        const { common, format } = await parseFile(fp, { duration: true, skipCovers: true });
        const bpm   = common.bpm ?? null;
        const genre = common.genre?.[0] ?? null;
        insert.run({
          filepath: fp,
          title:    common.title  ?? path.basename(fp, path.extname(fp)),
          artist:   common.artist ?? null,
          album:    common.album  ?? null,
          bpm, genre, duration: format.duration ?? null,
          mood: classifyMood(bpm, genre),
        });
        added++;
      } catch {}
    }
  } finally {
    musicScanActive = false;
  }
  return added;
}
