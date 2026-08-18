import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchMemories } from '../api/photos.js';

// ── Music engine ───────────────────────────────────────────────────────────────

function makeReverb(ctx, seconds) {
  const conv = ctx.createConvolver();
  const sr   = ctx.sampleRate;
  const buf  = ctx.createBuffer(2, sr * seconds, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
  }
  conv.buffer = buf;
  return conv;
}

function makeChain(ctx, { reverbSec, lpFreq, wet, dry }) {
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const reverb = makeReverb(ctx, reverbSec);
  const wg = ctx.createGain(); wg.gain.value = wet;
  const dg = ctx.createGain(); dg.gain.value = dry;
  reverb.connect(wg); wg.connect(master); dg.connect(master);
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass'; lpf.frequency.value = lpFreq; lpf.Q.value = 0.4;
  lpf.connect(reverb); lpf.connect(dg);
  return { master, lpf };
}

function runMelody(ctx, { scale, spacing, dur, gain, dest, delay }) {
  let cancelled = false, t = ctx.currentTime + delay, idx = 0;
  function next() {
    if (cancelled) return;
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = scale[idx++ % scale.length];
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.05);
    env.gain.setValueAtTime(gain, t + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env); env.connect(dest);
    osc.start(t); osc.stop(t + dur);
    t += spacing;
    setTimeout(next, Math.max(0, (t - ctx.currentTime - 0.6) * 1000));
  }
  next();
  return () => { cancelled = true; };
}

function runPluck(ctx, { scale, spacing, dur, gain, dest, delay }) {
  // Shorter, punchier envelope for upbeat feel
  let cancelled = false, t = ctx.currentTime + delay, idx = 0;
  function next() {
    if (cancelled) return;
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = scale[idx++ % scale.length];
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env); env.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
    t += spacing;
    setTimeout(next, Math.max(0, (t - ctx.currentTime - 0.6) * 1000));
  }
  next();
  return () => { cancelled = true; };
}

// ── Style: Upbeat (G major, bright, bouncy) ────────────────────────────────────
function createUpbeat(ctx) {
  const now = ctx.currentTime;
  const { master, lpf } = makeChain(ctx, { reverbSec: 2, lpFreq: 3200, wet: 0.4, dry: 0.6 });
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.45, now + 1.5);

  // G major pad: G3, B3, D4, G4
  [196, 246.94, 293.66, 392].forEach((freq, i) => {
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.055 / (1 + i * 0.22), now + 0.8 + i * 0.35);
    osc.connect(env); env.connect(lpf);
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.18 + i * 0.06; lfoG.gain.value = freq * 0.0025;
    lfo.connect(lfoG); lfoG.connect(osc.frequency); lfo.start(now); osc.start(now);
  });

  // G major pentatonic: G3, A3, B3, D4, E4, G4, A4, B4
  const scale = [293.66, 329.63, 392, 440, 392, 329.63, 293.66, 246.94,
                 293.66, 392, 440, 493.88, 440, 392, 329.63, 246.94];
  const cancel = runPluck(ctx, { scale, spacing: 0.85, dur: 0.65, gain: 0.11, dest: lpf, delay: 1.5 });

  return { master, stop() { cancel(); master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.8); } };
}

// ── Style: Dreamy (A minor, slow, nostalgic) ────────────────────────────────────
function createDreamy(ctx) {
  const now = ctx.currentTime;
  const { master, lpf } = makeChain(ctx, { reverbSec: 4, lpFreq: 1900, wet: 0.65, dry: 0.35 });
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.38, now + 4);

  // A minor pad: A2, E3, A3, C4, E4, G4
  [110, 164.81, 220, 261.63, 329.63, 392].forEach((freq, i) => {
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = i < 2 ? 'sine' : 'triangle';
    osc.frequency.value = freq + (Math.random() - 0.5) * 0.25;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.052 / (1 + i * 0.28), now + 1.5 + i * 0.65);
    osc.connect(env); env.connect(lpf);
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.07 + i * 0.02; lfoG.gain.value = freq * 0.0018;
    lfo.connect(lfoG); lfoG.connect(osc.frequency); lfo.start(now); osc.start(now);
  });

  // A pentatonic minor melody
  const scale = [329.63, 293.66, 261.63, 220, 261.63, 293.66, 329.63,
                 392, 440, 392, 329.63, 261.63, 293.66, 329.63];
  const cancel = runMelody(ctx, { scale, spacing: 2.3, dur: 1.9, gain: 0.1, dest: lpf, delay: 5.5 });

  return { master, stop() { cancel(); master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5); } };
}

