import type { SyncOutboxItem, SyncRequest, SyncResponse } from '@dink-derby/shared-types';
import { db } from '../db';
import { getOrCreateDeviceId } from '../utils/device';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncSnapshot = {
  phase: SyncPhase;
  pendingCount: number;
  lastSuccessAt?: string;
  message: string;
};

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const SYNC_INTERVAL_MS = 15_000;

class SyncService {
  private snapshot: SyncSnapshot = { phase: 'idle', pendingCount: 0, message: 'Saved on this phone' };
  private listeners = new Set<() => void>();
  private interval?: number;
  private debounce?: number;
  private syncing = false;
  private started = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private publish(next: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private async refreshPendingCount() {
    const pendingCount = await db.syncOutbox.count();
    this.publish({ pendingCount });
  }

  start() {
    if (this.started) return;
    this.started = true;
    void this.refreshPendingCount();
    void this.sync();
    this.interval = window.setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
    window.addEventListener('online', this.handleReconnect);
    window.addEventListener('focus', this.handleReconnect);
    window.addEventListener('offline', this.handleOffline);
  }

  stop() {
    if (this.interval) window.clearInterval(this.interval);
    if (this.debounce) window.clearTimeout(this.debounce);
    window.removeEventListener('online', this.handleReconnect);
    window.removeEventListener('focus', this.handleReconnect);
    window.removeEventListener('offline', this.handleOffline);
    this.started = false;
  }

  requestSync() {
    void this.refreshPendingCount();
    if (this.debounce) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => void this.sync(), 250);
  }

  private handleReconnect = () => void this.sync();
  private handleOffline = () => this.publish({ phase: 'offline', message: 'Offline — safely stored here' });

  private async markAcknowledged(items: SyncOutboxItem[], ids: string[]) {
    const acknowledged = new Set(ids);
    const applied = items.filter((item) => acknowledged.has(item.id));
    for (const item of applied) {
      if (item.entityType === 'catch') await db.catches.update(item.entityId, { isPendingSync: false });
      if (item.entityType === 'chatMessage') await db.chatMessages.update(item.entityId, { isPendingSync: false });
      if (item.entityType === 'reaction') await db.reactions.update(item.entityId, { isPendingSync: false });
      if (item.entityType === 'media') await db.media.update(item.entityId, { isPendingSync: false });
    }
    if (ids.length) await db.syncOutbox.bulkDelete(ids);
  }

  async sync() {
    if (this.syncing) return;
    await this.refreshPendingCount();

    if (!navigator.onLine) {
      this.publish({ phase: 'offline', message: 'Offline — safely stored here' });
      return;
    }

    this.syncing = true;
    this.publish({ phase: 'syncing', message: 'Syncing with the derby…' });
    const attemptedAt = new Date().toISOString();

    try {
      const deviceId = await getOrCreateDeviceId();
      const syncState = await db.syncState.get('_global');
      const outbox = await db.syncOutbox.orderBy('createdAt').toArray();
      const request: SyncRequest = {
        clientId: deviceId,
        cursor: syncState?.cursor,
        lastSyncedAt: syncState?.lastSuccessAt,
        outbox,
      };
      const response = await fetch(`${API_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`Derby server returned ${response.status}`);
      const data = (await response.json()) as SyncResponse;
      const patches = {
        ...data.patches,
        reactions: data.patches.reactions ?? [],
        media: data.patches.media ?? [],
      };

      await db.transaction(
        'rw',
        [db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.reactions, db.media, db.syncOutbox, db.syncState],
        async () => {
          await this.markAcknowledged(outbox, data.appliedOperationIds);
          if (patches.users.length) await db.users.bulkPut(patches.users);
          if (patches.derbies.length) await db.derbies.bulkPut(patches.derbies);
          if (patches.derbyParticipants.length) await db.derbyParticipants.bulkPut(patches.derbyParticipants);
          if (patches.catches.length) await db.catches.bulkPut(patches.catches);
          if (patches.chatMessages.length) await db.chatMessages.bulkPut(patches.chatMessages);
          if (patches.reactions.length) await db.reactions.bulkPut(patches.reactions);
          for (const incoming of patches.media) {
            const local = await db.media.get(incoming.id);
            await db.media.put({ ...incoming, blob: local?.blob });
          }
          await db.syncState.put({ derbyId: '_global', cursor: data.nextCursor, lastAttemptAt: attemptedAt, lastSuccessAt: data.serverTime });
        },
      );

      await this.refreshPendingCount();
      this.publish({
        phase: 'idle',
        lastSuccessAt: data.serverTime,
        message: this.snapshot.pendingCount ? `${this.snapshot.pendingCount} waiting to sync` : 'Synced to derby',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      const pending = await db.syncOutbox.toArray();
      await db.transaction('rw', [db.syncOutbox, db.syncState], async () => {
        await Promise.all(
          pending.map((item) =>
            db.syncOutbox.update(item.id, {
              attempts: (item.attempts ?? 0) + 1,
              status: 'failed',
              lastError: message,
            }),
          ),
        );
        await db.syncState.put({ derbyId: '_global', lastAttemptAt: attemptedAt, lastError: message });
      });
      await this.refreshPendingCount();
      this.publish({
        phase: navigator.onLine ? 'error' : 'offline',
        message: this.snapshot.pendingCount ? 'Saved here — server unavailable' : 'Server unavailable',
      });
    } finally {
      this.syncing = false;
    }
  }
}

export const syncService = new SyncService();
