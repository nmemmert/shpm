import { useState, useEffect } from 'react';
import {
  fetchSettings, patchSettings,
  fetchWatchFolders, addWatchFolder, removeWatchFolder, toggleWatchFolder,
  clearDismissals, fetchDirBrowser, triggerSync,
} from '../api/photos.js';

const EMPTY_SYNC = {
  icloud: { running: false, lines: [], exitCode: null, startedAt: null, error: null },
  amazon: { running: false, lines: [], exitCode: null, startedAt: null, error: null },
};

export default function SettingsPanel({ onClose }) {
  const [settings, setSettings]   = useState(null);
  const [folders, setFolders]     = useState([]);
  const [newPath, setNewPath]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [cleared, setCleared]     = useState(false);
  const [syncStatus, setSyncStatus] = useState(EMPTY_SYNC);
  const [syncError, setSyncError]   = useState({});
  const [amazonPath, setAmazonPath] = useState('');
  const [amazonAdded, setAmazonAdded] = useState(false);

  // Folder browser
  const [browseOpen,   setBrowseOpen]   = useState(false);
  const [browseData,   setBrowseData]   = useState(null);   // { path, parent, dirs }
  const [browseLoading, setBrowseLoading] = useState(false);

  useEffect(() => {
    fetchSettings().then(setSettings);
    fetchWatchFolders().then(setFolders);
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/sync/stream');
    es.onmessage = (e) => setSyncStatus(JSON.parse(e.data));
    return () => es.close();
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

  async function openBrowser() {
    setBrowseOpen(true);
    setBrowseLoading(true);
    try {
      const data = await fetchDirBrowser('/photos');
      setBrowseData(data);
    } catch {
      setBrowseData({ path: '/', parent: null, dirs: [] });
    }
    setBrowseLoading(false);
  }

  async function browseInto(dirPath) {
    setBrowseLoading(true);
    try {
      const data = await fetchDirBrowser(dirPath);
      setBrowseData(data);
    } catch {}
    setBrowseLoading(false);
  }

  function selectBrowsed() {
    if (browseData?.path) setNewPath(browseData.path);
    setBrowseOpen(false);
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

  async function handleSync(source) {
    setSyncError(prev => ({ ...prev, [source]: null }));
    try {
      await triggerSync(source);
    } catch (e) {
      setSyncError(prev => ({ ...prev, [source]: e.message }));
    }
  }

  async function handleAmazonImport() {
    const p = amazonPath.trim();
    if (!p) return;
    const updated = await addWatchFolder(p);
    setFolders(updated);
    setAmazonPath('');
    setAmazonAdded(true);
    setTimeout(() => setAmazonAdded(false), 3000);
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
                  onClick={openBrowser}
                  title="Browse filesystem"
                  style={{
                    background: browseOpen ? '#1e2f45' : '#181818',
                    border: '1px solid ' + (browseOpen ? '#2a4a6a' : '#222'),
                    borderRadius: 5, color: browseOpen ? '#7ab8f5' : '#555',
                    cursor: 'pointer', padding: '5px 9px', fontSize: 13,
                  }}
                >
                  📁
                </button>
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

              {/* Inline folder browser */}
              {browseOpen && (
                <div style={{
                  margin: '4px 18px 8px',
                  background: '#0d0d0d', border: '1px solid #222',
                  borderRadius: 6, overflow: 'hidden',
                }}>
                  {/* Breadcrumb + up */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderBottom: '1px solid #1a1a1a',
                    background: '#131313',
                  }}>
                    {browseData?.parent !== null && browseData?.parent !== undefined && (
                      <button
                        onClick={() => browseInto(browseData.parent)}
                        style={{
                          background: 'none', border: 'none', color: '#4d9eff',
                          cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0,
                        }}
                        title="Up"
                      >↑</button>
                    )}
                    <span style={{
                      flex: 1, fontSize: 11, color: '#666', fontFamily: 'monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      direction: 'rtl', textAlign: 'left',
                    }}>
                      {browseLoading ? '…' : (browseData?.path ?? '')}
                    </span>
                    <button
                      onClick={selectBrowsed}
                      title="Use this path"
                      style={{
                        background: '#1e2f45', border: '1px solid #2a4a6a',
                        borderRadius: 4, color: '#7ab8f5',
                        cursor: 'pointer', fontSize: 11, padding: '2px 8px', flexShrink: 0,
                      }}
                    >
                      Select
                    </button>
                    <button
                      onClick={() => setBrowseOpen(false)}
                      style={{
                        background: 'none', border: 'none', color: '#444',
                        cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0,
                      }}
                    >✕</button>
                  </div>

                  {/* Directory list */}
                  <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {!browseLoading && browseData?.dirs?.length === 0 && (
                      <p style={{ padding: '10px 12px', color: '#333', fontSize: 12, margin: 0 }}>
                        No subdirectories
                      </p>
                    )}
                    {browseData?.dirs?.map(name => {
                      const full = (browseData.path === '/' ? '' : browseData.path) + '/' + name;
                      return (
                        <button
                          key={name}
                          onClick={() => browseInto(full)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            width: '100%', padding: '5px 10px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#bbb', fontSize: 12, textAlign: 'left',
                            fontFamily: 'monospace',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <span style={{ color: '#4d9eff', flexShrink: 0 }}>📁</span>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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

            {/* ── Photo Sync ── */}
            <Section title="Photo Sync">

              {/* iCloud Photos */}
              <SyncSourceHeader label="iCloud Photos" />
              <ToggleSetting
                label="Enabled"
                value={!!settings.icloud_enabled}
                onChange={v => handleSetting('icloud_enabled', v)}
              />
              {settings.icloud_enabled && (
                <>
                  <TextSetting
                    label="Apple ID"
                    value={settings.icloud_apple_id}
                    placeholder="you@icloud.com"
                    onChange={v => handleSetting('icloud_apple_id', v)}
                  />
                  <TextSetting
                    label="Password"
                    type="password"
                    value={settings.icloud_password}
                    placeholder="optional after first auth"
                    onChange={v => handleSetting('icloud_password', v)}
                  />
                  <TextSetting
                    label="Download to"
                    value={settings.icloud_dest}
                    placeholder="/photos/icloud"
                    onChange={v => handleSetting('icloud_dest', v)}
                  />
                  <TextSetting
                    label="Cookie dir"
                    value={settings.icloud_cookie_dir}
                    placeholder="/data/icloud-cookies"
                    onChange={v => handleSetting('icloud_cookie_dir', v)}
                  />
                  <SyncControls
                    job={syncStatus.icloud}
                    error={syncError.icloud}
                    onSync={() => handleSync('icloud')}
                  />
                  <p style={{ fontSize: 11, color: '#3a3a3a', padding: '2px 18px 4px', lineHeight: 1.5 }}>
                    First run: <code style={{ color: '#555' }}>docker exec &lt;container&gt; icloudpd --username &lt;id&gt; --auth-only --cookie-directory /data/icloud-cookies</code>
                  </p>
                </>
              )}

              {/* Amazon Photos */}
              <SyncSourceHeader label="Amazon Photos — one-time import" />
              <p style={{ fontSize: 11, color: '#3a3a3a', padding: '0 18px 8px', lineHeight: 1.6 }}>
                Request your library at amazon.com → Account → Request Your Data → Amazon Photos.
                Extract the ZIP, copy to your server, then add the folder path here.
              </p>
              <div style={{ display: 'flex', gap: 6, padding: '0 18px 6px' }}>
                <input
                  value={amazonPath}
                  onChange={e => setAmazonPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAmazonImport()}
                  placeholder="/photos/amazon-export"
                  style={{
                    flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a',
                    borderRadius: 5, color: '#ccc', fontSize: 11,
                    padding: '5px 8px', outline: 'none', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={handleAmazonImport}
                  disabled={!amazonPath.trim()}
                  style={{
                    background: amazonAdded ? '#1a2f1a' : amazonPath.trim() ? '#1e2f45' : '#181818',
                    border: '1px solid ' + (amazonAdded ? '#2a4a2a' : amazonPath.trim() ? '#2a4a6a' : '#222'),
                    borderRadius: 5,
                    color: amazonAdded ? '#4a9a4a' : amazonPath.trim() ? '#7ab8f5' : '#333',
                    cursor: amazonPath.trim() ? 'pointer' : 'default',
                    padding: '5px 12px', fontSize: 12, whiteSpace: 'nowrap',
                  }}
                >
                  {amazonAdded ? '✓ Added' : 'Add & Index'}
                </button>
              </div>

              <p style={{ fontSize: 11, color: '#3a3a3a', padding: '4px 18px 0', lineHeight: 1.5 }}>
                Also add the iCloud download folder to Watch Folders once sync runs.
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

function SyncSourceHeader({ label }) {
  return (
    <div style={{
      fontSize: 11, color: '#555', fontWeight: 600,
      padding: '10px 18px 4px', borderTop: '1px solid #1a1a1a', marginTop: 6,
    }}>
      {label}
    </div>
  );
}

function ToggleSetting({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 18px' }}>
      <span style={{ flex: 1, fontSize: 13, color: '#aaa' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 36, height: 20, borderRadius: 10, flexShrink: 0,
          background: value ? '#1e3a5f' : '#1a1a1a',
          border: '1px solid ' + (value ? '#2a5a9f' : '#2a2a2a'),
          cursor: 'pointer', padding: 0, position: 'relative',
        }}
      >
        <span style={{
          position: 'absolute', top: 2,
          left: value ? 18 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: value ? '#7ab8f5' : '#444',
          transition: 'left 0.15s',
          display: 'block',
        }} />
      </button>
    </div>
  );
}

function TextSetting({ label, value, placeholder, type = 'text', onChange }) {
  const [local, setLocal] = useState(value ?? '');
  // Sync if parent value changes (e.g. after save)
  useState(() => setLocal(value ?? ''));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 18px' }}>
      <span style={{ flex: 1, fontSize: 13, color: '#aaa', flexShrink: 0 }}>{label}</span>
      <input
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        onKeyDown={e => e.key === 'Enter' && onChange(local)}
        style={{
          width: 170, background: '#1a1a1a', border: '1px solid #2a2a2a',
          borderRadius: 5, color: '#ccc', fontSize: 11,
          padding: '4px 8px', outline: 'none', fontFamily: 'monospace',
        }}
      />
    </div>
  );
}

function SyncControls({ job, error, onSync }) {
  const [showLog, setShowLog] = useState(false);

  // Auto-show log while running
  const wasRunning = job.running;
  if (wasRunning && !showLog) setShowLog(true);

  const lastRunLabel = job.startedAt
    ? new Date(job.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{ padding: '6px 18px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onSync}
          disabled={job.running}
          style={{
            background: job.running ? '#141414' : '#1e2f45',
            border: '1px solid ' + (job.running ? '#222' : '#2a4a6a'),
            borderRadius: 5, color: job.running ? '#444' : '#7ab8f5',
            cursor: job.running ? 'default' : 'pointer',
            padding: '5px 14px', fontSize: 12,
          }}
        >
          {job.running ? 'Syncing…' : 'Sync Now'}
        </button>

        {job.running && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#4d9eff', display: 'inline-block',
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
        )}

        {lastRunLabel && !job.running && (
          <span style={{ fontSize: 11, color: '#3a3a3a' }}>
            Last: {lastRunLabel}
            {job.exitCode !== null && (
              <span style={{ color: job.exitCode === 0 ? '#4a7a4a' : '#7a3a3a', marginLeft: 6 }}>
                {job.exitCode === 0 ? '✓' : `✗ (${job.exitCode})`}
              </span>
            )}
          </span>
        )}

        {job.lines.length > 0 && (
          <button
            onClick={() => setShowLog(s => !s)}
            style={{
              background: 'none', border: 'none', color: '#3a3a3a',
              cursor: 'pointer', fontSize: 11, marginLeft: 'auto', padding: 0,
            }}
          >
            {showLog ? 'hide log' : 'show log'}
          </button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 11, color: '#884444', margin: '4px 0 0' }}>{error}</p>
      )}

      {showLog && job.lines.length > 0 && (
        <div style={{
          marginTop: 6, background: '#080808', border: '1px solid #1a1a1a',
          borderRadius: 4, padding: '6px 8px',
          maxHeight: 140, overflowY: 'auto',
          fontFamily: 'monospace', fontSize: 10, color: '#555',
          lineHeight: 1.6,
        }}>
          {job.lines.slice(-60).map((line, i) => (
            <div key={i} style={{ color: line.startsWith('Error') || line.startsWith('  Error') ? '#884444' : '#555' }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
