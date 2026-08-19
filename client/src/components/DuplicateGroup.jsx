function fmtSize(b) {
  if (!b) return null;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fmtDate(d) {
  if (!d) return 'Undated';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scorePhoto(p) {
  const pixels  = (p.width  || 0) * (p.height || 0);
  const size    = p.filesize || 0;
  const hasExif = p.camera_model ? 1 : 0;
  return pixels * 1e6 + size + hasExif * 1e3;
}

export default function DuplicateGroup({ photos, onDismiss, onKeepBest, onOpen }) {
  const scores  = photos.map(scorePhoto);
  const maxScore = Math.max(...scores);
  const bestIdx  = scores.indexOf(maxScore);

  return (
    <div style={{
      background: '#111',
      border: '1px solid #1d1d1d',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Photo row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: '#0c0c0c' }}>
        {photos.map((photo, i) => {
          const isBest = i === bestIdx;
          return (
            <div
              key={photo.id}
              style={{
                flex: '1 1 200px', minWidth: 160, maxWidth: 320,
                display: 'flex', flexDirection: 'column',
                outline: isBest ? '2px solid #22c55e' : 'none',
                outlineOffset: '-2px',
                position: 'relative',
              }}
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

                {/* Best badge */}
                {isBest && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    background: '#16a34a',
                    borderRadius: 4,
                    fontSize: 10, color: '#fff', padding: '2px 6px',
                    fontWeight: 600,
                  }}>
                    Keep
                  </span>
                )}
              </div>

              {/* Meta */}
              <div style={{ padding: '7px 10px 8px', fontSize: 12, color: '#777', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: isBest ? '#86efac' : '#888' }}>{fmtDate(photo.date_taken)}</span>
                <span>
                  {[fmtSize(photo.filesize), photo.width && `${photo.width}×${photo.height}`].filter(Boolean).join(' · ')}
                </span>
                {photo.camera_model && (
                  <span style={{ color: '#666', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {photo.camera_model}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid #1a1a1a',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 12, color: '#666', flex: 1 }}>
          {photos.length} similar photos
        </span>
        <button
          onClick={onKeepBest}
          style={{
            background: '#14532d',
            border: '1px solid #16a34a',
            borderRadius: 5,
            color: '#86efac',
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: 12,
          }}
        >
          Keep best
        </button>
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
