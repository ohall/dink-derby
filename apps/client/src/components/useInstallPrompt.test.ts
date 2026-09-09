import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { installPlatform, isIos, isStandalone, readDismissal, recordDismissal, useInstallPrompt } from './useInstallPrompt';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

describe('isIos', () => {
  it('detects iPhone and iPod user agents', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', 'iPod', 5)).toBe(true);
  });

  it('detects iPadOS reporting itself as MacIntel with touch', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
  });

  it('does not flag desktop Macs or Android', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv81', 5)).toBe(false);
  });
});

describe('isStandalone', () => {
  it('is true when the display-mode media query matches', () => {
    expect(isStandalone(true, false)).toBe(true);
  });

  it('is true for iOS navigator.standalone', () => {
    expect(isStandalone(false, true)).toBe(true);
  });

  it('is false in a plain browser tab', () => {
    expect(isStandalone(false, false)).toBe(false);
  });
});

describe('install dismissal', () => {
  const day = 24 * 60 * 60 * 1000;

  it('treats missing or invalid values as not dismissed', () => {
    expect(readDismissal(fakeStorage(), Date.now())).toBe(false);
    expect(readDismissal(fakeStorage({ 'dink-derby:install-dismissed': 'not-a-number' }), Date.now())).toBe(false);
  });

  it('respects a recent dismissal', () => {
    const now = Date.now();
    const storage = fakeStorage();
    recordDismissal(storage, now);
    expect(readDismissal(storage, now + 5 * day)).toBe(true);
  });

  it('expires after 30 days', () => {
    const now = Date.now();
    const storage = fakeStorage();
    recordDismissal(storage, now);
    expect(readDismissal(storage, now + 31 * day)).toBe(false);
  });

  it('ignores future timestamps and blocked storage', () => {
    const now = Date.now();
    const storage = fakeStorage();
    recordDismissal(storage, now + day);
    expect(readDismissal(storage, now)).toBe(false);
    expect(readDismissal({ getItem: () => { throw new Error('Blocked'); } }, now)).toBe(false);
    expect(() => recordDismissal({ setItem: () => { throw new Error('Blocked'); } }, now)).not.toThrow();
  });
});

describe('install experience', () => {
  let displayMode: MediaQueryList;
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    displayMode = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => displayMode));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted', prompt = vi.fn(async () => undefined)) {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome }),
    });
    act(() => { window.dispatchEvent(event); });
    return event;
  }

  it('offers manual installation and a reminder without a browser event', () => {
    const { result } = renderHook(useInstallPrompt);
    expect(result.current.state.kind).toBe('manual');
    expect(result.current.showReminder).toBe(true);
    expect(installPlatform('Android', 'Linux', 5)).toBe('android');
    expect(installPlatform('iPhone', 'iPhone', 5)).toBe('ios');
    expect(installPlatform('Macintosh', 'MacIntel', 0)).toBe('desktop');
  });

  it('suppresses only the reminder after dismissal, including legacy dismissals', () => {
    recordDismissal(localStorage, Date.now());
    const { result } = renderHook(useInstallPrompt);
    expect(result.current.state.kind).toBe('manual');
    expect(result.current.showReminder).toBe(false);
    offerInstall();
    expect(result.current.state.kind).toBe('native');
    act(() => result.current.dismiss());
    expect(result.current.state.kind).toBe('native');
  });

  it('consumes an install event once and preserves manual access on cancellation', async () => {
    const { result } = renderHook(useInstallPrompt);
    const event = offerInstall('dismissed');
    expect(event.defaultPrevented).toBe(true);
    const state = result.current.state;
    if (state.kind !== 'native') throw new Error('Expected native install');
    await act(async () => { await Promise.all([state.prompt(), state.prompt()]); });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe('manual');
    expect(result.current.showReminder).toBe(false);
    expect(readDismissal(localStorage, Date.now())).toBe(true);
  });

  it('falls back safely when a native prompt fails', async () => {
    const { result } = renderHook(useInstallPrompt);
    offerInstall('accepted', vi.fn(async () => { throw new Error('Expired'); }));
    const state = result.current.state;
    if (state.kind !== 'native') throw new Error('Expected native install');
    await act(async () => { expect(await state.prompt()).toBe(false); });
    expect(result.current.state.kind).toBe('manual');
  });

  it('does not let prompt completion overwrite an appinstalled event', async () => {
    const { result } = renderHook(useInstallPrompt);
    offerInstall('accepted', vi.fn(async () => { window.dispatchEvent(new Event('appinstalled')); }));
    const state = result.current.state;
    if (state.kind !== 'native') throw new Error('Expected native install');
    await act(async () => { await state.prompt(); });
    expect(result.current.state.kind).toBe('installed');
    expect(result.current.showReminder).toBe(false);
  });

  it('hides installation controls in standalone mode and on display-mode change', () => {
    const { result } = renderHook(useInstallPrompt);
    act(() => {
      Object.defineProperty(displayMode, 'matches', { value: true, configurable: true });
      displayMode.dispatchEvent(new Event('change'));
    });
    expect(result.current.state.kind).toBe('installed');
    const standalone = renderHook(useInstallPrompt);
    expect(standalone.result.current.state.kind).toBe('installed');
  });

  it('handles inaccessible localStorage without hiding install or throwing', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('Blocked'); } });
    const { result } = renderHook(useInstallPrompt);
    expect(result.current.state.kind).toBe('manual');
    act(() => result.current.dismiss());
    expect(result.current.showReminder).toBe(false);
  });

  it('removes all event listeners on unmount', () => {
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDisplay = vi.spyOn(displayMode, 'removeEventListener');
    const { unmount } = renderHook(useInstallPrompt);
    unmount();
    expect(removeWindow).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('appinstalled', expect.any(Function));
    expect(removeDisplay).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
