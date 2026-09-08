import { describe, expect, it } from 'vitest';
import { readRoute, routeUrl } from './navigation';

describe('addressable app navigation', () => {
  it('restores a derby and a valid section, falling back safely for unknown views', () => {
    expect(readRoute('?derby=abc&view=standings')).toEqual({ derbyId: 'abc', section: 'standings', history: false });
    expect(readRoute('?derby=abc&view=map')).toEqual({ derbyId: 'abc', section: 'map', history: false });
    expect(readRoute('?derby=abc&view=bad').section).toBe('feed');
    expect(readRoute('?view=past')).toEqual({ derbyId: undefined, section: 'feed', history: true });
  });
  it('round-trips encoded derby IDs without removing unrelated or auth URL fields', () => {
    const route = { derbyId: 'a/b & c', section: 'rules' as const, history: false };
    const url = routeUrl(route, { pathname: '/', search: '?code=auth-code&view=past', hash: '#preserved' });
    expect(url).toContain('code=auth-code'); expect(url).toContain('#preserved');
    expect(readRoute(new URL(url, 'https://dinkderby.com').search)).toEqual(route);
  });
});
