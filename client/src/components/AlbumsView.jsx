import { useState, useEffect } from 'react';
import { fetchAlbums, createCollection, deleteCollection } from '../api/photos.js';

export default function AlbumsView({ onSelectAlbum }) {
  const [albums,   setAlbums]   = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [busy,     setBusy]     = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setAlbums(await fetchAlbums()); } catch {}
  }

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createCollection(name);
      setNewName('');
      setCreating(false);
      await load();
    } catch {}
    setBusy(false);
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"? Photos won't be deleted.`)) return;
    try { await deleteCollection(id); await load(); } catch {}
  }

  if (!albums) return <p style={{ padding: 24, color: '#777', fontSize: 13 }}>Loading…</p>;

  const { manual, auto } = albums;
  const hasAuto = auto.years.length > 0 || auto.cities.length > 0 || auto.cameras.length > 0;

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* My Albums */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#ddd', margin: 0 }}>My Albums</h2>
        <button
          onClick={() => { setCreating(c => !c); setNewName(''); }}
          style={newAlbumBtn}
        >
          {creating ? 'Cancel' : '+ New Album'}
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} style={{ marginBottom: 20, display: 'flex', gap: 8, maxWidth: 380 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Album name…"
            maxLength={200}
            style={inputSt}
          />
          <button type="submit" disabled={!newName.trim() || busy} style={submitSt}>
            Create
          </button>
        </form>
      )}

      {manual.length === 0 && !creating && (
        <p style={{ color: '#555', fontSize: 13, marginBottom: 32 }}>
          No albums yet — create one to start organizing your photos.
        </p>
      )}

      {manual.length > 0 && (
        <AlbumGrid>
          {manual.map(col => (
            <AlbumCard
              key={col.id}
              cover={col.cover_url}
              title={col.name}
              count={col.photo_count}
              onClick={() => onSelectAlbum({ type: 'collection', collectionId: col.id, name: col.name })}
              onDelete={() => handleDelete(col.id, col.name)}
            />
          ))}
        </AlbumGrid>
      )}

      {/* Smart Albums */}
      {hasAuto && (
        <>
          <div style={{ marginTop: 48, marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#ddd', margin: 0 }}>Smart Albums</h2>
            <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
              Auto-generated from your library
            </p>
          </div>

          {auto.recent?.length > 0 && (
            <>
              <SubHeader>Recently Added</SubHeader>
              <AlbumGrid>
                {auto.recent.map(r => (
                  <AlbumCard
                    key={r.days}
                    cover={r.cover_url}
                    title={r.label}
                    count={r.count}
                    onClick={() => onSelectAlbum({ type: 'recent', days: r.days, name: r.label })}
                  />
                ))}
              </AlbumGrid>
            </>
          )}

          {auto.years.length > 0 && (
            <>
              <SubHeader>Years</SubHeader>
              <AlbumGrid>
                {auto.years.map(r => (
                  <AlbumCard
                    key={r.year}
                    cover={r.cover_url}
                    title={r.year}
                    count={r.count}
                    onClick={() => onSelectAlbum({ type: 'year', year: r.year, name: r.year })}
                  />
                ))}
              </AlbumGrid>
            </>
          )}

          {auto.cities.length > 0 && (
            <>
              <SubHeader>Places</SubHeader>
              <AlbumGrid>
                {auto.cities.map(r => (
                  <AlbumCard
                    key={r.city}
                    cover={r.cover_url}
                    title={r.city}
                    subtitle={r.country}
                    count={r.count}
                    onClick={() => onSelectAlbum({ type: 'city', city: r.city, name: r.city })}
                  />
                ))}
              </AlbumGrid>
            </>
          )}

          {auto.cameras.length > 0 && (
            <>
              <SubHeader>Cameras</SubHeader>
              <AlbumGrid>
                {auto.cameras.map(r => (
                  <AlbumCard
                    key={r.camera}
                    cover={r.cover_url}
                    title={r.camera}
                    count={r.count}
                    onClick={() => onSelectAlbum({ type: 'camera', camera: r.camera, name: r.camera })}
                  />
                ))}
              </AlbumGrid>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SubHeader({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: '#555',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginTop: 28, marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function AlbumGrid({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
      gap: 18,
      marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function AlbumCard({ cover, title, subtitle, count, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      <div style={{
        aspectRatio: '1',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#1a1a1a',
        position: 'relative',
        marginBottom: 9,
        boxShadow: hovered ? '0 6px 24px rgba(0,0,0,0.55)' : '0 2px 10px rgba(0,0,0,0.35)',
        transform: hovered ? 'scale(1.025)' : 'scale(1)',
        transition: 'box-shadow 0.18s, transform 0.18s',
      }}>
        {cover ? (
          <img
            src={cover}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, color: '#252525',
          }}>
            ▪
          </div>
        )}

        {onDelete && hovered && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Delete album"
            style={{
              position: 'absolute', top: 7, right: 7,
              background: 'rgba(0,0,0,0.72)', border: 'none',
              borderRadius: 5, color: '#bbb', cursor: 'pointer',
              width: 26, height: 26, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>{subtitle}</div>
      )}
      <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}>
        {(count ?? 0).toLocaleString()} photo{count === 1 ? '' : 's'}
      </div>
    </div>
  );
}

const newAlbumBtn = {
  background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 7,
  color: '#7ab8f5', cursor: 'pointer', fontSize: 12, padding: '6px 14px',
};
const inputSt = {
  flex: 1, background: '#1a1a1a', border: '1px solid #272727',
  borderRadius: 7, color: '#ccc', fontSize: 13, padding: '7px 12px', outline: 'none',
};
const submitSt = {
  background: '#4d9eff', border: 'none', borderRadius: 7,
  color: '#fff', cursor: 'pointer', fontSize: 13, padding: '7px 16px', fontWeight: 600,
};
