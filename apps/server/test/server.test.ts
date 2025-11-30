import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';
import { FastifyInstance } from 'fastify';

describe('Server API', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('responds with 200 on root', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Dink Derby API is running' });
  });

  it('handles sync request structure', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/sync',
      payload: {
        clientId: 'test-device',
        outbox: [],
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('serverTime');
    expect(body.appliedOperationIds).toEqual([]);
    expect(body.patches.catches).toEqual([]);
  });
});
