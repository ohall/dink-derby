import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Derby } from '@dink-derby/shared-types';
import { db } from '../db';
import { CatchSheet } from './Sheets';
import { getCatchLocation } from '../utils/location';

vi.mock('../sync', () => ({ syncService: { requestSync: vi.fn() } }));
vi.mock('../lib/api', () => ({ identifyCatch: vi.fn(), joinDerbyRequest: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: null }));
vi.mock('../utils/location', () => ({ getCatchLocation: vi.fn() }));

const now = new Date().toISOString();
const derby: Derby = { id: 'derby', name: 'Test', bodyOfWaterName: 'Pond', scoringMode: 'length', createdByUserId: 'user', isArchived: false, createdAt: now, updatedAt: now };

beforeEach(async () => {
  await db.delete(); await db.open();
  await db.settings.put({ id: 'app', currentUserId: 'user' });
  await db.users.put({ id: 'user', displayName: 'Angler', createdAt: now, updatedAt: now });
  vi.mocked(getCatchLocation).mockReset().mockResolvedValue({ lat: 44.28, lon: -73.98 });
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await db.delete(); });

it('keeps the catch form open if Save draft & close cannot persist its fields', async () => {
  const onClose = vi.fn();
  render(<CatchSheet derby={derby} userId="user" onClose={onClose} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Length')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Length'), { target: { value: '12.5' } });
  await waitFor(async () => expect((await db.catchDrafts.toArray())[0].measurement).toBe('12.5'));

  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(db.catchDrafts, 'put').mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft & close' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Draft could not be backed up'));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Length')).toHaveValue(12.5);

  fireEvent.click(screen.getByRole('button', { name: 'Save draft & close' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect((await db.catchDrafts.toArray())[0]).toMatchObject({ measurement: '12.5', isOpen: false });
});

it('includes location by default but requests GPS only when saving a valid catch', async () => {
  const onSaved = vi.fn();
  render(<CatchSheet derby={derby} userId="user" onClose={vi.fn()} onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText('Include my location')).toBeEnabled());
  expect(screen.getByLabelText('Include my location')).toBeChecked();
  expect(getCatchLocation).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Length'), { target: { value: '12.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save catch' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(getCatchLocation).toHaveBeenCalledOnce();
  expect((await db.catches.toArray())[0]).toMatchObject({ locationLat: 44.28, locationLon: -73.98 });
});

it('preserves an opt-out with the draft and never requests or saves GPS for that catch', async () => {
  const onClose = vi.fn(), onSaved = vi.fn();
  const view = render(<CatchSheet derby={derby} userId="user" onClose={onClose} onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText('Include my location')).toBeEnabled());
  fireEvent.click(screen.getByLabelText('Include my location'));
  fireEvent.change(screen.getByLabelText('Length'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft & close' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect((await db.catchDrafts.toArray())[0].includeLocation).toBe(false);
  view.unmount();
  const reopened = render(<CatchSheet derby={derby} userId="user" onClose={vi.fn()} onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText('Include my location')).toBeEnabled());
  expect(screen.getByLabelText('Include my location')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save catch' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(getCatchLocation).not.toHaveBeenCalled();
  const saved = (await db.catches.toArray())[0];
  expect(saved.locationLat).toBeUndefined(); expect(saved.locationLon).toBeUndefined();
  reopened.unmount();
  render(<CatchSheet derby={derby} userId="user" onClose={vi.fn()} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Include my location')).toBeEnabled());
  expect(screen.getByLabelText('Include my location')).toBeChecked();
});

it('saves the catch with a clear notice when default-enabled GPS is denied', async () => {
  vi.mocked(getCatchLocation).mockResolvedValue({ error: 'Location permission was denied.' });
  const onSaved = vi.fn();
  render(<CatchSheet derby={derby} userId="user" onClose={vi.fn()} onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText('Length')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Length'), { target: { value: '12.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save catch' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Catch saved without a location. Location permission was denied.'));
  expect(await db.catches.count()).toBe(1);
  expect((await db.catches.toArray())[0].locationLat).toBeUndefined();
});

it('enables location on a restored legacy draft with no saved location choice', async () => {
  await db.catchDrafts.put({ id: 'legacy', derbyId: derby.id, userId: 'user', measurement: '11', species: '', note: '', isOpen: false, updatedAt: now });
  render(<CatchSheet derby={derby} userId="user" onClose={vi.fn()} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Length')).toHaveValue(11));
  expect(screen.getByLabelText('Include my location')).toBeChecked();
  expect((await db.catchDrafts.get('legacy'))?.includeLocation).toBe(true);
});
