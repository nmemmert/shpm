import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import sharp from 'sharp';
import exifr from 'exifr';
import { computeDHash } from './hash.js';
import { reverseGeocode } from './geocode.js';

const PHOTO_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
  '.tiff', '.tif', '.gif', '.avif',
]);

const VIDEO_EXTS = new Set([
  '.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.3gp',
]);

export function isSupported(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  return PHOTO_EXTS.has(ext) || VIDEO_EXTS.has(ext);
}

export async function ingestFile(filepath, db, posterDir, settings = {}) {
  if (VIDEO_EXTS.has(path.extname(filepath).toLowerCase())) {
    return ingestVideo(filepath, db, posterDir, settings);
  }
  return ingestPhoto(filepath, db, posterDir, settings);
}

// ── Photo ingest ───────────────────────────────────────────────────────────────

async function ingestPhoto(filepath, db, posterDir, settings) {
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
    media_type:    'photo',
    duration:      null,
  });

  console.log(`[ingest] ${path.basename(filepath)}`);
}

// ── Video ingest ───────────────────────────────────────────────────────────────

async function ingestVideo(filepath, db, posterDir, settings) {
  if (db.hasPhoto(filepath)) return;

  const thumbSize      = settings.thumb_size      ?? 400;
  const thumbQuality   = settings.thumb_quality   ?? 80;
  const previewSize    = settings.preview_size    ?? 1600;
  const previewQuality = settings.preview_quality ?? 85;

  const stat = fs.statSync(filepath);

  // 1. ffprobe — dimensions, duration, creation time
  let width = null, height = null, duration = null, dateTaken = null;
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_streams', '-show_format', filepath,
    ], { timeout: 15000, encoding: 'utf8' });
    const probe = JSON.parse(out);
    const vs = probe.streams?.find(s => s.codec_type === 'video');
    width    = vs?.width  ?? null;
    height   = vs?.height ?? null;
    duration = parseFloat(probe.format?.duration ?? '0') || null;
    const ct = probe.format?.tags?.creation_time ?? probe.format?.tags?.['com.apple.quicktime.creationdate'];
    if (ct) dateTaken = new Date(ct).toISOString();
  } catch (e) {
    console.error(`[ingest] ffprobe failed ${path.basename(filepath)}: ${e.message}`);
    return;
  }

  // 2. exifr — GPS + more accurate date (best-effort)
  let gpsLat = null, gpsLon = null;
  try {
    const exif = await exifr.parse(filepath, { gps: true, pick: ['DateTimeOriginal'] }) ?? {};
    if (exif.DateTimeOriginal) dateTaken = new Date(exif.DateTimeOriginal).toISOString();
    if (exif.latitude != null) { gpsLat = exif.latitude; gpsLon = exif.longitude; }
  } catch {}

  let placeCity = null, placeCountry = null;
  if (gpsLat !== null) {
    const place = await reverseGeocode(gpsLat, gpsLon);
    placeCity    = place?.city    ?? null;
    placeCountry = place?.country ?? null;
  }

  const { dir, thumb, preview } = posterPaths(filepath, posterDir, dateTaken ?? stat.mtime);
  fs.mkdirSync(dir, { recursive: true });

  // 3. Extract a frame with ffmpeg at 10% of duration (capped at 3 s)
  const seekSec = duration ? Math.min(duration * 0.1, 3) : 0;
  const tmpFrame = path.join(dir, `.vtmp_${crypto.randomBytes(4).toString('hex')}.jpg`);
  try {
    execFileSync('ffmpeg', [
      '-ss', String(seekSec.toFixed(3)),
      '-i', filepath,
      '-vframes', '1', '-q:v', '2', '-y', tmpFrame,
    ], { timeout: 30000, stdio: 'pipe' });
  } catch {
    try {
      // Fallback: first frame
      execFileSync('ffmpeg', [
        '-i', filepath, '-vframes', '1', '-q:v', '2', '-y', tmpFrame,
      ], { timeout: 30000, stdio: 'pipe' });
    } catch (e2) {
      console.error(`[ingest] video thumb failed ${path.basename(filepath)}: ${e2.message}`);
      return;
    }
  }

  // 4. Resize extracted frame with sharp (same pipeline as photos)
  try {
    await sharp(tmpFrame, { failOn: 'none' })
      .resize(thumbSize, thumbSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: thumbQuality })
      .toFile(thumb);

    await sharp(tmpFrame, { failOn: 'none' })
      .resize(previewSize, previewSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: previewQuality })
      .toFile(preview);
  } catch (err) {
    console.error(`[ingest] video poster failed ${path.basename(filepath)}: ${err.message}`);
    try { fs.unlinkSync(tmpFrame); } catch {}
    return;
  }
  try { fs.unlinkSync(tmpFrame); } catch {}

  db.insertPhoto({
    filepath,
    thumb_path:    thumb,
    preview_path:  preview,
    date_taken:    dateTaken,
    date_imported: new Date().toISOString(),
    camera_model:  null,
    gps_lat:       gpsLat,
    gps_lon:       gpsLon,
    phash:         null,
    width,
    height,
    filesize:      stat.size,
    place_city:    placeCity,
    place_country: placeCountry,
    media_type:    'video',
    duration,
  });

  console.log(`[ingest] video ${path.basename(filepath)}`);
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

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
