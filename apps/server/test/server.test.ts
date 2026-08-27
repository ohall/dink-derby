import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';

const emptyPatches = {
  users: [],
  derbies: [],
  derbyParticipants: [],
  catches: [],
  chatMessages: [],
  reactions: [],
  media: [],
};

describe('Server API', () => {
  let server: FastifyInstance;
  const syncProcessor = vi.fn(async () => ({
    appliedOperationIds: [],
    rejected: [],
    events: [],
    nextCursor: 0,
    patches: emptyPatches,
  }));

  beforeAll(async () => {
    server = buildServer(syncProcessor);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('reports a healthy API', async () => {
    const response = await server.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Dink Derby API is running' });
  });

  it('validates and forwards the explicit sync contract', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/sync',
      payload: { clientId: 'test-device', cursor: 4, outbox: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      appliedOperationIds: [],
      rejected: [],
      events: [],
      nextCursor: 0,
      patches: emptyPatches,
    });
    expect(syncProcessor).toHaveBeenCalledWith('test-device', [], undefined, 4, undefined);
  });

  it('rejects malformed operations before they reach persistence', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/sync',
      payload: { clientId: 'test-device', outbox: [{ nope: true }] },
    });
    expect(response.statusCode).toBe(400);
  });
});
