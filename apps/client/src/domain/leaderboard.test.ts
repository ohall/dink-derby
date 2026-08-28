import { describe, expect, it } from 'vitest';
import type { Catch, Derby, DerbyParticipant, User } from '@dink-derby/shared-types';
import { buildLeaderboard, findBiggestFish, scoringRuleLabel } from './leaderboard';

const now = '2026-08-27T12:00:00.000Z';
const users: User[] = [
  { id: 'one', displayName: 'One', createdAt: now, updatedAt: now },
  { id: 'two', displayName: 'Two', createdAt: now, updatedAt: now },
];
const participants: DerbyParticipant[] = users.map((user) => ({
  id: `p-${user.id}`,
  derbyId: 'derby',
  userId: user.id,
  isAdmin: user.id === 'one',
  createdAt: now,
}));

const derby = (scoringStyle: Derby['scoringStyle'], bestN?: number): Derby => ({
  id: 'derby',
  name: 'Test',
  bodyOfWaterName: 'Test Lake',
  scoringMode: 'length',
  scoringUnit: 'in',
  scoringStyle,
  bestN,
  createdByUserId: 'one',
  isArchived: false,
  createdAt: now,
  updatedAt: now,
});

const fish = (id: string, userId: string, lengthInInches: number, pending = false): Catch => ({
  id,
  derbyId: 'derby',
  userId,
  lengthInInches,
  count: 1,
  caughtAt: now,
  createdAt: now,
  updatedAt: now,
  clientId: 'device',
  isPendingSync: pending,
});

describe('buildLeaderboard', () => {
  it('uses the single biggest catch when configured', () => {
    const rows = buildLeaderboard(
      derby('biggest'),
      [fish('a', 'one', 11), fish('b', 'one', 19), fish('c', 'two', 18)],
      participants,
      users,
    );
    expect(rows.map((row) => [row.userId, row.score])).toEqual([['one', 19], ['two', 18]]);
  });

  it('sums only the configured best N catches', () => {
    const rows = buildLeaderboard(
      derby('best_n', 2),
      [fish('a', 'one', 8), fish('b', 'one', 14), fish('c', 'one', 11), fish('d', 'two', 20)],
      participants,
      users,
    );
    expect(rows[0]).toMatchObject({ userId: 'one', score: 25, catchCount: 3 });
  });

  it('keeps pending catches in a clearly countable provisional score', () => {
    const rows = buildLeaderboard(
      derby('total'),
      [fish('a', 'one', 12), fish('b', 'one', 7, true)],
      participants,
      users,
    );
    expect(rows.find((row) => row.userId === 'one')).toMatchObject({ score: 19, pendingCount: 1 });
  });

  it('tracks the biggest fish separately from a best-N team score', () => {
    const rules = derby('best_n', 3);
    const biggest = findBiggestFish(
      rules,
      [fish('a', 'one', 12), fish('b', 'one', 14), fish('c', 'two', 20)],
      participants,
      users,
    );
    expect(biggest).toMatchObject({ displayName: 'Two', score: 20, item: { id: 'c' } });
    expect(scoringRuleLabel(rules)).toBe('Best 3 fish by total length');
  });
});