// ── Style: Cinematic (D minor, sweeping, dramatic) ─────────────────────────────
function createCinematic(ctx) {
  const now = ctx.currentTime;
  const { master, lpf } = makeChain(ctx, { reverbSec: 5, lpFreq: 1500, wet: 0.75, dry: 0.25 });
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.42, now + 5);

  // D minor pad: D3, F3, A3, C4, F4 — dual oscillators slightly detuned for richness
  [[146.83, 0.07], [174.61, 0.055], [220, 0.05], [261.63, 0.04], [349.23, 0.03]].forEach(([freq, g], i) => {
    [-1, 1].forEach(side => {
      const osc = ctx.createOscillator(), env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * (1 + side * 0.0015);
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(g, now + 3 + i * 0.9);
      osc.connect(env); env.connect(lpf); osc.start(now);
    });
  });

  // D natural minor melody — sweeping and slow
  const scale = [220, 261.63, 293.66, 261.63, 220, 196, 174.61,
                 196, 220, 293.66, 261.63, 220, 196, 174.61, 196, 220];
  const cancel = runMelody(ctx, { scale, spacing: 2.8, dur: 2.4, gain: 0.09, dest: lpf, delay: 6.5 });

  return { master, stop() { cancel(); master.gain.linearRampToValueAtTime(0, ctx.currentTime + 3); } };
}

