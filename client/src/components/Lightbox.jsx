import { useState, useEffect } from 'react';
import { toggleStar } from '../api/photos.js';
import DetailPanel from './DetailPanel.jsx';

export default function Lightbox({ photos, index, onClose, onChange, onStarChange }) {
  const [showInfo, setShowInfo]   = useState(false);
  const [starring, setStarring]   = useState(false);
  const photo = photos[index];

  useEffect(() => {
    function onKey(e) {
      // Don't hijack shortcuts while typing in the detail panel
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft'  && index > 0)                onChange(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onChange(index + 1);
      if (e.key === 'i')           setShowInfo(s => !s);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onChange]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!photo) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', background: '#080808' }}>

      {/* ── Image area ── */}
      <div
        onClick={onClose}
        style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}
      >
        {/* Toolbar */}
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 4, padding: 10, zIndex: 10 }}
        >
          <IconBtn
            onClick={async () => {
              if (starring) return;
              setStarring(true);
              try {
                const updated = await toggleStar(photo.id, !photo.starred);
                onStarChange?.(updated);
              } finally {
                setStarring(false);
              }
            }}
            active={photo.starred}
            title={photo.starred ? 'Unstar' : 'Star'}
            style={{ color: photo.starred ? '#f5c518' : undefined }}
          >
            ★
          </IconBtn>
          <IconBtn
            onClick={() => setShowInfo(s => !s)}
            active={showInfo}
            title="Info  [i]"
          >
            <InfoIcon />
          </IconBtn>
          <IconBtn onClick={onClose} title="Close  [Esc]">✕</IconBtn>
        </div>

        {/* Left nav */}
        {index > 0 && (
          <NavBtn side="left" onClick={e => { e.stopPropagation(); onChange(index - 1); }}>‹</NavBtn>
        )}
        {/* Right nav */}
        {index < photos.length - 1 && (
          <NavBtn side="right" onClick={e => { e.stopPropagation(); onChange(index + 1); }}>›</NavBtn>
        )}

        <img
          key={photo.id}
          src={photo.preview_url || photo.thumb_url}
          alt=""
          onClick={e => e.stopPropagation()}
          style={{
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 20px)',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>

      {/* ── Detail panel ── */}
      {showInfo && (
        <div style={{
          width: 320,
          flexShrink: 0,
          background: '#111',
          borderLeft: '1px solid #1d1d1d',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <DetailPanel photoId={photo.id} />
        </div>
      )}
    </div>
  );
}

function IconBtn({ onClick, active, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: active ? '#fff' : '#888',
        cursor: 'pointer',
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14,
        transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  );
}

function NavBtn({ side, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [side]: 10,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '50%',
        width: 44, height: 44,
        fontSize: 24, color: '#ccc',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
        zIndex: 5,
      }}
    >
      {children}
    </button>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="6" />
      <line x1="7" y1="6" x2="7" y2="10" />
      <circle cx="7" cy="3.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
