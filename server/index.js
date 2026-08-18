import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { openDb } from '../worker/db.js';
import { scan, getGroups } from './dedupe.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PORT       = parseInt(process.env.PORT       ?? '3000', 10);
const DB_PATH    = process.env.DB_PATH    ?? './data/library.db';
const POSTER_DIR = process.env.POSTER_DIR ?? './data/posters';

const app          = express();
const db           = openDb(DB_PATH);
const posterDirAbs = path.resolve(POSTER_DIR);

app.use(express.json());

// ── Photo Sync state ──────────────────────────────────────────────────────────

const syncJobs = {
  icloud: { running: false, lines: [], exitCode: null, startedAt: null, error: null },
  amazon: { running: false, lines: [], exitCode: null, startedAt: null, error: null },
};
const syncClients = new Set();

function pushSyncUpdate() {
  const payload = JSON.stringify(syncJobs);
  for (const res of syncClients) res.write(`data: ${payload}\n\n`);
}

function spawnAsync(command, args, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'pipe' });
    const onData = (chunk) => {
      chunk.toString().split('\n').filter(Boolean).forEach(onLine);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('close', resolve);
    proc.on('error', reject);
  });
}

function runSync(source, command, args) {
  const job = syncJobs[source];
  if (job.running) return false;
  job.running  = true;
  job.lines    = [];
  job.exitCode = null;
  job.startedAt = new Date().toISOString();
  job.error    = null;
  pushSyncUpdate();

  const addLine = (line) => {
    job.lines.push(line);
    if (job.lines.length > 500) job.lines = job.lines.slice(-500);
    pushSyncUpdate();
  };

  spawnAsync(command, args, addLine)
    .then(code => {
      job.running  = false;
      job.exitCode = code;
      if (code !== 0) job.error = `Exited with code ${code}`;
      pushSyncUpdate();
    })
    .catch(err => {
      job.running = false;
      job.error   = err.message;
      addLine(`Error: ${err.message}`);
      pushSyncUpdate();
    });

  return true;
}

async function runICloudSync(s) {
  const job = syncJobs.icloud;

  const addLine = (line) => {
    job.lines.push(line);
    if (job.lines.length > 500) job.lines = job.lines.slice(-500);
    pushSyncUpdate();
  };

  const baseArgs = ['--cookie-directory', s.icloud_cookie_dir, '--username', s.icloud_apple_id];
  if (s.icloud_password) baseArgs.push('--password', s.icloud_password);

  // Discover libraries
  addLine('Discovering libraries…');
  const discoveryLines = [];
  await spawnAsync('icloudpd', [...baseArgs, '--list-libraries'], (line) => {
    addLine(line);
    discoveryLines.push(line);
  });

  const libraries = discoveryLines
    .map(l => l.trim())
    .filter(l => /^[A-Za-z][A-Za-z0-9-]*$/.test(l));

  if (libraries.length === 0) {
    job.running  = false;
    job.exitCode = 1;
    job.error    = 'No libraries found';
    pushSyncUpdate();
    return;
  }

  addLine(`Found ${libraries.length} librar${libraries.length === 1 ? 'y' : 'ies'}: ${libraries.join(', ')}`);

  let exitCode = 0;
  for (const lib of libraries) {
    const dest = path.join(s.icloud_dest, lib);
    addLine(`\n── Syncing ${lib} → ${dest}`);
    const code = await spawnAsync('icloudpd', [
      ...baseArgs,
      '--directory', dest,
      '--library', lib,
    ], addLine);
    if (code !== 0) exitCode = code;
  }

  job.running  = false;
  job.exitCode = exitCode;
  if (exitCode !== 0) job.error = `Exited with code ${exitCode}`;
  pushSyncUpdate();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function posterUrl(storedPath) {
  if (!storedPath) return null;
  const rel = path.relative(posterDirAbs, path.resolve(storedPath));
  if (rel.startsWith('..')) return null;
  return '/posters/' + rel.replace(/\\/g, '/');
}

function mapPhoto(p) {
  return {
    id:            p.id,
    date_taken:    p.date_taken,
    date_imported: p.date_imported,
    camera_model:  p.camera_model,
    gps_lat:       p.gps_lat,
    gps_lon:       p.gps_lon,
    width:         p.width,
    height:        p.height,
    filesize:      p.filesize,
    starred:       p.starred === 1,
    place_city:    p.place_city    ?? null,
    place_country: p.place_country ?? null,
    thumb_url:     posterUrl(p.thumb_path),
    preview_url:   posterUrl(p.preview_path),
    media_type:    p.media_type    ?? 'photo',
    duration:      p.duration      ?? null,
  };
}

const VIDEO_MIME = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.3gp': 'video/3gpp',
};
function videoMime(fp) { return VIDEO_MIME[path.extname(fp).toLowerCase()] ?? 'video/octet-stream'; }

