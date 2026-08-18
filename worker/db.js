import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const SETTING_DEFAULTS = {
  thumb_size:        '400',
  thumb_quality:     '80',
  preview_size:      '1600',
  preview_quality:   '85',
  dedupe_threshold:  '10',
  // iCloud Photos sync
  icloud_enabled:    '0',
  icloud_apple_id:   '',
  icloud_password:   '',
  icloud_dest:       '/photos/icloud',
  icloud_cookie_dir: '/data/icloud-cookies',
  // Amazon Photos sync
  amazon_enabled:     '0',
  amazon_cookie_file: '',
  amazon_dest:        '/photos/amazon',
};

const NUMERIC_SETTINGS = new Set(['thumb_size', 'thumb_quality', 'preview_size', 'preview_quality', 'dedupe_threshold']);
const BOOL_SETTINGS    = new Set(['icloud_enabled', 'amazon_enabled']);

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
      filesize       INTEGER,
      starred        INTEGER NOT NULL DEFAULT 0,
      place_city     TEXT,
      place_country  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON photos(date_taken);
    CREATE INDEX IF NOT EXISTS idx_photos_phash      ON photos(phash);

    CREATE TABLE IF NOT EXISTS collections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
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

    CREATE TABLE IF NOT EXISTS ingest_status (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      active     INTEGER NOT NULL DEFAULT 0,
      current    TEXT,
      scanned    INTEGER NOT NULL DEFAULT 0,
      errors     INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watch_folders (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      path     TEXT NOT NULL UNIQUE,
      enabled  INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Column migrations — run before any indexes that depend on the new column
  try { db.exec('ALTER TABLE photos ADD COLUMN starred INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN place_city    TEXT'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN place_country TEXT'); } catch {}
  try { db.exec("ALTER TABLE photos ADD COLUMN media_type TEXT NOT NULL DEFAULT 'photo'"); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN duration REAL'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN iso INTEGER'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN aperture REAL'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN shutter_speed TEXT'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN focal_length REAL'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN lens_model TEXT'); } catch {}
  try { db.exec('ALTER TABLE photos ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'); } catch {}
  db.exec('CREATE INDEX IF NOT EXISTS idx_photos_starred     ON photos(starred)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_photos_deleted     ON photos(deleted)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_photos_place_city  ON photos(place_city)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_photos_media_type  ON photos(media_type)');

  // Seed default settings
  const seedSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(SETTING_DEFAULTS)) seedSetting.run(k, v);

  const s = {
    insert:   db.prepare(`
      INSERT OR IGNORE INTO photos
        (filepath, thumb_path, preview_path, date_taken, date_imported,
         camera_model, gps_lat, gps_lon, phash, width, height, filesize,
         place_city, place_country, media_type, duration,
         iso, aperture, shutter_speed, focal_length, lens_model)
      VALUES
        (@filepath, @thumb_path, @preview_path, @date_taken, @date_imported,
         @camera_model, @gps_lat, @gps_lon, @phash, @width, @height, @filesize,
         @place_city, @place_country, @media_type, @duration,
         @iso, @aperture, @shutter_speed, @focal_length, @lens_model)
    `),
    exists:   db.prepare('SELECT 1 FROM photos WHERE filepath = ? LIMIT 1'),
    remove:   db.prepare('DELETE FROM photos WHERE filepath = ?'),
    count:    db.prepare('SELECT COUNT(*) AS n FROM photos'),

    tagByName:  db.prepare('SELECT id, name FROM tags WHERE name = ?'),
    tagInsert:  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)'),
    tagList:    db.prepare(`
      SELECT t.id, t.name, COUNT(pt.photo_id) AS count
      FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id
      GROUP BY t.id ORDER BY t.name
    `),
    tagOfPhoto: db.prepare('SELECT t.id, t.name FROM tags t JOIN photo_tags pt ON pt.tag_id = t.id WHERE pt.photo_id = ? ORDER BY t.name'),
    tagAttach:  db.prepare('INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)'),
    tagDetach:  db.prepare('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?'),

    colList:    db.prepare(`
      SELECT c.id, c.name, c.description, c.created_at, COUNT(pc.photo_id) AS photo_count
      FROM collections c LEFT JOIN photo_collections pc ON pc.collection_id = c.id
      GROUP BY c.id ORDER BY c.name
    `),
    colInsert:  db.prepare('INSERT INTO collections (name, description) VALUES (?, ?)'),
    colOfPhoto: db.prepare('SELECT c.id, c.name FROM collections c JOIN photo_collections pc ON pc.collection_id = c.id WHERE pc.photo_id = ? ORDER BY c.name'),
    colAdd:     db.prepare('INSERT OR IGNORE INTO photo_collections (photo_id, collection_id) VALUES (?, ?)'),
    colRemove:  db.prepare('DELETE FROM photo_collections WHERE photo_id = ? AND collection_id = ?'),

    dupePairs: db.prepare('SELECT photo_id_a, photo_id_b, distance FROM duplicate_pairs WHERE dismissed = 0'),

    ingestGet: db.prepare('SELECT * FROM ingest_status WHERE id = 1'),
    ingestSet: db.prepare(`
      INSERT INTO ingest_status (id, active, current, scanned, errors, started_at, updated_at)
      VALUES (1, @active, @current, @scanned, @errors, @started_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        active     = excluded.active,
        current    = excluded.current,
        scanned    = excluded.scanned,
        errors     = excluded.errors,
        started_at = COALESCE(ingest_status.started_at, excluded.started_at),
        updated_at = excluded.updated_at
    `),

    settingsAll: db.prepare('SELECT key, value FROM settings'),
    settingsSet: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),

    foldersAll:    db.prepare('SELECT id, path, enabled, added_at FROM watch_folders ORDER BY added_at'),
    folderInsert:  db.prepare('INSERT OR IGNORE INTO watch_folders (path) VALUES (?)'),
    folderDelete:  db.prepare('DELETE FROM watch_folders WHERE id = ?'),
    folderToggle:  db.prepare('UPDATE watch_folders SET enabled = ? WHERE id = ?'),
  };

  const addTagTx = db.transaction((photoId, tagName) => {
    s.tagInsert.run(tagName);
    const tag = s.tagByName.get(tagName);
    s.tagAttach.run(photoId, tag.id);
    return tag;
  });

  return {
    raw: db,

    insertPhoto: (row) => s.insert.run(row),
    hasPhoto:    (fp)  => !!s.exists.get(fp),
    removePhoto: (fp)  => s.remove.run(fp),
    count:       ()    => s.count.get().n,

    addTagToPhoto:      (photoId, tagName) => addTagTx(photoId, tagName),
    removeTagFromPhoto: (photoId, tagId)   => s.tagDetach.run(photoId, tagId),
    getPhotoTags:       (photoId)          => s.tagOfPhoto.all(photoId),
    listAllTags:        ()                 => s.tagList.all(),

    listCollections:           ()           => s.colList.all(),
    createCollection:          (name, desc) => {
      const info = s.colInsert.run(name, desc ?? null);
      return { id: info.lastInsertRowid, name, description: desc ?? null };
    },
    addPhotoToCollection:      (pid, cid)   => s.colAdd.run(pid, cid),
    removePhotoFromCollection: (pid, cid)   => s.colRemove.run(pid, cid),
    getPhotoCollections:       (pid)        => s.colOfPhoto.all(pid),

    getDupePairs: () => s.dupePairs.all(),
    dismissDuplicates: (ids) => {
      const ph = ids.map(() => '?').join(',');
      db.prepare(
        `UPDATE duplicate_pairs SET dismissed = 1
         WHERE photo_id_a IN (${ph}) AND photo_id_b IN (${ph})`
      ).run(...ids, ...ids);
    },

    getIngestStatus: () =>
      s.ingestGet.get() ?? { active: 0, current: null, scanned: 0, errors: 0 },
    setIngestStatus: ({ active, current = null, scanned = 0, errors = 0 }) =>
      s.ingestSet.run({
        active: active ? 1 : 0, current, scanned, errors,
        started_at: active ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),

    getSettings: () => {
      const rows = s.settingsAll.all();
      const out = { ...SETTING_DEFAULTS };
      for (const { key, value } of rows) out[key] = value;
      for (const k of NUMERIC_SETTINGS) out[k] = parseInt(out[k], 10);
      for (const k of BOOL_SETTINGS)    out[k] = out[k] === '1' || out[k] === true;
      return out;
    },
    setSetting: (key, value) => s.settingsSet.run(key, String(value)),

    listWatchFolders:   ()        => s.foldersAll.all(),
    addWatchFolder:     (p)       => s.folderInsert.run(p),
    removeWatchFolder:  (id)      => s.folderDelete.run(id),
    toggleWatchFolder:  (id, en)  => s.folderToggle.run(en ? 1 : 0, id),
  };
}
