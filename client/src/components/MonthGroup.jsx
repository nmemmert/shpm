import PhotoCard from './PhotoCard.jsx';

export default function MonthGroup({ label, photos, startIdx, onSelect }) {
  return (
    <section style={{ marginBottom: 8 }}>
      <h2 style={{
        padding: '18px 6px 8px',
        fontSize: 13,
        fontWeight: 600,
        color: '#666',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        userSelect: 'none',
      }}>
        {label}
        <span style={{ marginLeft: 8, color: '#3a3a3a', fontWeight: 400 }}>
          {photos.length.toLocaleString()}
        </span>
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 3,
      }}>
        {photos.map((photo, i) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onClick={() => onSelect(startIdx + i)}
          />
        ))}
      </div>
    </section>
  );
}
