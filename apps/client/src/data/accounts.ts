import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { SyncResponse } from '@dink-derby/shared-types';
import { db, databaseNameForAccount, DinkDerbyDatabase, selectAccountDatabase } from '../db';
import { API_URL } from '../lib/api';
import { createSignInClient, isAccountRecoveryEnabled, supabase } from '../lib/supabase';
import { syncService } from '../sync';

function requireOnline() {
  if (!isAccountRecoveryEnabled || !supabase) throw new Error('Account recovery is not available yet.');
  if (!navigator.onLine) throw new Error('Connect to the internet to save or recover an account.');
  return supabase;
}

export async function currentAccount() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function hasLocalDerbyData() {
  const counts = await Promise.all([db.derbies.count(), db.catches.count(), db.catchDrafts.count(), db.media.count(), db.derbyParticipants.count()]);
  return counts.some(Boolean);
}

export async function sendSaveAccountCode(email: string) {
  const client = requireOnline();
  const account = await currentAccount();
  const settings = await db.settings.get('app');
  if (!account || account.id !== settings?.currentUserId) throw new Error('This guest session has expired. Sign in to an account you previously saved; local history is still on this device.');
  if (!account.is_anonymous) throw new Error('This account is already saved.');
  // Ensure the existing app profile is on the server before linking it.
  await syncService.sync();
  if (await db.syncOutbox.where('entityType').equals('user').count()) throw new Error('Your profile has not synced yet. Wait for a connection and try again.');
  const { error } = await client.auth.updateUser({ email: email.trim() });
  if (error) throw new Error(error.message);
}

export async function verifySaveAccountCode(email: string, token: string) {
  const client = requireOnline();
  const owner = (await db.settings.get('app'))?.currentUserId;
  const account = await currentAccount();
  if (!owner || account?.id !== owner) throw new Error('The active account changed. Reopen Profile before continuing.');
  const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email_change' });
  if (error) throw new Error('That code is invalid or expired. Check the email or request a new code.');
  if (data.user?.id !== owner || data.user.is_anonymous || !data.user.email_confirmed_at) throw new Error('Email confirmation is not complete. Request a new code and try again.');
  return data.user;
}

export function beginAccountSignIn() {
  requireOnline();
  return createSignInClient();
}

export async function sendSignInCode(client: SupabaseClient, email: string) {
  requireOnline();
  const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
  if (error) throw new Error('Could not send a code. Use the email from Save my account, or wait a minute and try again.');
}

export async function assertSafeAccountSwitch(userId: string) {
  const owner = (await db.settings.get('app'))?.currentUserId;
  if (owner !== userId && await hasLocalDerbyData()) {
    throw new Error('This browser has another angler’s derby history. Save that guest account first, or sign in using a different browser. Accounts are not merged. Nothing here was changed.');
  }
}

export async function restoreAccount(session: Session, target: DinkDerbyDatabase) {
  const existing = await target.settings.get('app');
  if (existing) {
    if (existing.currentUserId !== session.user.id) throw new Error('Account storage does not match. Local history was not changed.');
    return;
  }
  const deviceId = crypto.randomUUID();
  // Read-only snapshot: never upload the other guest's outbox or generate a
  // placeholder user that overwrites the saved account's display name.
  const response = await fetch(`${API_URL}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, 'X-Dink-User-Id': session.user.id },
    body: JSON.stringify({ userId: session.user.id, clientId: deviceId, outbox: [] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error('Could not restore your history. Try again with a connection. Your current profile is unchanged.');
  const { SyncResponseSchema } = await import('@dink-derby/shared-types');
  const snapshot: SyncResponse = SyncResponseSchema.parse(await response.json());
  if (!snapshot.patches.users.some(user => user.id === session.user.id)) throw new Error('No saved angler profile was found for this account.');
  const now = new Date().toISOString();
  const device = { id: deviceId, userId: session.user.id, createdAt: now };
  await target.transaction('rw', target.tables, async () => {
    await target.users.bulkPut(snapshot.patches.users);
    await target.derbies.bulkPut(snapshot.patches.derbies);
    await target.derbyParticipants.bulkPut(snapshot.patches.derbyParticipants);
    await target.catches.bulkPut(snapshot.patches.catches);
    await target.chatMessages.bulkPut(snapshot.patches.chatMessages);
    await target.reactions.bulkPut(snapshot.patches.reactions ?? []);
    await target.media.bulkPut(snapshot.patches.media ?? []);
    await target.derbyEvents.bulkPut(snapshot.events);
    await target.device.put(device);
    await target.settings.put({ id: 'app', currentUserId: session.user.id, initializedAt: now, authMode: 'supabase', removedDerbyIds: snapshot.removedDerbyIds ?? [] });
    await target.syncState.put({ derbyId: '_global', cursor: snapshot.nextCursor, lastSuccessAt: snapshot.serverTime });
    await target.syncOutbox.add({ id: crypto.randomUUID(), entityId: deviceId, entityType: 'device', operation: 'create', payload: device, createdAt: now, attempts: 0, status: 'pending' });
  });
}

export async function finishAccountSignIn(client: SupabaseClient, email: string, token: string) {
  const main = requireOnline();
  const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error || !data.session) throw new Error('That code is invalid or expired. Check the email or request a new code.');
  const session = data.session;
  if (session.user.is_anonymous || !session.user.email_confirmed_at) throw new Error('Verify your email on the original device first.');
  await assertSafeAccountSwitch(session.user.id);
  const name = await databaseNameForAccount(session.user.id);
  const target = name === db.name ? db : new DinkDerbyDatabase(name);
  try { await restoreAccount(session, target); }
  finally { if (target !== db) target.close(); }
  // Recheck after network I/O: another tab may have created a derby meanwhile.
  await assertSafeAccountSwitch(session.user.id);
  selectAccountDatabase(name);
  const { error: sessionError } = await main.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (sessionError) { selectAccountDatabase(db.name); throw new Error('Sign-in could not be saved. Try again.'); }
  window.location.reload();
}