function createMusic(ctx, style) {
  if (style === 'dreamy')   return createDreamy(ctx);
  if (style === 'cinematic') return createCinematic(ctx);
  return createUpbeat(ctx);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MUSIC_STYLES = [
  { key: 'upbeat',    label: 'Upbeat',    icon: '⚡' },
  { key: 'dreamy',    label: 'Dreamy',    icon: '🌙' },
  { key: 'cinematic', label: 'Cinematic', icon: '🎬' },
];

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

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MemoriesView() {
  const [groups, setGroups]         = useState(null);
  const [error, setError]           = useState(null);
  const [musicStyle, setMusicStyle] = useState('upbeat');
  const [slideshow, setSlideshow]   = useState(false);
  const [ssIndex, setSsIndex]       = useState(0);
  const [opacity, setOpacity]       = useState(1);
  const [muted, setMuted]           = useState(false);
  const [tracks, setTracks]         = useState([]);
  const [trackIdx, setTrackIdx]     = useState(0);
  const [scanInfo, setScanInfo]     = useState(null);

  const audioCtxRef = useRef(null);
  const musicRef    = useRef(null);
  const timerRef    = useRef(null);
  const audioRef    = useRef(null);

  useEffect(() => {
    fetchMemories()
      .then(d => setGroups(groupByYear(d.photos)))
      .catch(e => setError(e.message));
    fetch('/api/music/scan-status')
      .then(r => r.json()).then(setScanInfo).catch(() => {});
  }, []);

  // Re-fetch track list whenever mood changes
  useEffect(() => {
    fetch(`/api/music?mood=${musicStyle}`)
      .then(r => r.json())
      .then(d => { setTracks(d.tracks ?? []); setTrackIdx(0); })
      .catch(() => setTracks([]));
  }, [musicStyle]);

  useEffect(() => () => { stopMusic(); clearInterval(timerRef.current); }, []);

  const allPhotos = groups ? groups.flatMap(g => g.photos) : [];

  // ── Music ──

  function startMusic(style) {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    musicRef.current = createMusic(ctx, style);
  }

  function stopMusic() {
    musicRef.current?.stop();
    const ctx = audioCtxRef.current;
    if (ctx) {
      setTimeout(() => { try { ctx.close(); } catch {} }, 3500);
      audioCtxRef.current = null;
      musicRef.current = null;
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (tracks.length > 0) {
      if (audioRef.current) audioRef.current.volume = next ? 0 : 1;
    } else if (musicRef.current && audioCtxRef.current) {
      musicRef.current.master.gain.linearRampToValueAtTime(next ? 0 : 0.42, audioCtxRef.current.currentTime + 0.5);
    }
  }

  // ── Slideshow ──

  const advance = useCallback((dir) => {
    setOpacity(0);
    setTimeout(() => {
      setSsIndex(i => (i + dir + allPhotos.length) % allPhotos.length);
      setOpacity(1);
    }, 320);
  }, [allPhotos.length]);

  function startSlideshow(idx) {
    setSsIndex(idx); setOpacity(1); setSlideshow(true);
    setTrackIdx(0);
    if (tracks.length === 0) startMusic(musicStyle); // synth fallback
  }

  function stopSlideshow() {
    clearInterval(timerRef.current);
    setSlideshow(false);
    stopMusic();
    setMuted(false);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
  }

  useEffect(() => {
    if (!slideshow) return;
    timerRef.current = setInterval(() => advance(1), 5000);
    return () => clearInterval(timerRef.current);
  }, [slideshow, advance]);

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

  const noPhotos  = allPhotos.length === 0;
  const dateLabel = todayLabel();

  return (
    <>
      {/* ── Main view ── */}
      <div style={{ padding: '28px 24px', maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 32 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Music style picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4, background: '#111', borderRadius: 8, padding: 3 }}>
                  {MUSIC_STYLES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setMusicStyle(s.key)}
                      title={s.label}
                      style={{
                        background: musicStyle === s.key ? '#1e2a3a' : 'transparent',
                        border: 'none', borderRadius: 6,
                        color: musicStyle === s.key ? '#7ab8f5' : '#555',
                        cursor: 'pointer', padding: '5px 10px',
                        fontSize: 13, display: 'flex', alignItems: 'center', gap: 5,
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      <span>{s.icon}</span>
                      <span style={{ fontSize: 12 }}>{s.label}</span>
                    </button>
                  ))}
                </div>
                {scanInfo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#444' }}>
                      {scanInfo.scanning ? '⟳ Scanning music…' : scanInfo.enabled ? `${(scanInfo.total ?? tracks.length || scanInfo.count).toLocaleString()} tracks` : ''}
                    </span>
                    {scanInfo.enabled && !scanInfo.scanning && (
                      <button
                        onClick={() => {
                          fetch('/api/music/scan', { method: 'POST' }).then(() =>
                            setScanInfo(s => ({ ...s, scanning: true }))
                          );
                        }}
                        style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: 0 }}
                      >
                        Rescan
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Play button */}
              <button
                onClick={() => startSlideshow(0)}
                style={{
                  background: '#4d9eff', border: 'none', borderRadius: 8,
                  color: '#fff', cursor: 'pointer',
                  padding: '9px 18px', fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                ▶ Play
              </button>
            </div>
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

        {/* Year groups */}
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
                    style={{ width: 168, height: 126, borderRadius: 5, overflow: 'hidden', cursor: 'pointer', flexShrink: 0, background: '#111' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
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
        const style = MUSIC_STYLES.find(s => s.key === musicStyle);
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', display: 'flex', flexDirection: 'column' }}>

            {/* Photo */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                key={photo.id}
                src={photo.preview_url || photo.thumb_url}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', opacity, transition: 'opacity 0.32s ease', userSelect: 'none' }}
              />

              {/* Year badge */}
              <div style={{
                position: 'absolute', bottom: 22, left: 22,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: 9, padding: '10px 16px',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ fontSize: 30, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: -0.5 }}>{year}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>{yearsAgo(year)}</div>
              </div>

              <button onClick={() => advance(-1)} style={navBtn('left')} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>‹</button>
              <button onClick={() => advance(1)}  style={navBtn('right')} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>›</button>
            </div>

            {/* Hidden audio element for real music */}
            {tracks.length > 0 && (
              <audio
                ref={audioRef}
                key={tracks[trackIdx % tracks.length]?.id}
                src={`/api/music/stream/${tracks[trackIdx % tracks.length]?.id}`}
                autoPlay
                onEnded={() => setTrackIdx(i => (i + 1) % tracks.length)}
                onError={() => setTrackIdx(i => (i + 1) % tracks.length)}
                style={{ display: 'none' }}
              />
            )}

            {/* Bottom bar */}
            <div style={{ background: '#090909', borderTop: '1px solid #1a1a1a', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Dots */}
              <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {allPhotos.map((_, i) => (
                  <div
                    key={i}
                    onClick={() => { setOpacity(0); setTimeout(() => { setSsIndex(i); setOpacity(1); }, 320); }}
                    style={{ width: i === ssIndex ? 20 : 6, height: 6, borderRadius: 3, background: i === ssIndex ? '#4d9eff' : '#2a2a2a', cursor: 'pointer', transition: 'width 0.25s, background 0.25s', flexShrink: 0 }}
                  />
                ))}
              </div>

              {/* Now playing */}
              {tracks.length > 0 && tracks[trackIdx % tracks.length] && (
                <div style={{ fontSize: 11, color: '#555', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {tracks[trackIdx % tracks.length].title}
                  {tracks[trackIdx % tracks.length].artist
                    ? ` — ${tracks[trackIdx % tracks.length].artist}` : ''}
                </div>
              )}

              <span style={{ fontSize: 12, color: '#555', flexShrink: 0 }}>
                {style?.icon} {ssIndex + 1} / {allPhotos.length}
              </span>

              <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={ctrlBtn}>
                {muted ? '🔇' : '🎵'}
              </button>
              <button onClick={stopSlideshow} title="Exit (Esc)" style={ctrlBtn}>✕</button>
            </div>
          </div>
        );
      })()}
    </>
  );
}

function navBtn(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 14,
    background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 36, lineHeight: 1,
    width: 44, height: 68,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: 0.5, transition: 'opacity 0.18s',
  };
}

const ctrlBtn = {
  background: 'transparent', border: '1px solid #222', borderRadius: 6,
  color: '#888', cursor: 'pointer', padding: '5px 11px', fontSize: 14, flexShrink: 0,
};
