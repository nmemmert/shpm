function fmtSize(b) {
  if (!b) return null;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fmtDate(d) {
  if (!d) return 'Undated';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DuplicateGroup({ photos, onDismiss, onOpen }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #1d1d1d',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Photo row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: '#0c0c0c' }}>
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 320, display: 'flex', flexDirection: 'column' }}
          >
            <div
              onClick={() => onOpen(photo)}
              style={{
                aspectRatio: '4/3',
                cursor: 'pointer',
                background: '#0c0c0c',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {photo.thumb_url ? (
                <img
                  src={photo.thumb_url}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222', fontSize: 24 }}>▪</div>
              )}

              {/* Index badge */}
              <span style={{
                position: 'absolute', top: 6, left: 6,
                background: 'rgba(0,0,0,0.6)', borderRadius: 4,
                fontSize: 10, color: '#888', padding: '2px 5px',
              }}>
                {i + 1}
              </span>
            </div>

            {/* Meta */}
            <div style={{ padding: '7px 10px 8px', fontSize: 12, color: '#555', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#888' }}>{fmtDate(photo.date_taken)}</span>
              <span>
                {[fmtSize(photo.filesize), photo.width && `${photo.width}×${photo.height}`].filter(Boolean).join(' · ')}
              </span>
              {photo.camera_model && (
                <span style={{ color: '#3a3a3a', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {photo.camera_model}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid #1a1a1a',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 12, color: '#333', flex: 1 }}>
          {photos.length} similar photos
        </span>
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: '1px solid #2a2a2a',
            borderRadius: 5,
            color: '#666',
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: 12,
          }}
        >
          Not duplicates
        </button>
      </div>
    </div>
  );
}
