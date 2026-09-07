import { and, eq, gt, inArray, InferModel } from 'drizzle-orm';
import type {
  Catch,
  ChatMessage,
  Derby,
  DerbyEvent,
  DerbyParticipant,
  DerbySnapshot,
  Media,
  Reaction,
  SyncOutboxItem,
  User,
} from '@dink-derby/shared-types';
import {
  CatchSchema,
  ChatMessageSchema,
  DerbyParticipantSchema,
  DerbySchema,
  DeviceSchema,
  MediaSchema,
  ReactionSchema,
  UserSchema,
} from '@dink-derby/shared-types';
import { db } from './db';
import { assertCatchBeforeCutoff, assertFinishAllowed } from './derbyLifecycle';
import {
  catches,
  chatMessages,
  derbyEvents,
  derbyParticipants,
  derbies,
  devices,
  media,
  processedOperations,
  reactions,
  users,
} from './db/schema';

type DbCatch = InferModel<typeof catches, 'select'>;
type DbChatMessage = InferModel<typeof chatMessages, 'select'>;
type DbUser = InferModel<typeof users, 'select'>;
type DbDerby = InferModel<typeof derbies, 'select'>;
type DbDerbyParticipant = InferModel<typeof derbyParticipants, 'select'>;
type DbReaction = InferModel<typeof reactions, 'select'>;
type DbMedia = InferModel<typeof media, 'select'>;
type DbEvent = InferModel<typeof derbyEvents, 'select'>;
type NewUser = InferModel<typeof users, 'insert'>;
type NewDevice = InferModel<typeof devices, 'insert'>;
type NewDerby = InferModel<typeof derbies, 'insert'>;
type NewDerbyParticipant = InferModel<typeof derbyParticipants, 'insert'>;
type NewCatch = InferModel<typeof catches, 'insert'>;
type NewChatMessage = InferModel<typeof chatMessages, 'insert'>;
type NewReaction = InferModel<typeof reactions, 'insert'>;
type NewMedia = InferModel<typeof media, 'insert'>;

function toCatch(record: DbCatch): Catch {
  return {
    id: record.id,
    derbyId: record.derbyId,
    userId: record.userId,
    species: record.species ?? undefined,
    lengthInInches: record.lengthInInches ?? undefined,
    weightInPounds: record.weightInPounds ?? undefined,
    count: record.count,
    photoUrl: record.photoUrl ?? undefined,
    photoMediaId: record.photoMediaId ?? undefined,
    note: record.note ?? undefined,
    speciesGuessed: record.speciesGuessed ?? undefined,
    guessLengthInInches: record.guessLengthInInches ?? undefined,
    guessWeightInPounds: record.guessWeightInPounds ?? undefined,
    fromAI: record.fromAI ?? undefined,
    rejectedAsNonFish: record.rejectedAsNonFish ?? undefined,
    locationLat: record.locationLat ?? undefined,
    locationLon: record.locationLon ?? undefined,
    caughtAt: record.caughtAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString(),
    clientId: record.clientId,
    isPendingSync: false,
  };
}

function toChatMessage(record: DbChatMessage): ChatMessage {
  return {
    id: record.id,
    derbyId: record.derbyId,
    userId: record.userId,
    text: record.text,
    sentAt: record.sentAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    clientId: record.clientId,
    isPendingSync: false,
  };
}

