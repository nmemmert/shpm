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
export function fetchPhotos({ cursor, limit = 100, q, from, to, tagId, collectionId } = {}) {
  const p = new URLSearchParams({ limit });
  if (cursor)       p.set('cursor',       cursor);
  if (q)            p.set('q',            q);
  if (from)         p.set('from',         from);
  if (to)           p.set('to',           to);
  if (tagId)        p.set('tagId',        tagId);
  if (collectionId) p.set('collectionId', collectionId);
  return api(`/api/photos?${p}`);
}

export function fetchPhotoDetail(id) {
  return api(`/api/photos/${id}`);
}

export function fetchMapPhotos() {
  return api('/api/photos/map');
}

// Tags
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

// Tags + collections (for filter dropdowns)
export function fetchTags() {
  return api('/api/tags');
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
