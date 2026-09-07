import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db';
import { SyncService } from './index';
import { apiFetch, uploadMedia } from '../lib/api';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn(), uploadMedia: vi.fn() }));
vi.mock('../utils/device', () => ({ getOrCreateDeviceId: async () => 'device' }));
let service: SyncService;
beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put({ id: 'app', currentUserId: 'user' });
  service = new SyncService();
  vi.mocked(apiFetch).mockImplementation(async () => ({ json: async () => ({
    serverTime: new Date().toISOString(), appliedOperationIds: [], rejected: [], events: [], nextCursor: 0,
    patches: { users: [], derbies: [], derbyParticipants: [], catches: [], chatMessages: [], reactions: [], media: [] },
  }) } as Response));
});
afterEach(async () => { service.stop(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); await db.delete(); });

it('does not start concurrent sync or upload runs when save and focus coincide', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let release!: () => void;
  const count = db.syncOutbox.count.bind(db.syncOutbox);
  vi.spyOn(db.syncOutbox, 'count').mockImplementationOnce(() => {
    const result = count();
    return result.then(() => new Promise<number>(resolve => { release = () => resolve(0); }));
  });
  const first = service.sync();
  await service.sync();
  expect(db.syncOutbox.count).toHaveBeenCalledOnce();
  // IndexedDB progresses independently of the window timers.
  await db.settings.get('app');
  release();
  await first;
  expect(apiFetch).toHaveBeenCalledOnce();
});

it('loads and uploads queued photos one at a time', async () => {
  const now = new Date().toISOString();
  for (const id of ['one', 'two']) await db.media.put({
    id, ownerId: 'user', derbyId: 'derby', contentHash: id, contentType: 'image/jpeg', sizeBytes: 1,
    createdAt: now, updatedAt: now, clientId: 'device', isPendingSync: false,
    ...(id === 'one' ? { bytes: new ArrayBuffer(1) } : { blob: new Blob(['x']) }),
  });
  const order: string[] = [];
  const get = db.media.get.bind(db.media);
  vi.spyOn(db.media, 'get').mockImplementation(id => {
    order.push(`load:${id}`);
    return get(id);
  });
  vi.mocked(uploadMedia).mockImplementation(async id => { order.push(`upload:${id}`); return `path/${id}`; });
  await service.sync();
  expect(order).toEqual(['load:one', 'upload:one', 'load:two', 'upload:two']);
  expect((await db.media.get('one'))?.remoteUrl).toBe('path/one');
});

it('does not overwrite locally queued completion with an older server snapshot', async () => {
  const now = new Date().toISOString();
  const derby = { id: 'derby', name: 'D', bodyOfWaterName: 'P', scoringMode: 'count' as const, createdByUserId: 'user', isArchived: false, createdAt: now, updatedAt: now, status: 'finished' as const, endsAt: now };
  await db.derbies.put(derby);
  await db.syncOutbox.put({ id: 'finish', entityId: derby.id, derbyId: derby.id, entityType: 'derby', operation: 'update', payload: derby, createdAt: now, status: 'pending' });
  vi.mocked(apiFetch).mockResolvedValue({ json: async () => ({
    serverTime: now, appliedOperationIds: [], rejected: [], events: [], nextCursor: 0,
    patches: { users: [], derbies: [{ ...derby, status: 'active', endsAt: undefined }], derbyParticipants: [], catches: [], chatMessages: [], reactions: [], media: [] },
  }) } as Response);
  await service.sync();
  expect((await db.derbies.get(derby.id))?.status).toBe('finished');
  expect(await db.syncOutbox.count()).toBe(1);
});

it('keeps a new edit pending when an in-flight create is acknowledged with an older snapshot', async () => {
  const now = new Date().toISOString();
  const original = { id: 'catch', derbyId: 'derby', userId: 'user', count: 1, note: 'Original', caughtAt: now, createdAt: now, updatedAt: now, clientId: 'device', isPendingSync: true };
  const create = { id: 'create', entityId: original.id, derbyId: original.derbyId, entityType: 'catch' as const, operation: 'create' as const, payload: original, createdAt: now, status: 'pending' as const };
  await db.catches.put(original); await db.syncOutbox.put(create);
  vi.mocked(apiFetch).mockImplementationOnce(async () => {
    const edited = { ...original, note: 'New correction', deletedAt: now };
    await db.catches.put(edited);
    await db.syncOutbox.put({ ...create, id: 'edit', operation: 'update', payload: edited });
    return { json: async () => ({ serverTime: now, appliedOperationIds: ['create'], rejected: [], events: [], nextCursor: 0,
      patches: { users: [], derbies: [], derbyParticipants: [], catches: [{ ...original, isPendingSync: false }], chatMessages: [], reactions: [], media: [] },
    }) } as Response;
  });
  await service.sync();
  expect(await db.catches.get(original.id)).toMatchObject({ note: 'New correction', deletedAt: now, isPendingSync: true });
  expect(await db.syncOutbox.count()).toBe(1);
});

it('sends catch corrections before a queued derby completion', async () => {
  const now = new Date().toISOString();
  for (const [id, entityType, operation] of [['finish', 'derby', 'update'], ['edit', 'catch', 'update'], ['create', 'derby', 'create']] as const) {
    await db.syncOutbox.put({ id, entityId: id, entityType, operation, payload: {}, createdAt: now, status: 'pending' });
  }
  await service.sync();
  const request = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(request.outbox.map((item: { id: string }) => item.id)).toEqual(['create', 'edit', 'finish']);
});

it('can dismiss rejected corrections without discarding a failed new catch', async () => {
  const now = new Date().toISOString();
  await db.syncOutbox.bulkPut([
    { id: 'edit', entityId: 'existing', entityType: 'catch', operation: 'update', payload: {}, createdAt: now, status: 'failed' },
    { id: 'new', entityId: 'new', entityType: 'catch', operation: 'create', payload: {}, createdAt: now, status: 'failed' },
  ]);
  await service.dismissRejectedEdits();
  expect(await db.syncOutbox.get('edit')).toBeUndefined();
  expect(await db.syncOutbox.get('new')).toBeDefined();
  expect(service.getSnapshot()).toMatchObject({ phase: 'error', pendingCount: 1, rejectedEditCount: 0 });
});
