import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Derby, DerbyParticipant, Device, SyncOutboxItem, User } from '@dink-derby/shared-types';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;

integration('Postgres sync POC', () => {
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

    const outsider: User = { id: 'integration-outsider', displayName: 'Outsider', createdAt: now, updatedAt: now };
    const outsiderDevice: Device = { id: 'integration-outsider-device', userId: outsider.id, createdAt: now };
    const outsiderSync = await processSync(outsiderDevice.id, outsider.id, [
      operation('user', outsider), operation('device', outsiderDevice),
    ]);
    expect(outsiderSync.patches.derbies).toEqual([]);
    expect(outsiderSync.patches.catches).toEqual([]);
  });
});
