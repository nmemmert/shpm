import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchMemories } from '../api/photos.js';

// ── Music ──────────────────────────────────────────────────────────────────────

function createAmbientMusic(ctx) {
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.38, now + 4);
  master.connect(ctx.destination);

  // Reverb convolver (4-second synthetic impulse)
  const convolver = ctx.createConvolver();
  const sr = ctx.sampleRate;
  const impulse = ctx.createBuffer(2, sr * 4, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
    }
  }
  convolver.buffer = impulse;

  const wet = ctx.createGain(); wet.gain.value = 0.65;
  const dry = ctx.createGain(); dry.gain.value = 0.35;
  convolver.connect(wet); wet.connect(master);
  dry.connect(master);

  // Warmth filter
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 1900;
  lpf.Q.value = 0.4;
  lpf.connect(convolver);
  lpf.connect(dry);

  // Pad: A minor chord — A2, E3, A3, C4, E4, G4
  [110, 164.81, 220, 261.63, 329.63, 392].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = i < 2 ? 'sine' : 'triangle';
    osc.frequency.value = freq + (Math.random() - 0.5) * 0.25;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.052 / (1 + i * 0.28), now + 1.5 + i * 0.65);
    osc.connect(env);
    env.connect(lpf);

    // Slow vibrato for shimmer
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.07 + i * 0.02;
    lfoG.gain.value = freq * 0.0018;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    lfo.start(now); osc.start(now);
  });

  // Melody: A pentatonic minor (A3, C4, D4, E4, G4, A4)
  const scale = [329.63, 293.66, 261.63, 220, 261.63, 293.66, 329.63, 392, 440, 392, 329.63, 261.63, 293.66, 329.63];
  let cancelled = false;
  let noteTime = now + 5.5;
  let noteIdx = 0;

  function playNote() {
    if (cancelled) return;
    const freq = scale[noteIdx % scale.length];
    noteIdx++;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const dur = 1.9;
    env.gain.setValueAtTime(0, noteTime);
    env.gain.linearRampToValueAtTime(0.1, noteTime + 0.06);
    env.gain.setValueAtTime(0.1, noteTime + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.001, noteTime + dur);
    osc.connect(env); env.connect(convolver);
    osc.start(noteTime); osc.stop(noteTime + dur);
    noteTime += 2.3;
    const msUntil = (noteTime - ctx.currentTime - 0.6) * 1000;
    setTimeout(playNote, Math.max(0, msUntil));
  }
  playNote();

  return {
    master,
    stop() {
      cancelled = true;
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5);
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function groupByYear(photos) {
  const map = {};
  for (const p of photos) {
    const yr = new Date(p.date_taken).getFullYear();
    (map[yr] ??= []).push(p);
  }
  return Object.entries(map)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, photos]) => ({ year: Number(year), photos }));
}

function yearsAgo(year) {
  const n = new Date().getFullYear() - year;
  if (n === 0) return 'This year';
  return n === 1 ? '1 year ago' : `${n} years ago`;
}

