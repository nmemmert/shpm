import { useState, useEffect } from 'react';
import { fetchPhotoDetail } from '../api/photos.js';
import TagEditor from './TagEditor.jsx';
import CollectionEditor from './CollectionEditor.jsx';

export default function DetailPanel({ photoId }) {
  const [photo, setPhoto]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPhoto(null);
    setLoading(true);
    fetchPhotoDetail(photoId)
      .then(setPhoto)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [photoId]);

  if (loading) {
    return <div style={panelPad}><span style={{ color: '#444', fontSize: 13 }}>Loading…</span></div>;
  }
  if (!photo) return null;

  const filename = photo.filepath?.split('/').pop();

  return (
    <div style={{ padding: '14px 16px 32px', fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>

      <Section label="File">
        {filename && <Row k="Name"     v={filename} mono />}
        {photo.date_taken && (
          <Row k="Taken" v={new Date(photo.date_taken).toLocaleDateString('en-US', { dateStyle: 'full' })} />
        )}
        {photo.date_imported && (
          <Row k="Added" v={new Date(photo.date_imported).toLocaleDateString('en-US', { dateStyle: 'medium' })} />
        )}
        {photo.width && photo.height && (
          <Row k="Pixels" v={`${photo.width.toLocaleString()} × ${photo.height.toLocaleString()}`} />
        )}
        {photo.filesize && (
          <Row k="Size" v={formatBytes(photo.filesize)} />
        )}
      </Section>

      {photo.camera_model && (
        <Section label="Camera">
          <Row k="Model" v={photo.camera_model} />
        </Section>
      )}

      {photo.gps_lat != null && (
        <Section label="Location">
          <Row k="GPS" v={`${photo.gps_lat.toFixed(5)}, ${photo.gps_lon.toFixed(5)}`} />
          <a
            href={`https://maps.google.com/?q=${photo.gps_lat},${photo.gps_lon}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: '#5a9', marginTop: 4, display: 'inline-block' }}
          >
            Open in Maps ↗
          </a>
        </Section>
      )}

      <Section label="Tags">
        <TagEditor photoId={photoId} initialTags={photo.tags ?? []} />
      </Section>

      <Section label="Collections">
        <CollectionEditor photoId={photoId} initialCollections={photo.collections ?? []} />
      </Section>

    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
      <span style={{ color: '#777', flexShrink: 0, width: 60, fontSize: 12 }}>{k}</span>
      <span style={{
        color: '#aaa',
        fontFamily: mono ? "'SF Mono', 'Fira Code', monospace" : undefined,
        fontSize: mono ? 11 : 13,
        wordBreak: 'break-all',
      }}>
        {v}
      </span>
    </div>
  );
}

function formatBytes(b) {
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const panelPad = { padding: '14px 16px' };