function badRequest(res, msg) { res.status(400).json({ error: msg }); }
function notFound(res)        { res.status(404).json({ error: 'not found' }); }

function buildFilter(q, from, to, tagId, collectionId, starred, city) {
  const joinParts  = [];
  const joinParams = [];
  const condParts  = [];
  const condParams = [];

  if (tagId) {
    joinParts.push('JOIN photo_tags _pt ON _pt.photo_id = p.id AND _pt.tag_id = ?');
    joinParams.push(parseInt(tagId, 10));
  }
  if (collectionId) {
    joinParts.push('JOIN photo_collections _pc ON _pc.photo_id = p.id AND _pc.collection_id = ?');
    joinParams.push(parseInt(collectionId, 10));
  }
  if (q) {
    condParts.push('(p.filepath LIKE ? OR p.camera_model LIKE ?)');
    condParams.push(`%${q}%`, `%${q}%`);
  }
  if (from)         { condParts.push('p.date_taken >= ?'); condParams.push(from); }
  if (to)           { condParts.push('p.date_taken <= ?'); condParams.push(to);   }
  if (starred === '1') condParts.push('p.starred = 1');
  if (city)            { condParts.push('p.place_city = ?'); condParams.push(city); }

  return {
    joinSql:  joinParts.join(' '),
    whereSql: condParts.length ? `WHERE ${condParts.join(' AND ')}` : '',
    params:   [...joinParams, ...condParams],
  };
}

// ── Static ────────────────────────────────────────────────────────────────────

app.use('/posters', express.static(posterDirAbs));

// ── Ingest status (SSE) ───────────────────────────────────────────────────────

app.get('/api/ingest/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',   // prevent nginx buffering
  });
  res.write('retry: 3000\n\n');

  const send = () => {
    const s = db.getIngestStatus();
    res.write(`data: ${JSON.stringify(s)}\n\n`);
  };

  send();
  const iv = setInterval(send, 1500);
  req.on('close', () => clearInterval(iv));
});

// ── Library stats ─────────────────────────────────────────────────────────────

app.get('/api/library/stats', (_req, res) => {
  const starred = db.raw.prepare('SELECT COUNT(*) AS n FROM photos WHERE starred = 1').get().n;
  const years   = db.raw.prepare(
    "SELECT strftime('%Y', date_taken) AS year, COUNT(*) AS count FROM photos WHERE date_taken IS NOT NULL GROUP BY year ORDER BY year DESC"
  ).all();
  const cities  = db.raw.prepare(
    "SELECT place_city AS city, place_country AS country, COUNT(*) AS count FROM photos WHERE place_city IS NOT NULL GROUP BY place_city ORDER BY count DESC LIMIT 100"
  ).all();
  res.json({
    total: db.count(),
    starred,
    years,
    cities,
    tags:        db.listAllTags(),
    collections: db.listCollections(),
  });
});

// ── Photos ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true, photos: db.count() }));

const SELECT_COLS = `
  p.id, p.thumb_path, p.preview_path, p.date_taken, p.date_imported,
  p.camera_model, p.gps_lat, p.gps_lon, p.width, p.height, p.filesize,
  p.starred, p.place_city, p.place_country, p.media_type, p.duration
`;

