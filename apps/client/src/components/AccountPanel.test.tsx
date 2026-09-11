import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountPanel } from './AccountPanel';
import * as accounts from '../data/accounts';

vi.mock('../lib/supabase', () => ({ isAccountRecoveryEnabled: true }));
vi.mock('../data/accounts', () => ({ currentAccount: vi.fn(), beginAccountSignIn: vi.fn(), sendSaveAccountCode: vi.fn(), sendSignInCode: vi.fn(), verifySaveAccountCode: vi.fn(), finishAccountSignIn: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(accounts.currentAccount).mockResolvedValue({ id: 'guest', is_anonymous: true } as never); });
afterEach(cleanup);

it('offers guest saving and existing-account sign-in as separate actions', async () => {
  render(<AccountPanel onBusyChange={vi.fn()} />);
  expect(await screen.findByRole('button', { name: 'Save my account' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Sign in to saved account' })).toBeEnabled();
  expect(accounts.sendSaveAccountCode).not.toHaveBeenCalled();
});

it('asks for a code then clearly confirms saving the existing angler', async () => {
  const onBusyChange = vi.fn();
  vi.mocked(accounts.verifySaveAccountCode).mockResolvedValue({ id: 'guest', email: 'parent@example.com', is_anonymous: false, email_confirmed_at: '2026-09-11' } as never);
  render(<AccountPanel onBusyChange={onBusyChange} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save my account' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'parent@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send email code' }));
  const code = await screen.findByLabelText('Email code');
  expect(code).toHaveFocus();
  expect(screen.getByLabelText('Email address')).toBeDisabled();
  fireEvent.change(code, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and save account' }));
  expect(await screen.findByRole('heading', { name: 'Account saved' })).toBeInTheDocument();
  expect(accounts.verifySaveAccountCode).toHaveBeenCalledWith('parent@example.com', '123456');
  expect(screen.getByRole('status')).toHaveTextContent('Only synced catches and photos');
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it('keeps the code form open after invalid verification and permits retry', async () => {
  vi.mocked(accounts.verifySaveAccountCode).mockRejectedValue(new Error('That code is invalid or expired.'));
  render(<AccountPanel onBusyChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save my account' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'parent@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send email code' }));
  fireEvent.change(await screen.findByLabelText('Email code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and save account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Verify and save account' })).toBeEnabled());
  expect(screen.getByLabelText('Email code')).toHaveValue('123456');
});
