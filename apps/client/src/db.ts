import Dexie, { type Table } from 'dexie';
import type {
  Catch,
  ChatMessage,
  Derby,
  DerbyParticipant,
  Device,
  Media,
  Reaction,
  SyncOutboxItem,
  User,
} from '@dink-derby/shared-types';

export type LocalMedia = Media & { blob?: Blob };

export type AppSettings = {
  id: 'app';
  currentUserId: string;
  seededAt: string;
};

export type DerbySyncState = {
  derbyId: string;
  cursor?: number;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
};

export class DinkDerbyDatabase extends Dexie {
  users!: Table<User, string>;
  derbies!: Table<Derby, string>;
  derbyParticipants!: Table<DerbyParticipant, string>;
  catches!: Table<Catch, string>;
  chatMessages!: Table<ChatMessage, string>;
  reactions!: Table<Reaction, string>;
  media!: Table<LocalMedia, string>;
  syncOutbox!: Table<SyncOutboxItem, string>;
  device!: Table<Device, string>;
  settings!: Table<AppSettings, string>;
  syncState!: Table<DerbySyncState, string>;

  constructor() {
    // A fresh database name intentionally separates this rebuild from the legacy client.
    super('DinkDerbyFieldDB');

    this.version(1).stores({
      users: 'id, displayName',
      derbies: 'id, status, startsAt, endsAt, createdByUserId, inviteCode',
      derbyParticipants: 'id, derbyId, userId, [derbyId+userId]',
      catches: 'id, derbyId, userId, caughtAt, isPendingSync, deletedAt',
      chatMessages: 'id, derbyId, sentAt, isPendingSync',
      reactions: 'id, derbyId, targetId, userId, isPendingSync',
      media: 'id, derbyId, catchId, ownerId, isPendingSync, createdAt',
      syncOutbox: 'id, derbyId, entityType, status, createdAt',
      device: 'id',
      settings: 'id',
      syncState: 'derbyId',
    });
  }
}

export const db = new DinkDerbyDatabase();
