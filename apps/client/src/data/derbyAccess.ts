import type { DerbyParticipant } from '@dink-derby/shared-types';
import { db } from '../db';

export async function assertDerbyAccess(derbyId: string) {
  const settings = await db.settings.get('app');
  if (settings?.removedDerbyIds?.includes(derbyId)) throw new Error('The creator removed you from this derby. Your history is read-only.');
}

/** Run inside the sync transaction, including settings and syncOutbox tables. */
export async function applyDerbyRemovals(ids: string[] = []) {
  if (!ids.length) return;
  const settings = await db.settings.get('app');
  if (!settings) return;
  const removedDerbyIds = [...new Set([...(settings.removedDerbyIds ?? []), ...ids])];
  await db.settings.update('app', { removedDerbyIds });
  // Cancel ineligible submissions, not the angler's original local catch/draft
  // records. Otherwise rejected uploads can keep unrelated derbies from syncing.
  await db.syncOutbox.where('derbyId').anyOf(removedDerbyIds).delete();
}

export async function applyMembershipPatches(participants: DerbyParticipant[]) {
  for (const participant of participants) {
    const local = await db.derbyParticipants.get(participant.id);
    // Removal is monotonic. A response already in flight cannot undo it.
    await db.derbyParticipants.put(local?.removedAt ? { ...participant, removedAt: local.removedAt } : participant);
  }
}
