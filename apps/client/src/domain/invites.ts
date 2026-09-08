const INVITE_CODE = /^DINK-[A-Z0-9]{4,27}$/;

/** Only extract a code; never navigate to a scanned URL or fetch its contents. */
export function parseDerbyInvite(value: string, currentOrigin: string): string | undefined {
  if (value.length > 1024) return;
  const input = value.trim();
  if (INVITE_CODE.test(input.toUpperCase())) return input.toUpperCase();
  try {
    const url = new URL(input);
    const trusted = url.origin === currentOrigin || ['https://dinkderby.com', 'https://www.dinkderby.com'].includes(url.origin);
    if (!trusted || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') return;
    const codes = [...url.searchParams.getAll('join'), ...new URLSearchParams(url.hash.slice(1)).getAll('join')];
    if (codes.length !== 1) return;
    const code = codes[0].toUpperCase();
    return INVITE_CODE.test(code) ? code : undefined;
  } catch { return; }
}

export function derbyInviteUrl(code: string, origin: string): string {
  // Fragments are not sent to web servers or in HTTP referrers.
  const url = new URL('/', origin);
  url.hash = new URLSearchParams({ join: code }).toString();
  return url.href;
}

export function clearInviteFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('join');
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has('join')) { hash.delete('join'); url.hash = hash.toString(); }
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