app.get('/api/photos', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit ?? '100', 10), 500);
  const cursor = req.query.cursor ?? null;
  const { q, from, to, tagId, collectionId, starred, city } = req.query;

  const { joinSql, whereSql, params } = buildFilter(q, from, to, tagId, collectionId, starred, city);

  // Exclude videos from the photo library — they have their own tab
  const photoOnlyClause = "(p.media_type IS NULL OR p.media_type = 'photo')";
  const fullWhere = whereSql ? `${whereSql} AND ${photoOnlyClause}` : `WHERE ${photoOnlyClause}`;

  let cursorSql    = '';
  const cursorParams = [];
  if (cursor) {
    const pipeAt     = cursor.lastIndexOf('|');
    const cursorDate = cursor.slice(0, pipeAt);
    const cursorId   = parseInt(cursor.slice(pipeAt + 1), 10);
    if (cursorDate === '') {
      cursorSql = `AND (p.date_taken IS NULL AND p.id < ?)`;
      cursorParams.push(cursorId);
    } else {
      cursorSql = `AND (p.date_taken < ? OR (p.date_taken = ? AND p.id < ?) OR p.date_taken IS NULL)`;
      cursorParams.push(cursorDate, cursorDate, cursorId);
    }
  }

  const allParams = [...params, ...cursorParams, limit + 1];
  const sql       = `SELECT ${SELECT_COLS} FROM photos p ${joinSql} ${fullWhere} ${cursorSql}
                     ORDER BY p.date_taken DESC, p.id DESC LIMIT ?`;
  const rows      = db.raw.prepare(sql).all(allParams);

  const countSql  = `SELECT COUNT(*) AS n FROM photos p ${joinSql} ${fullWhere}`;
  const total     = db.raw.prepare(countSql).get(params).n;

  const hasMore    = rows.length > limit;
  const page       = rows.slice(0, limit);
  const last       = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.date_taken ?? ''}|${last.id}` : null;

  res.json({ photos: page.map(mapPhoto), nextCursor, total });
});

app.get('/api/photos/map', (_req, res) => {
  const rows = db.raw.prepare(`
    SELECT id, gps_lat, gps_lon, thumb_path, preview_path, date_taken
    FROM photos WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL
  `).all();
  res.json(rows.map(r => ({
    id:          r.id,
    lat:         r.gps_lat,
    lon:         r.gps_lon,
    date_taken:  r.date_taken,
    thumb_url:   posterUrl(r.thumb_path),
    preview_url: posterUrl(r.preview_path),
  })));
});

app.get('/api/photos/:id', (req, res) => {
  const row = db.raw.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  res.json({
    ...mapPhoto(row),
    filepath:    row.filepath,
    phash:       row.phash,
    tags:        db.getPhotoTags(row.id),
    collections: db.getPhotoCollections(row.id),
  });
});

app.patch('/api/photos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if ('starred' in req.body) {
    db.raw.prepare('UPDATE photos SET starred = ? WHERE id = ?').run(req.body.starred ? 1 : 0, id);
  }
  const row = db.raw.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  if (!row) return notFound(res);
  res.json(mapPhoto(row));
});

// ── Tags ──────────────────────────────────────────────────────────────────────

app.get('/api/tags', (_req, res) => res.json(db.listAllTags()));

app.post('/api/photos/:id/tags', (req, res) => {
  const photoId = parseInt(req.params.id, 10);
  const name    = (req.body.name ?? '').trim().slice(0, 100);
  if (!name) return badRequest(res, 'name required');
  res.status(201).json(db.addTagToPhoto(photoId, name));
});

app.delete('/api/photos/:id/tags/:tagId', (req, res) => {
  db.removeTagFromPhoto(parseInt(req.params.id, 10), parseInt(req.params.tagId, 10));
  res.sendStatus(204);
});

// ── Collections ───────────────────────────────────────────────────────────────

app.get('/api/collections', (_req, res) => res.json(db.listCollections()));

app.post('/api/collections', (req, res) => {
  const name = (req.body.name ?? '').trim().slice(0, 200);
  if (!name) return badRequest(res, 'name required');
  try {
    res.status(201).json(db.createCollection(name, req.body.description));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return badRequest(res, 'collection already exists');
    throw e;
  }
});

app.post('/api/photos/:id/collections', (req, res) => {
  const colId = parseInt(req.body.collectionId, 10);
  if (!colId) return badRequest(res, 'collectionId required');
  db.addPhotoToCollection(parseInt(req.params.id, 10), colId);
  res.sendStatus(204);
});

app.delete('/api/photos/:id/collections/:colId', (req, res) => {
  db.removePhotoFromCollection(parseInt(req.params.id, 10), parseInt(req.params.colId, 10));
  res.sendStatus(204);
});

// ── Duplicates ────────────────────────────────────────────────────────────────

app.post('/api/dedupe/scan', (_req, res) => {
  try {
    const { dedupe_threshold } = db.getSettings();
    res.json(scan(db, dedupe_threshold));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/duplicates', (_req, res) => {
  const rawGroups = getGroups(db);
  const groups = rawGroups.map(group =>
    group.map(p => ({
      id:           p.id,
      date_taken:   p.date_taken,
      filesize:     p.filesize,
      width:        p.width,
      height:       p.height,
      camera_model: p.camera_model,
      thumb_url:    posterUrl(p.thumb_path),
      preview_url:  posterUrl(p.preview_path),
    }))
  );
  res.json({ groups, total: groups.length });
});

app.post('/api/duplicates/dismiss', (req, res) => {
  const ids = req.body.photoIds;
  if (!Array.isArray(ids) || ids.length < 2) return badRequest(res, 'photoIds must be array of ≥2');
  db.dismissDuplicates(ids.map(Number));
  res.sendStatus(204);
});

// ── Photo Sync ────────────────────────────────────────────────────────────────

app.get('/api/sync/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`data: ${JSON.stringify(syncJobs)}\n\n`);
  syncClients.add(res);
  req.on('close', () => syncClients.delete(res));
});

app.post('/api/sync/icloud', (_req, res) => {
  const s = db.getSettings();
  if (!s.icloud_apple_id) return badRequest(res, 'Apple ID not configured');

  const job = syncJobs.icloud;
  if (job.running) return res.status(409).json({ error: 'Sync already running' });

  job.running   = true;
  job.lines     = [];
  job.exitCode  = null;
  job.startedAt = new Date().toISOString();
  job.error     = null;
  pushSyncUpdate();

  runICloudSync(s).catch(err => {
    job.running = false;
    job.error   = err.message;
    job.lines.push(`Error: ${err.message}`);
    pushSyncUpdate();
  });

  res.json({ ok: true });
});

app.post('/api/sync/amazon', (_req, res) => {
  const s = db.getSettings();
  if (!s.amazon_cookie_file) return badRequest(res, 'Cookie file not configured');

  const scriptPath = path.join(path.dirname(__dirname), 'scripts', 'amazon_sync.py');
  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ error: 'amazon_sync.py not found in /app/scripts/' });
  }

  if (!runSync('amazon', 'python3', [scriptPath, s.amazon_cookie_file, s.amazon_dest])) {
    return res.status(409).json({ error: 'Sync already running' });
  }
  res.json({ ok: true });
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => res.json(db.getSettings()));

const NUMERIC_SETTING_KEYS = new Set(['thumb_size', 'thumb_quality', 'preview_size', 'preview_quality', 'dedupe_threshold']);
const STRING_SETTING_KEYS  = new Set(['icloud_apple_id', 'icloud_password', 'icloud_dest', 'icloud_cookie_dir', 'amazon_cookie_file', 'amazon_dest']);
const BOOL_SETTING_KEYS    = new Set(['icloud_enabled', 'amazon_enabled']);

app.patch('/api/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    if (NUMERIC_SETTING_KEYS.has(key)) {
      const n = parseInt(value, 10);
      if (!isNaN(n)) db.setSetting(key, n);
    } else if (STRING_SETTING_KEYS.has(key)) {
      db.setSetting(key, String(value ?? ''));
    } else if (BOOL_SETTING_KEYS.has(key)) {
      db.setSetting(key, value ? '1' : '0');
    }
  }
  res.json(db.getSettings());
});

// ── Watch folders ─────────────────────────────────────────────────────────────

app.get('/api/watch-folders', (_req, res) => res.json(db.listWatchFolders()));

app.post('/api/watch-folders', (req, res) => {
  const p = (req.body.path ?? '').trim();
  if (!p) return badRequest(res, 'path required');
  db.addWatchFolder(p);
  res.status(201).json(db.listWatchFolders());
});

app.delete('/api/watch-folders/:id', (req, res) => {
  db.removeWatchFolder(parseInt(req.params.id, 10));
  res.sendStatus(204);
});

app.patch('/api/watch-folders/:id', (req, res) => {
  db.toggleWatchFolder(parseInt(req.params.id, 10), req.body.enabled);
  res.json(db.listWatchFolders());
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.post('/api/admin/clear-dismissals', (_req, res) => {
  db.raw.prepare('UPDATE duplicate_pairs SET dismissed = 0').run();
  res.sendStatus(204);
});

// ── Videos ────────────────────────────────────────────────────────────────────

app.get('/api/videos/stats', (_req, res) => {
  const total  = db.raw.prepare("SELECT COUNT(*) AS n FROM photos WHERE media_type = 'video'").get().n;
  const years  = db.raw.prepare(
    "SELECT strftime('%Y', date_taken) AS year, COUNT(*) AS count FROM photos WHERE media_type = 'video' AND date_taken IS NOT NULL GROUP BY year ORDER BY year DESC"
  ).all();
  const cities = db.raw.prepare(
    "SELECT place_city AS city, place_country AS country, COUNT(*) AS count FROM photos WHERE media_type = 'video' AND place_city IS NOT NULL GROUP BY place_city ORDER BY count DESC LIMIT 100"
  ).all();
  res.json({ total, years, cities, starred: 0, tags: [], collections: [] });
});

app.get('/api/videos', (req, res) => {
  const { from, to, city } = req.query;
  const conditions = ["p.media_type = 'video'"];
  const params = [];
  if (from) { conditions.push('p.date_taken >= ?'); params.push(from); }
  if (to)   { conditions.push('p.date_taken <= ?'); params.push(to); }
  if (city) { conditions.push('p.place_city = ?');  params.push(city); }
  const where = 'WHERE ' + conditions.join(' AND ');
  const rows = db.raw.prepare(
    `SELECT ${SELECT_COLS} FROM photos p ${where} ORDER BY p.date_taken DESC, p.id DESC`
  ).all(...params);
  res.json({ videos: rows.map(mapPhoto), total: rows.length });
});

app.get('/api/photos/:id/video', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const row = db.raw.prepare('SELECT filepath, media_type FROM photos WHERE id = ?').get(id);
  if (!row || row.media_type !== 'video') return notFound(res);
  if (!fs.existsSync(row.filepath)) return notFound(res);

  const total = fs.statSync(row.filepath).size;
  const mime  = videoMime(row.filepath);
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(row.filepath).pipe(res);
    return;
  }

  const [s, e] = range.replace(/bytes=/, '').split('-');
  const start  = parseInt(s, 10);
  const end    = e ? parseInt(e, 10) : Math.min(start + 4 * 1024 * 1024 - 1, total - 1);
  res.writeHead(206, {
    'Content-Range':  `bytes ${start}-${end}/${total}`,
    'Accept-Ranges':  'bytes',
    'Content-Length': end - start + 1,
    'Content-Type':   mime,
  });
  fs.createReadStream(row.filepath, { start, end }).pipe(res);
});

// ── Memories (photos on this day) ─────────────────────────────────────────────

app.get('/api/memories/today', (req, res) => {
  // Client sends its local date as YYYY-MM-DD so Docker's UTC clock doesn't cause off-by-one
  const date = req.query.date ?? new Date().toISOString().slice(0, 10);
  const monthDay = date.slice(5); // "MM-DD"
  const rows = db.raw.prepare(`
    SELECT ${SELECT_COLS}
    FROM photos p
    WHERE p.date_taken IS NOT NULL
      AND strftime('%m-%d', p.date_taken) = ?
    ORDER BY p.date_taken ASC
  `).all(monthDay);
  res.json({ photos: rows.map(mapPhoto) });
});

// ── Filesystem browser ────────────────────────────────────────────────────────

app.get('/api/fs/browse', (req, res) => {
  const raw = (req.query.path ?? '/photos').replace(/\0/g, '');
  const dir = path.resolve('/', raw);   // normalize — prevents traversal via ../../
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.status(404).json({ error: 'not a directory' });
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return res.status(403).json({ error: 'permission denied' });
  }
  const dirs   = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));
  const parent = dir === '/' ? null : path.dirname(dir);
  res.json({ path: dir, parent, dirs });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get(/^(?!\/api|\/posters)/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  (${db.count()} photos)`);
});
