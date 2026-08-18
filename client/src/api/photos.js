async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? null : res.json();
}

const json = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Library
export function fetchPhotos({ cursor, limit = 100, q, from, to, tagId, collectionId, starred, city, importedFrom } = {}) {
  const p = new URLSearchParams({ limit });
  if (cursor)       p.set('cursor',       cursor);
  if (q)            p.set('q',            q);
  if (from)         p.set('from',         from);
  if (to)           p.set('to',           to);
  if (tagId)        p.set('tagId',        tagId);
  if (collectionId) p.set('collectionId', collectionId);
  if (starred)      p.set('starred',      starred);
  if (city)         p.set('city',         city);
  if (importedFrom) p.set('importedFrom', importedFrom);
  return api(`/api/photos?${p}`);
}

export function fetchDirBrowser(dirPath) {
  return api(`/api/fs/browse?path=${encodeURIComponent(dirPath)}`);
}

export function fetchPhotoDetail(id) {
  return api(`/api/photos/${id}`);
}

export function fetchMapPhotos() {
  return api('/api/photos/map');
}

export function fetchLibraryStats() {
  return api('/api/library/stats');
}

export function toggleStar(id, starred) {
  return api(`/api/photos/${id}`, { method: 'PATCH', ...json({ starred }) });
}

// Tags
export function fetchTags() {
  return api('/api/tags');
}

export function addTag(photoId, name) {
  return api(`/api/photos/${photoId}/tags`, { method: 'POST', ...json({ name }) });
}

export function removeTag(photoId, tagId) {
  return api(`/api/photos/${photoId}/tags/${tagId}`, { method: 'DELETE' });
}

// Collections
export function fetchCollections() {
  return api('/api/collections');
}

export function createCollection(name, description) {
  return api('/api/collections', { method: 'POST', ...json({ name, description }) });
}

export function addToCollection(photoId, collectionId) {
  return api(`/api/photos/${photoId}/collections`, { method: 'POST', ...json({ collectionId }) });
}

export function removeFromCollection(photoId, collectionId) {
  return api(`/api/photos/${photoId}/collections/${collectionId}`, { method: 'DELETE' });
}

// Settings
export function fetchSettings() {
  return api('/api/settings');
}

export function patchSettings(updates) {
  return api('/api/settings', { method: 'PATCH', ...json(updates) });
}

// Watch folders
export function fetchWatchFolders() {
  return api('/api/watch-folders');
}

export function addWatchFolder(path) {
  return api('/api/watch-folders', { method: 'POST', ...json({ path }) });
}

export function removeWatchFolder(id) {
  return api(`/api/watch-folders/${id}`, { method: 'DELETE' });
}

export function toggleWatchFolder(id, enabled) {
  return api(`/api/watch-folders/${id}`, { method: 'PATCH', ...json({ enabled }) });
}

// Admin
export function clearDismissals() {
  return api('/api/admin/clear-dismissals', { method: 'POST' });
}

// Photo sync
export function triggerSync(source) {
  return api(`/api/sync/${source}`, { method: 'POST' });
}

// Videos
export function fetchVideoStats() {
  return api('/api/videos/stats');
}

export function fetchVideos({ from, to, city, cursor } = {}) {
  const p = new URLSearchParams();
  if (from)   p.set('from',   from);
  if (to)     p.set('to',     to);
  if (city)   p.set('city',   city);
  if (cursor) p.set('cursor', cursor);
  const qs = p.toString();
  return api(`/api/videos${qs ? '?' + qs : ''}`);
}

// Memories
export function fetchMemories() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return api(`/api/memories/today?date=${date}`);
}

// Albums
export function fetchAlbums() {
  return api('/api/albums');
}

export function renameCollection(id, name) {
  return api(`/api/collections/${id}`, { method: 'PATCH', ...json({ name }) });
}

export function deleteCollection(id) {
  return api(`/api/collections/${id}`, { method: 'DELETE' });
}

// Trash / delete
export function deletePhoto(id) {
  return api(`/api/photos/${id}`, { method: 'DELETE' });
}

export function restorePhoto(id) {
  return api(`/api/photos/${id}/restore`, { method: 'POST' });
}

export function permanentDeletePhoto(id) {
  return api(`/api/photos/${id}/permanent`, { method: 'DELETE' });
}

export function fetchTrash() {
  return api('/api/trash');
}

// Bulk operations
export function bulkStar(ids, starred) {
  return api('/api/photos/bulk', { method: 'PATCH', ...json({ ids, starred }) });
}

export function bulkAddToCollection(ids, collectionId) {
  return api('/api/photos/bulk/collections', { method: 'POST', ...json({ ids, collectionId }) });
}

// Duplicates
export function fetchDuplicates() {
  return api('/api/duplicates');
}

export function scanDuplicates() {
  return api('/api/dedupe/scan', { method: 'POST' });
}

export function dismissGroup(photoIds) {
  return api('/api/duplicates/dismiss', { method: 'POST', ...json({ photoIds }) });
}
