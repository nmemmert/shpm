import { useState, useEffect } from 'react';
import { fetchTrash, restorePhoto, permanentDeletePhoto } from '../api/photos.js';

export default function TrashView() {
  const [photos, setPhotos] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try { const d = await fetchTrash(); setPhotos(d.photos); }
    catch { setPhotos([]); }
  }

  async function handleRestore(id) {
    await restorePhoto(id);
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  async function handleDelete(id) {
    if (!confirm('Permanently remove this photo from the library? This cannot be undone.')) return;
    await permanentDeletePhoto(id);
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  async function handleRestoreAll() {
    if (!photos?.length) return;
    await Promise.all(photos.map(p => restorePhoto(p.id)));
    setPhotos([]);
  }

  async function handleDeleteAll() {
    if (!photos?.length) return;
    if (!confirm(`Permanently remove all ${photos.length} photos from the library? This cannot be undone.`)) return;
    await Promise.all(photos.map(p => permanentDeletePhoto(p.id)));
    setPhotos([]);
  }

  if (!photos) return <p style={{ padding: 24, color: '#777', fontSize: 13 }}>Loading…</p>;

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#ddd', margin: 0 }}>Trash</h2>
          <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            Trashed photos are hidden from your library but not deleted from disk.
          </p>
        </div>
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRestoreAll} style={actionBtn('#2a3a2a', '#5a9')}>
              Restore all
            </button>
            <button onClick={handleDeleteAll} style={actionBtn('#3a1a1a', '#f87171')}>
              Delete all forever
            </button>
          </div>
        )}
      </div>

      {photos.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 80, color: '#444' }}>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.4 }}>🗑</div>
          <p style={{ fontSize: 14 }}>Trash is empty</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
          marginTop: 24,
        }}>
          {photos.map(photo => (
            <TrashCard
              key={photo.id}
              photo={photo}
              onRestore={() => handleRestore(photo.id)}
              onDelete={() => handleDelete(photo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrashCard({ photo, onRestore, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#141414' }}
    >
      <div style={{ aspectRatio: '1', position: 'relative' }}>
        {photo.thumb_url ? (
          <img
            src={photo.thumb_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.55 }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a2a', fontSize: 24 }}>▪</div>
        )}
        {hovered && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'rgba(0,0,0,0.6)',
          }}>
            <button onClick={onRestore} style={overlayBtn('#5a9')}>Restore</button>
            <button onClick={onDelete}  style={overlayBtn('#f87171')}>Delete forever</button>
          </div>
        )}
      </div>
      <div style={{ padding: '7px 10px', fontSize: 11, color: '#555' }}>
        {photo.date_taken
          ? new Date(photo.date_taken).toLocaleDateString('en-US', { dateStyle: 'medium' })
          : 'Unknown date'}
      </div>
    </div>
  );
}

const overlayBtn = (color) => ({
  background: 'rgba(0,0,0,0.7)', border: `1px solid ${color}`,
  borderRadius: 6, color, cursor: 'pointer', fontSize: 12,
  padding: '6px 18px', fontWeight: 600,
});

const actionBtn = (bg, color) => ({
  background: bg, border: `1px solid ${color}33`,
  borderRadius: 7, color, cursor: 'pointer', fontSize: 12,
  padding: '6px 14px',
});
