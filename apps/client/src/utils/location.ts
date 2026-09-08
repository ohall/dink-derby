import { hasCatchLocation } from '../domain/catchMap';

type CatchLocation = { lat: number; lon: number; error?: never } | { lat?: undefined; lon?: undefined; error: string };

// One-shot fix only, never continuous tracking. The deadline also covers browsers
// that leave a permission prompt pending instead of invoking an error callback.
export function getCatchLocation(timeout = 5000): Promise<CatchLocation> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (result: CatchLocation) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({ error: 'Location timed out.' }), timeout);
    if (!navigator.geolocation) return finish({ error: 'Location is unavailable on this device.' });
    try {
      navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        finish(hasCatchLocation({ locationLat: lat, locationLon: lon }) ? { lat, lon } : { error: 'The device returned an invalid location.' });
      }, error => finish({ error: error.code === 1 ? 'Location permission was denied.' : 'The device could not get a location.' }),
      { timeout, maximumAge: 0, enableHighAccuracy: true });
    } catch { finish({ error: 'Location is unavailable on this device.' }); }
  });
}
