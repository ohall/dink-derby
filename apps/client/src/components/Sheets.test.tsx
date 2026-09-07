import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Derby } from '@dink-derby/shared-types';
import { db } from '../db';
import { CatchSheet } from './Sheets';

vi.mock('../sync', () => ({ syncService: { requestSync: vi.fn() } }));
vi.mock('../lib/api', () => ({ identifyCatch: vi.fn(), joinDerbyRequest: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: null }));

const now = new Date().toISOString();
const derby: Derby = { id: 'derby', name: 'Test', bodyOfWaterName: 'Pond', scoringMode: 'length', createdByUserId: 'user', isArchived: false, createdAt: now, updatedAt: now };

beforeEach(async () => { await db.delete(); await db.open(); });
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
