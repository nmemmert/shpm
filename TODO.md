# Plex for Photos — Self-Hosted Photo Library Architecture

A self-built media server for your photo collection, running as another container in your homelab. Follows the same pattern as your existing study app: React/Vite frontend + Express/SQLite backend, files stay on disk, DB just indexes them.

---

## High-Level Flow

```
┌───────────────────┐        watches         ┌──────────────────────┐
│  Photo Library    │ ─────────────────────▶ │  Ingestion Engine     │
│  (disk / NAS)     │                        │  (chokidar file watch)│
└───────────────────┘                        └───────────┬───────────┘
                                                         │ extract EXIF,
                                                         │ generate poster,
                                                         │ compute pHash
                                                         ▼
                                                ┌──────────────────────┐
                                                │   SQLite metadata DB  │
                                                │  (photos, collections,│
                                                │   hashes, artwork)    │
                                                └───────────┬───────────┘
                                                            │
                                                            ▼
                                                ┌──────────────────────┐
                                                │  Express API server   │
                                                └───────────┬───────────┘
                                                            │ REST/WS
                                                            ▼
                                                ┌──────────────────────┐
                                                │  React/Vite frontend  │
                                                │  (browse, collections,│
                                                │   discover, map)      │
                                                └──────────────────────┘
```

Original files never move or duplicate — the DB just points to paths on disk. Posters (thumbnails) are the only generated/derived asset stored separately (for instant browsing and discovery views).

---

## Components

### Ingestion Engine

**Stack:** Node + chokidar (file watcher) or a scheduled scan job

**On new file detected:**
- **Extract EXIF** (date taken, GPS, camera model, orientation) — exifr or exiftool wrapper
- **Generate posters** (e.g., sharp) at multiple sizes — grid poster + hero/preview size
- **Compute a perceptual hash** (pHash via sharp + blockhash-core) for smart duplicate detection
- **Insert a row** into SQLite: path, EXIF fields, poster path, hash, import timestamp

Runs as a background process inside the same container, or a separate lightweight worker container if you want to isolate it from the API.

---

### Database (SQLite)

**Core tables to start with:**

| Table | Purpose |
|-------|---------|
| `photos` | `id, filepath, poster_path, date_taken, date_imported, camera_model, gps_lat, gps_lon, phash, width, height, filesize` |
| `collections` | `id, name, created_at, description, poster_path` |
| `photo_collections` (join) | `photo_id, collection_id` |
| `tags` | `id, name` |
| `photo_tags` (join) | `photo_id, tag_id` |

Matches the SQLite pattern you're already using in the study app — no new infra to stand up.

---

### API Server (Express)

- **GET /photos** — paginated library query (filter by date range, tag, collection)
- **GET /photos/:id** — full detail + EXIF metadata
- **GET /photos/similar** — grouped by similar pHash (within a distance threshold)
- **POST /collections, POST /photos/:id/tags** — manual organization endpoints
- **GET /photos/map** — GPS-tagged photos for map view
- **Poster serving** — directly via endpoint or Nginx for static file efficiency

---

### Frontend (React/Vite)

- **Browse view** — infinite scroll, grouped by day/month, lazy-loaded posters (like Plex's continuous feed)
- **Collection/tag views** — same grid, filtered (like Plex collections for photos)
- **Detail view** — full image, EXIF panel, tag editor, related photos
- **Duplicate review** — side-by-side similar photos with keep/flag workflow (like Plex's duplicate management)
- **Map view** — Leaflet/MapLibre pins from GPS EXIF, click to open photo
- **Discovery/search** — date range, camera, tag filters, full-text search

---

## Smart Duplicate Detection (High Value — Do This Early)

At import time, compute pHash for every photo. On a scheduled job (or on-demand from a "Find Similar" button), compare hashes pairwise within a similarity threshold (Hamming distance) to group near-duplicates — burst shots, slightly different crops, etc.

Surface groups in a review UI rather than auto-deleting — you make the call, app just surfaces the candidates. This is much cheaper computationally than face recognition and gives you the real "cleanup" value people want from a photo manager.

---

## Face Grouping (Optional, Scope Carefully)

If you want this eventually:

**Options:** face-api.js (runs in Node, ONNX-based, no Python needed) or a Python microservice using face_recognition/dlib if you're OK adding a Python component.

Store face embeddings + bounding boxes in a `faces` table, cluster embeddings to group "this looks like the same person" without needing named identities upfront — you label clusters after the fact.

**This is the single biggest scope jump** — worth treating as a v2/v3 feature, not part of the initial build.

---

## Deployment Fit

**New container** (`photo-library`), same pattern as your other homelab services:
- Mounts your existing photo backup folder(s) read-only (ingestion engine doesn't need write access to originals) plus a writable volume for posters/DB
- Nginx Proxy Manager route (photos.necloud.us), behind Authelia like your other private services
- No external dependencies — everything runs locally against files already on disk

---

## Suggested Build Order

1. **Ingestion engine + SQLite schema** — watch folder, extract EXIF, generate posters, populate DB (get this solid before touching UI)
2. **Basic API + browse UI** — paginated grid, chronological browsing — this alone is already usable
3. **Detail view + manual tagging/collections**
4. **Smart duplicate detection + review UI** — high value, moderate effort
5. **Search + filters**
6. **Map view** (if your library has meaningful GPS data)
7. **Face grouping** (only if you still want it after living with V1–V6 for a while)
