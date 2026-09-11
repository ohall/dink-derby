import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beginAccountSignIn, currentAccount, finishAccountSignIn, sendSaveAccountCode, sendSignInCode, verifySaveAccountCode } from '../data/accounts';
import { isAccountRecoveryEnabled } from '../lib/supabase';

export function AccountPanel({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [account, setAccount] = useState<User | null>();
  const [mode, setMode] = useState<'save' | 'sign-in' | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const signInClient = useRef<SupabaseClient>();
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    currentAccount().then(user => { if (active) setAccount(user); }).catch(() => { if (active) setAccount(null); });
    return () => { active = false; signInClient.current?.auth.stopAutoRefresh(); };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => { if (sent) codeInput.current?.focus(); }, [sent]);

  if (!isAccountRecoveryEnabled) return <p className="form-help">Guest profile: keep this browser’s data to retain access. Account recovery is not available yet.</p>;
  if (account === undefined) return <p className="form-help" role="status">Checking account…</p>;
  const saved = account && !account.is_anonymous && account.email_confirmed_at;

  function choose(next: 'save' | 'sign-in') {
    setMode(next); setError(''); setMessage(''); setSent(false); setCode('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (!sent && cooldown > 0)) return;
    setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try {
      if (!sent) {
        if (mode === 'save') await sendSaveAccountCode(email);
        else {
          signInClient.current ??= beginAccountSignIn();
          await sendSignInCode(signInClient.current, email);
        }
        setSent(true); setCooldown(60);
      } else if (mode === 'save') {
        setAccount(await verifySaveAccountCode(email, code));
        setMode(null); setSent(false); setCode('');
        setMessage('Account saved. Use this email to sign in on another phone. Only synced catches and photos can be restored there.');
      } else {
        if (!signInClient.current) throw new Error('Request a new sign-in code.');
        await finishAccountSignIn(signInClient.current, email, code);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not complete sign-in. Try again.'); }
    finally { setBusy(false); onBusyChange(false); }
  }

  return <section className="account-panel" aria-labelledby="account-heading">
    <h3 id="account-heading">{saved ? 'Account saved' : 'Keep your derby history'}</h3>
    {saved ? <p>{account.email}<br /><small>Sign in with this email on another device to restore your synced derbies and catches.</small></p>
      : <p>Save this angler with an email address to recover synced history on another phone. Guest play does not require an email.</p>}
    {message && <p className="form-help" role="status">{message}</p>}
    {!mode && !saved && <div className="account-actions">
      {account?.is_anonymous && <button className="button button--primary" type="button" onClick={() => choose('save')}>Save my account</button>}
      <button className="button button--paper" type="button" onClick={() => choose('sign-in')}>Sign in to saved account</button>
    </div>}
    {mode && <form className="field-form" onSubmit={submit}>
      <h4>{mode === 'save' ? 'Save this angler' : 'Sign in to saved account'}</h4>
      {mode === 'sign-in' && <p className="form-help">Use an email you previously verified with “Save my account.” Different anglers’ histories will not be merged.</p>}
      <label><span>Email address</span><input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} disabled={busy || sent} required /></label>
      {sent && <>
        <p className="form-help" role="status">Check your email for a code, then enter it here. Check spam if it does not arrive.</p>
        <label><span>Email code</span><input ref={codeInput} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" minLength={6} maxLength={10} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} required /></label>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button--primary button--full" disabled={busy || (!sent && cooldown > 0)} type="submit">{busy ? (sent && mode === 'sign-in' ? 'Restoring history…' : 'Please wait…') : sent ? (mode === 'save' ? 'Verify and save account' : 'Verify and sign in') : cooldown > 0 ? `Send another code in ${cooldown}s` : 'Send email code'}</button>
      {sent && <button className="button button--paper" type="button" disabled={busy || cooldown > 0} onClick={() => { setSent(false); setCode(''); setError(''); }}>{cooldown > 0 ? `Request another code in ${cooldown}s` : 'Change email or request another code'}</button>}
      <button className="button button--paper" type="button" disabled={busy} onClick={() => { setMode(null); setSent(false); setCode(''); }}>Cancel</button>
    </form>}
  </section>;
}
