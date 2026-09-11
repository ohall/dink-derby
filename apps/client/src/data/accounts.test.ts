import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { db, DinkDerbyDatabase, databaseNameForAccount, LEGACY_DATABASE, accountDatabaseName } from '../db';
import { assertSafeAccountSwitch, finishAccountSignIn, restoreAccount, sendSaveAccountCode, sendSignInCode, verifySaveAccountCode } from './accounts';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn(), setSession: vi.fn(), sync: vi.fn() }));
vi.mock('../lib/supabase', () => ({ isAccountRecoveryEnabled: true, supabase: { auth: mocks }, createSignInClient: vi.fn() }));
vi.mock('../lib/api', () => ({ API_URL: 'https://api.test' }));
vi.mock('../sync', () => ({ syncService: { sync: mocks.sync } }));

const guestId = '11111111-1111-4111-8111-111111111111';
const savedId = '22222222-2222-4222-8222-222222222222';
const now = '2026-09-11T12:00:00.000Z';
const savedUser = { id: savedId, email: 'test@example.com', email_confirmed_at: now, is_anonymous: false };
const session = { user: savedUser, access_token: 'test-access', refresh_token: 'test-refresh' } as Session;
const oldDerby = { id: '33333333-3333-4333-8333-333333333333', name: 'History derby', bodyOfWaterName: 'Test pond', createdByUserId: savedId, scoringMode: 'weight' as const, status: 'finished' as const, completedAt: now, createdAt: now, updatedAt: now, isArchived: false };
const restored = new DinkDerbyDatabase('DinkDerbyAccountTest');
function snapshot() {
  return { serverTime: now, nextCursor: 2, appliedOperationIds: [], rejected: [], events: [], removedDerbyIds: [oldDerby.id], patches: {
    users: [{ id: savedId, displayName: 'Saved Angler', createdAt: now, updatedAt: now }],
    derbies: [oldDerby], derbyParticipants: [{ id: '44444444-4444-4444-8444-444444444444', derbyId: oldDerby.id, userId: savedId, createdAt: now, isAdmin: false, removedAt: now }],
    catches: [{ id: 'catch', derbyId: oldDerby.id, userId: savedId, weightInPounds: 3.5, count: 1, photoMediaId: 'photo', caughtAt: now, createdAt: now, updatedAt: now, clientId: 'original-phone', isPendingSync: false }], chatMessages: [], reactions: [],
    media: [{ id: 'photo', derbyId: oldDerby.id, ownerId: savedId, catchId: 'catch', contentHash: 'test-hash', contentType: 'image/jpeg', sizeBytes: 42, remoteUrl: 'private/path.jpg', createdAt: now, updatedAt: now, clientId: 'original-phone', isPendingSync: false }],
  } };
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await db.delete(); await db.open(); await restored.delete(); await restored.open();
  await db.settings.put({ id: 'app', currentUserId: guestId });
  await db.users.put({ id: guestId, displayName: 'Original', createdAt: now, updatedAt: now });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: guestId, is_anonymous: true } } }, error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.sync.mockResolvedValue(undefined);
});
afterEach(async () => { await db.delete(); await restored.delete(); vi.unstubAllGlobals(); });

it('links email to the existing guest, never replaces the angler or its outbox', async () => {
  await db.derbies.put({ ...oldDerby, scoringMode: 'weight' });
  await sendSaveAccountCode(' parent@example.com ');
  expect(mocks.updateUser).toHaveBeenCalledWith({ email: 'parent@example.com' });
  expect((await db.settings.get('app'))?.currentUserId).toBe(guestId);
  expect(await db.derbies.count()).toBe(1);
  expect(mocks.setSession).not.toHaveBeenCalled();
});

