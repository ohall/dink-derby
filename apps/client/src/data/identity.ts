import type { Device, SyncOutboxItem, User } from '@dink-derby/shared-types';
import { db, databaseNameForAccount, selectAccountDatabase, type AppSettings } from '../db';
import { getOrCreateDeviceId } from '../utils/device';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

function identityOperation(entityType: 'user' | 'device', entity: User | Device): SyncOutboxItem {
  return {
    id: crypto.randomUUID(),
    entityType,
    entityId: entity.id,
    operation: 'create',
    payload: entity,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
}

async function removeLegacyDemo() {
  const settings = await db.settings.get('app');
  if (settings?.currentUserId !== 'demo-you') return;

  await db.transaction(
    'rw',
    [db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.reactions, db.media, db.syncOutbox, db.settings, db.syncState],
    async () => {
      await Promise.all([
        db.users.clear(),
        db.derbies.clear(),
        db.derbyParticipants.clear(),
        db.catches.clear(),
        db.chatMessages.clear(),
        db.reactions.clear(),
        db.media.clear(),
        db.syncOutbox.clear(),
        db.settings.clear(),
        db.syncState.clear(),
      ]);
    },
  );
}

async function resolveUserId() {
  if (!supabase) return crypto.randomUUID();

  const current = await supabase.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session?.user.id) return current.data.session.user.id;

  const created = await supabase.auth.signInAnonymously();
  if (created.error) throw new Error(`Dink Derby could not create your field identity: ${created.error.message}`);
  if (!created.data.user) throw new Error('Dink Derby could not create your field identity.');
  return created.data.user.id;
}

let initialization: Promise<{ user: User; isNew: boolean; authMode: AppSettings['authMode'] }> | undefined;

async function initializeIdentityOnce() {
  await removeLegacyDemo();
  const existing = await db.settings.get('app');
  const existingUser = existing ? await db.users.get(existing.currentUserId) : undefined;
  if (existing && existingUser && !navigator.onLine) return { user: existingUser, isNew: false, authMode: existing.authMode };
  if (existing && !existingUser) throw new Error('This browser’s cached profile is incomplete. Local derby data was preserved; do not clear browser storage.');
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    // Auth refresh failures must not replace a cached offline identity.
    if (!error && data.session) {
      const session = data.session;
      if (existing && session.user.id !== existing.currentUserId) {
        selectAccountDatabase(await databaseNameForAccount(session.user.id));
        window.location.reload();
        return new Promise<never>(() => undefined);
      }
      if (!existing && !session.user.is_anonymous) {
        const { restoreAccount } = await import('./accounts');
        await restoreAccount(session, db);
        const user = await db.users.get(session.user.id);
        if (!user) throw new Error('Account history could not be restored. Reconnect and try again.');
        return { user, isNew: false, authMode: 'supabase' as const };
      }
    }
  }
  if (existing && existingUser) return { user: existingUser, isNew: false, authMode: existing.authMode };

  if (isSupabaseConfigured && !navigator.onLine) {
    throw new Error('Connect once to set up this phone. After that, Dink Derby works offline.');
  }

  const userId = await resolveUserId();
  const deviceId = await getOrCreateDeviceId();
  const now = new Date().toISOString();
  const user: User = {
    id: userId,
    displayName: `Angler ${userId.slice(0, 4).toUpperCase()}`,
    createdAt: now,
    updatedAt: now,
  };
  const device: Device = { id: deviceId, userId, createdAt: now };
  const settings: AppSettings = {
    id: 'app',
    currentUserId: userId,
    initializedAt: now,
    authMode: isSupabaseConfigured ? 'supabase' : 'local',
  };

  await db.transaction('rw', [db.users, db.device, db.settings, db.syncOutbox], async () => {
    await db.users.put(user);
    await db.device.put(device);
    await db.settings.put(settings);
    await db.syncOutbox.bulkAdd([
      identityOperation('user', user),
      identityOperation('device', device),
    ]);
  });

  return { user, isNew: true, authMode: settings.authMode };
}

export function initializeIdentity() {
  initialization ??= initializeIdentityOnce();
  return initialization;
}
