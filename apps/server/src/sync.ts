import { db } from './db';
import { users, derbies, derbyParticipants, catches, chatMessages } from './db/schema';
import { SyncOutboxItem, User, Derby, DerbyParticipant, Catch, ChatMessage } from '@dink-derby/shared-types';
import { eq, gt, and } from 'drizzle-orm';

export async function processSync(clientId: string, outbox: SyncOutboxItem[], lastSyncedAt?: string) {
  const appliedOperationIds: string[] = [];

  // 1. Apply Outbox
  // We process sequentially to maintain integrity (e.g. create User -> create Derby)
  for (const item of outbox) {
    try {
      await applyOperation(item);
      appliedOperationIds.push(item.id);
    } catch (e) {
      console.error(`Failed to apply operation ${item.id} (${item.entityType} ${item.operation})`, e);
      // We log and skip. The client will retry this item on next sync if not acked.
    }
  }

  // 2. Fetch Patches
  // Return all records modified after lastSyncedAt
  const syncDate = lastSyncedAt ? new Date(lastSyncedAt) : new Date(0);

  const [
    patchUsers,
    patchDerbies,
    patchParticipants,
    patchCatches,
    patchChat
  ] = await Promise.all([
    db.select().from(users).where(gt(users.updatedAt, syncDate)),
    db.select().from(derbies).where(gt(derbies.updatedAt, syncDate)),
    db.select().from(derbyParticipants).where(gt(derbyParticipants.createdAt, syncDate)),
    db.select().from(catches).where(gt(catches.updatedAt, syncDate)),
    db.select().from(chatMessages).where(gt(chatMessages.updatedAt, syncDate))
  ]);

  return {
    appliedOperationIds,
    patches: {
      users: patchUsers as User[],
      derbies: patchDerbies as Derby[],
      derbyParticipants: patchParticipants as DerbyParticipant[],
      catches: patchCatches as Catch[],
      chatMessages: patchChat as ChatMessage[],
    }
  };
}

async function applyOperation(item: SyncOutboxItem) {
  const { entityType, operation, payload, entityId } = item;

  // Helper to handle Date conversion from JSON string to Date object
  const sanitizePayload = (data: any) => {
    const result = { ...data };
    // Convert known date fields
    ['createdAt', 'updatedAt', 'startsAt', 'endsAt', 'caughtAt', 'sentAt', 'deletedAt'].forEach(field => {
      if (result[field] && typeof result[field] === 'string') {
        result[field] = new Date(result[field]);
      }
    });
    return result;
  };

  const data = sanitizePayload(payload);

  if (entityType === 'user') {
    if (operation === 'delete') {
        // Not implemented for users typically
    } else {
        await db.insert(users).values(data).onConflictDoUpdate({
            target: users.id,
            set: data
        });
    }
  }

  if (entityType === 'derby') {
    if (operation === 'delete') {
        // Soft delete via isArchived or distinct deletedAt? Schema has isArchived.
        // If payload contains isArchived: true, the upsert handles it.
        // If it's a hard delete request:
        await db.delete(derbies).where(eq(derbies.id, entityId));
    } else {
        await db.insert(derbies).values(data).onConflictDoUpdate({
            target: derbies.id,
            set: data
        });
    }
  }

  if (entityType === 'derbyParticipant') {
    if (operation === 'delete') {
        await db.delete(derbyParticipants).where(eq(derbyParticipants.id, entityId));
    } else {
        await db.insert(derbyParticipants).values(data).onConflictDoUpdate({
            target: derbyParticipants.id,
            set: data
        });
    }
  }

  if (entityType === 'catch') {
    if (operation === 'delete') {
        // Schema has deletedAt. If the operation is 'delete', we should set deletedAt if not present,
        // or if it's a hard delete. The 'delete' op usually implies hard delete or setting state.
        // The shared-types Catch has deletedAt.
        // Let's assume soft delete update comes as 'update' with deletedAt set.
        // If 'delete' op comes, we hard delete.
        await db.delete(catches).where(eq(catches.id, entityId));
    } else {
        await db.insert(catches).values(data).onConflictDoUpdate({
            target: catches.id,
            set: data
        });
    }
  }

  if (entityType === 'chatMessage') {
    if (operation === 'delete') {
        await db.delete(chatMessages).where(eq(chatMessages.id, entityId));
    } else {
        await db.insert(chatMessages).values(data).onConflictDoUpdate({
            target: chatMessages.id,
            set: data
        });
    }
  }
}
