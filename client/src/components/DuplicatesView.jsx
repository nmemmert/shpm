import { useState, useEffect } from 'react';
import { fetchDuplicates, scanDuplicates, dismissGroup } from '../api/photos.js';
import DuplicateGroup from './DuplicateGroup.jsx';

export default function DuplicatesView({ onOpenPhoto, onGroupCountChange }) {
  const [groups, setGroups]         = useState(null);
  const [scanning, setScanning]     = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError]           = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await fetchDuplicates();
      setGroups(data.groups);
      onGroupCountChange?.(data.total);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const result = await scanDuplicates();
      setScanResult(result);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setScanning(false);
  }

  async function handleDismiss(photoIds) {
    try {
      await dismissGroup(photoIds);
      setGroups(prev => {
        const next = prev.filter(g => {
          const s = new Set(g.map(p => p.id));
          return !photoIds.every(id => s.has(id));
        });
        onGroupCountChange?.(next.length);
        return next;
      });
    } catch {}
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#999', margin: 0 }}>Similar photos</h1>

        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
            color: scanning ? '#444' : '#aaa', cursor: scanning ? 'default' : 'pointer',
            padding: '5px 14px', fontSize: 13,
          }}
        >
          {scanning ? 'Scanning…' : 'Scan library'}
        </button>

        {scanResult && (
          <span style={{ fontSize: 12, color: '#555' }}>
            {scanResult.newPairs === 0
              ? 'No new pairs'
              : `${scanResult.newPairs} new pair${scanResult.newPairs !== 1 ? 's' : ''} found`}
            {' · '}{scanResult.photos.toLocaleString()} photos · {scanResult.duration}ms
          </span>
        )}
      </div>

      {error && (
        <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      {groups === null && (
        <p style={{ color: '#555', fontSize: 13 }}>Loading…</p>
      )}

      {groups !== null && groups.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#555' }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>No similar photos to review.</p>
          <p style={{ fontSize: 13 }}>Click "Scan library" to compare perceptual hashes across your library.</p>
        </div>
      )}

      {groups !== null && groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: '#444', marginBottom: 4 }}>
            {groups.length} group{groups.length !== 1 ? 's' : ''} — click a photo to inspect it, "Not duplicates" to dismiss
          </p>
          {groups.map((group, i) => (
            <DuplicateGroup
              key={i}
              photos={group}
              onDismiss={() => handleDismiss(group.map(p => p.id))}
              onOpen={(photo) => onOpenPhoto(photo, group)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