it('does not link before the existing profile has reached the server', async () => {
  await db.syncOutbox.add({ id: 'op', entityType: 'user', entityId: guestId, operation: 'create', payload: {}, createdAt: now });
  await expect(sendSaveAccountCode('parent@example.com')).rejects.toThrow('has not synced');
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it('refuses linking offline or with a different active auth identity', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await expect(sendSaveAccountCode('parent@example.com')).rejects.toThrow('Connect');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  await expect(sendSaveAccountCode('parent@example.com')).rejects.toThrow('expired');
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it('verifies linking as email_change and insists that the ID stays unchanged', async () => {
  mocks.verifyOtp.mockResolvedValue({ data: { user: { ...savedUser, id: guestId } }, error: null });
  expect((await verifySaveAccountCode('parent@example.com', '123456')).id).toBe(guestId);
  expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'parent@example.com', token: '123456', type: 'email_change' });
  mocks.verifyOtp.mockResolvedValue({ data: { user: savedUser }, error: null });
  await expect(verifySaveAccountCode('parent@example.com', '123456')).rejects.toThrow('not complete');
});

it('reports invalid/expired codes without touching local history', async () => {
  mocks.verifyOtp.mockResolvedValue({ error: { message: 'expired' }, data: {} });
  await expect(verifySaveAccountCode('parent@example.com', '123456')).rejects.toThrow('invalid or expired');
  expect((await db.users.get(guestId))?.displayName).toBe('Original');
});

it('sign-in never creates another account for an unknown email', async () => {
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  await sendSignInCode({ auth: { signInWithOtp } } as unknown as SupabaseClient, 'test@example.com');
  expect(signInWithOtp).toHaveBeenCalledWith({ email: 'test@example.com', options: { shouldCreateUser: false } });
});

it('blocks wrong-account activation when a guest has history, photos, or drafts', async () => {
  await db.catchDrafts.put({ id: 'draft', derbyId: oldDerby.id, userId: guestId, measurement: '5', species: '', note: '', isOpen: false, updatedAt: now });
  await expect(assertSafeAccountSwitch(savedId)).rejects.toThrow('not merged');
  await expect(assertSafeAccountSwitch(guestId)).resolves.toBeUndefined();
  const verifyOtp = vi.fn().mockResolvedValue({ data: { session }, error: null });
  await expect(finishAccountSignIn({ auth: { verifyOtp } } as unknown as SupabaseClient, 'test@example.com', '123456')).rejects.toThrow('not merged');
  expect(mocks.setSession).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(await db.catchDrafts.count()).toBe(1);
});

it('uses the original DB for its owner and a separate DB for another account', async () => {
  expect(await databaseNameForAccount(guestId)).toBe(LEGACY_DATABASE);
  expect(await databaseNameForAccount(savedId)).toBe(accountDatabaseName(savedId));
  expect(() => accountDatabaseName('../invalid')).toThrow('Invalid');
});

it('restores historical membership and profile before queuing only a fresh device', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(snapshot()), { status: 200 }));
  await restoreAccount(session, restored);
  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(request).toMatchObject({ userId: savedId, outbox: [] });
  expect((await restored.users.get(savedId))?.displayName).toBe('Saved Angler');
  expect((await restored.settings.get('app'))?.removedDerbyIds).toEqual([oldDerby.id]);
  expect(await restored.derbies.count()).toBe(1);
  expect(await restored.derbyParticipants.count()).toBe(1);
  expect((await restored.catches.get('catch'))?.weightInPounds).toBe(3.5);
  expect((await restored.media.get('photo'))?.remoteUrl).toBe('private/path.jpg');
  const outbox = await restored.syncOutbox.toArray();
  expect(outbox.map(op => op.entityType)).toEqual(['device']);
  expect(outbox[0].payload).toMatchObject({ id: request.clientId, userId: savedId });
  expect((await db.settings.get('app'))?.currentUserId).toBe(guestId);
  expect((await db.users.get(guestId))?.displayName).toBe('Original');
});

it('keeps both databases intact when history restoration fails', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503 }));
  await expect(restoreAccount(session, restored)).rejects.toThrow('Could not restore');
  expect(await restored.settings.count()).toBe(0);
  expect(await restored.users.count()).toBe(0);
  expect(await db.users.count()).toBe(1);
  expect(mocks.setSession).not.toHaveBeenCalled();
});

it('never overwrites an existing same-account cache or pending edits during restore', async () => {
  await restored.settings.put({ id: 'app', currentUserId: savedId });
  await restored.catchDrafts.put({ id: 'draft', derbyId: oldDerby.id, userId: savedId, measurement: '7', species: '', note: '', isOpen: true, updatedAt: now });
  await restoreAccount(session, restored);
  expect(fetch).not.toHaveBeenCalled();
  expect((await restored.catchDrafts.get('draft'))?.measurement).toBe('7');
  await expect(restoreAccount(session, db)).rejects.toThrow('does not match');
});