function toUser(record: DbUser): User {
  return {
    id: record.id,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toDerby(record: DbDerby): Derby {
  return {
    id: record.id,
    name: record.name,
    bodyOfWaterName: record.bodyOfWaterName,
    scoringMode: record.scoringMode as Derby['scoringMode'],
    scoringUnit: (record.scoringUnit ?? undefined) as Derby['scoringUnit'],
    scoringStyle: (record.scoringStyle ?? undefined) as Derby['scoringStyle'],
    bestN: record.bestN ?? undefined,
    speciesFilter: record.speciesFilter ?? undefined,
    inviteCode: record.inviteCode ?? undefined,
    status: (record.status ?? undefined) as Derby['status'],
    createdByUserId: record.createdByUserId,
    startsAt: record.startsAt?.toISOString(),
    endsAt: record.endsAt?.toISOString(),
    isArchived: record.isArchived,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toDerbyParticipant(record: DbDerbyParticipant): DerbyParticipant {
  return {
    id: record.id,
    derbyId: record.derbyId,
    userId: record.userId,
    nickname: record.nickname ?? undefined,
    isAdmin: record.isAdmin,
    createdAt: record.createdAt.toISOString(),
  };
}

function toReaction(record: DbReaction): Reaction {
  return {
    id: record.id,
    derbyId: record.derbyId,
    userId: record.userId,
    targetType: record.targetType as Reaction['targetType'],
    targetId: record.targetId,
    reaction: record.reaction as Reaction['reaction'],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    clientId: record.clientId,
    isPendingSync: false,
  };
}

function toMedia(record: DbMedia): Media {
  return {
    id: record.id,
    ownerId: record.ownerId,
    derbyId: record.derbyId,
    catchId: record.catchId ?? undefined,
    contentHash: record.contentHash,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    width: record.width ?? undefined,
    height: record.height ?? undefined,
    remoteUrl: record.remoteUrl ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    clientId: record.clientId,
    isPendingSync: false,
  };
}

function toEvent(record: DbEvent): DerbyEvent {
  return {
    id: record.id,
    derbyId: record.derbyId,
    sequence: record.sequence,
    entityType: (record.entityType ?? undefined) as DerbyEvent['entityType'],
    entityId: record.entityId ?? undefined,
    type: record.type,
    payload: record.payload,
    serverCreatedAt: record.serverCreatedAt.toISOString(),
  };
}

export async function processSync(
  clientId: string,
  userId: string,
  outbox: SyncOutboxItem[],
  lastSyncedAt?: string,
  cursor = 0,
  requestedDerbyId?: string,
) {
  const appliedOperationIds: string[] = [];
  const rejected: Array<{ operationId: string; code: string; message: string }> = [];

  for (const item of outbox) {
    const [alreadyProcessed] = await db
      .select({ opId: processedOperations.opId })
      .from(processedOperations)
      .where(eq(processedOperations.opId, item.id))
      .limit(1);

    if (alreadyProcessed) {
      appliedOperationIds.push(item.id);
      continue;
    }

    try {
      await db.transaction(async (transaction) => {
        const database = transaction as unknown as typeof db;
        await assertCanWrite(database, userId, clientId, item);
        await applyOperation(database, item);
        await database.insert(processedOperations).values({
          opId: item.id,
          deviceId: clientId,
          derbyId: item.derbyId,
          result: { applied: true },
        }).onConflictDoNothing();

        if (item.derbyId) {
          await database.insert(derbyEvents).values({
            id: crypto.randomUUID(),
            derbyId: item.derbyId,
            entityType: item.entityType,
            entityId: item.entityId,
            type: `${item.entityType}.${item.operation}`,
            payload: item.payload,
          });
        }
      });
      appliedOperationIds.push(item.id);
    } catch (error) {
      rejected.push({
        operationId: item.id,
        code: 'OPERATION_REJECTED',
        message: error instanceof Error ? error.message : 'Operation could not be applied',
      });
    }
  }

  const memberships = await db.select().from(derbyParticipants).where(eq(derbyParticipants.userId, userId));
  const visibleDerbyIds = memberships.map((membership) => membership.derbyId);
  if (requestedDerbyId && !visibleDerbyIds.includes(requestedDerbyId)) {
    throw Object.assign(new Error('You have not joined that derby.'), { statusCode: 403 });
  }
  const visibleUserIds = visibleDerbyIds.length
    ? (await db.select({ userId: derbyParticipants.userId }).from(derbyParticipants).where(inArray(derbyParticipants.derbyId, visibleDerbyIds))).map((item) => item.userId)
    : [];
  const userIds = Array.from(new Set([userId, ...visibleUserIds]));

  if (!visibleDerbyIds.length) {
    const patchUsers = await db.select().from(users).where(eq(users.id, userId));
    return {
      appliedOperationIds,
      rejected,
      events: [],
      nextCursor: cursor,
      patches: {
        users: patchUsers.map(toUser), derbies: [], derbyParticipants: [], catches: [], chatMessages: [], reactions: [], media: [],
      },
    };
  }

  const [
    patchUsers,
    patchDerbies,
    patchParticipants,
    patchCatches,
    patchChat,
    patchReactions,
    patchMedia,
    eventRecords,
  ] = await Promise.all([
    db.select().from(users).where(inArray(users.id, userIds)),
    db.select().from(derbies).where(inArray(derbies.id, visibleDerbyIds)),
    db.select().from(derbyParticipants).where(inArray(derbyParticipants.derbyId, visibleDerbyIds)),
    db.select().from(catches).where(inArray(catches.derbyId, visibleDerbyIds)),
    db.select().from(chatMessages).where(inArray(chatMessages.derbyId, visibleDerbyIds)),
    db.select().from(reactions).where(inArray(reactions.derbyId, visibleDerbyIds)),
    db.select().from(media).where(inArray(media.derbyId, visibleDerbyIds)),
    requestedDerbyId
      ? db.select().from(derbyEvents).where(and(eq(derbyEvents.derbyId, requestedDerbyId), gt(derbyEvents.sequence, cursor)))
      : db.select().from(derbyEvents).where(and(inArray(derbyEvents.derbyId, visibleDerbyIds), gt(derbyEvents.sequence, cursor))),
  ]);

  const events = eventRecords.map(toEvent);
  const nextCursor = events.reduce((highest, event) => Math.max(highest, event.sequence), cursor);

  return {
    appliedOperationIds,
    rejected,
    events,
    nextCursor,
    patches: {
      users: patchUsers.map(toUser),
      derbies: patchDerbies.map(toDerby),
      derbyParticipants: patchParticipants.map(toDerbyParticipant),
      catches: patchCatches.map(toCatch),
      chatMessages: patchChat.map(toChatMessage),
      reactions: patchReactions.map(toReaction),
      media: patchMedia.map(toMedia),
    },
  };
}

export async function getDerbySnapshot(derbyId: string): Promise<DerbySnapshot> {
  const [derbyRows, participantRows, catchRows, chatRows, reactionRows, mediaRows] = await Promise.all([
    db.select().from(derbies).where(eq(derbies.id, derbyId)),
    db.select().from(derbyParticipants).where(eq(derbyParticipants.derbyId, derbyId)),
    db.select().from(catches).where(eq(catches.derbyId, derbyId)),
    db.select().from(chatMessages).where(eq(chatMessages.derbyId, derbyId)),
    db.select().from(reactions).where(eq(reactions.derbyId, derbyId)),
    db.select().from(media).where(eq(media.derbyId, derbyId)),
  ]);
  const userRows = participantRows.length
    ? await db.select().from(users).where(inArray(users.id, participantRows.map((item) => item.userId)))
    : [];
  return {
    users: userRows.map(toUser),
    derbies: derbyRows.map(toDerby),
    derbyParticipants: participantRows.map(toDerbyParticipant),
    catches: catchRows.map(toCatch),
    chatMessages: chatRows.map(toChatMessage),
    reactions: reactionRows.map(toReaction),
    media: mediaRows.map(toMedia),
  };
}

function sanitizePayload(payload: unknown) {
  const result = { ...(payload as Record<string, unknown>) };
  delete result.isPendingSync;
  delete result.blob;
  for (const field of ['createdAt', 'updatedAt', 'startsAt', 'endsAt', 'caughtAt', 'sentAt', 'deletedAt']) {
    if (typeof result[field] === 'string') result[field] = new Date(result[field] as string);
  }
  return result;
}

function validatedPayload(item: SyncOutboxItem) {
  if (item.entityType === 'user') return UserSchema.parse(item.payload);
  if (item.entityType === 'device') return DeviceSchema.parse(item.payload);
  if (item.entityType === 'derby') return DerbySchema.parse(item.payload);
  if (item.entityType === 'derbyParticipant') return DerbyParticipantSchema.parse(item.payload);
  if (item.entityType === 'catch') return CatchSchema.parse(item.payload);
  if (item.entityType === 'chatMessage') return ChatMessageSchema.parse(item.payload);
  if (item.entityType === 'reaction') return ReactionSchema.parse(item.payload);
  return MediaSchema.parse(item.payload);
}

async function applyOperation(database: typeof db, item: SyncOutboxItem) {
  const data = sanitizePayload(validatedPayload(item));

  if (item.entityType === 'user') {
    if (item.operation !== 'delete') await database.insert(users).values(data as NewUser).onConflictDoUpdate({ target: users.id, set: data });
    return;
  }
  if (item.entityType === 'device') {
    if (item.operation === 'delete') await database.delete(devices).where(eq(devices.id, item.entityId));
    else await database.insert(devices).values(data as NewDevice).onConflictDoUpdate({ target: devices.id, set: data });
    return;
  }
  if (item.entityType === 'derby') {
    if (item.operation === 'update') {
      await database.update(derbies).set({ status: 'finished', endsAt: data.endsAt as Date, updatedAt: new Date() }).where(eq(derbies.id, item.entityId));
    } else await database.insert(derbies).values(data as NewDerby).onConflictDoNothing();
    return;
  }
  if (item.entityType === 'derbyParticipant') {
    if (item.operation === 'delete') await database.delete(derbyParticipants).where(eq(derbyParticipants.id, item.entityId));
    else await database.insert(derbyParticipants).values(data as NewDerbyParticipant).onConflictDoUpdate({ target: derbyParticipants.id, set: data });
    return;
  }
  if (item.entityType === 'catch') {
    // Tombstones stay in snapshots so another phone cannot resurrect a removed
    // catch. Updates deliberately cannot change ownership or catch timestamps.
    if (item.operation === 'delete') await database.update(catches).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(catches.id, item.entityId));
    else if (item.operation === 'update') await database.update(catches).set({
      species: (data.species as string | undefined) ?? null,
      note: (data.note as string | undefined) ?? null,
      lengthInInches: (data.lengthInInches as number | undefined) ?? null,
      weightInPounds: (data.weightInPounds as number | undefined) ?? null,
      count: data.count as number,
      photoMediaId: (data.photoMediaId as string | undefined) ?? null,
      deletedAt: (data.deletedAt as Date | undefined) ?? null,
      updatedAt: new Date(),
    }).where(eq(catches.id, item.entityId));
    else await database.insert(catches).values(data as NewCatch).onConflictDoNothing();
    return;
  }
  if (item.entityType === 'chatMessage') {
    if (item.operation === 'delete') await database.delete(chatMessages).where(eq(chatMessages.id, item.entityId));
    else await database.insert(chatMessages).values(data as NewChatMessage).onConflictDoUpdate({ target: chatMessages.id, set: data });
    return;
  }
  if (item.entityType === 'reaction') {
    if (item.operation === 'delete') await database.delete(reactions).where(eq(reactions.id, item.entityId));
    else await database.insert(reactions).values(data as NewReaction).onConflictDoUpdate({ target: reactions.id, set: data });
    return;
  }
  if (item.entityType === 'media') {
    if (item.operation === 'delete') await database.delete(media).where(eq(media.id, item.entityId));
    else await database.insert(media).values(data as NewMedia).onConflictDoUpdate({ target: media.id, set: data });
  }
}

async function assertCanWrite(database: typeof db, userId: string, clientId: string, item: SyncOutboxItem) {
  const payload = item.payload as Record<string, unknown>;
  if (payload.id !== item.entityId) throw new Error('The operation does not match its entity payload.');
  if (item.entityType === 'user') {
    if (item.entityId !== userId) throw new Error('A user can only update their own profile.');
    return;
  }
  if (item.entityType === 'device') {
    if (item.entityId !== clientId || payload.userId !== userId) throw new Error('This device does not belong to the signed-in user.');
    return;
  }
  if (item.entityType === 'derby') {
    const next = DerbySchema.parse(payload);
    if (item.derbyId !== item.entityId) throw new Error('The derby operation targets the wrong derby.');
    const [existing] = await database.select().from(derbies).where(eq(derbies.id, item.entityId)).limit(1).for('update');
    if (item.operation === 'create') {
      if (next.createdByUserId !== userId || (existing && existing.createdByUserId !== userId)) throw new Error('A derby must be created by the signed-in user.');
      if (!existing && next.status === 'finished') throw new Error('Create the derby before finishing it.');
    } else {
      if (!existing || item.operation !== 'update') throw new Error('This derby cannot be changed.');
      assertFinishAllowed(toDerby(existing), next, userId);
    }
    return;
  }
  if (item.entityType === 'derbyParticipant' && item.operation === 'create') {
    if (payload.userId !== userId) throw new Error('A user can only add their own derby membership.');
    const [derby] = await database.select().from(derbies).where(eq(derbies.id, String(payload.derbyId))).limit(1);
    if (!derby || derby.createdByUserId !== userId) throw new Error('Use an invite code to join this derby.');
    return;
  }

  const derbyId = item.derbyId || (typeof payload.derbyId === 'string' ? payload.derbyId : undefined);
  if (!derbyId) throw new Error('This change is missing its derby.');
  const [membership] = await database.select().from(derbyParticipants)
    .where(and(eq(derbyParticipants.derbyId, derbyId), eq(derbyParticipants.userId, userId))).limit(1);
  if (!membership) throw new Error('You have not joined this derby.');

  if (['catch', 'chatMessage', 'reaction'].includes(item.entityType) && payload.userId !== userId) {
    throw new Error('A user can only write their own field activity.');
  }
  if (item.entityType === 'media' && payload.ownerId !== userId) throw new Error('A user can only upload their own catch photo.');

  if (item.entityType === 'catch') {
    if (payload.derbyId !== derbyId) throw new Error('Catch derby does not match the operation.');
    const [derby] = await database.select().from(derbies).where(eq(derbies.id, derbyId)).limit(1).for('share');
    if (!derby) throw new Error('Derby not found.');
    const next = CatchSchema.parse(payload);
    assertCatchBeforeCutoff(toDerby(derby), next.caughtAt);
    if (next.count !== 1) throw new Error('Each catch must record exactly one fish.');
    const measurement = derby.scoringMode === 'weight' ? next.weightInPounds : next.lengthInInches;
    if (derby.scoringMode !== 'count' && (!measurement || !Number.isFinite(measurement) || measurement <= 0 || measurement > 999)) throw new Error('Enter a valid catch measurement between 0.01 and 999.');
    const [existing] = await database.select().from(catches).where(eq(catches.id, item.entityId)).limit(1).for('update');
    if (!existing && item.operation !== 'create') throw new Error('Create this catch before changing it.');
    if (existing && existing.userId !== userId) throw new Error('A user cannot change another angler’s catch.');
    if (existing && existing.derbyId !== derbyId) throw new Error('A catch cannot move to another derby.');
    if (existing && item.operation !== 'create') {
      if (existing.caughtAt.toISOString() !== next.caughtAt || existing.createdAt.toISOString() !== next.createdAt || existing.clientId !== next.clientId) throw new Error('A catch’s original time and device cannot change.');
    }
    if (existing && (derby.status === 'finished' || (derby.endsAt && derby.endsAt.getTime() <= Date.now()))) {
      const saved = toCatch(existing);
      for (const key of ['caughtAt', 'count', 'lengthInInches', 'weightInPounds', 'deletedAt', 'species', 'note'] as const) {
        if (payload[key] !== saved[key]) throw new Error('Scores cannot be edited after the derby ends.');
      }
      if (item.operation === 'delete') throw new Error('Catches cannot be deleted after the derby ends.');
    }
  }
  if (item.entityType === 'chatMessage') {
    const [existing] = await database.select().from(chatMessages).where(eq(chatMessages.id, item.entityId)).limit(1);
    if (existing && existing.userId !== userId) throw new Error('A user cannot change another angler’s message.');
  }
  if (item.entityType === 'reaction') {
    const [existing] = await database.select().from(reactions).where(eq(reactions.id, item.entityId)).limit(1);
    if (existing && existing.userId !== userId) throw new Error('A user cannot change another angler’s reaction.');
  }
  if (item.entityType === 'media') {
    const [existing] = await database.select().from(media).where(eq(media.id, item.entityId)).limit(1);
    if (existing && existing.ownerId !== userId) throw new Error('A user cannot change another angler’s photo.');
  }
}
