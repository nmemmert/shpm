import { useState, useEffect } from 'react';
import {
  fetchSettings, patchSettings,
  fetchWatchFolders, addWatchFolder, removeWatchFolder, toggleWatchFolder,
  clearDismissals,
} from '../api/photos.js';

export default function SettingsPanel({ onClose }) {
  const [settings, setSettings]   = useState(null);
  const [folders, setFolders]     = useState([]);
  const [newPath, setNewPath]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [cleared, setCleared]     = useState(false);

  useEffect(() => {
    fetchSettings().then(setSettings);
    fetchWatchFolders().then(setFolders);
  }, []);

  // Debounced setting save
  async function handleSetting(key, value) {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    setSaving(true);
    try {
      const saved = await patchSettings({ [key]: value });
      setSettings(saved);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFolder() {
    const p = newPath.trim();
    if (!p) return;
    const updated = await addWatchFolder(p);
    setFolders(updated);
    setNewPath('');
  }

  async function handleRemoveFolder(id) {
    await removeWatchFolder(id);
    setFolders(f => f.filter(x => x.id !== id));
  }

  async function handleToggleFolder(id, enabled) {
    const updated = await toggleWatchFolder(id, !enabled);
    setFolders(updated);
  }

  async function handleClearDismissals() {
    await clearDismissals();
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  }

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, right: 0,
          width: 380, height: '100%',
          background: '#111', borderLeft: '1px solid #1e1e1e',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '14px 18px', borderBottom: '1px solid #1a1a1a',
          position: 'sticky', top: 0, background: '#111', zIndex: 1,
        }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#ddd' }}>Settings</span>
          {saving && <span style={{ fontSize: 11, color: '#555', marginRight: 10 }}>Saving…</span>}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}
          >✕</button>
        </div>

        {settings === null ? (
          <p style={{ padding: 24, color: '#555', fontSize: 13 }}>Loading…</p>
        ) : (
          <div style={{ padding: '6px 0 40px' }}>

            {/* ── Watch Folders ── */}
            <Section title="Watch Folders">
              <p style={{ fontSize: 11, color: '#444', padding: '0 18px 10px', lineHeight: 1.5 }}>
                Add absolute paths to scan. In Docker, the path must be mounted as a volume.
              </p>

              {folders.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 18px',
                }}>
                  <button
                    onClick={() => handleToggleFolder(f.id, f.enabled)}
                    title={f.enabled ? 'Disable' : 'Enable'}
                    style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      background: f.enabled ? '#4d9eff' : '#2a2a2a',
                      border: '1px solid ' + (f.enabled ? '#2a6ecc' : '#333'),
                      cursor: 'pointer', padding: 0,
                    }}
                  />
                  <span style={{
                    flex: 1, fontSize: 12, color: f.enabled ? '#ccc' : '#444',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: 'monospace',
                  }}>
                    {f.path}
                  </span>
                  <button
                    onClick={() => handleRemoveFolder(f.id)}
                    style={{
                      background: 'none', border: 'none',
                      color: '#3a3a3a', cursor: 'pointer', fontSize: 14,
                      flexShrink: 0, lineHeight: 1,
                    }}
                  >×</button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 6, padding: '8px 18px 4px' }}>
                <input
                  value={newPath}
                  onChange={e => setNewPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddFolder()}
                  placeholder="/path/to/photos"
                  style={{
                    flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a',
                    borderRadius: 5, color: '#ccc', fontSize: 12,
                    padding: '5px 8px', outline: 'none', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={handleAddFolder}
                  disabled={!newPath.trim()}
                  style={{
                    background: newPath.trim() ? '#1e2f45' : '#181818',
                    border: '1px solid ' + (newPath.trim() ? '#2a4a6a' : '#222'),
                    borderRadius: 5, color: newPath.trim() ? '#7ab8f5' : '#333',
                    cursor: newPath.trim() ? 'pointer' : 'default',
                    padding: '5px 12px', fontSize: 12,
                  }}
                >
                  Add
                </button>
              </div>
            </Section>

            {/* ── Ingestion ── */}
            <Section title="Ingestion">
              <NumSetting label="Thumbnail size" unit="px" min={100} max={800} step={50}
                value={settings.thumb_size}
                onChange={v => handleSetting('thumb_size', v)} />
              <NumSetting label="Thumbnail quality" unit="%" min={1} max={100}
                value={settings.thumb_quality}
                onChange={v => handleSetting('thumb_quality', v)} />
              <NumSetting label="Preview size" unit="px" min={800} max={4000} step={100}
                value={settings.preview_size}
                onChange={v => handleSetting('preview_size', v)} />
              <NumSetting label="Preview quality" unit="%" min={1} max={100}
                value={settings.preview_quality}
                onChange={v => handleSetting('preview_quality', v)} />
              <p style={{ fontSize: 11, color: '#3a3a3a', padding: '4px 18px 0', lineHeight: 1.5 }}>
                Changes apply to newly ingested photos. Existing thumbnails are not regenerated.
              </p>
            </Section>

            {/* ── Duplicate Detection ── */}
            <Section title="Duplicate Detection">
              <NumSetting label="Similarity threshold" unit="" min={1} max={20}
                value={settings.dedupe_threshold}
                onChange={v => handleSetting('dedupe_threshold', v)} />
              <p style={{ fontSize: 11, color: '#3a3a3a', padding: '4px 18px 0', lineHeight: 1.5 }}>
                Hamming distance — lower = stricter (fewer, more exact matches).
              </p>
            </Section>

            {/* ── Danger Zone ── */}
            <Section title="Danger Zone">
              <div style={{ padding: '4px 18px' }}>
                <DangerBtn onClick={handleClearDismissals}>
                  {cleared ? '✓ Done' : 'Clear dismissed duplicates'}
                </DangerBtn>
                <p style={{ fontSize: 11, color: '#3a3a3a', marginTop: 5, lineHeight: 1.5 }}>
                  Resets all "Not duplicates" decisions so groups reappear in the review list.
                </p>
              </div>
            </Section>

          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color: '#3a3a3a', textTransform: 'uppercase',
        padding: '0 18px 8px',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function NumSetting({ label, unit, min, max, step = 1, value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '5px 18px',
    }}>
      <span style={{ flex: 1, fontSize: 13, color: '#aaa' }}>{label}</span>
      <input
        type="number"
        min={min} max={max} step={step}
        value={value}
        onChange={e => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        style={{
          width: 70, background: '#1a1a1a', border: '1px solid #2a2a2a',
          borderRadius: 5, color: '#ccc', fontSize: 12,
          padding: '4px 8px', outline: 'none', textAlign: 'right',
        }}
      />
      {unit && <span style={{ fontSize: 11, color: '#444', width: 16 }}>{unit}</span>}
    </div>
  );
}

function DangerBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid #3a1a1a',
        borderRadius: 5, color: '#884444',
        cursor: 'pointer', padding: '6px 14px', fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}
