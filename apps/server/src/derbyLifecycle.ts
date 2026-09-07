import type { Derby } from '@dink-derby/shared-types';

export function assertFinishAllowed(current: Derby, next: Derby, userId: string, now = Date.now()) {
  if (current.createdByUserId !== userId) throw new Error('Only the organizer can finish this derby.');
  if (current.id !== next.id || current.createdByUserId !== next.createdByUserId) throw new Error('Derby identity cannot change.');
  if (current.status === 'cancelled') throw new Error('This derby was cancelled.');
  if (next.status !== 'finished' || !next.endsAt) throw new Error('Only finishing a derby is supported.');
  const cutoff = Date.parse(next.endsAt);
  if (!Number.isFinite(cutoff) || cutoff > now || cutoff < Date.parse(current.createdAt)) throw new Error('Invalid derby end time.');
  if (current.status === 'finished' && current.endsAt !== next.endsAt) throw new Error('A finished derby cannot be reopened or its cutoff changed.');
}

export function assertCatchBeforeCutoff(derby: Derby, caughtAt: string) {
  if (!Number.isFinite(Date.parse(caughtAt))) throw new Error('Invalid catch time.');
  if (derby.status === 'cancelled') throw new Error('This derby was cancelled.');
  if (derby.endsAt && Date.parse(caughtAt) > Date.parse(derby.endsAt)) throw new Error('This catch was recorded after the derby ended.');
  if (derby.status === 'finished' && !derby.endsAt) throw new Error('This derby is closed.');
}
