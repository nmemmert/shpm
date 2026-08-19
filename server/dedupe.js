import { hammingDistance } from '../worker/hash.js';

// Chunk size for the outer loop — yields to the event loop between chunks
// so the server stays responsive during a long scan.
const SCAN_CHUNK = 50;

// dHash is 64 bits. A near-uniform image (solid color, blank shot, sand
// close-up) has almost no gradient transitions so its hash has very few
// or very many bits set. These images match many unrelated photos and
// produce false positives. Require 8–56 set bits out of 64 (12–87% density).
function popcount16hex(hex) {
  let n = (parseInt(hex.slice(0, 8), 16) >>> 0);
  let m = (parseInt(hex.slice(8),    16) >>> 0);
  const pc = x => { x -= (x >> 1) & 0x55555555; x = (x & 0x33333333) + ((x >> 2) & 0x33333333); x = (x + (x >> 4)) & 0x0f0f0f0f; return Math.imul(x, 0x01010101) >>> 24; };
  return pc(n) + pc(m);
}

function hasGoodEntropy(phash) {
  const bits = popcount16hex(phash);
  return bits >= 8 && bits <= 56;
}

export async function scan(db, threshold) {
  const THRESHOLD = threshold ?? parseInt(process.env.DEDUPE_THRESHOLD ?? '3', 10);
  const start = Date.now();

  // Clear all existing pairs so the result exactly matches the current threshold.
  // Dismissed pairs are also cleared — a fresh scan is a clean slate.
  db.raw.prepare('DELETE FROM duplicate_pairs').run();

  const allPhotos = db.raw.prepare(
    "SELECT id, phash FROM photos WHERE phash IS NOT NULL AND phash != '0000000000000000'"
  ).all();

  // Skip near-uniform images — their hashes are unreliable and cause false matches
  const photos = allPhotos.filter(p => hasGoodEntropy(p.phash));

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

  return { photos: allPhotos.length, compared: photos.length, newPairs, duration: Date.now() - start };
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

  const allIds = [...new Set(pairs.flatMap(p => [p.photo_id_a, p.photo_id_b]))];
  const rows   = fetchPhotosByIds(db, allIds);
  const photoMap = new Map(rows.map(r => [r.id, r]));

  // Return each pair as its own 2-photo group.
  // Union-find chaining caused false "5000-photo" mega-groups through
  // transitivity (A≈B and B≈C ≠ A≈C). Individual pairs are always accurate.
  return pairs
    .map(({ photo_id_a, photo_id_b }) =>
      [photoMap.get(photo_id_a), photoMap.get(photo_id_b)].filter(Boolean)
    )
    .filter(g => g.length === 2);
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
