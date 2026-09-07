import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Derby } from '@dink-derby/shared-types';
import { db } from '../db';
import { correctCatch, finishDerby, saveCatch, setCatchRemoved } from './operations';
import { openCatchDraft, resumableCatchDraft } from './catchDraft';
import { syncService } from '../sync';

vi.mock('../sync', () => ({ syncService: { requestSync: vi.fn() } }));
vi.mock('../lib/api', () => ({ joinDerbyRequest: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: null }));
vi.mock('../utils/device', () => ({ getOrCreateDeviceId: async () => 'device' }));

const now = new Date().toISOString();
const derby: Derby = { id: 'derby', name: 'Test', bodyOfWaterName: 'Pond', scoringMode: 'count', createdByUserId: 'user', isArchived: false, createdAt: now, updatedAt: now };
const photo = { bytes: new ArrayBuffer(5), contentType: 'image/jpeg' as const, hash: 'a'.repeat(64), width: 1200, height: 900 };

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put({ id: 'app', currentUserId: 'user' });
  await db.users.put({ id: 'user', displayName: 'Angler', createdAt: now, updatedAt: now });
});
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });

describe('durable catch saving', () => {
  it('commits the fish before storing a photo and clears the draft atomically', async () => {
    const draft = await openCatchDraft(derby.id, 'user');
    const add = db.media.add.bind(db.media);
    vi.spyOn(db.media, 'add').mockImplementation(value => db.catches.get(draft.id).then(saved => {
      expect(saved).toBeDefined();
      return add(value);
    }));
    const result = await saveCatch({ id: draft.id, derby, photo });
    expect(result.photoError).toBeUndefined();
    expect(result.item.photoMediaId).toBeDefined();
    expect(await db.catchDrafts.count()).toBe(0);
    expect(await db.media.count()).toBe(1);
    const operations = await db.syncOutbox.toArray();
    expect(operations.map(op => [op.entityType, op.operation])).toEqual(expect.arrayContaining([['catch', 'create'], ['catch', 'update'], ['media', 'create']]));
    expect(operations.every(op => !('blob' in (op.payload as object)) && !('bytes' in (op.payload as object)))).toBe(true);
    const catchOperations = (await db.syncOutbox.orderBy('createdAt').toArray()).filter(op => op.entityType === 'catch');
    expect(catchOperations.map(op => op.operation)).toEqual(['create', 'update']);
  });

  it('keeps the catch and its outbox entry when photo storage fails', async () => {
    vi.spyOn(db.media, 'add').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    const result = await saveCatch({ derby, photo });
    expect(result.photoError).toContain('Catch saved');
    expect(result.item.photoMediaId).toBeUndefined();
    expect(await db.catches.count()).toBe(1);
    expect(await db.media.count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(1);
    expect(syncService.requestSync).toHaveBeenCalled();
  });

  it('rolls back a failed photo attachment without leaving a dangling reference', async () => {
    vi.spyOn(db.syncOutbox, 'bulkAdd').mockRejectedValue(new Error('outbox failure'));
    const { item, photoError } = await saveCatch({ derby, photo });
    expect(photoError).toBeDefined();
    expect(item.photoMediaId).toBeUndefined();
    expect((await db.catches.get(item.id))?.photoMediaId).toBeUndefined();
    expect(await db.media.count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(1);
  });

  it('does not duplicate the fish or photo when a saved draft is retried', async () => {
    const id = crypto.randomUUID();
    await saveCatch({ id, derby, photo });
    await saveCatch({ id, derby, photo });
    expect(await db.catches.count()).toBe(1);
    expect(await db.media.count()).toBe(1);
    expect(await db.syncOutbox.count()).toBe(3);
  });

  it('retains the draft when the catch itself cannot be committed', async () => {
    const draft = await openCatchDraft(derby.id, 'user');
    vi.spyOn(db.syncOutbox, 'add').mockRejectedValue(new Error('write failed'));
    await expect(saveCatch({ id: draft.id, derby })).rejects.toThrow('write failed');
    expect(await db.catchDrafts.get(draft.id)).toBeDefined();
    expect(await db.catches.count()).toBe(0);
  });
});

describe('catch corrections', () => {
  it('preserves catch identity, time and photo, and queues create/edit/remove/restore in order', async () => {
    const weightDerby = { ...derby, scoringMode: 'weight' as const };
    await db.derbies.put(weightDerby);
    const { item } = await saveCatch({ derby: weightDerby, measurement: 2.5, note: 'Wrong weight', photo });
    await correctCatch(item.id, { measurement: 3.25, species: ' Bass ', note: '' });
    expect(await db.catches.get(item.id)).toMatchObject({ caughtAt: item.caughtAt, photoMediaId: item.photoMediaId, weightInPounds: 3.25, species: 'Bass', count: 1, isPendingSync: true });
    expect((await db.catches.get(item.id))?.note).toBeUndefined();
    await setCatchRemoved(item.id, true);
    expect((await db.catches.get(item.id))?.deletedAt).toBeDefined();
    await setCatchRemoved(item.id, false);
    expect((await db.catches.get(item.id))?.deletedAt).toBeUndefined();
    const operations = (await db.syncOutbox.orderBy('createdAt').toArray()).filter(op => op.entityType === 'catch');
    expect(operations).toHaveLength(5);
    expect(operations.map(op => op.operation)).toEqual(['create', 'update', 'update', 'update', 'update']);
    expect(new Set(operations.map(op => op.createdAt)).size).toBe(5);
  });
  it('rejects invalid measurements, other anglers, and changes to a completed derby', async () => {
    const weightDerby = { ...derby, scoringMode: 'weight' as const };
    await db.derbies.put(weightDerby);
    const { item } = await saveCatch({ derby: weightDerby, measurement: 2 });
    await expect(correctCatch(item.id, { measurement: 0 })).rejects.toThrow('valid weight');
    await db.catches.update(item.id, { userId: 'other' });
    await expect(correctCatch(item.id, { measurement: 3 })).rejects.toThrow('own catches');
    await expect(setCatchRemoved(item.id, true)).rejects.toThrow('own catches');
    await db.catches.update(item.id, { userId: 'user' });
    await finishDerby(derby.id);
    await expect(correctCatch(item.id, { measurement: 3 })).rejects.toThrow('closed');
    await expect(setCatchRemoved(item.id, true)).rejects.toThrow('closed');
    await expect(setCatchRemoved(item.id, false)).rejects.toThrow('closed');
  });
  it('rolls back a correction if its sync operation cannot be stored', async () => {
    await db.derbies.put(derby);
    const { item } = await saveCatch({ derby, note: 'Original' });
    vi.spyOn(db.syncOutbox, 'add').mockRejectedValue(new Error('Storage full'));
    await expect(correctCatch(item.id, { note: 'Correction' })).rejects.toThrow('Storage full');
    expect((await db.catches.get(item.id))?.note).toBe('Original');
  });
});

describe('catch drafts', () => {
  it('uses the derby species for new drafts without overwriting a resumed draft', async () => {
    const draft = await openCatchDraft(derby.id, 'user', 'Smallmouth bass');
    expect(draft.species).toBe('Smallmouth bass');
    await db.catchDrafts.update(draft.id, { species: 'User entry' });
    expect((await openCatchDraft(derby.id, 'user', 'Smallmouth bass')).species).toBe('User entry');
    expect((await openCatchDraft('open-derby', 'user')).species).toBe('');
  });
  it('restores details and a prepared photo after reopening the database', async () => {
    const draft = await openCatchDraft(derby.id, 'user');
    await db.catchDrafts.update(draft.id, { measurement: '18.5', note: 'By the dock', photo });
    db.close();
    await db.open();
    const restored = await openCatchDraft(derby.id, 'user');
    expect(restored).toMatchObject({ id: draft.id, measurement: '18.5', note: 'By the dock', photo: { width: 1200 } });
    expect(restored.photo?.bytes.byteLength).toBe(5);
    expect((await resumableCatchDraft('user'))?.id).toBe(draft.id);
    expect(await resumableCatchDraft('someone-else')).toBeUndefined();
    await db.catchDrafts.update(draft.id, { isOpen: false });
    expect(await resumableCatchDraft('user')).toBeUndefined();
  });

  it('opens only one draft when initialization runs twice', async () => {
    const [a, b] = await Promise.all([openCatchDraft(derby.id, 'user'), openCatchDraft(derby.id, 'user')]);
    expect(a.id).toBe(b.id);
    expect(await db.catchDrafts.count()).toBe(1);
  });
});

describe('derby completion', () => {
  it('finishes locally, queues once, and blocks new catches even from stale screens', async () => {
    await db.derbies.put(derby);
    await finishDerby(derby.id);
    await finishDerby(derby.id);
    expect((await db.derbies.get(derby.id))?.status).toBe('finished');
    expect(await db.syncOutbox.count()).toBe(1);
    expect((await db.syncOutbox.toArray())[0]).toMatchObject({ entityType: 'derby', operation: 'update' });
    await expect(saveCatch({ derby })).rejects.toThrow('closed');
    expect(await db.catches.count()).toBe(0);
  });
  it('does not allow another angler to finish', async () => {
    await db.derbies.put({ ...derby, createdByUserId: 'other' });
    await expect(finishDerby(derby.id)).rejects.toThrow('organizer');
    expect(await db.syncOutbox.count()).toBe(0);
  });
});
