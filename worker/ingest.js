import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { computeDHash } from './hash.js';
import { reverseGeocode } from './geocode.js';

const SUPPORTED = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
  '.tiff', '.tif', '.gif', '.avif',
]);

export function isSupported(filepath) {
  return SUPPORTED.has(path.extname(filepath).toLowerCase());
}

export async function ingestFile(filepath, db, posterDir, settings = {}) {
  if (db.hasPhoto(filepath)) return;

  const thumbSize      = settings.thumb_size      ?? 400;
  const thumbQuality   = settings.thumb_quality   ?? 80;
  const previewSize    = settings.preview_size    ?? 1600;
  const previewQuality = settings.preview_quality ?? 85;

  const stat = fs.statSync(filepath);

  let exif = {};
  try {
    exif = await exifr.parse(filepath, {
      pick: ['DateTimeOriginal', 'Make', 'Model', 'Orientation'],
      gps: true,
    }) ?? {};
  } catch {}

  const dateTaken   = exif.DateTimeOriginal ?? null;
  const cameraModel = [exif.Make, exif.Model].filter(Boolean).join(' ') || null;
  const gpsLat      = exif.latitude  ?? null;
  const gpsLon      = exif.longitude ?? null;

  let placeCity = null, placeCountry = null;
  if (gpsLat !== null && gpsLon !== null) {
    const place = await reverseGeocode(gpsLat, gpsLon);
    placeCity    = place?.city    ?? null;
    placeCountry = place?.country ?? null;
  }

  const { dir, thumb, preview } = posterPaths(filepath, posterDir, dateTaken ?? stat.mtime);
  fs.mkdirSync(dir, { recursive: true });

  let width = null, height = null;

  try {
    const meta = await sharp(filepath, { failOn: 'none' }).metadata();
    width  = meta.width;
    height = meta.height;

    await sharp(filepath, { failOn: 'none' })
      .rotate()
      .resize(thumbSize, thumbSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: thumbQuality })
      .toFile(thumb);

    await sharp(filepath, { failOn: 'none' })
      .rotate()
      .resize(previewSize, previewSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: previewQuality })
      .toFile(preview);
  } catch (err) {
    console.error(`[ingest] poster failed ${path.basename(filepath)}: ${err.message}`);
    return;
  }

  let phash = null;
  try { phash = await computeDHash(filepath); } catch {}

  db.insertPhoto({
    filepath,
    thumb_path:    thumb,
    preview_path:  preview,
    date_taken:    dateTaken ? new Date(dateTaken).toISOString() : null,
    date_imported: new Date().toISOString(),
    camera_model:  cameraModel,
    gps_lat:       gpsLat,
    gps_lon:       gpsLon,
    phash,
    width,
    height,
    filesize:      stat.size,
    place_city:    placeCity,
    place_country: placeCountry,
  });

  console.log(`[ingest] ${path.basename(filepath)}`);
}

function posterPaths(filepath, posterDir, date) {
  const id     = crypto.createHash('sha1').update(filepath).digest('hex').slice(0, 10);
  const stem   = path.basename(filepath, path.extname(filepath));
  const name   = `${id}_${stem}`;
  const d      = new Date(date);
  const folder = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const dir    = path.join(posterDir, folder);
  return {
    dir,
    thumb:   path.join(dir, `${name}_thumb.jpg`),
    preview: path.join(dir, `${name}_preview.jpg`),
  };
}
