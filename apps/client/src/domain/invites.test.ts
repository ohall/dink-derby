import { afterEach, expect, it } from 'vitest';
import { clearInviteFromUrl, derbyInviteUrl, parseDerbyInvite } from './invites';

const origin = 'https://dinkderby.com';
const code = 'DINK-ABC123DEF456';
afterEach(() => window.history.replaceState(null, '', '/'));

it('generates a standard HTTPS camera link without putting the invite in server requests', () => {
  const link = derbyInviteUrl(code, origin);
  expect(link).toBe(`${origin}/#join=${code}`);
  expect(new URL(link).search).toBe('');
  expect(parseDerbyInvite(link, origin)).toBe(code);
});
it('accepts canonical links, local links on the same origin, and printed invite codes', () => {
  for (const value of [code, `  ${code.toLowerCase()}  `, `${origin}/?join=${code}`, `https://www.dinkderby.com/#join=${code}`]) expect(parseDerbyInvite(value, origin)).toBe(code);
  expect(parseDerbyInvite(`http://localhost:5174/#join=${code}`, 'http://localhost:5174')).toBe(code);
  expect(parseDerbyInvite(`${origin}/#join=${code}`, 'http://localhost:5174')).toBe(code);
});
it.each([
  'https://evil.example/#join=DINK-ABC123DEF456', 'https://dinkderby.com.evil.example/#join=DINK-ABC123DEF456',
  'https://user:password@dinkderby.com/#join=DINK-ABC123DEF456', 'http://dinkderby.com/#join=DINK-ABC123DEF456',
  'https://dinkderby.com/something/#join=DINK-ABC123DEF456', 'javascript:alert(1)', '/#join=DINK-ABC123DEF456',
  `${origin}/?join=${code}#join=${code}`, `${origin}/#join=${code}&join=OTHER`,
  `${origin}/#join=%3Cscript%3E`, `${origin}/#join=DINK-123`, 'DINK-' + 'A'.repeat(28), 'A'.repeat(1025), '',
])('rejects unrelated or ambiguous QR payloads: %s', value => { expect(parseDerbyInvite(value, origin)).toBeUndefined(); });
it('consumes only the invite fields while preserving navigation and unrelated URL data', () => {
  window.history.replaceState(null, '', `/?derby=abc&join=${code}&code=auth#join=${code}&other=value`);
  clearInviteFromUrl();
  expect(window.location.search).toBe('?derby=abc&code=auth');
  expect(window.location.hash).toBe('#other=value');
});
