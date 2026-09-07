import { describe, expect, it } from 'vitest';
import type { Derby } from '@dink-derby/shared-types';
import { assertCatchBeforeCutoff, assertFinishAllowed } from '../src/derbyLifecycle';

const derby: Derby = { id: 'd', createdByUserId: 'owner', name: 'Test', bodyOfWaterName: 'Pond', scoringMode: 'count', isArchived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', status: 'active' };
const finished: Derby = { ...derby, status: 'finished', endsAt: '2026-01-02T00:00:00.000Z' };
describe('derby completion policy', () => {
  it('allows owner completion and an identical retry', () => {
    expect(() => assertFinishAllowed(derby, finished, 'owner')).not.toThrow();
    expect(() => assertFinishAllowed(finished, finished, 'owner')).not.toThrow();
  });
  it('rejects non-owners and reopening', () => {
    expect(() => assertFinishAllowed(derby, finished, 'other')).toThrow('organizer');
    expect(() => assertFinishAllowed(finished, derby, 'owner')).toThrow();
    expect(() => assertFinishAllowed(finished, { ...finished, endsAt: '2026-01-03T00:00:00.000Z' }, 'owner')).toThrow('cutoff');
  });
  it('rejects future and pre-creation cutoffs', () => {
    expect(() => assertFinishAllowed(derby, finished, 'owner', Date.parse(derby.createdAt))).toThrow('end time');
    expect(() => assertFinishAllowed(derby, { ...finished, endsAt: '2025-01-01T00:00:00.000Z' }, 'owner')).toThrow('end time');
  });
  it('accepts late delivery of pre-cutoff catches, rejects new catches', () => {
    expect(() => assertCatchBeforeCutoff(finished, derby.createdAt)).not.toThrow();
    expect(() => assertCatchBeforeCutoff(finished, finished.endsAt!)).not.toThrow();
    expect(() => assertCatchBeforeCutoff(finished, '2026-01-02T00:00:00.001Z')).toThrow('ended');
  });
});
