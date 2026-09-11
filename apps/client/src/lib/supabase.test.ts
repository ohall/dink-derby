import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), settings: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../db', () => ({ db: { settings: { get: mocks.settings } } }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://accounts.test');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  mocks.createClient.mockReturnValue({ auth: { getSession: mocks.getSession } });
  mocks.settings.mockResolvedValue({ currentUserId: 'angler-a' });
});
afterEach(() => vi.unstubAllEnvs());
it('returns tokens only for the active local angler', async () => {
  const { getAccessToken } = await import('./supabase');
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'angler-a' }, access_token: 'test-token' } }, error: null });
  await expect(getAccessToken()).resolves.toBe('test-token');
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'angler-b' }, access_token: 'wrong-token' } }, error: null });
  await expect(getAccessToken()).rejects.toThrow('local catches have not been changed');
});
it('refuses authenticated API calls when the session is lost', async () => {
  const { getAccessToken } = await import('./supabase');
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(getAccessToken()).rejects.toThrow('Sign in');
});
it('does not consume URL-delivered sessions or persist a candidate sign-in', async () => {
  const { createSignInClient } = await import('./supabase');
  createSignInClient();
  expect(mocks.createClient.mock.calls[0][2].auth.detectSessionInUrl).toBe(false);
  expect(mocks.createClient.mock.calls[1][2].auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
});
it('leaves offline local development without Supabase unchanged', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', ''); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
  const { getAccessToken, isAccountRecoveryEnabled } = await import('./supabase');
  await expect(getAccessToken()).resolves.toBeUndefined();
  expect(isAccountRecoveryEnabled).toBe(false);
  expect(mocks.createClient).not.toHaveBeenCalled();
});
