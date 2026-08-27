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
import { db, type LocalMedia } from '../db';
import { getOrCreateDeviceId } from '../utils/device';
import { syncService } from '../sync';

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
  derby: Derby;
  species?: string;
  measurement: number;
  note?: string;
  photo: File;
};

function inviteCode() {
  return `DINK-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
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

async function currentIdentity() {
  const settings = await db.settings.get('app');
  if (!settings) throw new Error('Dink Derby has not finished setting up this device.');
  const user = await db.users.get(settings.currentUserId);
  if (!user) throw new Error('Your angler profile is missing from this device.');
  return { user, deviceId: await getOrCreateDeviceId() };
}

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Photo compression failed.'))), type, quality);
  });
}

async function preparePhoto(file: File): Promise<{ blob: Blob; hash: string; width?: number; height?: number }> {
  if (!('createImageBitmap' in window)) {
    return { blob: file, hash: await hashBlob(file) };
  }

  const bitmap = await createImageBitmap(file);
  const longestEdge = 1800;
  const scale = Math.min(1, longestEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare the photo.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.84);
  return { blob, hash: await hashBlob(blob), width, height };
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

export async function saveCatch(input: SaveCatchInput) {
  const { user, deviceId } = await currentIdentity();
  const prepared = await preparePhoto(input.photo);
  const now = new Date().toISOString();
  const catchId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  const media: LocalMedia = {
    id: mediaId,
    ownerId: user.id,
    derbyId: input.derby.id,
    catchId,
    contentHash: prepared.hash,
    contentType: prepared.blob.type || input.photo.type || 'image/jpeg',
    sizeBytes: prepared.blob.size,
    width: prepared.width,
    height: prepared.height,
    createdAt: now,
    updatedAt: now,
    clientId: deviceId,
    isPendingSync: true,
    blob: prepared.blob,
  };
  const item: Catch = {
    id: catchId,
    derbyId: input.derby.id,
    userId: user.id,
    species: input.species?.trim() || undefined,
    lengthInInches: input.derby.scoringMode === 'length' ? input.measurement : undefined,
    weightInPounds: input.derby.scoringMode === 'weight' ? input.measurement : undefined,
    count: input.derby.scoringMode === 'count' ? Math.max(1, Math.round(input.measurement)) : 1,
    photoMediaId: mediaId,
    note: input.note?.trim() || undefined,
    caughtAt: now,
    createdAt: now,
    updatedAt: now,
    clientId: deviceId,
    isPendingSync: true,
  };
  const mediaPayload: Media = { ...media };
  delete (mediaPayload as LocalMedia).blob;

  await db.transaction('rw', [db.catches, db.media, db.syncOutbox], async () => {
    await db.catches.add(item);
    await db.media.add(media);
    await db.syncOutbox.bulkAdd([
      outboxItem('catch', item.id, item, 'create', input.derby.id),
      outboxItem('media', media.id, mediaPayload, 'create', input.derby.id),
    ]);
  });

  syncService.requestSync();
  return item;
}

export async function sendMessage(derbyId: string, text: string) {
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

export async function toggleReaction(
  derbyId: string,
  targetType: Reaction['targetType'],
  targetId: string,
  reactionKind: Reaction['reaction'] = 'fire',
) {
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
