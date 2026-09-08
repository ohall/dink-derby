import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WaterSuggestions } from './WaterSuggestions';
import { getCatchLocation } from '../utils/location';
import { findNearbyWaters } from '../lib/api';

vi.mock('../utils/location', () => ({ getCatchLocation: vi.fn() }));
vi.mock('../lib/api', () => ({ findNearbyWaters: vi.fn() }));
const result = { source: 'USGS National Hydrography Dataset' as const, radiusMeters: 5000 as const, partial: false, suggestions: [{ id: 'lake', name: 'Mirror Lake', kind: 'Lake / pond' as const, containsLocation: true, distanceMeters: 0 }] };
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); vi.mocked(getCatchLocation).mockResolvedValue({ lat: 44, lon: -74 }); vi.mocked(findNearbyWaters).mockResolvedValue(result); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('only requests GPS after a click and requires explicit confirmation', async () => {
  const onSelect = vi.fn(); render(<WaterSuggestions value="My pond" onSelect={onSelect} disabled={false} />);
  expect(getCatchLocation).not.toHaveBeenCalled(); expect(findNearbyWaters).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  fireEvent.click(await screen.findByRole('button', { name: /Mirror Lake/ }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('Mirror Lake');
  expect(findNearbyWaters).toHaveBeenCalledWith(44, -74, expect.any(AbortSignal));
});
it('does not overwrite a manual name when a delayed lookup finishes', async () => {
  let finish!: (value: typeof result) => void;
  vi.mocked(findNearbyWaters).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const onSelect = vi.fn(); const view = render(<WaterSuggestions value="" onSelect={onSelect} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  await waitFor(() => expect(findNearbyWaters).toHaveBeenCalled());
  view.rerender(<WaterSuggestions value="Typed while waiting" onSelect={onSelect} disabled={false} />);
  await act(async () => finish(result));
  expect(screen.getByRole('button', { name: /Mirror Lake/ })).toHaveAttribute('aria-pressed', 'false');
  expect(onSelect).not.toHaveBeenCalled();
});
it('skips GPS and the provider when offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  render(<WaterSuggestions value="" onSelect={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  expect(screen.getByRole('status')).toHaveTextContent('You’re offline'); expect(getCatchLocation).not.toHaveBeenCalled();
});
it('handles denied location without contacting the provider', async () => {
  vi.mocked(getCatchLocation).mockResolvedValue({ error: 'Location permission was denied.' });
  render(<WaterSuggestions value="" onSelect={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('permission was denied'));
  expect(findNearbyWaters).not.toHaveBeenCalled();
});
it('cancels a pending GPS lookup without starting a late network request', async () => {
  let finish!: (value: { lat: number; lon: number }) => void;
  vi.mocked(getCatchLocation).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<WaterSuggestions value="" onSelect={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel lookup' }));
  await act(async () => finish({ lat: 44, lon: -74 }));
  expect(findNearbyWaters).not.toHaveBeenCalled(); expect(screen.getByRole('status')).toHaveTextContent('Lookup canceled');
});
it('aborts the request when the create form closes', async () => {
  vi.mocked(findNearbyWaters).mockImplementation(() => new Promise(() => undefined));
  const view = render(<WaterSuggestions value="" onSelect={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  await waitFor(() => expect(findNearbyWaters).toHaveBeenCalled());
  const signal = vi.mocked(findNearbyWaters).mock.calls[0][2]; view.unmount(); expect(signal.aborted).toBe(true);
});
it('handles empty or partial results with a manual-entry fallback', async () => {
  vi.mocked(findNearbyWaters).mockResolvedValue({ ...result, partial: true, suggestions: [] });
  render(<WaterSuggestions value="" onSelect={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No named waters found'));
  expect(screen.getByText(/Suggestions may be incomplete/)).toBeVisible();
});
it('recovers from provider errors and allows another lookup', async () => {
  vi.mocked(findNearbyWaters).mockRejectedValueOnce(new Error('503'));
  render(<WaterSuggestions value="" onSelect={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not look up'));
  fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
  expect(await screen.findByRole('button', { name: /Mirror Lake/ })).toBeEnabled();
});

it('stops waiting after 15 seconds even if authentication or fetch never settles', async () => {
  vi.useFakeTimers();
  vi.mocked(findNearbyWaters).mockImplementation(() => new Promise(() => undefined));
  render(<WaterSuggestions value="" onSelect={vi.fn()} disabled={false} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use my location' })));
  expect(screen.getByRole('button', { name: 'Finding nearby waters…' })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.getByRole('status')).toHaveTextContent('Could not look up');
  expect(screen.getByRole('button', { name: 'Use my location' })).toBeEnabled();
  expect(vi.mocked(findNearbyWaters).mock.calls[0][2].aborted).toBe(true);
});
