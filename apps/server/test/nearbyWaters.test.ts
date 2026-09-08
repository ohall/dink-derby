import { describe, expect, it, vi } from 'vitest';
import { createNearbyWaterLookup, distanceToWater, rankWaterSuggestions } from '../src/nearbyWaters';

const square: [number, number][] = [[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01], [-0.01, -0.01]];
const feature = (name = 'Test Lake', geometry = { rings: [square] }, extra: Record<string, unknown> = {}) => ({
  attributes: { GNIS_NAME: name, FTYPE: 390, OBJECTID: 1, GNIS_ID: 'lake-1', ...extra }, geometry,
});
const response = (features = [feature()], extra = {}) => Response.json({ features, ...extra });
const point = { lat: 0, lon: 0 };

describe('water geometry ranking', () => {
  it('ranks the water containing the GPS point before closer label centers', () => {
    expect(distanceToWater({ rings: [square] }, 0, 0)).toEqual({ distanceMeters: 0, containsLocation: true });
    const waters = rankWaterSuggestions([{ layerId: 12, data: { features: [feature('Nearby', { rings: [square.map(([x, y]) => [x + .02, y])] }, { GNIS_ID: 'other' }), feature()] } }], 0, 0);
    expect(waters.map(w => w.name)).toEqual(['Test Lake', 'Nearby']);
    expect(waters[1].distanceMeters).toBeGreaterThan(1000);
  });
  it('respects holes, disjoint polygons and open river paths', () => {
    const hole = square.map(([x, y]): [number, number] => [x / 2, y / 2]);
    expect(distanceToWater({ rings: [square, hole] }, 0, 0).containsLocation).toBe(false);
    expect(distanceToWater({ rings: [square, hole] }, 0, 0).distanceMeters).toBeCloseTo(556, 0);
    expect(distanceToWater({ paths: [[[-.01, -.01], [.01, -.01], [.01, .01]]] }, 0, 0).distanceMeters).toBeGreaterThan(1000);
    expect(distanceToWater({ rings: [square, square.map(([x, y]) => [x + .04, y])] }, 0, 0).containsLocation).toBe(true);
  });
  it('deduplicates river segments, handles lowercase fields and excludes unnamed/distant waters', () => {
    const results = rankWaterSuggestions([{ layerId: 6, data: { features: [
      { attributes: { gnis_name: 'River', gnis_id: 'river', ftype: 460, objectid: 3 }, geometry: { paths: [[[-.01, .01], [.01, .01]]] } },
      { attributes: { gnis_name: 'River', gnis_id: 'river', ftype: 460, objectid: 4 }, geometry: { paths: [[[-.01, .001], [.01, .001]]] } },
      feature(''), feature('Far', { rings: [square.map(([x, y]) => [x + 1, y])] }),
    ] } }], 0, 0);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'River', kind: 'River / stream', id: '6:4', distanceMeters: 111 });
  });
  it('limits the result to six named waters and rejects invalid geometry distances', () => {
    const features = Array.from({ length: 10 }, (_, i) => feature(`Lake ${i}`, { rings: [square] }, { GNIS_ID: String(i + 1) }));
    expect(rankWaterSuggestions([{ layerId: 12, data: { features } }], 0, 0)).toHaveLength(6);
    expect(rankWaterSuggestions([{ layerId: 12, data: { features: [feature('Empty', { rings: [] })] } }], 0, 0)).toEqual([]);
  });
});

describe('bounded USGS lookup', () => {
  it('coalesces concurrent lookups, rounds GPS, caches only suggestions, and expires cache', async () => {
    let time = 0;
    const fetcher = vi.fn(async () => response());
    const lookup = createNearbyWaterLookup({ fetcher, now: () => time });
    const p = { lat: .0000123, lon: .0000234 };
    const [a, b] = await Promise.all([lookup(p), lookup(p)]);
    expect(a).toEqual(b); expect(a.partial).toBe(false); expect(a.suggestions).toHaveLength(1);
    expect(JSON.stringify(a)).not.toContain('rings');
    expect(fetcher).toHaveBeenCalledTimes(3);
    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.searchParams.get('geometry')).toBe('0,0');
    expect(url.searchParams.get('distance')).toBe('5000');
    expect(url.searchParams.get('resultRecordCount')).toBe('200');
    await lookup(p); expect(fetcher).toHaveBeenCalledTimes(3);
    time = 300_001; await lookup(p); expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('returns partial suggestions when a layer fails and does not cache incomplete results', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('/6/query') ? new Response('down', { status: 503 }) : response());
    const lookup = createNearbyWaterLookup({ fetcher });
    expect(await lookup(point)).toMatchObject({ partial: true, suggestions: [{ name: 'Test Lake' }] });
    await lookup(point); expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('labels truncated provider results as partial', async () => {
    expect(await createNearbyWaterLookup({ fetcher: vi.fn(async () => response([feature()], { exceededTransferLimit: true })) })(point)).toMatchObject({ partial: true });
  });
  it('returns an honest empty result when there are no nearby named waters', async () => {
    expect(await createNearbyWaterLookup({ fetcher: vi.fn(async () => response([])) })(point)).toMatchObject({ suggestions: [], partial: false });
  });
  it.each([
    ['unavailable', () => new Response('down', { status: 503 })],
    ['malformed', () => Response.json({ error: { message: 'Bad query' } })],
    ['oversized header', () => new Response('{}', { headers: { 'Content-Length': '2000001' } })],
    ['oversized stream', () => new Response('x'.repeat(2_000_001))],
  ])('fails safely for %s provider responses', async (_, makeResponse) => {
    await expect(createNearbyWaterLookup({ fetcher: vi.fn(async () => makeResponse()) })(point)).rejects.toThrow('Water provider unavailable');
  });
  it('aborts slow requests and frees the concurrency slot for retry', async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const lookup = createNearbyWaterLookup({ fetcher, timeoutMs: 10 });
    await expect(lookup(point)).rejects.toThrow('Water provider unavailable');
    await expect(lookup(point)).rejects.toThrow('Water provider unavailable');
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('validates coordinates before contacting the provider', async () => {
    const fetcher = vi.fn();
    await expect(createNearbyWaterLookup({ fetcher })({ lat: 91, lon: 0 })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
