import { useState, useEffect } from 'react';

export default function TimelineScrubber({ years }) {
  const [activeYear, setActiveYear] = useState(null);

  // Track which year is currently visible at the top of the viewport
  useEffect(() => {
    function onScroll() {
      const header = 52;
      for (const { year } of years) {
        const el = document.getElementById(`year-${year}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= header + 40) setActiveYear(year);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [years]);

  if (!years?.length || years.length < 2) return null;

  function scrollToYear(year) {
    const el = document.getElementById(`year-${year}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 52,
      bottom: 0,
      width: 38,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 50,
      pointerEvents: 'none',
    }}>
      <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {years.map(({ year }) => {
          const active = year === activeYear;
          return (
            <button
              key={year}
              onClick={() => scrollToYear(year)}
              title={year}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 6px',
                color: active ? '#9fc8ff' : '#3a3a3a',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                fontWeight: active ? 700 : 400,
                lineHeight: 1.6,
                textAlign: 'right',
                transition: 'color 0.12s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#888'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#3a3a3a'; }}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}
