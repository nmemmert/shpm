import { useState, useEffect, useRef, useCallback } from 'react';
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

const SHORT_THRESHOLD = 2; // seconds

export default function VideosView({ filters = {} }) {
  const [videos,      setVideos]      = useState([]);
  const [nextCursor,  setNextCursor]  = useState(undefined);
  const [total,       setTotal]       = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [playing,     setPlaying]     = useState(null);
  const [error,       setError]       = useState(null);
  const [showShort,   setShowShort]   = useState(false);
  const loadingRef  = useRef(false);
  const sentinelRef = useRef(null);

  const loadPage = useCallback(async (cursor, activeFilters) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const d = await fetchVideos({ ...activeFilters, cursor });
      setVideos(prev => cursor ? [...prev, ...d.videos] : d.videos);
      setNextCursor(d.nextCursor ?? null);
      setTotal(d.total);
    } catch (e) {
      setError(e.message);
    }
    loadingRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    setVideos([]);
    setNextCursor(undefined);
    setTotal(null);
    loadPage(undefined, { from: filters.from, to: filters.to, city: filters.city });
  }, [filters.from, filters.to, filters.city]);

  useEffect(() => {
    if (!sentinelRef.current || !nextCursor) return;
    const el  = sentinelRef.current;
    const cur = nextCursor;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadPage(cur, { from: filters.from, to: filters.to, city: filters.city }); },
      { rootMargin: '600px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, filters.from, filters.to, filters.city]);

  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => { if (e.key === 'Escape') setPlaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  if (error) return <p style={{ color: '#f87171', padding: 24, fontSize: 14 }}>{error}</p>;

  const isEmpty = !loading && videos.length === 0;
  if (isEmpty) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60, color: '#555' }}>
        <div style={{ fontSize: 44, marginBottom: 18, opacity: 0.4 }}>🎬</div>
        <p style={{ fontSize: 15, marginBottom: 8, color: '#777' }}>No videos indexed yet.</p>
        <p style={{ fontSize: 13 }}>Add a folder with .mp4, .mov, or .m4v files and rescan.</p>
      </div>
    );
  }

  const isShort     = v => v.duration != null && Math.floor(v.duration) <= SHORT_THRESHOLD;
  const shortCount  = videos.filter(isShort).length;
  const visible     = showShort ? videos : videos.filter(v => !isShort(v));
  const groups      = groupByMonth(visible).filter(g => g.videos.length > 0);

  return (
    <>
      {/* Toolbar */}
      {shortCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px 2px',
        }}>
          <button
            onClick={() => setShowShort(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: showShort ? '#1e2a3a' : 'transparent',
              border: `1px solid ${showShort ? '#4d9eff' : '#2a2a2a'}`,
              borderRadius: 6, color: showShort ? '#9fc8ff' : '#555',
              fontSize: 12, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            {showShort ? '▾' : '▸'}
            {showShort
              ? `Hiding ${shortCount} short clip${shortCount === 1 ? '' : 's'}`
              : `${shortCount} short clip${shortCount === 1 ? '' : 's'} hidden`}
          </button>
        </div>
      )}

      <main style={{ padding: '0 3px' }}>
        {loading && videos.length === 0 && (
          <p style={{ padding: 24, color: '#555', fontSize: 13 }}>Loading…</p>
        )}
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
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loading && videos.length > 0 && (
          <p style={{ textAlign: 'center', padding: 24, color: '#444', fontSize: 13 }}>Loading…</p>
        )}
        {nextCursor === null && videos.length > 0 && !loading && (
          <p style={{ textAlign: 'center', padding: 24, color: '#555', fontSize: 12 }}>
            — {total?.toLocaleString()} video{total === 1 ? '' : 's'} —
          </p>
        )}
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
