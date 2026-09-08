import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { derbyEvents, derbyParticipants, derbies } from './db/schema';
import { httpError } from './auth';
import type { DerbyParticipant } from '@dink-derby/shared-types';

export function participantRecord(record: typeof derbyParticipants.$inferSelect): DerbyParticipant {
  return { id: record.id, derbyId: record.derbyId, userId: record.userId, nickname: record.nickname ?? undefined,
    isAdmin: record.isAdmin, createdAt: record.createdAt.toISOString(), removedAt: record.removedAt?.toISOString() };
}

export async function requireActiveMembership(derbyId: string, userId: string) {
  const [membership] = await db.select().from(derbyParticipants)
    .where(and(eq(derbyParticipants.derbyId, derbyId), eq(derbyParticipants.userId, userId))).limit(1);
  if (!membership || membership.removedAt) throw httpError(403, 'You no longer have access to this derby.');
  return membership;
}

export async function removeAngler(derbyId: string, userId: string, actorId: string) {
  return db.transaction(async transaction => {
    const [derby] = await transaction.select().from(derbies).where(eq(derbies.id, derbyId)).limit(1).for('share');
    // isAdmin is deliberately not sufficient: only the original creator can remove.
    if (!derby || derby.createdByUserId !== actorId) throw httpError(403, 'Only the derby creator can remove an angler.');
    if (userId === actorId) throw httpError(409, 'The derby creator cannot be removed.');
    const [participant] = await transaction.select().from(derbyParticipants)
      .where(and(eq(derbyParticipants.derbyId, derbyId), eq(derbyParticipants.userId, userId))).limit(1).for('update');
    if (!participant) throw httpError(404, 'That angler is not in this derby.');
    if (participant.removedAt) return { participant: participantRecord(participant) };
    const [removed] = await transaction.update(derbyParticipants).set({ removedAt: new Date() })
      .where(eq(derbyParticipants.id, participant.id)).returning();
    const result = participantRecord(removed);
    await transaction.insert(derbyEvents).values({ id: crypto.randomUUID(), derbyId, entityType: 'derbyParticipant', entityId: participant.id,
      type: 'derbyParticipant.removed', payload: { ...result, removedByUserId: actorId } });
    return { participant: result };
  });
}
