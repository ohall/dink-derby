import { z } from 'zod';
import { NearbyWatersRequestSchema, type NearbyWatersResponse, type WaterSuggestion } from '@dink-derby/shared-types';

const SOURCE = 'USGS National Hydrography Dataset' as const;
const RADIUS = 5000;
const BASE_URL = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer';
const MAX_BYTES = 2_000_000;
const MAX_FEATURES = 200;
const LAYERS = [{ id: 12, types: '390,436' }, { id: 9, types: '460' }, { id: 6, types: '460,336' }];
const pointSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const geometrySchema = z.object({
  rings: z.array(z.array(pointSchema).max(50_000)).max(2000).optional(),
  paths: z.array(z.array(pointSchema).max(50_000)).max(2000).optional(),
});
const featureSchema = z.object({ attributes: z.record(z.unknown()), geometry: geometrySchema });
const resultSchema = z.object({ features: z.array(featureSchema).max(MAX_FEATURES), exceededTransferLimit: z.boolean().optional() });
type Geometry = z.infer<typeof geometrySchema>;
type LayerResult = { layerId: number; data: z.infer<typeof resultSchema> };

function relativePoint(point: [number, number], lat: number, lon: number): [number, number] {
  const longitudeDelta = ((point[0] - lon + 540) % 360) - 180;
  const radians = Math.PI / 180;
  return [longitudeDelta * radians * 6_371_000 * Math.cos(lat * radians), (point[1] - lat) * radians * 6_371_000];
}

function segmentDistance(a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared)) : 0;
  return Math.hypot(a[0] + t * dx, a[1] + t * dy);
}

// Local projection is adequate for approximate distances within the 5km search.
// Ring parity respects islands/holes; paths must not be closed into fake polygons.
export function distanceToWater(geometry: Geometry, lat: number, lon: number) {
  let distanceMeters = Infinity;
  let inside = false;
  for (const ring of geometry.rings || []) {
    if (ring.length < 3) continue;
    let previous = relativePoint(ring[ring.length - 1], lat, lon);
    for (const point of ring) {
      const next = relativePoint(point, lat, lon);
      distanceMeters = Math.min(distanceMeters, segmentDistance(previous, next));
      if ((previous[1] > 0) !== (next[1] > 0) && (previous[0] + (next[0] - previous[0]) * -previous[1] / (next[1] - previous[1])) > 0) inside = !inside;
      previous = next;
    }
  }
  for (const path of geometry.paths || []) {
    for (let index = 1; index < path.length; index++) {
      distanceMeters = Math.min(distanceMeters, segmentDistance(relativePoint(path[index - 1], lat, lon), relativePoint(path[index], lat, lon)));
    }
  }
  return { distanceMeters: inside ? 0 : distanceMeters, containsLocation: inside };
}

export function rankWaterSuggestions(layers: LayerResult[], lat: number, lon: number): WaterSuggestion[] {
  const byWater = new Map<string, WaterSuggestion>();
  for (const { layerId, data } of layers) for (const feature of data.features) {
    // The published flowline layer uses lowercase fields; polygon layers use uppercase.
    const attributes = Object.fromEntries(Object.entries(feature.attributes).map(([key, value]) => [key.toLowerCase(), value]));
    const name = typeof attributes.gnis_name === 'string' ? attributes.gnis_name.trim().slice(0, 150) : '';
    const kinds: Record<number, WaterSuggestion['kind']> = { 390: 'Lake / pond', 436: 'Reservoir', 460: 'River / stream', 336: 'Canal' };
    const kind = kinds[Number(attributes.ftype)];
    if (!name || !kind) continue;
    const distance = distanceToWater(feature.geometry, lat, lon);
    if (!Number.isFinite(distance.distanceMeters) || distance.distanceMeters > RADIUS + 25) continue;
    const gnisId = String(attributes.gnis_id || '').trim();
    const key = gnisId ? `gnis:${gnisId}` : `${kind}:${name.toLowerCase()}`;
    const candidate: WaterSuggestion = {
      id: `${layerId}:${String(attributes.permanent_identifier || attributes.objectid || key)}`.slice(0, 150),
      name, kind, containsLocation: distance.containsLocation, distanceMeters: Math.round(distance.distanceMeters),
    };
    const existing = byWater.get(key);
    if (!existing || (candidate.containsLocation && !existing.containsLocation) || (candidate.containsLocation === existing.containsLocation && candidate.distanceMeters < existing.distanceMeters)) byWater.set(key, candidate);
  }
  return [...byWater.values()].sort((a, b) => Number(b.containsLocation) - Number(a.containsLocation) || a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name)).slice(0, 6);
}

async function boundedJson(response: Response) {
  if (!response.ok || !response.body) throw new Error('Water provider unavailable');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body.cancel(); throw new Error('Water provider response too large'); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Water provider response too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return resultSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export function createNearbyWaterLookup({ fetcher = fetch, now = Date.now, timeoutMs = 12_000 }: {
  fetcher?: typeof fetch; now?: () => number; timeoutMs?: number;
} = {}) {
  const cache = new Map<string, { expires: number; value: NearbyWatersResponse }>();
  const pending = new Map<string, Promise<NearbyWatersResponse>>();
  return async (input: { lat: number; lon: number }): Promise<NearbyWatersResponse> => {
    const validated = NearbyWatersRequestSchema.parse(input);
    // Roughly 11m precision: no full GPS precision, actor ID or derby data goes upstream.
    const lat = Number(validated.lat.toFixed(4)), lon = Number(validated.lon.toFixed(4));
    const key = `${lat},${lon}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.value;
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= 3) throw new Error('Water lookup is busy');

    const work = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const results = await Promise.allSettled(LAYERS.map(async layer => {
          const params = new URLSearchParams({
            f: 'json', where: `GNIS_NAME IS NOT NULL AND FTYPE IN (${layer.types})`,
            geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
            spatialRel: 'esriSpatialRelIntersects', distance: String(RADIUS), units: 'esriSRUnit_Meter',
            outFields: 'OBJECTID,PERMANENT_IDENTIFIER,GNIS_ID,GNIS_NAME,FTYPE',
            outSR: '4326', returnGeometry: 'true', returnZ: 'false', returnM: 'false',
            geometryPrecision: '5', maxAllowableOffset: '0.00005', resultRecordCount: String(MAX_FEATURES),
          });
          const response = await fetcher(`${BASE_URL}/${layer.id}/query?${params}`, {
            headers: { 'User-Agent': 'DinkDerby/1.0 (https://dinkderby.com)', Accept: 'application/json' },
            signal: controller.signal,
          });
          return { layerId: layer.id, data: await boundedJson(response) };
        }));
        const layers = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        if (!layers.length) throw new Error('Water provider unavailable');
        const value: NearbyWatersResponse = { suggestions: rankWaterSuggestions(layers, lat, lon), radiusMeters: RADIUS, source: SOURCE,
          partial: layers.length !== LAYERS.length || layers.some(layer => layer.data.exceededTransferLimit) };
        // Cache names/distances only, never provider geometries or user identity.
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        if (!value.partial) cache.set(key, { value, expires: now() + 300_000 });
        return value;
      } finally { clearTimeout(timer); }
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}

export const lookupNearbyWaters = createNearbyWaterLookup();
