import Dexie, { type Table } from 'dexie';
import type { PreparedPhoto } from './utils/photo';
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

// Keep blob for photos saved by older versions; new photos use bounded bytes
// to avoid WebKit's IndexedDB Blob staging failures.
export type LocalMedia = Media & { blob?: Blob; bytes?: ArrayBuffer };

export type CatchDraft = {
  id: string;
  derbyId: string;
  userId: string;
  measurement: string;
  species: string;
  note: string;
  // Optional for drafts created before location became enabled by default.
  includeLocation?: boolean;
  photo?: PreparedPhoto;
  isOpen: boolean;
  updatedAt: string;
};

export type DerbyEventEntry = {
  id: string;
  derbyId: string;
  sequence: number;
  entityType?: string;
  entityId?: string;
  type: string;
  payload?: unknown;
  serverCreatedAt: string;
};

export type AppSettings = {
  id: 'app';
  currentUserId: string;
  initializedAt?: string;
  seededAt?: string;
  authMode?: 'supabase' | 'local';
  removedDerbyIds?: string[];
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
  derbyEvents!: Table<DerbyEventEntry, string>;
  catchDrafts!: Table<CatchDraft, string>;

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

    this.version(2).stores({
      derbyEvents: 'id, derbyId, sequence',
    });

    this.version(3).stores({
      catchDrafts: 'id, userId, &[derbyId+userId], updatedAt',
    });
  }
}

export const db = new DinkDerbyDatabase();
