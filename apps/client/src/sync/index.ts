import type { SyncOutboxItem, SyncRequest, SyncResponse } from '@dink-derby/shared-types';
import { db } from '../db';
import { getOrCreateDeviceId } from '../utils/device';
import { apiFetch, uploadMedia } from '../lib/api';
import { applyDerbyRemovals, applyMembershipPatches } from '../data/derbyAccess';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncSnapshot = {
  phase: SyncPhase;
  pendingCount: number;
  rejectedEditCount: number;
  lastSuccessAt?: string;
  message: string;
};

const SYNC_INTERVAL_MS = Number(import.meta.env.VITE_SYNC_INTERVAL_MS ?? 15_000);

export class SyncService {
  private snapshot: SyncSnapshot = { phase: 'idle', pendingCount: 0, rejectedEditCount: 0, message: 'Saved on this phone' };
  private listeners = new Set<() => void>();
  private interval?: number;
  private syncTimer?: number;
  private retryTimer?: number;
  private retryDelayMs = 2_000;
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
    const rejectedEditCount = await db.syncOutbox.where('status').equals('failed').filter(item => item.entityType === 'catch' && item.operation === 'update').count();
    this.publish({ pendingCount, rejectedEditCount });
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
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    window.removeEventListener('online', this.handleReconnect);
    window.removeEventListener('focus', this.handleReconnect);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.started = false;
  }

  requestSync() {
    this.syncRequested = true;
    void this.refreshPendingCount();
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => void this.sync(), 0);
  }

  async retry() {
    const failed = await db.syncOutbox.where('status').equals('failed').toArray();
    await Promise.all(failed.map((item) => db.syncOutbox.update(item.id, { status: 'pending', lastError: undefined })));
    await this.sync();
  }

  async dismissRejectedEdits() {
    // Only failed corrections can be dismissed. Never discard a newly captured
    // fish or an upload merely because the server rejected it.
    await db.syncOutbox.where('status').equals('failed').filter(item => item.entityType === 'catch' && item.operation === 'update').delete();
    await this.sync();
  }

  private static readonly MAX_RETRY_DELAY_MS = 30_000;

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined;
      void this.sync();
    }, this.retryDelayMs);
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, SyncService.MAX_RETRY_DELAY_MS);
  }

  private clearRetry() {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryDelayMs = 2_000;
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
    if (ids.length) await db.syncOutbox.bulkDelete(ids);
    const remaining = await db.syncOutbox.toArray();
    for (const item of applied) {
      if (remaining.some(op => op.entityType === item.entityType && op.entityId === item.entityId && op.status !== 'failed')) continue;
      if (item.entityType === 'catch') await db.catches.update(item.entityId, { isPendingSync: false });
      if (item.entityType === 'chatMessage') await db.chatMessages.update(item.entityId, { isPendingSync: false });
      if (item.entityType === 'reaction') await db.reactions.update(item.entityId, { isPendingSync: false });
      if (item.entityType === 'media') await db.media.update(item.entityId, { isPendingSync: false });
    }
  }

  private async uploadPendingMedia() {
    // Enumerate keys first so a backlog never retains every photo at once.
    const ids = await db.media.toCollection().primaryKeys();
    const removed = new Set((await db.settings.get('app'))?.removedDerbyIds ?? []);
    for (const id of ids) {
      const media = await db.media.get(id);
      if (!media || removed.has(media.derbyId) || (!media.bytes && !media.blob) || media.remoteUrl) continue;
      const blob = media.bytes ? new Blob([media.bytes], { type: media.contentType }) : media.blob!;
      const path = await uploadMedia(media.id, media.contentType, blob);
      if (path) await db.media.update(media.id, { remoteUrl: path, isPendingSync: false });
    }
  }

  async sync() {
    if (this.syncing) {
      this.syncRequested = true;
      return;
    }
    // Claim the run before the first await; focus and save can arrive together.
    this.syncing = true;
    this.syncRequested = false;
    const attemptedAt = new Date().toISOString();

    try {
      await this.refreshPendingCount();
      if (!navigator.onLine) {
        this.clearRetry();
        this.publish({ phase: 'offline', message: 'Offline — safely stored here' });
        return;
      }
      this.publish({ phase: 'syncing', message: 'Syncing with the derby…' });
      const deviceId = await getOrCreateDeviceId();
      const settings = await db.settings.get('app');
      if (!settings) throw new Error('This phone is missing its Dink Derby identity.');
      const syncState = await db.syncState.get('_global');
      const queued = await db.syncOutbox.orderBy('createdAt').toArray();
      const priority: Record<SyncOutboxItem['entityType'], number> = { user: 0, device: 1, derby: 2, derbyParticipant: 3, catch: 4, media: 5, chatMessage: 6, reaction: 7 };
      // Finish only after this device's catch corrections have reached the
      // server. Otherwise a queued finish can lock out an earlier offline edit.
      const operationPriority = (item: SyncOutboxItem) => item.entityType === 'derby' && item.operation === 'update' ? 8 : priority[item.entityType];
      const outbox = queued
        .filter((item) => item.status !== 'failed')
        .sort((a, b) => operationPriority(a) - operationPriority(b) || a.createdAt.localeCompare(b.createdAt));
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
        [db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.reactions, db.media, db.syncOutbox, db.syncState, db.derbyEvents, db.settings],
        async () => {
          await applyDerbyRemovals(data.removedDerbyIds);
          await this.markAcknowledged(outbox, data.appliedOperationIds);
          await Promise.all(data.rejected.map((rejection) => db.syncOutbox.update(rejection.operationId, {
            status: 'failed',
            lastError: `${rejection.code}: ${rejection.message}`,
          })));
          if (patches.users.length) await db.users.bulkPut(patches.users);
          const pending = (await db.syncOutbox.toArray()).filter(op => op.status !== 'failed');
          const pendingDerbies = new Set(pending.filter(op => op.entityType === 'derby').map(op => op.entityId));
          const settledDerbies = patches.derbies.filter(derby => !pendingDerbies.has(derby.id));
          if (settledDerbies.length) await db.derbies.bulkPut(settledDerbies);
          await applyMembershipPatches(patches.derbyParticipants);
          const pendingCatches = new Set(pending.filter(op => op.entityType === 'catch').map(op => op.entityId));
          const settledCatches = patches.catches.filter(item => !pendingCatches.has(item.id));
          if (settledCatches.length) await db.catches.bulkPut(settledCatches);
          if (patches.chatMessages.length) await db.chatMessages.bulkPut(patches.chatMessages);
          if (patches.reactions.length) await db.reactions.bulkPut(patches.reactions);
          for (const incoming of patches.media) {
            const local = await db.media.get(incoming.id);
            await db.media.put({ ...incoming, blob: local?.blob, bytes: local?.bytes });
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
      const failedChanges = await db.syncOutbox.where('status').equals('failed').toArray();
      if (failedChanges.length) {
        this.clearRetry();
        this.publish({ phase: 'error', message: `${failedChanges.length} change${failedChanges.length === 1 ? '' : 's'} rejected: ${failedChanges[0].lastError?.replace(/^OPERATION_REJECTED: /, '') || 'Check your changes.'}` });
        return;
      }
      this.clearRetry();
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
      this.scheduleRetry();
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
