import { describe, expect, it } from 'vitest';
import type { Catch, Derby } from '@dink-derby/shared-types';
import { buildCatchMap, groupCatchLocations, hasCatchLocation } from './catchMap';

const now = '2026-09-08T12:00:00Z';
const derby: Derby = { id: 'derby', name: 'Test', bodyOfWaterName: 'Lake', scoringMode: 'weight', createdByUserId: 'me', isArchived: false, createdAt: now, updatedAt: now };
const fish = (id: string, patch: Partial<Catch> = {}): Catch => ({ id, derbyId: derby.id, userId: 'me', count: 1, locationLat: 44.28, locationLon: -73.98, caughtAt: now, createdAt: now, updatedAt: now, clientId: 'device', isPendingSync: false, ...patch });

describe('catch map data', () => {
  it('filters to this derby and angler, without discarding offline catches or mutating input', () => {
    const catches = [fish('pending', { isPendingSync: true }), fish('other-user', { userId: 'other' }), fish('other-derby', { derbyId: 'elsewhere' }), fish('removed', { deletedAt: now })];
    expect(buildCatchMap(derby, catches, 'me').points.map(point => point.item.id)).toEqual(['pending']);
    expect(buildCatchMap(derby, catches).totalCount).toBe(2);
    expect(catches.map(item => item.id)).toEqual(['pending', 'other-user', 'other-derby', 'removed']);
  });
  it('numbers locations chronologically with a stable tie-break and reports missing coordinates', () => {
    const data = buildCatchMap(derby, [fish('b'), fish('a'), fish('early', { caughtAt: '2026-09-08T11:00:00Z' }), fish('missing', { locationLat: undefined }), fish('invalid', { locationLon: NaN })]);
    expect(data.points.map(point => [point.item.id, point.number])).toEqual([['early', 1], ['a', 2], ['b', 3]]);
    expect(data.missingCount).toBe(2);
    expect(data.totalCount).toBe(5);
  });
  it('retains catches at or before completion, including ones received later from offline phones', () => {
    const finished = { ...derby, endsAt: now, status: 'finished' as const };
    const data = buildCatchMap(finished, [fish('at-cutoff'), fish('late', { caughtAt: '2026-09-08T12:01:00Z' })]);
    expect(data.points.map(point => point.item.id)).toEqual(['at-cutoff']);
  });
  it('accepts zero coordinates and rejects partial, non-finite, or out-of-range locations', () => {
    expect(hasCatchLocation({ locationLat: 0, locationLon: 0 })).toBe(true);
    for (const [lat, lon] of [[91, 0], [0, 181], [NaN, 0], [0, Infinity], [0, undefined], [undefined, 0]]) {
      expect(hasCatchLocation({ locationLat: lat, locationLon: lon })).toBe(false);
    }
  });
  it('keeps all coincident catches reachable in a shared location group', () => {
    const { points } = buildCatchMap(derby, [fish('a'), fish('b'), fish('c', { locationLat: 44.29 })]);
    expect(groupCatchLocations(points).map(group => group.map(point => point.number))).toEqual([[1, 2], [3]]);
  });
});
