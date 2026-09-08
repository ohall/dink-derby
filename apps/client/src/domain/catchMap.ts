import type { Catch, Derby } from '@dink-derby/shared-types';
import { catchWithinDerby } from './derbyLifecycle';

export type LocatedCatch = Catch & { locationLat: number; locationLon: number };
export type CatchMapPoint = { item: LocatedCatch; number: number };

export function hasCatchLocation<T extends Pick<Catch, 'locationLat' | 'locationLon'>>(item: T): item is T & { locationLat: number; locationLon: number } {
  return typeof item.locationLat === 'number' && Number.isFinite(item.locationLat) && Math.abs(item.locationLat) <= 90
    && typeof item.locationLon === 'number' && Number.isFinite(item.locationLon) && Math.abs(item.locationLon) <= 180;
}

export function buildCatchMap(derby: Derby, catches: Catch[], userId?: string) {
  const eligible = catches.filter(item => item.derbyId === derby.id && catchWithinDerby(derby, item) && (!userId || item.userId === userId))
    .sort((a, b) => a.caughtAt.localeCompare(b.caughtAt) || a.id.localeCompare(b.id));
  const points: CatchMapPoint[] = eligible.filter(hasCatchLocation).map((item, index) => ({ item, number: index + 1 }));
  return { points, missingCount: eligible.length - points.length, totalCount: eligible.length };
}

// Coincident catches share a pin, but each stays individually selectable in the list.
export function groupCatchLocations(points: CatchMapPoint[]) {
  const groups = new Map<string, CatchMapPoint[]>();
  for (const point of points) {
    const key = `${point.item.locationLat},${point.item.locationLon}`;
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }
  return [...groups.values()];
}
