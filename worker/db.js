import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath       TEXT    NOT NULL UNIQUE,
      thumb_path     TEXT,
      preview_path   TEXT,
      date_taken     TEXT,
      date_imported  TEXT    NOT NULL,
      camera_model   TEXT,
      gps_lat        REAL,
      gps_lon        REAL,
      phash          TEXT,
      width          INTEGER,
      height         INTEGER,
      filesize       INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON photos(date_taken);
    CREATE INDEX IF NOT EXISTS idx_photos_phash      ON photos(phash);

    CREATE TABLE IF NOT EXISTS collections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      poster_path TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photo_collections (
      photo_id      INTEGER NOT NULL REFERENCES photos(id)      ON DELETE CASCADE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (photo_id, collection_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS photo_tags (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (photo_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS duplicate_pairs (
      photo_id_a INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      photo_id_b INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      distance   INTEGER NOT NULL,
      dismissed  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (photo_id_a, photo_id_b),
      CHECK (photo_id_a < photo_id_b)
    );
  `);

  const s = {
    // Photos
    insert:   db.prepare(`
      INSERT OR IGNORE INTO photos
        (filepath, thumb_path, preview_path, date_taken, date_imported,
         camera_model, gps_lat, gps_lon, phash, width, height, filesize)
      VALUES
        (@filepath, @thumb_path, @preview_path, @date_taken, @date_imported,
         @camera_model, @gps_lat, @gps_lon, @phash, @width, @height, @filesize)
    `),
    exists:   db.prepare('SELECT 1 FROM photos WHERE filepath = ? LIMIT 1'),
    remove:   db.prepare('DELETE FROM photos WHERE filepath = ?'),
    count:    db.prepare('SELECT COUNT(*) AS n FROM photos'),

    // Tags
    tagByName:  db.prepare('SELECT id, name FROM tags WHERE name = ?'),
    tagInsert:  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)'),
    tagList:    db.prepare(`
      SELECT t.id, t.name, COUNT(pt.photo_id) AS count
      FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id
      GROUP BY t.id ORDER BY t.name
    `),
    tagOfPhoto: db.prepare(
      'SELECT t.id, t.name FROM tags t JOIN photo_tags pt ON pt.tag_id = t.id WHERE pt.photo_id = ? ORDER BY t.name'
    ),
    tagAttach:  db.prepare('INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)'),
    tagDetach:  db.prepare('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?'),

    // Collections
    colList:    db.prepare(`
      SELECT c.id, c.name, c.description, c.created_at,
             COUNT(pc.photo_id) AS photo_count
      FROM collections c
      LEFT JOIN photo_collections pc ON pc.collection_id = c.id
      GROUP BY c.id ORDER BY c.name
    `),
    colInsert:  db.prepare('INSERT INTO collections (name, description) VALUES (?, ?)'),
    colOfPhoto: db.prepare(
      'SELECT c.id, c.name FROM collections c JOIN photo_collections pc ON pc.collection_id = c.id WHERE pc.photo_id = ? ORDER BY c.name'
    ),
    colAdd:     db.prepare('INSERT OR IGNORE INTO photo_collections (photo_id, collection_id) VALUES (?, ?)'),
    colRemove:  db.prepare('DELETE FROM photo_collections WHERE photo_id = ? AND collection_id = ?'),

    // Duplicates
    dupePairs:   db.prepare(
      'SELECT photo_id_a, photo_id_b, distance FROM duplicate_pairs WHERE dismissed = 0'
    ),
    dupePairCount: db.prepare(
      'SELECT COUNT(*) AS n FROM duplicate_pairs WHERE dismissed = 0'
    ),
  };

  const addTagTx = db.transaction((photoId, tagName) => {
    s.tagInsert.run(tagName);
    const tag = s.tagByName.get(tagName);
    s.tagAttach.run(photoId, tag.id);
    return tag;
  });

  return {
    raw: db,

    // Photos
    insertPhoto: (row) => s.insert.run(row),
    hasPhoto:    (fp)  => !!s.exists.get(fp),
    removePhoto: (fp)  => s.remove.run(fp),
    count:       ()    => s.count.get().n,

    // Tags
    addTagToPhoto:      (photoId, tagName) => addTagTx(photoId, tagName),
    removeTagFromPhoto: (photoId, tagId)   => s.tagDetach.run(photoId, tagId),
    getPhotoTags:       (photoId)          => s.tagOfPhoto.all(photoId),
    listAllTags:        ()                 => s.tagList.all(),

    // Collections
    listCollections: () => s.colList.all(),
    createCollection: (name, desc) => {
      const info = s.colInsert.run(name, desc ?? null);
      return { id: info.lastInsertRowid, name, description: desc ?? null };
    },
    addPhotoToCollection:     (photoId, colId) => s.colAdd.run(photoId, colId),
    removePhotoFromCollection:(photoId, colId) => s.colRemove.run(photoId, colId),
    getPhotoCollections:      (photoId)        => s.colOfPhoto.all(photoId),

    // Duplicates
    getDupePairs: () => s.dupePairs.all(),
    dismissDuplicates: (ids) => {
      const ph = ids.map(() => '?').join(',');
      db.prepare(
        `UPDATE duplicate_pairs SET dismissed = 1
         WHERE photo_id_a IN (${ph}) AND photo_id_b IN (${ph})`
      ).run(...ids, ...ids);
    },
  };
}
