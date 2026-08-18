const cache    = new Map();
let lastCallMs = 0;

export async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  // Nominatim ToS: max 1 request/second
  const wait = 1100 - (Date.now() - lastCallMs);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallMs = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Luma/1.0 self-hosted-photo-manager' },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const place = {
      city:    data.address?.city
            ?? data.address?.town
            ?? data.address?.village
            ?? data.address?.county
            ?? null,
      country: data.address?.country ?? null,
    };
    cache.set(key, place);
    return place;
  } catch (err) {
    console.warn(`[geocode] ${lat.toFixed(4)},${lon.toFixed(4)}: ${err.message}`);
    cache.set(key, null);
    return null;
  }
}
