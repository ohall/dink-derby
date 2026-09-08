import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnglersSheet } from './AnglersSheet';
import { apiFetch } from '../lib/api';
import { applyMembershipPatches } from '../data/derbyAccess';
vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('../data/derbyAccess', () => ({ applyMembershipPatches: vi.fn() }));
vi.mock('../sync', () => ({ syncService: { requestSync: vi.fn() } }));
const now = new Date().toISOString();
const derby = { id: 'derby', name: 'Test derby', bodyOfWaterName: 'Pond', scoringMode: 'count' as const, createdByUserId: 'owner', isArchived: false, createdAt: now, updatedAt: now };
const participants = [{ id: 'p-owner', userId: 'owner', nickname: 'Oakley', isAdmin: true }, { id: 'p-guest', userId: 'guest', nickname: 'Sam', isAdmin: true }].map(person => ({ ...person, derbyId: derby.id, createdAt: now }));
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const show = (userId = 'owner') => render(<AnglersSheet derby={derby} participants={participants} users={[]} userId={userId} onClose={vi.fn()} />);
it('restricts removal controls to the creator, not someone with an isAdmin flag', () => {
  show('guest'); expect(screen.queryByRole('button', { name: 'Remove Oakley' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Remove Sam' })).toBeNull();
});
it('shows the name and effects, defaults to Keep, and sends nothing when canceled', () => {
  show(); expect(screen.queryByRole('button', { name: 'Remove Oakley' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));
  expect(screen.getByRole('heading', { name: 'Remove Sam?' })).toBeVisible();
  expect(screen.getByText(/no longer count/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Keep angler' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Keep angler' }));
  expect(apiFetch).not.toHaveBeenCalled();
});
it('waits for confirmed server removal before changing local membership', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ json: async () => ({ participant: { ...participants[1], removedAt: now } }) } as Response);
  show(); fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sam was removed'));
  expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/derbies/derby/anglers/guest/remove', { method: 'POST' });
  expect(applyMembershipPatches).toHaveBeenCalledWith([{ ...participants[1], removedAt: now }]);
});
it('keeps the confirmation open after failure and supports offline cancellation', async () => {
  vi.mocked(apiFetch).mockRejectedValue(new Error('Server unavailable'));
  show(); fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server unavailable'));
  expect(applyMembershipPatches).not.toHaveBeenCalled();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing has changed'); expect(apiFetch).toHaveBeenCalledTimes(1);
});
