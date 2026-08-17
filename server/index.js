import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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
    thumb_url:     posterUrl(p.thumb_path),
    preview_url:   posterUrl(p.preview_path),
  };
}

function badRequest(res, msg) { res.status(400).json({ error: msg }); }
function notFound(res)        { res.status(404).json({ error: 'not found' }); }

// Build SQL parts for the photo list query based on active filters.
// Returns { joinSql, whereSql, params } where params covers joins then where clauses.
function buildFilter(q, from, to, tagId, collectionId) {
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
  if (from) { condParts.push('p.date_taken >= ?'); condParams.push(from); }
  if (to)   { condParts.push('p.date_taken <= ?'); condParams.push(to);   }

  return {
    joinSql: joinParts.join(' '),
    whereSql: condParts.length ? `WHERE ${condParts.join(' AND ')}` : '',
    params: [...joinParams, ...condParams],
  };
}

// ── Static ────────────────────────────────────────────────────────────────────

app.use('/posters', express.static(posterDirAbs));

// ── Photos ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, photos: db.count() });
});

const SELECT_COLS = `
  p.id, p.thumb_path, p.preview_path, p.date_taken, p.date_imported,
  p.camera_model, p.gps_lat, p.gps_lon, p.width, p.height, p.filesize
`;

app.get('/api/photos', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit ?? '100', 10), 500);
  const cursor = req.query.cursor ?? null;
  const { q, from, to, tagId, collectionId } = req.query;

  const { joinSql, whereSql, params } = buildFilter(q, from, to, tagId, collectionId);

  // Cursor condition — handles null dates correctly (NULLs sort last in DESC).
  // When cursor_date is a real date: include photos before it AND all null-dated ones.
  // When cursor_date is empty (we're in the null section): only null-dated with lower id.
  let cursorSql = '';
  const cursorParams = [];
  if (cursor) {
    const pipeAt = cursor.lastIndexOf('|');
    const cursorDate = cursor.slice(0, pipeAt);
    const cursorId   = parseInt(cursor.slice(pipeAt + 1), 10);
    if (cursorDate === '') {
      cursorSql = whereSql
        ? 'AND (p.date_taken IS NULL AND p.id < ?)'
        : 'WHERE (p.date_taken IS NULL AND p.id < ?)';
      cursorParams.push(cursorId);
    } else {
      const clause = '(p.date_taken < ? OR (p.date_taken = ? AND p.id < ?) OR p.date_taken IS NULL)';
      cursorSql = whereSql ? `AND ${clause}` : `WHERE ${clause}`;
      cursorParams.push(cursorDate, cursorDate, cursorId);
    }
  }

  const allParams = [...params, ...cursorParams, limit + 1];

  const sql = `SELECT ${SELECT_COLS} FROM photos p ${joinSql} ${whereSql} ${cursorSql}
               ORDER BY p.date_taken DESC, p.id DESC LIMIT ?`;
  const rows = db.raw.prepare(sql).all(allParams);

  const countSql = `SELECT COUNT(*) AS n FROM photos p ${joinSql} ${whereSql}`;
  const total = db.raw.prepare(countSql).get(params).n;

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
  try { res.json(scan(db)); }
  catch (e) { res.status(500).json({ error: e.message }); }
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

// ── SPA fallback ──────────────────────────────────────────────────────────────

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get(/^(?!\/api|\/posters)/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  (${db.count()} photos)`);
});
