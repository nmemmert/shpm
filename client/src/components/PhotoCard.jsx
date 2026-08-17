import { useState } from 'react';

export default function PhotoCard({ photo, onClick }) {
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        aspectRatio: '1',
        background: '#181818',
        cursor: 'pointer',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {photo.thumb_url && !error ? (
        <img
          src={photo.thumb_url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.15s ease',
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
