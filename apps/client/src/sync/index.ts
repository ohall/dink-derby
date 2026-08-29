import type { SyncOutboxItem, SyncRequest, SyncResponse } from '@dink-derby/shared-types';
import { db } from '../db';
import { getOrCreateDeviceId } from '../utils/device';
import { apiFetch, uploadMedia } from '../lib/api';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncSnapshot = {
  phase: SyncPhase;
  pendingCount: number;
  lastSuccessAt?: string;
  message: string;
};

const SYNC_INTERVAL_MS = Number(import.meta.env.VITE_SYNC_INTERVAL_MS ?? 15_000);

class SyncService {
  private snapshot: SyncSnapshot = { phase: 'idle', pendingCount: 0, message: 'Saved on this phone' };
  private listeners = new Set<() => void>();
  private interval?: number;
  private debounce?: number;
  private syncing = false;
  private syncRequested = false;
  private started = false;
  private unseenCount = 0;
  private baseTitle = 'Dink Derby';

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
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.updateBadge();
  }

  stop() {
    if (this.interval) window.clearInterval(this.interval);
    if (this.debounce) window.clearTimeout(this.debounce);
    window.removeEventListener('online', this.handleReconnect);
    window.removeEventListener('focus', this.handleReconnect);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.started = false;
  }

  requestSync() {
    this.syncRequested = true;
    void this.refreshPendingCount();
    if (this.debounce) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => void this.sync(), 250);
  }

  async retry() {
    const failed = await db.syncOutbox.where('status').equals('failed').toArray();
    await Promise.all(failed.map((item) => db.syncOutbox.update(item.id, { status: 'pending', lastError: undefined })));
    await this.sync();
  }

  private handleReconnect = () => void this.sync();
  private handleOffline = () => this.publish({ phase: 'offline', message: 'Offline — safely stored here' });
  private handleVisibility = () => {
    if (document.visibilityState === 'visible') this.resetBadge();
  };

  private updateBadge() {
    if (this.unseenCount > 0) {
      document.title = `(${this.unseenCount}) ${this.baseTitle}`;
    } else {
      document.title = this.baseTitle;
    }
  }

  private bumpBadge(count: number) {
    this.unseenCount += count;
    this.updateBadge();
  }

  private resetBadge() {
    this.unseenCount = 0;
    this.updateBadge();
  }

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

  private async uploadPendingMedia() {
    const candidates = await db.media.filter((item) => Boolean(item.blob) && !item.remoteUrl).toArray();
    for (const media of candidates) {
      if (!media.blob) continue;
      const path = await uploadMedia(media.id, media.contentType, media.blob);
      if (path) await db.media.update(media.id, { remoteUrl: path, isPendingSync: false });
    }
  }

  async sync() {
    if (this.syncing) {
      this.syncRequested = true;
      return;
    }
    this.syncRequested = false;
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
      const settings = await db.settings.get('app');
      if (!settings) throw new Error('This phone is missing its Dink Derby identity.');
      const syncState = await db.syncState.get('_global');
      const queued = await db.syncOutbox.orderBy('createdAt').toArray();
      const priority: Record<SyncOutboxItem['entityType'], number> = { user: 0, device: 1, derby: 2, derbyParticipant: 3, catch: 4, media: 5, chatMessage: 6, reaction: 7 };
      const outbox = queued
        .filter((item) => item.status !== 'failed')
        .sort((a, b) => priority[a.entityType] - priority[b.entityType] || a.createdAt.localeCompare(b.createdAt));
      const request: SyncRequest = {
        clientId: deviceId,
        userId: settings.currentUserId,
        cursor: syncState?.cursor,
        lastSyncedAt: syncState?.lastSuccessAt,
        outbox,
      };
      const response = await apiFetch('/sync', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      const data = (await response.json()) as SyncResponse;
      const patches = {
        ...data.patches,
        reactions: data.patches.reactions ?? [],
        media: data.patches.media ?? [],
      };

      await db.transaction(
        'rw',
        [db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.reactions, db.media, db.syncOutbox, db.syncState, db.derbyEvents],
        async () => {
          await this.markAcknowledged(outbox, data.appliedOperationIds);
          await Promise.all(data.rejected.map((rejection) => db.syncOutbox.update(rejection.operationId, {
            status: 'failed',
            lastError: `${rejection.code}: ${rejection.message}`,
          })));
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
          if (data.events.length) {
            await db.derbyEvents.bulkPut(data.events);
            const newCatchesOrMessages = data.events.filter(
              (event) => event.type === 'catch.create' || event.type === 'chatMessage.create',
            ).length;
            if (newCatchesOrMessages > 0 && document.visibilityState !== 'visible') {
              this.bumpBadge(newCatchesOrMessages);
            }
          }
          await db.syncState.put({ derbyId: '_global', cursor: data.nextCursor, lastAttemptAt: attemptedAt, lastSuccessAt: data.serverTime });
        },
      );

      await this.uploadPendingMedia();

      await this.refreshPendingCount();
      if (data.rejected.length) {
        this.publish({ phase: 'error', message: `${data.rejected.length} change${data.rejected.length === 1 ? '' : 's'} need attention` });
        return;
      }
      this.publish({
        phase: 'idle',
        lastSuccessAt: data.serverTime,
        message: this.snapshot.pendingCount ? `${this.snapshot.pendingCount} waiting to sync` : 'Synced to derby',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      const pending = await db.syncOutbox.where('status').notEqual('failed').toArray();
      await db.transaction('rw', [db.syncOutbox, db.syncState], async () => {
        await Promise.all(
          pending.map((item) =>
            db.syncOutbox.update(item.id, {
              attempts: (item.attempts ?? 0) + 1,
              status: 'pending',
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
      if (this.syncRequested) window.setTimeout(() => void this.sync(), 0);
    }
  }
}

export const syncService = new SyncService();
