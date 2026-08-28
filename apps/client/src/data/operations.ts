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
import { joinDerbyRequest } from '../lib/api';

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
  measurement?: number;
  note?: string;
  photo?: File;
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
  const snapshot = result.snapshot;
  await db.transaction(
    'rw',
    [db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.reactions, db.media],
    async () => {
      if (snapshot.users.length) await db.users.bulkPut(snapshot.users);
      if (snapshot.derbies.length) await db.derbies.bulkPut(snapshot.derbies);
      if (snapshot.derbyParticipants.length) await db.derbyParticipants.bulkPut(snapshot.derbyParticipants);
      if (snapshot.catches.length) await db.catches.bulkPut(snapshot.catches);
      if (snapshot.chatMessages.length) await db.chatMessages.bulkPut(snapshot.chatMessages);
      if (snapshot.reactions.length) await db.reactions.bulkPut(snapshot.reactions);
      if (snapshot.media.length) await db.media.bulkPut(snapshot.media);
    },
  );
  syncService.requestSync();
  return result.derby;
}

async function hashBlob(blob: Blob) {
  // Read in chunks so we don't spike mobile Safari while hashing a photo.
  const stream = blob.stream();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Photo compression failed.'))), type, quality);
  });
}

async function preparePhoto(file: File): Promise<{ blob: Blob; hash: string; width?: number; height?: number }> {
  // Mobile browsers (especially iOS Safari) can kill the tab if photo prep holds
  // the raw decoded bitmap, the original File, and the compressed output in memory
  // at the same time. Use <img> decode (smaller peak than createImageBitmap) and
  // cap to a modest longest edge so a 12MP phone photo doesn't explode JS heap.
  const longestEdge = 1600;
  if (!('createImageBitmap' in window) || !('Blob' in window)) {
    return { blob: file, hash: await hashBlob(file) };
  }

  const url = URL.createObjectURL(file);
  let decoded: { width: number; height: number; image: HTMLImageElement } | undefined;
  try {
    decoded = await new Promise<{ width: number; height: number; image: HTMLImageElement }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, image: img });
      img.onerror = () => reject(new Error('The photo could not be read.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  const scale = Math.min(1, longestEdge / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  // Skip re-encode when the source is already a small JPEG — avoids another full copy.
  if (file.type === 'image/jpeg' && scale === 1) {
    decoded.image.src = '';
    return { blob: file, hash: await hashBlob(file), width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare the photo.');
  context.drawImage(decoded.image, 0, 0, width, height);
  decoded.image.src = ''; // release the decoded source as soon as the canvas holds it

  const blob = await canvasBlob(canvas, 'image/jpeg', 0.82);
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
  if (input.derby.scoringMode !== 'count' && (!input.measurement || input.measurement <= 0)) {
    throw new Error(`Enter a valid ${input.derby.scoringMode}.`);
  }
  const prepared = input.photo ? await preparePhoto(input.photo) : undefined;
  const now = new Date().toISOString();
  const catchId = crypto.randomUUID();
  const mediaId = prepared ? crypto.randomUUID() : undefined;
  const media: LocalMedia | undefined = prepared && mediaId ? {
    id: mediaId,
    ownerId: user.id,
    derbyId: input.derby.id,
    catchId,
    contentHash: prepared.hash,
    contentType: prepared.blob.type || input.photo?.type || 'image/jpeg',
    sizeBytes: prepared.blob.size,
    width: prepared.width,
    height: prepared.height,
    createdAt: now,
    updatedAt: now,
    clientId: deviceId,
    isPendingSync: true,
    blob: prepared.blob,
  } : undefined;
  const item: Catch = {
    id: catchId,
    derbyId: input.derby.id,
    userId: user.id,
    species: input.species?.trim() || undefined,
    lengthInInches: input.derby.scoringMode === 'length' ? input.measurement : undefined,
    weightInPounds: input.derby.scoringMode === 'weight' ? input.measurement : undefined,
    count: 1,
    photoMediaId: mediaId,
    note: input.note?.trim() || undefined,
    caughtAt: now,
    createdAt: now,
    updatedAt: now,
    clientId: deviceId,
    isPendingSync: true,
  };
  const mediaPayload: Media | undefined = media ? { ...media } : undefined;
  if (mediaPayload) delete (mediaPayload as LocalMedia).blob;

  await db.transaction('rw', [db.catches, db.media, db.syncOutbox], async () => {
    await db.catches.add(item);
    if (media) await db.media.add(media);
    const operations = [outboxItem('catch', item.id, item, 'create', input.derby.id)];
    if (media && mediaPayload) operations.push(outboxItem('media', media.id, mediaPayload, 'create', input.derby.id));
    await db.syncOutbox.bulkAdd(operations);
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
