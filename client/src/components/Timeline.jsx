import MonthGroup from './MonthGroup.jsx';

function groupByMonth(photos) {
  const groups = [];
  let current  = null;

  for (const photo of photos) {
    const key = photo.date_taken ? photo.date_taken.slice(0, 7) : 'undated';

    if (!current || current.key !== key) {
      current = { key, label: monthLabel(photo.date_taken), photos: [] };
      groups.push(current);
    }
    current.photos.push(photo);
  }

  return groups;
}

function monthLabel(dateTaken) {
  if (!dateTaken) return 'Undated';
  return new Date(dateTaken).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Timeline({ photos, onSelect }) {
  if (!photos.length) return null;

  const groups = groupByMonth(photos);
  let globalIdx = 0;

  return (
    <main style={{ padding: '0 3px' }}>
      {groups.map(group => {
        const startIdx = globalIdx;
        globalIdx += group.photos.length;
        return (
          <MonthGroup
            key={group.key}
            label={group.label}
            photos={group.photos}
            startIdx={startIdx}
            onSelect={onSelect}
          />
        );
      })}
    </main>
  );
}
