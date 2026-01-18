import { db } from '../db';
import { SyncResponse, SyncRequest } from '@dink-derby/shared-types';
import { getOrCreateDeviceId } from '../utils/device';

const SYNC_INTERVAL_MS = 10000; // 10 seconds
const API_URL = 'http://localhost:3000';

export class SyncService {
  private isSyncing = false;
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (this.timer) return;
    
    // Initial sync
    this.sync().catch(console.error);
    
    // Periodic sync
    this.timer = setInterval(() => {
      this.sync().catch(console.error);
    }, SYNC_INTERVAL_MS);

    // Sync on online
    window.addEventListener('online', () => this.sync());
    
    // Sync on focus
    window.addEventListener('focus', () => this.sync());
  }

  async sync() {
    if (this.isSyncing || !navigator.onLine) return;

    try {
      this.isSyncing = true;
      const deviceId = await getOrCreateDeviceId();
      
      // 1. Get last sync time (we'll store this in localStorage for simplicity for now)
      const lastSyncedAt = localStorage.getItem('lastSyncedAt') || undefined;

      // 2. Get pending outbox items
      const outbox = await db.syncOutbox.orderBy('createdAt').toArray();

      // 3. Prepare request
      const request: SyncRequest = {
        clientId: deviceId,
        lastSyncedAt,
        outbox
      };

      // 4. Send to server
      const response = await fetch(`${API_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const data: SyncResponse = await response.json();

      // 5. Apply changes locally transactionally
      await db.transaction('rw', db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.syncOutbox, async () => {
        
        // A. Remove applied outbox items
        if (data.appliedOperationIds.length > 0) {
          await db.syncOutbox.where('id').anyOf(data.appliedOperationIds).delete();
        }

        // B. Apply patches (Upsert all)
        if (data.patches.users.length) await db.users.bulkPut(data.patches.users);
        if (data.patches.derbies.length) await db.derbies.bulkPut(data.patches.derbies);
        if (data.patches.derbyParticipants.length) await db.derbyParticipants.bulkPut(data.patches.derbyParticipants);
        if (data.patches.catches.length) await db.catches.bulkPut(data.patches.catches);
        if (data.patches.chatMessages.length) await db.chatMessages.bulkPut(data.patches.chatMessages);
      });

      // 6. Update last sync time
      localStorage.setItem('lastSyncedAt', data.serverTime);
      
      console.log('Sync complete', { 
        sent: outbox.length, 
        received: Object.values(data.patches).reduce((acc, arr) => acc + arr.length, 0) 
      });

    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncService = new SyncService();
