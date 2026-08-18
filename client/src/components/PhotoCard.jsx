import { useState, memo } from 'react';

function PhotoCard({ photo, onClick, isSelected, onToggle, selectionActive }) {
  const [loaded,  setLoaded]  = useState(false);
  const [error,   setError]   = useState(false);
  const [hovered, setHovered] = useState(false);

  function handleClick() {
    if (selectionActive) {
      onToggle?.(photo.id);
    } else {
      onClick();
    }
  }

  const showCheck = (hovered || isSelected || selectionActive) && onToggle;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        aspectRatio: '1',
        background: '#181818',
        cursor: 'pointer',
        overflow: 'hidden',
        position: 'relative',
        outline: isSelected ? '2px solid #4d9eff' : 'none',
        outlineOffset: '-2px',
      }}
    >
      {/* Checkbox */}
      {showCheck && (
        <div
          onClick={e => { e.stopPropagation(); onToggle(photo.id); }}
          style={{
            position: 'absolute', top: 6, left: 6, zIndex: 2,
            width: 20, height: 20, borderRadius: '50%',
            background: isSelected ? '#4d9eff' : 'rgba(0,0,0,0.55)',
            border: isSelected ? 'none' : '1.5px solid rgba(255,255,255,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: '#fff',
            transition: 'background 0.12s',
          }}
        >
          {isSelected && '✓'}
        </div>
      )}

      {/* Selection tint */}
      {isSelected && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(77,158,255,0.18)', zIndex: 1 }} />
      )}

      {photo.thumb_url && !error ? (
        <img
          src={photo.thumb_url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: loaded ? 1 : 0, transition: 'opacity 0.15s ease',
          }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#2a2a2a', fontSize: 20,
        }}>
          ▪
        </div>
      )}
    </div>
  );
}

export default memo(PhotoCard);
