import { describe, expect, it } from 'vitest';
import { isIos, isStandalone, readDismissal, recordDismissal } from './useInstallPrompt';

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
});
