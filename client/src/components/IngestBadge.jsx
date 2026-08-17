import { useState, useEffect, useRef } from 'react';

export default function IngestBadge({ onScanComplete }) {
  const [status, setStatus] = useState(null);
  const wasActive = useRef(false);

  useEffect(() => {
    const es = new EventSource('/api/ingest/stream');

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setStatus(data);
      if (wasActive.current && !data.active) {
        onScanComplete?.();
      }
      wasActive.current = !!data.active;
    };

    es.onerror = () => {
      // Reconnect is handled automatically by EventSource
    };

    return () => es.close();
  }, []);

  if (!status?.active) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      fontSize: 12, color: '#888',
      overflow: 'hidden', maxWidth: 340,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: '#4d9eff', flexShrink: 0,
        animation: 'pulse-dot 1.4s ease-in-out infinite',
      }} />
      <span style={{ whiteSpace: 'nowrap', color: '#aaa' }}>
        Scanning · {status.scanned.toLocaleString()} indexed
      </span>
      {status.current && (
        <span style={{
          color: '#444', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 11,
        }}>
          {status.current}
        </span>
      )}
    </div>
  );
}
