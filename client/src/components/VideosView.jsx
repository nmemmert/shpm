import { useState, useEffect, useRef } from 'react';
import { fetchVideos } from '../api/photos.js';

function fmtDuration(s) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSize(b) {
  if (!b) return null;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

export default function VideosView() {
  const [videos, setVideos] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [error, setError]   = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    fetchVideos()
      .then(d => setVideos(d.videos))
      .catch(e => setError(e.message));
  }, []);

  // Keyboard: Esc to close player
  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => { if (e.key === 'Escape') setPlaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  if (error) return <p style={{ color: '#f87171', padding: 24, fontSize: 14 }}>{error}</p>;
  if (!videos) return <p style={{ color: '#777', padding: 24, fontSize: 13 }}>Loading…</p>;

  const noVideos = videos.length === 0;

  return (
    <>
      <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: '#999', margin: 0 }}>
            Videos
            {videos.length > 0 && (
              <span style={{ fontWeight: 400, color: '#555', marginLeft: 8 }}>
                {videos.length.toLocaleString()}
              </span>
            )}
          </h1>
        </div>

        {noVideos && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#555' }}>
            <div style={{ fontSize: 44, marginBottom: 18, opacity: 0.4 }}>🎬</div>
            <p style={{ fontSize: 15, marginBottom: 8, color: '#777' }}>No videos indexed yet.</p>
            <p style={{ fontSize: 13 }}>Add a folder containing .mp4, .mov, or .m4v files and rescan.</p>
          </div>
        )}

        {/* Video grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {videos.map(v => (
            <div
              key={v.id}
              onClick={() => setPlaying(v)}
              style={{
                width: 220, height: 124, // 16:9
                position: 'relative', cursor: 'pointer',
                borderRadius: 6, overflow: 'hidden',
                background: '#111', flexShrink: 0,
              }}
              onMouseEnter={e => e.currentTarget.querySelector('.play-ring').style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.querySelector('.play-ring').style.opacity = '0.7'}
            >
              {/* Thumbnail */}
              {v.thumb_url
                ? <img src={v.thumb_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: '100%', background: '#1a1a1a' }} />
              }

              {/* Play button overlay */}
              <div className="play-ring" style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0.7, transition: 'opacity 0.15s',
              }}>
                <div style={{
                  width: 38, height: 38,
                  background: 'rgba(0,0,0,0.65)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid rgba(255,255,255,0.4)',
                }}>
                  <span style={{ color: '#fff', fontSize: 16, marginLeft: 3, lineHeight: 1 }}>▶</span>
                </div>
              </div>

              {/* Duration badge */}
              {v.duration != null && (
                <span style={{
                  position: 'absolute', bottom: 6, right: 6,
                  background: 'rgba(0,0,0,0.72)', color: '#fff',
                  fontSize: 11, padding: '2px 5px', borderRadius: 3, lineHeight: 1.4,
                }}>
                  {fmtDuration(v.duration)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Video player overlay ── */}
      {playing && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setPlaying(null); }}
        >
          {/* Close */}
          <button
            onClick={() => setPlaying(null)}
            style={{
              position: 'absolute', top: 16, right: 20,
              background: 'transparent', border: 'none',
              color: '#777', fontSize: 22, cursor: 'pointer', lineHeight: 1,
            }}
            title="Close (Esc)"
          >
            ✕
          </button>

          {/* Video element */}
          <video
            ref={videoRef}
            key={playing.id}
            src={`/api/photos/${playing.id}/video`}
            controls
            autoPlay
            playsInline
            style={{
              maxWidth: '92vw', maxHeight: '80vh',
              background: '#000', borderRadius: 6,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            }}
          />

          {/* Info bar */}
          <div style={{
            marginTop: 14, display: 'flex', gap: 16, alignItems: 'center',
            fontSize: 13, color: '#666', flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {fmtDate(playing.date_taken) && <span>{fmtDate(playing.date_taken)}</span>}
            {playing.duration && <span>{fmtDuration(playing.duration)}</span>}
            {playing.width && playing.height && <span>{playing.width} × {playing.height}</span>}
            {fmtSize(playing.filesize) && <span>{fmtSize(playing.filesize)}</span>}
          </div>
        </div>
      )}
    </>
  );
}
