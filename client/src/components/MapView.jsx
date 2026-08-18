import { useEffect, useState, useMemo, Component } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { fetchMapPhotos } from '../api/photos.js';

class MapErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 24, color: '#f87171', fontSize: 14 }}>
        Map failed to load: {this.state.error.message}
      </div>
    );
    return this.props.children;
  }
}

// Custom dot icon — avoids Leaflet's broken default asset URLs in Vite
const dotIcon = (color = '#4d9eff') =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:12px;height:12px;border-radius:50%;
      background:${color};border:2px solid rgba(255,255,255,0.85);
      box-shadow:0 1px 4px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -8],
  });

const ICON = dotIcon();

function centroid(points) {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  return [lat, lon];
}

export default function MapView({ onOpenPhoto }) {
  const [points, setPoints] = useState(null);
  const [error, setError]   = useState(null);

  useEffect(() => {
    fetchMapPhotos()
      .then(setPoints)
      .catch(e => setError(e.message));
  }, []);

  const validPoints = useMemo(() =>
    (points ?? []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
  [points]);

  const center = useMemo(() => {
    if (!validPoints.length) return [20, 0];
    return centroid(validPoints);
  }, [validPoints]);

  if (error) return (
    <p style={{ color: '#f87171', padding: 24, fontSize: 13 }}>{error}</p>
  );

  if (points === null) return (
    <p style={{ color: '#777', padding: 24, fontSize: 13 }}>Loading map…</p>
  );

  if (validPoints.length === 0) return (
    <div style={{ textAlign: 'center', paddingTop: 60, color: '#777' }}>
      <p style={{ fontSize: 15, marginBottom: 8 }}>No geotagged photos.</p>
      <p style={{ fontSize: 13 }}>Photos with GPS metadata will appear here once indexed.</p>
    </div>
  );

  return (
    <MapErrorBoundary>
    <div style={{ height: 'calc(100vh - 52px)' }}>
      <MapContainer
        center={center}
        zoom={4}
        style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
          maxZoom={19}
        />

        <MarkerClusterGroup chunkedLoading>
          {validPoints.map(p => (
            <Marker key={p.id} position={[p.lat, p.lon]} icon={ICON}>
              <Popup maxWidth={220} className="luma-popup">
                <div style={{ margin: 0, padding: 0 }}>
                  {p.thumb_url && (
                    <img
                      src={p.thumb_url}
                      alt=""
                      onClick={() => onOpenPhoto(p)}
                      style={{
                        width: 200, height: 150,
                        objectFit: 'cover', display: 'block',
                        cursor: 'pointer', borderRadius: 3,
                      }}
                    />
                  )}
                  {p.date_taken && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4, textAlign: 'center' }}>
                      {new Date(p.date_taken).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
    </MapErrorBoundary>
  );
}
