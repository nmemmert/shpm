import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPhotos, fetchLibraryStats } from './api/photos.js';
import Timeline from './components/Timeline.jsx';
import Lightbox from './components/Lightbox.jsx';
import FilterSidebar from './components/FilterSidebar.jsx';
import IngestBadge from './components/IngestBadge.jsx';
import DuplicatesView from './components/DuplicatesView.jsx';

import { lazy, Suspense } from 'react';
const MapView = lazy(() => import('./components/MapView.jsx'));

const EMPTY_FILTERS = { q: '', from: '', to: '', tagId: '', collectionId: '', starred: '' };
const SIDEBAR_W = 210;

export default function App() {
  const [view, setView]             = useState('library');
  const [photos, setPhotos]         = useState([]);
  const [nextCursor, setNextCursor] = useState(undefined);
  const [loading, setLoading]       = useState(false);
  const [total, setTotal]           = useState(null);
  const [error, setError]           = useState(null);
  const [dupeCount, setDupeCount]   = useState(0);

  const [filters, setFilters]   = useState(EMPTY_FILTERS);
  const [stats, setStats]       = useState(null);

  const [lbPhotos, setLbPhotos] = useState(null);
  const [lbIndex, setLbIndex]   = useState(null);

  const loadingRef  = useRef(false);
  const sentinelRef = useRef(null);

  const loadStats = useCallback(() => {
    fetchLibraryStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, []);

  // Reset + reload when filters change (debounce text search)
  useEffect(() => {
    const delay = filters.q ? 300 : 0;
    const timer = setTimeout(() => {
      setPhotos([]);
      setNextCursor(undefined);
      loadPage(undefined, filters);
    }, delay);
    return () => clearTimeout(timer);
  }, [filters]);

  async function loadPage(cursor, activeFilters) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPhotos({ cursor, ...activeFilters });
      setPhotos(prev => cursor !== undefined ? [...prev, ...data.photos] : data.photos);
      setNextCursor(data.nextCursor ?? null);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    }
    loadingRef.current = false;
    setLoading(false);
  }

  // Infinite scroll sentinel
  useEffect(() => {
    if (!sentinelRef.current || !nextCursor || view !== 'library') return;
    const el  = sentinelRef.current;
    const cur = nextCursor;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadPage(cur, filters); },
      { rootMargin: '600px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, view, filters]);

  function openLightbox(photosArr, idx) {
    setLbPhotos(photosArr);
    setLbIndex(idx);
  }

  // When a photo's star state changes in the lightbox, patch it in the local list
  function handleStarChange(updated) {
    setPhotos(prev => prev.map(p => p.id === updated.id ? { ...p, starred: updated.starred } : p));
    if (lbPhotos) {
      setLbPhotos(prev => prev.map(p => p.id === updated.id ? { ...p, starred: updated.starred } : p));
    }
    loadStats(); // refresh sidebar count
  }

  // When ingest finishes, refresh photos + stats
  function handleScanComplete() {
    setPhotos([]);
    setNextCursor(undefined);
    loadPage(undefined, filters);
    loadStats();
  }

  const hasFilter = filters.q || filters.from || filters.to || filters.tagId || filters.collectionId || filters.starred;

  return (
    <>
      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#0f0f0f', borderBottom: '1px solid #1c1c1c',
        height: 52, padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginRight: 20, letterSpacing: -0.3 }}>
          Luma
        </span>

        <nav style={{ display: 'flex', gap: 2 }}>
          <Tab active={view === 'library'}    onClick={() => setView('library')}>
            Library
            {total !== null && (
              <span style={{ marginLeft: 6, fontSize: 12, color: view === 'library' ? '#555' : '#3a3a3a' }}>
                {total.toLocaleString()}
              </span>
            )}
          </Tab>
          <Tab active={view === 'map'}        onClick={() => setView('map')}>Map</Tab>
          <Tab active={view === 'duplicates'} onClick={() => setView('duplicates')}>
            Duplicates
            {dupeCount > 0 && (
              <span style={{
                marginLeft: 6, background: '#b8860b', color: '#fff',
                borderRadius: 10, fontSize: 10, fontWeight: 700,
                padding: '1px 6px', lineHeight: '16px',
              }}>
                {dupeCount}
              </span>
            )}
          </Tab>
        </nav>

        {/* Ingest progress — right side */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <IngestBadge onScanComplete={handleScanComplete} />
        </div>
      </header>

      {/* ── Body (sidebar + content) ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* Sidebar — only in library view */}
        {view === 'library' && (
          <aside style={{
            position: 'sticky', top: 52,
            width: SIDEBAR_W, flexShrink: 0,
            height: 'calc(100vh - 52px)', overflowY: 'auto',
            borderRight: '1px solid #141414', background: '#0a0a0a',
          }}>
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              stats={stats}
              total={total}
            />
          </aside>
        )}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Library */}
          {view === 'library' && (
            <>
              {error && (
                <p style={{ color: '#f87171', padding: 24, textAlign: 'center', fontSize: 14 }}>
                  {error}
                </p>
              )}
              {photos.length === 0 && !loading && !error && (
                <div style={{ textAlign: 'center', padding: '80px 24px', color: '#555' }}>
                  {hasFilter ? (
                    <p style={{ fontSize: 15 }}>No photos match these filters.</p>
                  ) : (
                    <>
                      <p style={{ fontSize: 15, marginBottom: 8 }}>No photos indexed yet.</p>
                      <p style={{ fontSize: 13 }}>Set <code>PHOTO_DIR</code> in <code>.env</code> and run <code>npm run worker</code>.</p>
                    </>
                  )}
                </div>
              )}
              <Timeline photos={photos} onSelect={(idx) => openLightbox(photos, idx)} />
              <div ref={sentinelRef} style={{ height: 1 }} />
              {loading && <p style={{ textAlign: 'center', padding: 24, color: '#444', fontSize: 13 }}>Loading…</p>}
              {nextCursor === null && photos.length > 0 && !loading && (
                <p style={{ textAlign: 'center', padding: 24, color: '#2a2a2a', fontSize: 12 }}>
                  — {total?.toLocaleString()} photo{total === 1 ? '' : 's'} —
                </p>
              )}
            </>
          )}

          {/* Map */}
          {view === 'map' && (
            <Suspense fallback={<p style={{ padding: 24, color: '#555', fontSize: 13 }}>Loading map…</p>}>
              <MapView onOpenPhoto={(photo) => openLightbox([photo], 0)} />
            </Suspense>
          )}

          {/* Duplicates */}
          {view === 'duplicates' && (
            <DuplicatesView
              onGroupCountChange={setDupeCount}
              onOpenPhoto={(photo, group) =>
                openLightbox(group, group.findIndex(p => p.id === photo.id))
              }
            />
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lbPhotos !== null && (
        <Lightbox
          photos={lbPhotos}
          index={lbIndex}
          onClose={() => { setLbPhotos(null); setLbIndex(null); }}
          onChange={setLbIndex}
          onStarChange={handleStarChange}
        />
      )}
    </>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#1e1e1e' : 'transparent',
        border: 'none', borderRadius: 6,
        color: active ? '#e0e0e0' : '#666',
        cursor: 'pointer', padding: '5px 12px', fontSize: 13,
        fontWeight: active ? 600 : 400,
        display: 'flex', alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}
