import 'dotenv/config';
import chokidar from 'chokidar';
import path from 'path';
import { openDb } from './db.js';
import { ingestFile, isSupported } from './ingest.js';

const PHOTO_DIR  = process.env.PHOTO_DIR  ?? './photos';
const DB_PATH    = process.env.DB_PATH    ?? './data/library.db';
const POSTER_DIR = process.env.POSTER_DIR ?? './data/posters';

const db = openDb(DB_PATH);

// Load all known paths into memory once so chokidar's initial 'add' burst
// for an already-indexed library costs one bulk query instead of N serial
// DB lookups through the drain queue.
const indexed = new Set(
  db.raw.prepare('SELECT filepath FROM photos').all().map(r => r.filepath)
);

console.log(`[worker] watching ${path.resolve(PHOTO_DIR)}`);
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
    const fp = queue.shift();
    try {
      await ingestFile(fp, db, POSTER_DIR);
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

const watcher = chokidar.watch(PHOTO_DIR, {
  persistent: true,
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  ignored: /(^|[/\\])\../,
});

watcher.on('add', (fp) => {
  if (!isSupported(fp)) return;
  const resolved = path.resolve(fp);
  if (indexed.has(resolved)) return;   // already in DB — skip entirely
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

process.on('SIGINT', () => {
  console.log('\n[worker] shutting down');
  db.setIngestStatus({ active: false, current: null, scanned, errors });
  watcher.close();
  process.exit(0);
});
