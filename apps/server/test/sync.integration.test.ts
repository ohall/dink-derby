import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Derby, DerbyParticipant, Device, SyncOutboxItem, User } from '@dink-derby/shared-types';

vi.mock('../src/storage', async importOriginal => ({
  ...await importOriginal<typeof import('../src/storage')>(),
  createMediaDownload: vi.fn(async (path: string) => `https://photos.example.test/${path}`),
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  const target = new URL(testDatabaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.endsWith('_test')) {
    throw new Error('Destructive integration cleanup is allowed only on a local database with a name ending in _test.');
  }
}
const integration = testDatabaseUrl ? describe : describe.skip;

integration('Postgres sync integration', () => {
  let server: FastifyInstance;
  let database: typeof import('../src/db').db;
  let databasePool: typeof import('../src/db').databasePool;
  let schema: typeof import('../src/db/schema');
  let processSync: typeof import('../src/sync').processSync;

  const now = new Date().toISOString();
  const userA: User = { id: 'integration-user-a', displayName: 'Angler A', createdAt: now, updatedAt: now };
  const userB: User = { id: 'integration-user-b', displayName: 'Angler B', createdAt: now, updatedAt: now };
  const deviceA: Device = { id: 'integration-device-a', userId: userA.id, createdAt: now };
  const deviceB: Device = { id: 'integration-device-b', userId: userB.id, createdAt: now };
  const derby: Derby = {
    id: 'integration-derby', name: 'Integration Throwdown', bodyOfWaterName: 'Test Lake',
    scoringMode: 'count', scoringStyle: 'total', inviteCode: 'DINK-TEST',
    status: 'active', createdByUserId: userA.id, isArchived: false, createdAt: now, updatedAt: now,
  };
  const membership: DerbyParticipant = {
    id: 'integration-membership-a', derbyId: derby.id, userId: userA.id,
    nickname: userA.displayName, isAdmin: true, createdAt: now,
  };

  function operation(entityType: SyncOutboxItem['entityType'], entity: { id: string }, derbyId?: string): SyncOutboxItem {
    return {
      id: `op-${entityType}-${entity.id}`,
      derbyId,
      entityType,
      entityId: entity.id,
      operation: 'create',
      payload: entity,
      createdAt: now,
      status: 'pending',
    };
  }

  async function clearDatabase() {
    await database.delete(schema.derbyEvents);
    await database.delete(schema.processedOperations);
    await database.delete(schema.reactions);
    await database.delete(schema.media);
    await database.delete(schema.chatMessages);
    await database.delete(schema.catches);
    await database.delete(schema.derbyParticipants);
    await database.delete(schema.devices);
    await database.delete(schema.derbies);
    await database.delete(schema.users);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ db: database, databasePool } = await import('../src/db'));
    schema = await import('../src/db/schema');
    ({ processSync } = await import('../src/sync'));
    const { buildServer } = await import('../src/index');
    server = buildServer();
    await server.ready();
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await server.close();
    await databasePool.end();
  });

  it('keeps all app tables API-only, including against direct membership changes', async () => {
    const tables = ['catches', 'chat_messages', 'derbies', 'derby_events', 'derby_participants', 'devices', 'media', 'processed_operations', 'reactions', 'users'];
    const result = await databasePool.query('select relname, relrowsecurity from pg_class where relnamespace = $1::regnamespace and relname = any($2)', ['public', tables]);
    expect(result.rows).toHaveLength(tables.length);
    expect(result.rows.every(row => row.relrowsecurity)).toBe(true);
    for (const role of (await databasePool.query("select rolname from pg_roles where rolname in ('anon', 'authenticated')")).rows) {
      for (const table of tables) {
        const grants = await databasePool.query('select has_table_privilege($1, $2, $3) as allowed', [role.rolname, `public.${table}`, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER']);
        expect(grants.rows[0].allowed).toBe(false);
      }
    }
    // Even a future accidental CRUD grant cannot bypass the default-deny RLS.
    const client = await databasePool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO public.users (id, display_name) VALUES ('rls-test-user', 'RLS test')");
      await client.query("INSERT INTO public.derbies (id, name, body_of_water_name, scoring_mode, created_by_user_id) VALUES ('rls-test-derby', 'RLS test', 'Test water', 'count', 'rls-test-user')");
      await client.query("INSERT INTO public.derby_participants (id, derby_id, user_id, removed_at) VALUES ('rls-test-membership', 'rls-test-derby', 'rls-test-user', now())");
      await client.query('CREATE ROLE dink_removal_rls_test NOLOGIN');
      await client.query('GRANT USAGE ON SCHEMA public TO dink_removal_rls_test');
      await client.query('GRANT SELECT, UPDATE ON public.derby_participants TO dink_removal_rls_test');
      await client.query('SET LOCAL ROLE dink_removal_rls_test');
      expect((await client.query('SELECT id FROM public.derby_participants')).rows).toEqual([]);
      expect((await client.query('UPDATE public.derby_participants SET removed_at = NULL RETURNING id')).rows).toEqual([]);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });

  it('creates, joins, syncs, and scopes a derby across two identities', async () => {
    const created = await processSync(deviceA.id, userA.id, [
      operation('user', userA),
      operation('device', deviceA),
      operation('derby', derby, derby.id),
      operation('derbyParticipant', membership, derby.id),
    ]);
    expect(created.rejected).toEqual([]);
    expect(created.appliedOperationIds).toHaveLength(4);

    const joined = await server.inject({
      method: 'POST',
      url: '/join',
      payload: { inviteCode: derby.inviteCode, user: userB, device: deviceB },
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json().snapshot.derbies[0].id).toBe(derby.id);
    expect(joined.json().snapshot.derbies[0]).not.toHaveProperty('scoringUnit');

    const catchEntity = {
      id: 'integration-catch-b', derbyId: derby.id, userId: userB.id, species: 'Smallmouth bass',
      count: 1, caughtAt: now, createdAt: now, updatedAt: now,
      clientId: deviceB.id, isPendingSync: true,
    };
    const caught = await processSync(deviceB.id, userB.id, [operation('catch', catchEntity, derby.id)]);
    expect(caught.rejected).toEqual([]);

    const visibleToA = await processSync(deviceA.id, userA.id, [], undefined, 0);
    expect(visibleToA.patches.catches.map((item) => item.id)).toContain(catchEntity.id);

    const correction = { ...catchEntity, species: 'Corrected bass', note: 'Corrected note' };
    const edit = { ...operation('catch', correction, derby.id), id: 'edit-catch', operation: 'update' as const };
    expect((await processSync(deviceB.id, userB.id, [edit])).rejected).toEqual([]);
    const forged = { ...edit, id: 'edit-another-catch', payload: { ...correction, userId: userA.id, clientId: deviceA.id } };
    expect((await processSync(deviceA.id, userA.id, [forged])).rejected).toHaveLength(1);
    expect((await processSync(deviceB.id, userB.id, [{ ...edit, id: 'change-time', payload: { ...correction, caughtAt: new Date(Date.parse(now) + 1).toISOString() } }])).rejected).toHaveLength(1);
    const removed = { ...correction, deletedAt: new Date().toISOString() };
    expect((await processSync(deviceB.id, userB.id, [{ ...edit, id: 'remove-catch', payload: removed }])).rejected).toEqual([]);
    expect((await processSync(deviceA.id, userA.id, [])).patches.catches[0].deletedAt).toBeDefined();
    const restored = await processSync(deviceB.id, userB.id, [{ ...edit, id: 'restore-catch', payload: { ...catchEntity, species: undefined, note: undefined } }]);
    expect(restored.rejected).toEqual([]);
    expect(restored.patches.catches[0].deletedAt).toBeUndefined();
    expect(restored.patches.catches[0].note).toBeUndefined();
    expect(restored.patches.catches[0].species).toBeUndefined();
    // A duplicate create must not overwrite a correction or resurrect a removal.
    await processSync(deviceB.id, userB.id, [{ ...edit, id: 'remove-again', payload: removed }]);
    const replayed = await processSync(deviceB.id, userB.id, [{ ...operation('catch', catchEntity, derby.id), id: 'duplicate-create' }]);
    expect(replayed.patches.catches[0].deletedAt).toBeDefined();
    await processSync(deviceB.id, userB.id, [{ ...edit, id: 'restore-again', payload: catchEntity }]);

    const outsider: User = { id: 'integration-outsider', displayName: 'Outsider', createdAt: now, updatedAt: now };
    const outsiderDevice: Device = { id: 'integration-outsider-device', userId: outsider.id, createdAt: now };
    const outsiderSync = await processSync(outsiderDevice.id, outsider.id, [
      operation('user', outsider), operation('device', outsiderDevice),
    ]);
    expect(outsiderSync.patches.derbies).toEqual([]);
    expect(outsiderSync.patches.catches).toEqual([]);

    const endedAt = new Date().toISOString();
    const finished = { ...derby, status: 'finished' as const, endsAt: endedAt, updatedAt: endedAt };
    const finishOp: SyncOutboxItem = { ...operation('derby', finished, derby.id), id: 'finish-denied', operation: 'update' };
    const denied = await processSync(deviceB.id, userB.id, [finishOp]);
    expect(denied.rejected).toHaveLength(1);
    const ended = await processSync(deviceA.id, userA.id, [{ ...finishOp, id: 'finish-allowed' }]);
    expect(ended.rejected).toEqual([]);
    expect(ended.patches.derbies[0]).toMatchObject({ status: 'finished', endsAt: endedAt });
    const onOtherPhone = await processSync(deviceB.id, userB.id, []);
    expect(onOtherPhone.patches.derbies[0].status).toBe('finished');
    expect((await processSync(deviceB.id, userB.id, [{ ...edit, id: 'closed-edit' }])).rejected).toHaveLength(1);
    expect((await processSync(deviceB.id, userB.id, [{ ...edit, id: 'closed-remove', payload: removed }])).rejected).toHaveLength(1);
    const lateCatch = { ...catchEntity, id: 'late-offline-catch' };
    expect((await processSync(deviceB.id, userB.id, [operation('catch', lateCatch, derby.id)])).rejected).toEqual([]);
    const afterCutoff = { ...catchEntity, id: 'after-cutoff', caughtAt: new Date(Date.parse(endedAt) + 1).toISOString() };
    expect((await processSync(deviceB.id, userB.id, [operation('catch', afterCutoff, derby.id)])).rejected).toHaveLength(1);
    const reopen = { ...finishOp, id: 'reopen-denied', payload: derby };
    expect((await processSync(deviceA.id, userA.id, [reopen])).rejected).toHaveLength(1);
  });
  it('enforces creator-only removal, retains read-only history, and blocks removed-member writes', async () => {
    const url = `/derbies/${derby.id}/anglers/${userB.id}/remove`;
    const { eq } = await import('drizzle-orm');
    const [guest] = await database.select().from(schema.derbyParticipants).where(eq(schema.derbyParticipants.userId, userB.id));
    expect((await server.inject({ method: 'POST', url })).statusCode).toBe(401);
    expect((await server.inject({ method: 'POST', url, headers: { 'x-dink-user-id': userB.id } })).statusCode).toBe(403);
    expect((await server.inject({ method: 'POST', url, headers: { 'x-dink-user-id': 'integration-outsider' } })).statusCode).toBe(403);
    expect((await server.inject({ method: 'POST', url: `/derbies/${derby.id}/anglers/${userA.id}/remove`, headers: { 'x-dink-user-id': userA.id } })).statusCode).toBe(409);
    expect((await server.inject({ method: 'POST', url: '/derbies/not-the-derby/anglers/integration-user-b/remove', headers: { 'x-dink-user-id': userA.id } })).statusCode).toBe(403);
    // Neither a forged isAdmin flag nor the old generic membership update/delete
    // routes grant removal or reinstatement authority.
    for (const operationType of ['update', 'delete'] as const) {
      const result = await processSync(deviceB.id, userB.id, [{ ...operation('derbyParticipant', membership, derby.id), id: `forged-member-${operationType}`, operation: operationType }]);
      expect(result.rejected).toHaveLength(1);
    }
    await database.update(schema.derbyParticipants).set({ isAdmin: true }).where(eq(schema.derbyParticipants.id, guest.id));
    expect((await server.inject({ method: 'POST', url, headers: { 'x-dink-user-id': userB.id } })).statusCode).toBe(403);

    await database.insert(schema.media).values({ id: 'removal-photo', derbyId: derby.id, ownerId: userB.id, contentHash: 'a'.repeat(64), contentType: 'image/jpeg', sizeBytes: 20, clientId: deviceB.id, remoteUrl: `${derby.id}/removal-photo.jpg` });
    const response = await server.inject({ method: 'POST', url, headers: { 'x-dink-user-id': userA.id } });
    expect(response.statusCode).toBe(200);
    expect(response.json().participant).toMatchObject({ userId: userB.id, derbyId: derby.id, removedAt: expect.any(String) });
    const repeated = await server.inject({ method: 'POST', url, headers: { 'x-dink-user-id': userA.id } });
    expect(repeated.json()).toEqual(response.json());
    const ownerSnapshot = await processSync(deviceA.id, userA.id, []);
    expect(ownerSnapshot.patches.catches.some(item => item.userId === userB.id && !item.deletedAt)).toBe(true);
    expect(ownerSnapshot.patches.derbyParticipants.find(person => person.userId === userB.id)?.removedAt).toBeDefined();
    expect(ownerSnapshot.events.filter(event => event.type === 'derbyParticipant.removed')).toHaveLength(1);
    const removedSnapshot = await processSync(deviceB.id, userB.id, []);
    expect(removedSnapshot.removedDerbyIds).toEqual([derby.id]);
    for (const field of ['derbies', 'derbyParticipants', 'catches', 'chatMessages', 'reactions', 'media'] as const) expect(removedSnapshot.patches[field]).toEqual(ownerSnapshot.patches[field]);
    expect(removedSnapshot.events).toEqual(ownerSnapshot.events);
    const restoredHistory = await processSync('history-new-device', userB.id, [], undefined, 0, derby.id);
    expect(restoredHistory.patches.derbies[0].status).toBe('finished');
    expect(restoredHistory.patches.catches.some(item => item.userId === userB.id)).toBe(true);
    await expect(processSync('outsider-device', 'integration-outsider', [], undefined, 0, derby.id)).rejects.toMatchObject({ statusCode: 403 });
    const rejoin = await server.inject({ method: 'POST', url: '/join', payload: { inviteCode: derby.inviteCode, user: userB, device: deviceB } });
    expect(rejoin.statusCode).toBe(403); expect(rejoin.json().message).toContain('cannot rejoin');
    for (const entityType of ['catch', 'chatMessage', 'reaction', 'media', 'derbyParticipant'] as const) {
      const result = await processSync(deviceB.id, userB.id, [{ ...operation(entityType, { id: `blocked-${entityType}` }, derby.id), payload: { id: `blocked-${entityType}`, derbyId: derby.id, userId: userB.id, ownerId: userB.id } }]);
      expect(result.rejected).toHaveLength(1);
    }
    for (const request of [
      { method: 'POST' as const, url: '/media/upload-url', payload: { mediaId: 'removal-photo', contentType: 'image/jpeg' } },
      { method: 'POST' as const, url: '/media/removal-photo/complete', payload: { path: `${derby.id}/removal-photo.jpg` } },
    ]) expect((await server.inject({ ...request, headers: { 'x-dink-user-id': userB.id } })).statusCode).toBe(403);
    const photo = await server.inject({ method: 'GET', url: '/media/removal-photo/download-url', headers: { 'x-dink-user-id': userB.id } });
    expect(photo.statusCode).toBe(200);
    expect(photo.json().signedUrl).toContain('/removal-photo.jpg');
    expect((await server.inject({ method: 'GET', url: '/media/removal-photo/download-url', headers: { 'x-dink-user-id': 'integration-outsider' } })).statusCode).toBe(403);
  });
});
