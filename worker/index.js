import 'dotenv/config';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import exifr from 'exifr';
import { openDb } from './db.js';
import { ingestFile, isSupported } from './ingest.js';
import { reverseGeocode } from './geocode.js';

const PHOTO_DIR  = process.env.PHOTO_DIR  ?? null;
const DB_PATH    = process.env.DB_PATH    ?? './data/library.db';
const POSTER_DIR = process.env.POSTER_DIR ?? './data/posters';

const db = openDb(DB_PATH);

// Seed PHOTO_DIR env var as the first watch folder (if set)
if (PHOTO_DIR) {
  const resolved = path.resolve(PHOTO_DIR);
  if (fs.existsSync(resolved)) db.addWatchFolder(resolved);
}

// Load all known filepaths into memory so the initial chokidar burst skips
// already-indexed files without touching the drain queue.
const indexed = new Set(
  db.raw.prepare('SELECT filepath FROM photos').all().map(r => r.filepath)
);

console.log(`[worker] db at ${path.resolve(DB_PATH)} (${indexed.size} photos indexed)`);

const queue = [];
let busy    = false;
let scanned = 0;
let errors  = 0;

async function drain() {
  if (busy) return;
  busy = true;
  db.setIngestStatus({ active: true, scanned, errors });

  while (queue.length > 0) {
    const fp       = queue.shift();
    const settings = db.getSettings();
    try {
      await ingestFile(fp, db, POSTER_DIR, settings);
      indexed.add(fp);
      scanned++;
      db.setIngestStatus({ active: true, current: path.basename(fp), scanned, errors });
    } catch (err) {
      errors++;
      console.error(`[worker] ${path.basename(fp)}: ${err.message}`);
      db.setIngestStatus({ active: true, current: path.basename(fp), scanned, errors });
    }
  }

  db.setIngestStatus({ active: false, current: null, scanned, errors });
  busy = false;
}

// Single chokidar instance — paths are added/removed dynamically
const watcher = chokidar.watch([], {
  persistent: true,
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  ignored: /(^|[/\\])\../,
});

watcher.on('add', (fp) => {
  if (!isSupported(fp)) return;
  const resolved = path.resolve(fp);
  if (indexed.has(resolved)) return;
  queue.push(resolved);
  drain();
});

watcher.on('unlink', (fp) => {
  const resolved = path.resolve(fp);
  indexed.delete(resolved);
  db.removePhoto(resolved);
  console.log(`[worker] removed ${path.basename(fp)}`);
});

watcher.on('error', (err) => console.error('[worker] watcher error:', err));

// Sync watched paths against watch_folders table
const watching = new Set();

function syncWatchFolders() {
  const folders = db.listWatchFolders().filter(f => f.enabled);

  for (const { path: p } of folders) {
    if (!watching.has(p)) {
      console.log(`[worker] watching ${p}`);
      watcher.add(p);
      watching.add(p);
    }
  }

  const enabledPaths = new Set(folders.map(f => f.path));
  for (const p of watching) {
    if (!enabledPaths.has(p)) {
      console.log(`[worker] stopped watching ${p}`);
      watcher.unwatch(p);
      watching.delete(p);
    }
  }
}

// Initial sync then poll every 30s for UI-added folders
syncWatchFolders();
setInterval(syncWatchFolders, 30_000);

// Backfill GPS for photos indexed before the exifr pick-filter bug was fixed
async function backfillGps() {
  const rows = db.raw.prepare(
    "SELECT id, filepath FROM photos WHERE gps_lat IS NULL"
  ).all().filter(r => fs.existsSync(r.filepath));

  if (rows.length === 0) return;
  console.log(`[worker] GPS backfill: checking ${rows.length} photos`);

  const updateStmt = db.raw.prepare(
    'UPDATE photos SET gps_lat = ?, gps_lon = ?, place_city = ?, place_country = ? WHERE id = ?'
  );

  let updated = 0;
  for (const { id, filepath } of rows) {
    try {
      const gps = await exifr.gps(filepath);
      if (gps?.latitude == null) continue;
      let city = null, country = null;
      try {
        const place = await reverseGeocode(gps.latitude, gps.longitude);
        city    = place?.city    ?? null;
        country = place?.country ?? null;
      } catch {}
      updateStmt.run(gps.latitude, gps.longitude, city, country, id);
      updated++;
    } catch {}
  }

  if (updated > 0) console.log(`[worker] GPS backfill: updated ${updated} photos with location data`);
}

setTimeout(backfillGps, 5000);

process.on('SIGINT', () => {
  console.log('\n[worker] shutting down');
  db.setIngestStatus({ active: false, current: null, scanned, errors });
  watcher.close();
  process.exit(0);
});
