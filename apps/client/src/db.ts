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

  constructor(name = 'DinkDerbyFieldDB') {
    // A fresh database name intentionally separates this rebuild from the legacy client.
    super(name);

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

export const LEGACY_DATABASE = 'DinkDerbyFieldDB';
export const ACTIVE_DATABASE_KEY = 'dink-active-database';

export function accountDatabaseName(userId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error('Invalid account ID.');
  return `${LEGACY_DATABASE}:${userId}`;
}

function activeDatabaseName() {
  try {
    const name = localStorage.getItem(ACTIVE_DATABASE_KEY);
    if (name && /^DinkDerbyFieldDB:[a-f0-9-]{36}$/i.test(name)) return name;
  } catch { /* Existing guest play still works without localStorage. */ }
  return LEGACY_DATABASE;
}

// Account changes reload the app. No mounted screen or in-flight sync ever
// changes its database underneath an operation.
export const db = new DinkDerbyDatabase(activeDatabaseName());

export async function databaseNameForAccount(userId: string) {
  const legacy = db.name === LEGACY_DATABASE ? db : new DinkDerbyDatabase();
  try {
    if ((await legacy.settings.get('app'))?.currentUserId === userId) return LEGACY_DATABASE;
  } finally { if (legacy !== db) legacy.close(); }
  return accountDatabaseName(userId);
}

export function selectAccountDatabase(name: string) {
  if (name !== LEGACY_DATABASE && !/^DinkDerbyFieldDB:[a-f0-9-]{36}$/i.test(name)) throw new Error('Invalid account storage.');
  localStorage.setItem(ACTIVE_DATABASE_KEY, name);
  if (localStorage.getItem(ACTIVE_DATABASE_KEY) !== name) throw new Error('Allow browser storage before signing in.');
}
