import { hammingDistance } from '../worker/hash.js';

export function scan(db, threshold) {
  const THRESHOLD = threshold ?? parseInt(process.env.DEDUPE_THRESHOLD ?? '10', 10);
  const start = Date.now();

  const photos = db.raw.prepare(
    "SELECT id, phash FROM photos WHERE phash IS NOT NULL AND phash != '0000000000000000'"
  ).all();

  const insert = db.raw.prepare(
    'INSERT OR IGNORE INTO duplicate_pairs (photo_id_a, photo_id_b, distance) VALUES (?, ?, ?)'
  );

  let newPairs = 0;
  db.raw.transaction(() => {
    for (let i = 0; i < photos.length; i++) {
      for (let j = i + 1; j < photos.length; j++) {
        const dist = hammingDistance(photos[i].phash, photos[j].phash);
        if (dist <= THRESHOLD) {
          const r = insert.run(photos[i].id, photos[j].id, dist);
          if (r.changes) newPairs++;
        }
      }
    }
  })();

  return { photos: photos.length, newPairs, duration: Date.now() - start };
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
  const rows   = db.raw.prepare(
    `SELECT id, thumb_path, preview_path, date_taken, filesize, width, height, camera_model
     FROM photos WHERE id IN (${allIds.map(() => '?').join(',')})`
  ).all(allIds);

  const photoMap = new Map(rows.map(r => [r.id, r]));

  return [...groups.values()]
    .filter(ids => ids.length >= 2)
    .map(ids => ids.map(id => photoMap.get(id)).filter(Boolean))
    .sort((a, b) => b.length - a.length);
}
