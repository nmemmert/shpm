import { useState, useRef } from 'react';
import { addTag, removeTag } from '../api/photos.js';

export default function TagEditor({ photoId, initialTags }) {
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState('');
  const [busy, setBusy]   = useState(false);
  const inputRef = useRef(null);

  async function handleAdd(e) {
    e.preventDefault();
    const name = input.trim();
    if (!name || busy) return;
    if (tags.some(t => t.name === name)) { setInput(''); return; }

    setBusy(true);
    try {
      const tag = await addTag(photoId, name);
      setTags(prev => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setInput('');
    } catch {}
    setBusy(false);
    inputRef.current?.focus();
  }

  async function handleRemove(tagId) {
    setTags(prev => prev.filter(t => t.id !== tagId)); // optimistic
    try {
      await removeTag(photoId, tagId);
    } catch {
      // On failure re-fetch would be ideal; for now the optimistic update stays
    }
  }

  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {tags.map(t => (
            <Chip key={t.id} label={t.name} color="neutral" onRemove={() => handleRemove(t.id)} />
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 5 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd(e)}
          placeholder="Add tag…"
          disabled={busy}
          maxLength={100}
          style={iStyle}
        />
        <Btn type="submit" disabled={!input.trim() || busy}>+</Btn>
      </form>
    </div>
  );
}

// ── shared with CollectionEditor ─────────────────────────────────────────────

export function Chip({ label, onRemove, color = 'neutral' }) {
  const colors = {
    neutral: { bg: '#222', border: '#333', text: '#ccc' },
    green:   { bg: '#1a2a1a', border: '#2a3a2a', text: '#8c8' },
  };
  const c = colors[color] ?? colors.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: '3px 7px',
      fontSize: 12, color: c.text,
    }}>
      {label}
      <button
        type="button"
        onClick={onRemove}
        style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, marginLeft: 1 }}
      >
        ×
      </button>
    </span>
  );
}

export const iStyle = {
  flex: 1,
  background: '#181818', border: '1px solid #2a2a2a', borderRadius: 4,
  padding: '5px 8px', color: '#ccc', fontSize: 12, outline: 'none',
  minWidth: 0,
};

export function Btn({ children, style: overrides, disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      {...props}
      style={{
        background: '#222', border: '1px solid #333', borderRadius: 4,
        color: '#999', fontSize: 16, cursor: 'pointer',
        width: 30, height: 30, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        ...overrides,
      }}
    >
      {children}
    </button>
  );
}