function localDate() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MemoriesView() {
  const [groups, setGroups]   = useState(null);
  const [error, setError]     = useState(null);
  const [slideshow, setSlideshow] = useState(false);
  const [ssIndex, setSsIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [muted, setMuted]     = useState(false);

  const audioCtxRef = useRef(null);
  const musicRef    = useRef(null);
  const timerRef    = useRef(null);

  useEffect(() => {
    fetchMemories()
      .then(d => setGroups(groupByYear(d.photos)))
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => () => { stopMusic(); clearInterval(timerRef.current); }, []);

  const allPhotos = groups ? groups.flatMap(g => g.photos) : [];

  // ── Music ──

  function startMusic() {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    musicRef.current = createAmbientMusic(ctx);
  }

  function stopMusic() {
    musicRef.current?.stop();
    const ctx = audioCtxRef.current;
    if (ctx) {
      setTimeout(() => { try { ctx.close(); } catch {} }, 3000);
      audioCtxRef.current = null;
      musicRef.current = null;
    }
  }

  function toggleMute() {
    if (!musicRef.current || !audioCtxRef.current) return;
    const next = !muted;
    setMuted(next);
    const g = musicRef.current.master.gain;
    g.linearRampToValueAtTime(next ? 0 : 0.38, audioCtxRef.current.currentTime + 0.6);
  }

  // ── Slideshow ──

  const advance = useCallback((dir) => {
    setOpacity(0);
    setTimeout(() => {
      setSsIndex(i => (i + dir + allPhotos.length) % allPhotos.length);
      setOpacity(1);
    }, 330);
  }, [allPhotos.length]);

  function startSlideshow(startIndex) {
    setSsIndex(startIndex);
    setOpacity(1);
    setSlideshow(true);
    startMusic();
  }

  function stopSlideshow() {
    clearInterval(timerRef.current);
    setSlideshow(false);
    stopMusic();
    setMuted(false);
  }

  // Auto-advance
  useEffect(() => {
    if (!slideshow) return;
    timerRef.current = setInterval(() => advance(1), 5000);
    return () => clearInterval(timerRef.current);
  }, [slideshow, advance]);

  // Keyboard
  useEffect(() => {
    if (!slideshow) return;
    function onKey(e) {
      if (e.key === 'ArrowRight') advance(1);
      else if (e.key === 'ArrowLeft') advance(-1);
      else if (e.key === 'Escape') stopSlideshow();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slideshow, advance]);

  // ── Render ──

  if (error) return <p style={{ color: '#f87171', padding: 24, fontSize: 14 }}>{error}</p>;
  if (!groups) return <p style={{ color: '#777', padding: 24, fontSize: 13 }}>Loading…</p>;

  const noPhotos = allPhotos.length === 0;
  const dateLabel = localDate();

  return (
    <>
      {/* ── Main view ── */}
      <div style={{ padding: '28px 24px', maxWidth: 980, margin: '0 auto' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e8e8e8', margin: 0, marginBottom: 5, letterSpacing: -0.4 }}>
              {dateLabel}
            </h1>
            <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
              {noPhotos
                ? 'No photos from this day in your library yet'
                : `${allPhotos.length} photo${allPhotos.length !== 1 ? 's' : ''} across ${groups.length} year${groups.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {!noPhotos && (
            <button
              onClick={() => startSlideshow(0)}
              style={{
                background: '#4d9eff', border: 'none', borderRadius: 8,
                color: '#fff', cursor: 'pointer',
                padding: '9px 20px', fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
                letterSpacing: 0.1,
              }}
            >
              ▶ Play Memories
            </button>
          )}
        </div>

        {/* Empty state */}
        {noPhotos && (
          <div style={{ textAlign: 'center', paddingTop: 64, color: '#555' }}>
            <div style={{ fontSize: 44, marginBottom: 18, opacity: 0.5 }}>📷</div>
            <p style={{ fontSize: 15, marginBottom: 8, color: '#777' }}>Nothing from {dateLabel} yet.</p>
            <p style={{ fontSize: 13 }}>Keep shooting — they'll appear here on this date next year.</p>
          </div>
        )}

        {/* Year sections */}
        {groups.map(({ year, photos: yPhotos }) => (
          <div key={year} style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#ddd' }}>{year}</span>
              <span style={{ fontSize: 12, color: '#666' }}>{yearsAgo(year)}</span>
              <span style={{ fontSize: 12, color: '#444' }}>· {yPhotos.length} photo{yPhotos.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {yPhotos.map(photo => {
                const idx = allPhotos.indexOf(photo);
                return (
                  <div
                    key={photo.id}
                    onClick={() => startSlideshow(idx)}
                    style={{
                      width: 168, height: 126, borderRadius: 5,
                      overflow: 'hidden', cursor: 'pointer',
                      flexShrink: 0, background: '#111',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.78'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                  >
                    {photo.thumb_url
                      ? <img src={photo.thumb_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 22 }}>▪</div>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Slideshow overlay ── */}
      {slideshow && allPhotos.length > 0 && (() => {
        const photo = allPhotos[ssIndex];
        const year  = new Date(photo.date_taken).getFullYear();
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', display: 'flex', flexDirection: 'column' }}>

            {/* Photo area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                key={photo.id}
                src={photo.preview_url || photo.thumb_url}
                alt=""
                style={{
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain',
                  opacity,
                  transition: 'opacity 0.33s ease',
                  userSelect: 'none',
                }}
              />

              {/* Year badge */}
              <div style={{
                position: 'absolute', bottom: 22, left: 22,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: 9, padding: '10px 16px',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ fontSize: 30, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: -0.5 }}>{year}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>{yearsAgo(year)}</div>
              </div>

              {/* Prev */}
              <button
                onClick={() => advance(-1)}
                style={navBtn('left')}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
              >‹</button>

              {/* Next */}
              <button
                onClick={() => advance(1)}
                style={navBtn('right')}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
              >›</button>
            </div>

            {/* Bottom bar */}
            <div style={{
              background: '#090909',
              borderTop: '1px solid #1a1a1a',
              padding: '10px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              {/* Progress dots */}
              <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {allPhotos.map((_, i) => (
                  <div
                    key={i}
                    onClick={() => { setOpacity(0); setTimeout(() => { setSsIndex(i); setOpacity(1); }, 330); }}
                    style={{
                      width: i === ssIndex ? 20 : 6, height: 6, borderRadius: 3,
                      background: i === ssIndex ? '#4d9eff' : '#2a2a2a',
                      cursor: 'pointer',
                      transition: 'width 0.25s, background 0.25s',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>

              {/* Counter */}
              <span style={{ fontSize: 12, color: '#555', flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
                {ssIndex + 1} / {allPhotos.length}
              </span>

              {/* Mute */}
              <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={ctrlBtn}>
                {muted ? '🔇' : '🎵'}
              </button>

              {/* Exit */}
              <button onClick={stopSlideshow} title="Exit slideshow (Esc)" style={ctrlBtn}>
                ✕
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function navBtn(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 14,
    background: 'rgba(0,0,0,0.45)',
    border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 36, lineHeight: 1,
    width: 44, height: 68,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: 0.5, transition: 'opacity 0.18s',
  };
}

const ctrlBtn = {
  background: 'transparent',
  border: '1px solid #222', borderRadius: 6,
  color: '#888', cursor: 'pointer',
  padding: '5px 11px', fontSize: 14,
  flexShrink: 0,
};
