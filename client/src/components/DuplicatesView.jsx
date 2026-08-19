import { useState, useEffect } from 'react';
import { fetchDuplicates, scanDuplicates, dismissGroup, keepBestDuplicate } from '../api/photos.js';
import DuplicateGroup from './DuplicateGroup.jsx';

const PAGE_SIZE = 20;

export default function DuplicatesView({ onOpenPhoto, onGroupCountChange }) {
  const [groups, setGroups]         = useState([]);
  const [total, setTotal]           = useState(null);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError]           = useState(null);

  async function loadPage(p, replace = false) {
    try {
      const data = await fetchDuplicates(p, PAGE_SIZE);
      setTotal(data.total);
      setPage(p);
      setHasMore(p < data.pages);
      setGroups(prev => replace ? data.groups : [...prev, ...data.groups]);
      onGroupCountChange?.(data.total);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    await loadPage(page + 1, false);
    setLoadingMore(false);
  }

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const result = await scanDuplicates();
      setScanResult(result);
      setLoading(true);
      await loadPage(1, true);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  }

  function removeGroupLocal(photoIds) {
    const ids = new Set(photoIds);
    setGroups(prev => prev.filter(g => !photoIds.every(id => new Set(g.map(p => p.id)).has(id))));
    setTotal(prev => {
      const next = (prev ?? 1) - 1;
      onGroupCountChange?.(next);
      return next;
    });
  }

  async function handleDismiss(photoIds) {
    try {
      await dismissGroup(photoIds);
      removeGroupLocal(photoIds);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleKeepBest(photoIds) {
    try {
      await keepBestDuplicate(photoIds);
      removeGroupLocal(photoIds);
    } catch (e) {
      setError(e.message);
    }
  }

  // Initial load
  useEffect(() => {
    loadPage(1, true).finally(() => setLoading(false));
  }, []);

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
          <span style={{ fontSize: 12, color: '#777' }}>
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

      {loading && (
        <p style={{ color: '#777', fontSize: 13 }}>Loading…</p>
      )}

      {!loading && total === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#777' }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>No similar photos to review.</p>
          <p style={{ fontSize: 13 }}>Click "Scan library" to compare perceptual hashes across your library.</p>
        </div>
      )}

      {!loading && total > 0 && (
        <>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
            {total} group{total !== 1 ? 's' : ''} — showing {groups.length}
            {' · '}click a photo to inspect it
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((group, i) => (
              <DuplicateGroup
                key={`${group[0]?.id}-${i}`}
                photos={group}
                onDismiss={() => handleDismiss(group.map(p => p.id))}
                onKeepBest={() => handleKeepBest(group.map(p => p.id))}
                onOpen={(photo) => onOpenPhoto(photo, group)}
              />
            ))}
          </div>

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{
                  background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
                  color: loadingMore ? '#444' : '#aaa', cursor: loadingMore ? 'default' : 'pointer',
                  padding: '8px 28px', fontSize: 13,
                }}
              >
                {loadingMore ? 'Loading…' : `Load more (${total - groups.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
