import { useState } from 'react';

const MAX_DEFAULT = 5;

export default function FilterSidebar({ filters, onChange, stats, total }) {
  const [expanded, setExpanded] = useState({});

  function toggle(section) {
    setExpanded(e => ({ ...e, [section]: !e[section] }));
  }

  // Derive active sidebar selection
  const selectedYear  = (filters.from && filters.to)
    ? filters.from.slice(0, 4)
    : null;
  const isStarred     = filters.starred === '1';
  const isAll         = !isStarred && !selectedYear && !filters.tagId && !filters.collectionId;

  function selectAll() {
    onChange({ q: filters.q, from: '', to: '', tagId: '', collectionId: '', starred: '' });
  }
  function selectStarred() {
    onChange({ q: filters.q, from: '', to: '', tagId: '', collectionId: '', starred: '1' });
  }
  function selectYear(year) {
    onChange({ q: filters.q, from: `${year}-01-01`, to: `${year}-12-31`, tagId: '', collectionId: '', starred: '' });
  }
  function selectTag(id) {
    onChange({ q: filters.q, from: '', to: '', tagId: String(id), collectionId: '', starred: '' });
  }
  function selectCollection(id) {
    onChange({ q: filters.q, from: '', to: '', tagId: '', collectionId: String(id), starred: '' });
  }

  return (
    <nav style={{ padding: '10px 0 24px', userSelect: 'none' }}>

      {/* Search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          type="search"
          placeholder="Search…"
          value={filters.q}
          onChange={e => onChange({ ...filters, q: e.target.value })}
          style={{
            width: '100%', background: '#1a1a1a', border: '1px solid #242424',
            borderRadius: 7, color: '#ccc', fontSize: 12,
            padding: '6px 10px', outline: 'none',
          }}
        />
      </div>

      {/* All Photos */}
      <Row
        active={isAll && !filters.q}
        onClick={selectAll}
        icon="⊞"
        label="All Photos"
        count={stats?.total ?? total}
      />

      {/* Favorites */}
      {(stats?.starred > 0 || isStarred) && (
        <Row
          active={isStarred}
          onClick={selectStarred}
          icon="★"
          iconColor="#f5c518"
          label="Favorites"
          count={stats?.starred}
        />
      )}

      {/* Date Taken */}
      {stats?.years?.length > 0 && (
        <Section title="Date Taken">
          {(expanded.years ? stats.years : stats.years.slice(0, MAX_DEFAULT)).map(({ year, count }) => (
            <Row
              key={year}
              active={selectedYear === year}
              onClick={() => selectYear(year)}
              label={year}
              count={count}
              indent
            />
          ))}
          {stats.years.length > MAX_DEFAULT && (
            <SeeMore expanded={expanded.years} onClick={() => toggle('years')} />
          )}
        </Section>
      )}

      {/* Tags */}
      {stats?.tags?.length > 0 && (
        <Section title="Tags">
          {(expanded.tags ? stats.tags : stats.tags.slice(0, MAX_DEFAULT)).map(tag => (
            <Row
              key={tag.id}
              active={filters.tagId === String(tag.id)}
              onClick={() => selectTag(tag.id)}
              label={tag.name}
              count={tag.count}
              indent
            />
          ))}
          {stats.tags.length > MAX_DEFAULT && (
            <SeeMore expanded={expanded.tags} onClick={() => toggle('tags')} />
          )}
        </Section>
      )}

      {/* Collections */}
      {stats?.collections?.length > 0 && (
        <Section title="Collections">
          {(expanded.collections ? stats.collections : stats.collections.slice(0, MAX_DEFAULT)).map(col => (
            <Row
              key={col.id}
              active={filters.collectionId === String(col.id)}
              onClick={() => selectCollection(col.id)}
              label={col.name}
              count={col.photo_count}
              indent
            />
          ))}
          {stats.collections.length > MAX_DEFAULT && (
            <SeeMore expanded={expanded.collections} onClick={() => toggle('collections')} />
          )}
        </Section>
      )}
    </nav>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color: '#3a3a3a', textTransform: 'uppercase',
        padding: '0 16px 4px',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ active, onClick, icon, iconColor, label, count, indent }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: `5px ${indent ? '16px' : '14px'}`,
        background: active ? '#1e2a3a' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: active ? '#9fc8ff' : '#aaa',
        fontSize: 13, textAlign: 'left',
        borderLeft: active ? '2px solid #4d9eff' : '2px solid transparent',
      }}
    >
      {icon && (
        <span style={{ fontSize: 12, flexShrink: 0, color: iconColor ?? 'inherit', lineHeight: 1 }}>
          {icon}
        </span>
      )}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {count != null && (
        <span style={{ fontSize: 11, color: active ? '#5a7a9a' : '#333', flexShrink: 0 }}>
          {Number(count).toLocaleString()}
        </span>
      )}
    </button>
  );
}

function SeeMore({ expanded, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 16px 3px 20px',
        background: 'transparent', border: 'none',
        color: '#4d9eff', cursor: 'pointer', fontSize: 12,
      }}
    >
      {expanded ? 'See less ▲' : 'See more ▼'}
    </button>
  );
}
