import { afterEach, expect, it, vi } from 'vitest';
import { getCatchLocation } from './location';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('returns a fresh one-shot fix, including zero coordinates', async () => {
  const getCurrentPosition = vi.fn(success => success({ coords: { latitude: 0, longitude: 0 } }));
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  expect(await getCatchLocation()).toEqual({ lat: 0, lon: 0 });
  expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { timeout: 5000, maximumAge: 0, enableHighAccuracy: true });
});

it('reports denied permission without rejecting the catch save', async () => {
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 }) } });
  expect(await getCatchLocation()).toEqual({ error: 'Location permission was denied.' });
});

it('enforces a deadline even if the permission prompt never calls back, and ignores a late fix', async () => {
  vi.useFakeTimers();
  const getCurrentPosition = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  const pending = getCatchLocation();
  await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ error: 'Location timed out.' });
  getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 44, longitude: -74 } });
  expect(await pending).toEqual({ error: 'Location timed out.' });
  expect(vi.getTimerCount()).toBe(0);
});

it('handles unsupported browsers and synchronous browser failures', async () => {
  vi.stubGlobal('navigator', {});
  expect((await getCatchLocation()).error).toContain('unavailable');
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: () => { throw new Error('Blocked'); } } });
  expect((await getCatchLocation()).error).toContain('unavailable');
});

it('does not save invalid device coordinates', async () => {
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (success: (position: unknown) => void) => success({ coords: { latitude: NaN, longitude: 250 } }) } });
  expect(await getCatchLocation()).toEqual({ error: 'The device returned an invalid location.' });
});
