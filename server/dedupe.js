import { hammingDistance } from '../worker/hash.js';

// Chunk size for the outer loop — yields to the event loop between chunks
// so the server stays responsive during a long scan.
const SCAN_CHUNK = 50;

export async function scan(db, threshold) {
  const THRESHOLD = threshold ?? parseInt(process.env.DEDUPE_THRESHOLD ?? '10', 10);
  const start = Date.now();

  const photos = db.raw.prepare(
    "SELECT id, phash FROM photos WHERE phash IS NOT NULL AND phash != '0000000000000000'"
  ).all();

  const insert = db.raw.prepare(
    'INSERT OR IGNORE INTO duplicate_pairs (photo_id_a, photo_id_b, distance) VALUES (?, ?, ?)'
  );

  let newPairs = 0;

  for (let i = 0; i < photos.length; i += SCAN_CHUNK) {
    await new Promise(resolve => setImmediate(resolve));
    const end = Math.min(i + SCAN_CHUNK, photos.length);

    db.raw.transaction(() => {
      for (let ii = i; ii < end; ii++) {
        for (let j = ii + 1; j < photos.length; j++) {
          const dist = hammingDistance(photos[ii].phash, photos[j].phash);
          if (dist <= THRESHOLD) {
            const r = insert.run(photos[ii].id, photos[j].id, dist);
            if (r.changes) newPairs++;
          }
        }
      }
    })();
  }

  return { photos: photos.length, newPairs, duration: Date.now() - start };
}

const ID_BATCH = 900;

function fetchPhotosByIds(db, ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const batch = ids.slice(i, i + ID_BATCH);
    const got = db.raw.prepare(
      `SELECT id, thumb_path, preview_path, date_taken, filesize, width, height, camera_model
       FROM photos WHERE id IN (${batch.map(() => '?').join(',')})`
    ).all(batch);
    rows.push(...got);
  }
  return rows;
}

export function getGroups(db) {
  const pairs = db.getDupePairs();
  if (!pairs.length) return [];

  const parent = new Map();

  function find(x) {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  }

  function union(a, b) { parent.set(find(a), find(b)); }

  for (const { photo_id_a, photo_id_b } of pairs) union(photo_id_a, photo_id_b);
  for (const id of [...parent.keys()]) find(id);

  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }

  const allIds = [...parent.keys()];
  const rows   = fetchPhotosByIds(db, allIds);
  const photoMap = new Map(rows.map(r => [r.id, r]));

  return [...groups.values()]
    .filter(ids => ids.length >= 2)
    .map(ids => ids.map(id => photoMap.get(id)).filter(Boolean))
    .sort((a, b) => b.length - a.length);
}

export function scoreDuplicate(photo) {
  const pixels = (photo.width || 0) * (photo.height || 0);
  const size   = photo.filesize || 0;
  const hasExif = photo.camera_model ? 1 : 0;
  return pixels * 1e6 + size + hasExif * 1e3;
}

export function keepBest(db, photoIds) {
  const ids = photoIds.map(Number);
  const photos = fetchPhotosByIds(db, ids);
  if (photos.length < 2) return null;

  photos.sort((a, b) => scoreDuplicate(b) - scoreDuplicate(a));
  const keeper = photos[0];
  const discard = photos.slice(1);

  db.raw.transaction(() => {
    for (const p of discard) {
      db.raw.prepare('UPDATE photos SET deleted = 1 WHERE id = ?').run(p.id);
    }
  })();

  db.dismissDuplicates(ids);
  return { kept: keeper.id, deleted: discard.map(p => p.id) };
}
