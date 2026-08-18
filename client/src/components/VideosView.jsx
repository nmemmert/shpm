import { useState, useEffect } from 'react';
import { fetchVideos } from '../api/photos.js';

// ── Grouping (mirrors Timeline.jsx) ───────────────────────────────────────────

function groupByMonth(videos) {
  const groups = [];
  let current  = null;
  for (const v of videos) {
    const key = v.date_taken ? v.date_taken.slice(0, 7) : 'undated';
    if (!current || current.key !== key) {
      current = { key, label: monthLabel(v.date_taken), videos: [] };
      groups.push(current);
    }
    current.videos.push(v);
  }
  return groups;
}

function monthLabel(d) {
  if (!d) return 'Undated';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(s) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSize(b) {
  if (!b) return null;
  if (b < 1048576)    return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VideosView({ filters = {} }) {
  const [videos,  setVideos]  = useState(null);
  const [playing, setPlaying] = useState(null);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setVideos(null);
    setError(null);
    fetchVideos({ from: filters.from, to: filters.to, city: filters.city })
      .then(d => setVideos(d.videos))
      .catch(e => setError(e.message));
  }, [filters.from, filters.to, filters.city]);

  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => { if (e.key === 'Escape') setPlaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  if (error)   return <p style={{ color: '#f87171', padding: 24, fontSize: 14 }}>{error}</p>;
  if (!videos) return <p style={{ color: '#777',    padding: 24, fontSize: 13 }}>Loading…</p>;

  if (videos.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60, color: '#555' }}>
        <div style={{ fontSize: 44, marginBottom: 18, opacity: 0.4 }}>🎬</div>
        <p style={{ fontSize: 15, marginBottom: 8, color: '#777' }}>No videos indexed yet.</p>
        <p style={{ fontSize: 13 }}>Add a folder with .mp4, .mov, or .m4v files and rescan.</p>
      </div>
    );
  }

  const groups = groupByMonth(videos);

  return (
    <>
      <main style={{ padding: '0 3px' }}>
        {groups.map(group => (
          <section key={group.key} style={{ marginBottom: 8 }}>

            {/* Month header — identical style to MonthGroup.jsx */}
            <h2 style={{
              padding: '18px 6px 8px',
              fontSize: 13, fontWeight: 600,
              color: '#666', letterSpacing: 0.4,
              textTransform: 'uppercase', userSelect: 'none',
            }}>
              {group.label}
              <span style={{ marginLeft: 8, color: '#666', fontWeight: 400 }}>
                {group.videos.length.toLocaleString()}
              </span>
            </h2>

            {/* Video grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 3,
            }}>
              {group.videos.map(v => (
                <VideoCard key={v.id} video={v} onPlay={setPlaying} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── Player overlay ── */}
      {playing && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setPlaying(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.94)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <button
            onClick={() => setPlaying(null)}
            title="Close (Esc)"
            style={{
              position: 'absolute', top: 16, right: 20,
              background: 'transparent', border: 'none',
              color: '#777', fontSize: 22, cursor: 'pointer', lineHeight: 1,
            }}
          >✕</button>

          <video
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

          <div style={{
            marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap',
            justifyContent: 'center', fontSize: 13, color: '#555',
          }}>
            {fmtDate(playing.date_taken) && <span>{fmtDate(playing.date_taken)}</span>}
            {playing.duration  != null   && <span>{fmtDuration(playing.duration)}</span>}
            {playing.width && playing.height && <span>{playing.width} × {playing.height}</span>}
            {fmtSize(playing.filesize)   && <span>{fmtSize(playing.filesize)}</span>}
          </div>
        </div>
      )}
    </>
  );
}

// ── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({ video: v, onPlay }) {
  return (
    <div
      onClick={() => onPlay(v)}
      style={{
        aspectRatio: '16 / 9',
        position: 'relative', cursor: 'pointer',
        borderRadius: 4, overflow: 'hidden',
        background: '#111',
      }}
      onMouseEnter={e => { e.currentTarget.querySelector('.play-ring').style.opacity = '1'; }}
      onMouseLeave={e => { e.currentTarget.querySelector('.play-ring').style.opacity = '0.65'; }}
    >
      {v.thumb_url
        ? <img src={v.thumb_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', background: '#1a1a1a' }} />
      }

      {/* Play button */}
      <div className="play-ring" style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.65, transition: 'opacity 0.15s',
      }}>
        <div style={{
          width: 36, height: 36,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid rgba(255,255,255,0.35)',
        }}>
          <span style={{ color: '#fff', fontSize: 14, marginLeft: 3, lineHeight: 1 }}>▶</span>
        </div>
      </div>

      {/* Duration badge */}
      {v.duration != null && (
        <span style={{
          position: 'absolute', bottom: 5, right: 5,
          background: 'rgba(0,0,0,0.7)', color: '#fff',
          fontSize: 11, padding: '2px 5px', borderRadius: 3, lineHeight: 1.4,
        }}>
          {fmtDuration(v.duration)}
        </span>
      )}
    </div>
  );
}
