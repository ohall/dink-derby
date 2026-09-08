import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildServer } from '../src/index';
import type { FastifyInstance } from 'fastify';

const result = { suggestions: [], radiusMeters: 5000 as const, source: 'USGS National Hydrography Dataset' as const, partial: false };
let server: FastifyInstance;
const lookup = vi.fn(async () => result);
beforeEach(async () => { lookup.mockReset().mockResolvedValue(result); server = buildServer(undefined, lookup); await server.ready(); });
afterEach(async () => { await server.close(); });
const request = (payload: unknown = { lat: 44, lon: -74 }, headers = { 'x-dink-user-id': 'water-tester' }) => server.inject({ method: 'POST', url: '/waters/nearby', payload, headers });

it('requires an authenticated field identity', async () => {
  expect((await request({ lat: 44, lon: -74 }, {} as any)).statusCode).toBe(401);
  expect(lookup).not.toHaveBeenCalled();
});
it.each([{ lat: 91, lon: 0 }, { lat: 0, lon: -181 }, { lat: '44', lon: -74 }, { lat: 44, lon: -74, url: 'https://example.com' }])('rejects invalid coordinates or extra input: %j', async payload => {
  expect((await request(payload)).statusCode).toBe(400); expect(lookup).not.toHaveBeenCalled();
});
it('returns the small validated response without public caching', async () => {
  const response = await request();
  expect(response.statusCode).toBe(200); expect(response.json()).toEqual(result);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(lookup).toHaveBeenCalledWith({ lat: 44, lon: -74 });
});
it('returns a recoverable provider error without leaking upstream details', async () => {
  lookup.mockRejectedValueOnce(new Error('secret upstream URL/coordinates'));
  const response = await request();
  expect(response.statusCode).toBe(503); expect(response.body).toContain('Enter the water name yourself');
  expect(response.body).not.toContain('secret');
});
it('rate limits expensive lookups', async () => {
  for (let i = 0; i < 5; i++) expect((await request()).statusCode).toBe(200);
  expect((await request()).statusCode).toBe(429); expect(lookup).toHaveBeenCalledTimes(5);
  expect((await request({ lat: 44, lon: -74 }, { 'x-dink-user-id': 'different-angler-on-same-ip' })).statusCode).toBe(200);
});
