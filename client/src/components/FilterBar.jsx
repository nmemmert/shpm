const EMPTY = { q: '', from: '', to: '', tagId: '', collectionId: '' };

function isActive(f) {
  return f.q || f.from || f.to || f.tagId || f.collectionId;
}

export default function FilterBar({ filters, onChange, tags, collections }) {
  const s = { // shared input style
    background: '#111', border: '1px solid #222', borderRadius: 5,
    color: '#ccc', fontSize: 12, padding: '4px 8px',
    outline: 'none',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 20px', borderBottom: '1px solid #141414',
      background: '#0c0c0c', flexWrap: 'wrap',
    }}>
      <input
        type="search"
        placeholder="Search…"
        value={filters.q}
        onChange={e => onChange({ ...filters, q: e.target.value })}
        style={{ ...s, width: 160 }}
      />

      <input
        type="date"
        value={filters.from}
        onChange={e => onChange({ ...filters, from: e.target.value })}
        style={{ ...s, colorScheme: 'dark' }}
        title="From date"
      />
      <span style={{ color: '#333', fontSize: 11 }}>–</span>
      <input
        type="date"
        value={filters.to}
        onChange={e => onChange({ ...filters, to: e.target.value })}
        style={{ ...s, colorScheme: 'dark' }}
        title="To date"
      />

      {tags.length > 0 && (
        <select
          value={filters.tagId}
          onChange={e => onChange({ ...filters, tagId: e.target.value })}
          style={{ ...s }}
        >
          <option value="">All tags</option>
          {tags.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      {collections.length > 0 && (
        <select
          value={filters.collectionId}
          onChange={e => onChange({ ...filters, collectionId: e.target.value })}
          style={{ ...s }}
        >
          <option value="">All collections</option>
          {collections.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {isActive(filters) && (
        <button
          onClick={() => onChange(EMPTY)}
          style={{
            background: 'transparent', border: '1px solid #2a2a2a',
            borderRadius: 5, color: '#555', cursor: 'pointer',
            padding: '4px 10px', fontSize: 11,
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
