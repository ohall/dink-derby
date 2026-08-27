import { and, eq, gt, InferModel } from 'drizzle-orm';
import type {
  Catch,
  ChatMessage,
  Derby,
  DerbyEvent,
  DerbyParticipant,
  Media,
  Reaction,
  SyncOutboxItem,
  User,
} from '@dink-derby/shared-types';
import { db } from './db';
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
    scoringUnit: record.scoringUnit as Derby['scoringUnit'],
    scoringStyle: record.scoringStyle as Derby['scoringStyle'],
    bestN: record.bestN ?? undefined,
    speciesFilter: record.speciesFilter ?? undefined,
    inviteCode: record.inviteCode ?? undefined,
    status: record.status as Derby['status'],
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
    entityType: record.entityType as DerbyEvent['entityType'],
    entityId: record.entityId ?? undefined,
    type: record.type,
    payload: record.payload,
    serverCreatedAt: record.serverCreatedAt.toISOString(),
  };
}

export async function processSync(
  clientId: string,
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

  const syncDate = lastSyncedAt && !Number.isNaN(Date.parse(lastSyncedAt)) ? new Date(lastSyncedAt) : new Date(0);
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
    db.select().from(users).where(gt(users.updatedAt, syncDate)),
    db.select().from(derbies).where(gt(derbies.updatedAt, syncDate)),
    db.select().from(derbyParticipants).where(gt(derbyParticipants.createdAt, syncDate)),
    db.select().from(catches).where(gt(catches.updatedAt, syncDate)),
    db.select().from(chatMessages).where(gt(chatMessages.updatedAt, syncDate)),
    db.select().from(reactions).where(gt(reactions.updatedAt, syncDate)),
    db.select().from(media).where(gt(media.updatedAt, syncDate)),
    requestedDerbyId
      ? db.select().from(derbyEvents).where(and(eq(derbyEvents.derbyId, requestedDerbyId), gt(derbyEvents.sequence, cursor)))
      : db.select().from(derbyEvents).where(gt(derbyEvents.sequence, cursor)),
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

function sanitizePayload(payload: unknown) {
  const result = { ...(payload as Record<string, unknown>) };
  delete result.isPendingSync;
  delete result.blob;
  for (const field of ['createdAt', 'updatedAt', 'startsAt', 'endsAt', 'caughtAt', 'sentAt', 'deletedAt']) {
    if (typeof result[field] === 'string') result[field] = new Date(result[field] as string);
  }
  return result;
}

async function applyOperation(database: typeof db, item: SyncOutboxItem) {
  const data = sanitizePayload(item.payload);

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
    if (item.operation === 'delete') await database.delete(derbies).where(eq(derbies.id, item.entityId));
    else await database.insert(derbies).values(data as NewDerby).onConflictDoUpdate({ target: derbies.id, set: data });
    return;
  }
  if (item.entityType === 'derbyParticipant') {
    if (item.operation === 'delete') await database.delete(derbyParticipants).where(eq(derbyParticipants.id, item.entityId));
    else await database.insert(derbyParticipants).values(data as NewDerbyParticipant).onConflictDoUpdate({ target: derbyParticipants.id, set: data });
    return;
  }
  if (item.entityType === 'catch') {
    if (item.operation === 'delete') await database.delete(catches).where(eq(catches.id, item.entityId));
    else await database.insert(catches).values(data as NewCatch).onConflictDoUpdate({ target: catches.id, set: data });
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
