import type {
  Catch,
  ChatMessage,
  Derby,
  DerbyParticipant,
  Media,
  Reaction,
  SyncOutboxItem,
  User,
} from '@dink-derby/shared-types';
import { db } from '../db';
import { getOrCreateDeviceId } from '../utils/device';
import type { PreparedPhoto } from '../utils/photo';
import { syncService } from '../sync';
import { joinDerbyRequest } from '../lib/api';
import { supabase } from '../lib/supabase';
import { isDerbyComplete } from '../domain/derbyLifecycle';
import { applyMembershipPatches, assertDerbyAccess } from './derbyAccess';

type CreateDerbyInput = {
  name: string;
  bodyOfWaterName: string;
  scoringMode: Derby['scoringMode'];
  scoringStyle: NonNullable<Derby['scoringStyle']>;
  bestN?: number;
  speciesFilter?: string;
  startsAt?: string;
  endsAt?: string;
};

type SaveCatchInput = {
  id?: string;
  derby: Derby;
  species?: string;
  measurement?: number;
  note?: string;
  photo?: PreparedPhoto;
  lat?: number;
  lon?: number;
};

function inviteCode() {
  return `DINK-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function outboxItem(
  entityType: SyncOutboxItem['entityType'],
  entityId: string,
  payload: unknown,
  operation: SyncOutboxItem['operation'],
  derbyId?: string,
): SyncOutboxItem {
  return {
    id: crypto.randomUUID(),
    derbyId,
    entityType,
    entityId,
    operation,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
}

export async function currentIdentity() {
  const settings = await db.settings.get('app');
  if (!settings) throw new Error('Dink Derby has not finished setting up this device.');
  const user = await db.users.get(settings.currentUserId);
  if (!user) throw new Error('Your angler profile is missing from this device.');
  return { user, deviceId: await getOrCreateDeviceId() };
}

export async function joinDerby(inviteCode: string) {
  if (!navigator.onLine) throw new Error('Connect to join a new derby. It will work offline after that.');
  const { user, deviceId } = await currentIdentity();
  const device = await db.device.get(deviceId);
  if (!device) throw new Error('This phone is missing its field identity.');
  const result = await joinDerbyRequest({ inviteCode: inviteCode.trim().toUpperCase(), user, device });
  await assertDerbyAccess(result.derby.id);
  const snapshot = result.snapshot;
  await db.transaction(
    'rw',
    [db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.reactions, db.media],
    async () => {
      if (snapshot.users.length) await db.users.bulkPut(snapshot.users);
      if (snapshot.derbies.length) await db.derbies.bulkPut(snapshot.derbies);
      await applyMembershipPatches(snapshot.derbyParticipants);
      if (snapshot.catches.length) await db.catches.bulkPut(snapshot.catches);
      if (snapshot.chatMessages.length) await db.chatMessages.bulkPut(snapshot.chatMessages);
      if (snapshot.reactions.length) await db.reactions.bulkPut(snapshot.reactions);
      if (snapshot.media.length) await db.media.bulkPut(snapshot.media);
    },
  );
  syncService.requestSync();
  return result.derby;
}

export async function createDerby(input: CreateDerbyInput) {
  const { user } = await currentIdentity();
  const now = new Date().toISOString();
  const derby: Derby = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    bodyOfWaterName: input.bodyOfWaterName.trim(),
    scoringMode: input.scoringMode,
    scoringUnit: input.scoringMode === 'weight' ? 'lb' : input.scoringMode === 'length' ? 'in' : undefined,
    scoringStyle: input.scoringMode === 'count' ? 'total' : input.scoringStyle,
    bestN: input.scoringStyle === 'best_n' ? input.bestN ?? 5 : undefined,
    speciesFilter: input.speciesFilter?.trim() || undefined,
    inviteCode: inviteCode(),
    status: 'active',
    createdByUserId: user.id,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
  const participant: DerbyParticipant = {
    id: crypto.randomUUID(),
    derbyId: derby.id,
    userId: user.id,
    nickname: user.displayName,
    isAdmin: true,
    createdAt: now,
  };

  await db.transaction('rw', [db.derbies, db.derbyParticipants, db.syncOutbox], async () => {
    await db.derbies.add(derby);
    await db.derbyParticipants.add(participant);
    await db.syncOutbox.bulkAdd([
      outboxItem('derby', derby.id, derby, 'create', derby.id),
      outboxItem('derbyParticipant', participant.id, participant, 'create', derby.id),
    ]);
  });

  syncService.requestSync();
  return derby;
}

export async function finishDerby(derbyId: string) {
  await assertDerbyAccess(derbyId);
  const { user } = await currentIdentity();
  await db.transaction('rw', [db.derbies, db.derbyParticipants, db.syncOutbox], async () => {
    const derby = await db.derbies.get(derbyId);
    if (!derby) throw new Error('Derby not found.');
    if (derby.createdByUserId !== user.id) throw new Error('Only the organizer can finish this derby.');
    if (derby.status === 'finished') return;
    if (derby.status === 'cancelled') throw new Error('This derby was cancelled.');
    const now = new Date().toISOString();
    const finished: Derby = { ...derby, status: 'finished', endsAt: derby.endsAt && derby.endsAt < now ? derby.endsAt : now, updatedAt: now };
    await db.derbies.put(finished);
    const operation = outboxItem('derby', derby.id, finished, 'update', derby.id);
    // A newly created derby must reach the server before its completion.
    const previous = await db.syncOutbox.where('derbyId').equals(derby.id).toArray();
    operation.createdAt = new Date(Math.max(Date.now(), ...previous.map(op => Date.parse(op.createdAt) + 1))).toISOString();
    await db.syncOutbox.add(operation);
  });
  syncService.requestSync();
}

export async function saveCatch(input: SaveCatchInput) {
  await assertDerbyAccess(input.derby.id);
  const { user, deviceId } = await currentIdentity();
  if (input.derby.scoringMode !== 'count' && (!input.measurement || !Number.isFinite(input.measurement) || input.measurement <= 0)) {
    throw new Error(`Enter a valid ${input.derby.scoringMode}.`);
  }
  let photoError: string | undefined;
  const now = new Date().toISOString();
  const catchId = input.id ?? crypto.randomUUID();
  let item: Catch = {
    id: catchId,
    derbyId: input.derby.id,
    userId: user.id,
    species: input.species?.trim() || undefined,
    lengthInInches: input.derby.scoringMode === 'length' ? input.measurement : undefined,
    weightInPounds: input.derby.scoringMode === 'weight' ? input.measurement : undefined,
    count: 1,
    note: input.note?.trim() || undefined,
    caughtAt: now,
    createdAt: now,
    updatedAt: now,
    clientId: deviceId,
    isPendingSync: true,
    locationLat: input.lat,
    locationLon: input.lon,
  };
  // Commit the fish and clear its draft atomically, before any photo write.
  // Reusing the draft ID makes retries after an interruption idempotent.
  const createOperation = outboxItem('catch', item.id, item, 'create', input.derby.id);
  await db.transaction('rw', [db.catches, db.syncOutbox, db.catchDrafts, db.derbies], async () => {
    const existing = await db.catches.get(catchId);
    if (existing) {
      if (existing.userId !== user.id || existing.derbyId !== input.derby.id) throw new Error('This catch belongs to another angler or derby.');
      item = existing;
    } else {
      const latest = await db.derbies.get(input.derby.id) ?? input.derby;
      if (isDerbyComplete(latest) || latest.status === 'cancelled') throw new Error('This derby is closed. New catches cannot be added.');
      await db.catches.add(item);
      await db.syncOutbox.add(createOperation);
    }
    await db.catchDrafts.delete(catchId);
  });

  const prepared = input.photo;
  if (prepared && !item.photoMediaId) {
    try {
      const mediaId = crypto.randomUUID();
      const metadata: Media = {
        id: mediaId, ownerId: user.id, derbyId: input.derby.id, catchId,
        contentHash: prepared.hash, contentType: prepared.contentType,
        sizeBytes: prepared.bytes.byteLength, width: prepared.width, height: prepared.height,
        createdAt: now, updatedAt: now, clientId: deviceId, isPendingSync: true,
      };
      const attached = await db.transaction('rw', [db.catches, db.media, db.syncOutbox], async () => {
        const current = (await db.catches.get(catchId))!;
        if (current.photoMediaId) return current;
        const linked = { ...current, photoMediaId: mediaId, updatedAt: new Date().toISOString(), isPendingSync: true };
        const updateOperation = outboxItem('catch', catchId, linked, 'update', input.derby.id);
        // IndexedDB breaks equal timestamp ties by random UUID. Keep the photo
        // update strictly after its create so sync cannot overwrite the link.
        updateOperation.createdAt = new Date(Math.max(Date.now(), Date.parse(createOperation.createdAt) + 1)).toISOString();
        await db.media.add({ ...metadata, bytes: prepared.bytes });
        await db.catches.put(linked);
        await db.syncOutbox.bulkAdd([
          updateOperation,
          outboxItem('media', mediaId, metadata, 'create', input.derby.id),
        ]);
        return linked;
      });
      item = attached;
    } catch {
      photoError = 'Catch saved. The photo could not be stored on this device.';
    }
  }
  syncService.requestSync();
  return { item, photoError };
}

export async function sendMessage(derbyId: string, text: string) {
  await assertDerbyAccess(derbyId);
  const { user, deviceId } = await currentIdentity();
  const now = new Date().toISOString();
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    derbyId,
    userId: user.id,
    text: text.trim(),
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    clientId: deviceId,
    isPendingSync: true,
  };

  await db.transaction('rw', [db.chatMessages, db.syncOutbox], async () => {
    await db.chatMessages.add(message);
    await db.syncOutbox.add(outboxItem('chatMessage', message.id, message, 'create', derbyId));
  });
  syncService.requestSync();
}

export type CatchCorrection = { measurement?: number; species?: string; note?: string };

async function changeCatch(catchId: string, correction: CatchCorrection | { removed: boolean }) {
  const { user } = await currentIdentity();
  await db.transaction('rw', [db.catches, db.derbies, db.syncOutbox, db.settings], async () => {
    const current = await db.catches.get(catchId);
    if (!current || current.userId !== user.id) throw new Error('You can only change your own catches.');
    await assertDerbyAccess(current.derbyId);
    const derby = await db.derbies.get(current.derbyId);
    if (!derby || isDerbyComplete(derby) || derby.status === 'cancelled') throw new Error('This derby is closed. Its catches cannot be changed.');
    const now = new Date().toISOString();
    let next: Catch;
    if ('removed' in correction) {
      next = { ...current, deletedAt: correction.removed ? now : undefined, updatedAt: now, isPendingSync: true };
    } else {
      if (current.deletedAt) throw new Error('Restore this catch before editing it.');
      if (derby.scoringMode !== 'count' && (!correction.measurement || !Number.isFinite(correction.measurement) || correction.measurement <= 0 || correction.measurement > 999)) {
        throw new Error(`Enter a valid ${derby.scoringMode} between 0.01 and 999.`);
      }
      if ((correction.note?.length ?? 0) > 500) throw new Error('Keep the note to 500 characters.');
      next = { ...current, species: correction.species?.trim() || undefined, note: correction.note?.trim() || undefined,
        lengthInInches: derby.scoringMode === 'length' ? correction.measurement : undefined,
        weightInPounds: derby.scoringMode === 'weight' ? correction.measurement : undefined,
        count: 1, updatedAt: now, isPendingSync: true };
    }
    const operation = outboxItem('catch', current.id, next, 'update', current.derbyId);
    const previous = await db.syncOutbox.where('derbyId').equals(current.derbyId).filter(op => op.entityType === 'catch' && op.entityId === current.id).toArray();
    operation.createdAt = new Date(Math.max(Date.now(), ...previous.map(op => Date.parse(op.createdAt) + 1))).toISOString();
    await db.catches.put(next);
    await db.syncOutbox.add(operation);
  });
  syncService.requestSync();
}

export const correctCatch = (catchId: string, correction: CatchCorrection) => changeCatch(catchId, correction);
export const setCatchRemoved = (catchId: string, removed: boolean) => changeCatch(catchId, { removed });

export async function toggleReaction(
  derbyId: string,
  targetType: Reaction['targetType'],
  targetId: string,
  reactionKind: Reaction['reaction'],
) {
  await assertDerbyAccess(derbyId);
  const { user, deviceId } = await currentIdentity();
  const existing = await db.reactions
    .where('targetId')
    .equals(targetId)
    .filter((item) => item.derbyId === derbyId && item.userId === user.id && item.reaction === reactionKind)
    .first();

  if (existing) {
    await db.transaction('rw', [db.reactions, db.syncOutbox], async () => {
      await db.reactions.delete(existing.id);
      await db.syncOutbox.add(outboxItem('reaction', existing.id, existing, 'delete', derbyId));
    });
  } else {
    const now = new Date().toISOString();
    const reaction: Reaction = {
      id: crypto.randomUUID(),
      derbyId,
      userId: user.id,
      targetType,
      targetId,
      reaction: reactionKind,
      createdAt: now,
      updatedAt: now,
      clientId: deviceId,
      isPendingSync: true,
    };
    await db.transaction('rw', [db.reactions, db.syncOutbox], async () => {
      await db.reactions.add(reaction);
      await db.syncOutbox.add(outboxItem('reaction', reaction.id, reaction, 'create', derbyId));
    });
  }
  syncService.requestSync();
}

export async function updateProfile(displayName: string) {
  const { user } = await currentIdentity();
  const updated: User = { ...user, displayName: displayName.trim(), updatedAt: new Date().toISOString() };
  await db.transaction('rw', [db.users, db.syncOutbox], async () => {
    await db.users.put(updated);
    await db.syncOutbox.add(outboxItem('user', updated.id, updated, 'update'));
  });
  syncService.requestSync();
}

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('Sign-in is not available on this device.');
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) throw new Error('Enter a valid email address.');
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
  });
  if (error) throw new Error(`Dink Derby could not send your sign-in link: ${error.message}`);
}

export async function completeMagicLinkUpgrade() {
  if (!supabase) throw new Error('Sign-in is not available on this device.');
  const { data, error } = await supabase.auth.updateUser({ data: {} });
  if (error) throw error;
  return data.user;
}
