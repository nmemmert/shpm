# Self-Hosted Photo Manager — TODO

## Architecture

A self-built alternative to Immich: React/Vite frontend + Express/SQLite backend,
files stay on disk, DB indexes them, thumbnails are the only derived asset.

```
┌───────────────────┐        watches         ┌──────────────────────┐
│  Photo folder(s)   │ ─────────────────────▶ │  Ingestion Worker      │
│  (disk / NAS)      │                        │  (chokidar file watch) │
└───────────────────┘                        └───────────┬────────────┘
                                                          │ extract EXIF,
                                                          │ generate thumbnail,
                                                          │ compute pHash
                                                          ▼
                                              ┌──────────────────────┐
                                              │   SQLite metadata DB  │
                                              │  (photos, tags,       │
                                              │   albums, hashes)     │
                                              └───────────┬────────────┘
                                                          │
                                                          ▼
                                              ┌──────────────────────┐
                                              │  Express API server   │
                                              └───────────┬────────────┘
                                                          │ REST
                                                          ▼
                                              ┌──────────────────────┐
                                              │  React/Vite frontend  │
                                              │  (timeline, albums,   │
                                              │   search, map)        │
                                              └──────────────────────┘
```

## Build Order

- [ ] **1. Ingestion worker + SQLite schema** — watch folder, extract EXIF, generate thumbnails, populate DB
- [ ] **2. Basic API + timeline UI** — paginated grid, chronological browsing (usable on its own)
- [ ] **3. Detail view + manual tagging/albums**
- [ ] **4. Dedupe detection + review UI** — pHash comparison, side-by-side review, keep/delete
- [ ] **5. Search + filters** — date range, camera model, tag
- [ ] **6. Map view** — Leaflet/MapLibre pins from GPS EXIF
- [ ] **7. Face grouping** — only if wanted after v1–v5 (biggest scope jump, treat as v2+)

## Stack

| Layer | Tech |
|---|---|
| File watching | `chokidar` (persistent) or cron scan |
| EXIF extraction | `exifr` or `exiftool` wrapper |
| Thumbnails | `sharp` (1–2 sizes: grid thumb + preview) |
| Dedupe hashing | pHash via `sharp` + hashing lib, or `blockhash-core` |
| Database | SQLite via `better-sqlite3` |
| API | Express |
| Frontend | React + Vite |
| Map | Leaflet or MapLibre |
| Deployment | Docker container, Nginx Proxy Manager, behind Authelia |

## Database Schema

```sql
photos (
  id, filepath, thumbnail_path, date_taken, date_imported,
  camera_model, gps_lat, gps_lon, phash, width, height, filesize
)
albums (id, name, created_at)
photo_albums (photo_id, album_id)
tags (id, name)
photo_tags (photo_id, tag_id)
```

## API Endpoints (planned)

```
GET  /photos                 paginated timeline (filter by date, tag, album)
GET  /photos/:id             full detail + EXIF
GET  /photos/duplicates      grouped by pHash similarity
GET  /photos/map             GPS-tagged photos for map view
POST /albums                 create album
POST /photos/:id/tags        tag a photo
```

## Deployment Notes

- Mount photo folder(s) **read-only** (worker doesn't need write access to originals)
- Writable volume for thumbnails + DB
- Route: `photos.necloud.us` via Nginx Proxy Manager
- Same homelab pattern as other services
