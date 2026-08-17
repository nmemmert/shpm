import { useState, useEffect } from 'react';
import { addToCollection, removeFromCollection, fetchCollections, createCollection } from '../api/photos.js';
import { Chip, Btn, iStyle } from './TagEditor.jsx';

export default function CollectionEditor({ photoId, initialCollections }) {
  const [collections, setCollections] = useState(initialCollections);
  const [all, setAll]                 = useState([]);
  const [mode, setMode]               = useState('select');   // 'select' | 'create'
  const [selectedId, setSelectedId]   = useState('');
  const [newName, setNewName]         = useState('');
  const [busy, setBusy]               = useState(false);

  useEffect(() => {
    fetchCollections().then(setAll).catch(() => {});
  }, []);

  const currentIds = new Set(collections.map(c => c.id));
  const available  = all.filter(c => !currentIds.has(c.id));

  async function handleAdd() {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'select') {
        if (!selectedId) return;
        const col = all.find(c => c.id === parseInt(selectedId, 10));
        await addToCollection(photoId, col.id);
        setCollections(prev => [...prev, col]);
        setSelectedId('');
      } else {
        const name = newName.trim();
        if (!name) return;
        const col = await createCollection(name);
        setAll(prev => [...prev, col].sort((a, b) => a.name.localeCompare(b.name)));
        await addToCollection(photoId, col.id);
        setCollections(prev => [...prev, col]);
        setNewName('');
        setMode('select');
      }
    } catch {}
    setBusy(false);
  }

  async function handleRemove(colId) {
    setCollections(prev => prev.filter(c => c.id !== colId));
    try {
      await removeFromCollection(photoId, colId);
    } catch {}
  }

  return (
    <div>
      {collections.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {collections.map(c => (
            <Chip key={c.id} label={c.name} color="green" onRemove={() => handleRemove(c.id)} />
          ))}
        </div>
      )}

      {mode === 'select' ? (
        <div style={{ display: 'flex', gap: 5 }}>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ ...iStyle, cursor: 'pointer' }}
          >
            <option value="">Add to collection…</option>
            {available.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedId && <Btn onClick={handleAdd} disabled={busy}>+</Btn>}
          <Btn
            type="button"
            onClick={() => setMode('create')}
            style={{ width: 'auto', padding: '0 10px', fontSize: 11 }}
          >
            New
          </Btn>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 5 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setMode('select'); }}
            placeholder="Collection name…"
            maxLength={200}
            style={iStyle}
          />
          <Btn onClick={handleAdd} disabled={!newName.trim() || busy}>+</Btn>
          <Btn type="button" onClick={() => setMode('select')}>×</Btn>
        </div>
      )}
    </div>
  );
}
