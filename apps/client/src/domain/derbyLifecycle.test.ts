import { expect, it } from 'vitest';
import type { Catch, Derby } from '@dink-derby/shared-types';
import { catchWithinDerby, isDerbyComplete } from './derbyLifecycle';
import { buildLeaderboard, findBiggestFish } from './leaderboard';

const derby: Derby = { id: 'd', createdByUserId: 'u', name: 'D', bodyOfWaterName: 'P', scoringMode: 'weight', isArchived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z', status: 'finished' };
it('recognizes explicit and scheduled completion', () => {
  expect(isDerbyComplete(derby)).toBe(true);
  expect(isDerbyComplete({ ...derby, status: 'active' }, Date.parse(derby.endsAt!))).toBe(true);
  expect(isDerbyComplete({ ...derby, status: 'active', endsAt: undefined })).toBe(false);
});
it('excludes catches after cutoff from scores and biggest fish', () => {
  const before = { id: 'a', derbyId: 'd', userId: 'u', count: 1, weightInPounds: 2, caughtAt: derby.createdAt, createdAt: derby.createdAt, updatedAt: derby.createdAt, clientId: 'c' } as Catch;
  const after = { ...before, id: 'b', weightInPounds: 99, caughtAt: '2026-01-03T00:00:00.000Z' };
  expect(catchWithinDerby(derby, before)).toBe(true);
  expect(catchWithinDerby(derby, after)).toBe(false);
  const participants = [{ id: 'p', derbyId: 'd', userId: 'u', isAdmin: true, createdAt: derby.createdAt }];
  expect(buildLeaderboard(derby, [before, after], participants, [])[0].score).toBe(2);
  expect(findBiggestFish(derby, [before, after], participants, [])?.item.id).toBe('a');
});
