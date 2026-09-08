import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
const now = new Date().toISOString();
const user = { id: 'guest', displayName: 'Sam', createdAt: now, updatedAt: now };
const active = { id: 'derby', name: 'Former derby', bodyOfWaterName: 'Pond', scoringMode: 'count' as const, createdByUserId: 'owner', isArchived: false, createdAt: now, updatedAt: now };
const props = { user, derbies: [active], catches: [], removedDerbyIds: ['derby'], onOpenDerby: vi.fn(), onCreate: vi.fn(), onJoin: vi.fn(), onHistoryChange: vi.fn() };
afterEach(cleanup);
it('keeps a former derby in Past derbies even while others are still fishing', () => {
  render(<HomeScreen {...props} history />);
  expect(screen.getByRole('button', { name: 'Past derbies (1)' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Former derby' })).toBeVisible();
  expect(screen.getByText('Read-only history')).toBeVisible();
  expect(screen.getByText('Participation ended')).toBeVisible();
  expect(screen.getByText('View history')).toBeVisible();
  expect(screen.queryByText(/^Ended /)).toBeNull();
});
it('does not list a former derby as active', () => {
  render(<HomeScreen {...props} history={false} />);
  expect(screen.getByRole('button', { name: 'Active derbies (0)' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Former derby' })).toBeNull();
});
