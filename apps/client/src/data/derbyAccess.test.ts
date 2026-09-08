import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from '../db';
import { applyDerbyRemovals, applyMembershipPatches, assertDerbyAccess } from './derbyAccess';
const now = new Date().toISOString();
beforeEach(async () => { await db.delete(); await db.open(); await db.settings.put({ id: 'app', currentUserId: 'guest' }); });
afterEach(async () => { await db.delete(); });
it('durably revokes access and cancels only the removed derby outbox, keeping original catches and drafts', async () => {
  await db.catches.put({ id: 'fish', derbyId: 'removed', userId: 'guest', count: 1, clientId: 'device', caughtAt: now, createdAt: now, updatedAt: now, isPendingSync: true });
  await db.catchDrafts.put({ id: 'draft', derbyId: 'removed', userId: 'guest', measurement: '2', species: 'Bass', note: '', isOpen: true, updatedAt: now });
  for (const derbyId of ['removed', 'other']) await db.syncOutbox.put({ id: derbyId, derbyId, entityType: 'catch', entityId: derbyId, payload: {}, operation: 'create', createdAt: now });
  await db.transaction('rw', [db.settings, db.syncOutbox], () => applyDerbyRemovals(['removed']));
  await expect(assertDerbyAccess('removed')).rejects.toThrow('removed');
  await expect(assertDerbyAccess('other')).resolves.toBeUndefined();
  expect(await db.syncOutbox.toArray()).toMatchObject([{ id: 'other' }]);
  expect(await db.catches.count()).toBe(1); expect(await db.catchDrafts.count()).toBe(1);
  await db.transaction('rw', [db.settings, db.syncOutbox], () => applyDerbyRemovals(['removed', 'another']));
  expect((await db.settings.get('app'))?.removedDerbyIds).toEqual(['removed', 'another']);
});
it('never lets a delayed snapshot resurrect a removed participant', async () => {
  const person = { id: 'membership', derbyId: 'derby', userId: 'guest', isAdmin: false, createdAt: now };
  await applyMembershipPatches([{ ...person, removedAt: now }]);
  await applyMembershipPatches([person]);
  expect((await db.derbyParticipants.get(person.id))?.removedAt).toBe(now);
});
