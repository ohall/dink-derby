import type { Catch, Derby, DerbyParticipant, User } from '@dink-derby/shared-types';

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  score: number;
  catchCount: number;
  pendingCount: number;
  bestCatch?: Catch;
};

export function catchScore(derby: Derby, item: Catch): number {
  if (derby.scoringMode === 'weight') return item.weightInPounds ?? 0;
  if (derby.scoringMode === 'count') return item.count;
  return item.lengthInInches ?? 0;
}

function aggregateScore(derby: Derby, items: Catch[]): number {
  const scores = items.map((item) => catchScore(derby, item)).sort((a, b) => b - a);
  const style = derby.scoringStyle ?? (derby.scoringMode === 'count' ? 'total' : 'biggest');

  if (style === 'biggest') return scores[0] ?? 0;
  if (style === 'best_n') return scores.slice(0, derby.bestN ?? 5).reduce((sum, value) => sum + value, 0);
  return scores.reduce((sum, value) => sum + value, 0);
}

export function buildLeaderboard(
  derby: Derby,
  catches: Catch[],
  participants: DerbyParticipant[],
  users: User[],
): LeaderboardRow[] {
  const userById = new Map(users.map((user) => [user.id, user]));
  const active = catches.filter((item) => item.derbyId === derby.id && !item.deletedAt);

  return participants
    .filter((participant) => participant.derbyId === derby.id)
    .map((participant) => {
      const participantCatches = active.filter((item) => item.userId === participant.userId);
      const bestCatch = [...participantCatches].sort(
        (a, b) => catchScore(derby, b) - catchScore(derby, a),
      )[0];

      return {
        userId: participant.userId,
        displayName:
          participant.nickname || userById.get(participant.userId)?.displayName || 'Unknown angler',
        score: aggregateScore(derby, participantCatches),
        catchCount: participantCatches.reduce((sum, item) => sum + item.count, 0),
        pendingCount: participantCatches.filter((item) => item.isPendingSync).length,
        bestCatch,
      };
    })
    .sort((a, b) => b.score - a.score || b.catchCount - a.catchCount || a.displayName.localeCompare(b.displayName));
}

export function scoringLabel(derby: Derby): string {
  if (derby.scoringMode === 'count') return 'fish';
  return derby.scoringUnit ?? (derby.scoringMode === 'weight' ? 'lb' : 'in');
}

export function formatScore(derby: Derby, value: number): string {
  return derby.scoringMode === 'count' ? String(Math.round(value)) : value.toFixed(2);
}
