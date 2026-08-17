import 'dotenv/config';
import chokidar from 'chokidar';
import path from 'path';
import { openDb } from './db.js';
import { ingestFile, isSupported } from './ingest.js';

const PHOTO_DIR  = process.env.PHOTO_DIR  ?? './photos';
const DB_PATH    = process.env.DB_PATH    ?? './data/library.db';
const POSTER_DIR = process.env.POSTER_DIR ?? './data/posters';

const db = openDb(DB_PATH);

console.log(`[worker] watching ${path.resolve(PHOTO_DIR)}`);
console.log(`[worker] db at ${path.resolve(DB_PATH)} (${db.count()} photos indexed)`);

// Serial queue: chokidar fires many 'add' events at once on startup;
// process them one at a time to keep memory and I/O pressure low.
const queue = [];
let busy = false;

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length > 0) {
    const fp = queue.shift();
    try {
      await ingestFile(fp, db, POSTER_DIR);
    } catch (err) {
      console.error(`[worker] ${path.basename(fp)}: ${err.message}`);
    }
  }
  busy = false;
}

const watcher = chokidar.watch(PHOTO_DIR, {
  persistent: true,
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  ignored: /(^|[/\\])\../,   // skip dotfiles
});

watcher.on('add', (fp) => {
  if (!isSupported(fp)) return;
  queue.push(path.resolve(fp));
  drain();
});

watcher.on('unlink', (fp) => {
  const resolved = path.resolve(fp);
  db.removePhoto(resolved);
  console.log(`[worker] removed ${path.basename(fp)}`);
});

watcher.on('error', (err) => console.error('[worker] watcher error:', err));

process.on('SIGINT', () => {
  console.log('\n[worker] shutting down');
  watcher.close();
  process.exit(0);
});
