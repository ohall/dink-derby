export type DerbySection = 'feed' | 'standings' | 'rules' | 'activity';
export type AppRoute = { derbyId?: string; section: DerbySection; history: boolean };

export function readRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  return { derbyId: params.get('derby') || undefined, history: view === 'past',
    section: view === 'standings' || view === 'rules' || view === 'activity' ? view : 'feed' };
}

export function routeUrl(route: AppRoute, location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const params = new URLSearchParams(location.search);
  params.delete('derby'); params.delete('view');
  if (route.derbyId) {
    params.set('derby', route.derbyId);
    if (route.section !== 'feed') params.set('view', route.section);
  } else if (route.history) params.set('view', 'past');
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
}
