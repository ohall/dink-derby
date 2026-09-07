import { describe, expect, it } from 'vitest';
import { Sha256 } from './sha256';

async function referenceDigest(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes); // guarantee byteOffset 0 for crypto.subtle
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomBytes(length: number, seed = length * 2654435761) {
  const bytes = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[i] = state & 0xff;
  }
  return bytes;
}

describe('Sha256', () => {
  it('matches the published test vector for "abc"', () => {
    const hasher = new Sha256();
    hasher.update(new TextEncoder().encode('abc'));
    expect(hasher.digest()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches crypto.subtle for the empty message', async () => {
    expect(new Sha256().digest()).toBe(await referenceDigest(new Uint8Array(0)));
  });

  it.each([1, 55, 56, 63, 64, 65, 127, 128, 129, 1024, 1_000_001])(
    'matches crypto.subtle for %i bytes fed in one chunk',
    async (length) => {
      const bytes = randomBytes(length);
      const hasher = new Sha256();
      hasher.update(bytes);
      expect(hasher.digest()).toBe(await referenceDigest(bytes));
    },
  );

  it('matches crypto.subtle when fed uneven chunks across block boundaries', async () => {
    const bytes = randomBytes(300_000);
    const expected = await referenceDigest(bytes);
    for (const chunkSize of [1, 63, 64, 65, 4097, 131_072]) {
      const hasher = new Sha256();
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        hasher.update(bytes.subarray(offset, offset + chunkSize));
      }
      expect(hasher.digest()).toBe(expected);
    }
  });

  it('handles views with a nonzero byteOffset', async () => {
    const wrapped = new Uint8Array(500);
    wrapped.set(randomBytes(300), 100);
    const view = wrapped.subarray(100, 400);
    const hasher = new Sha256();
    hasher.update(view);
    expect(hasher.digest()).toBe(await referenceDigest(view));
  });
});
