import { useCallback, useEffect, useState } from 'react';
import { readRoute, routeUrl, type AppRoute } from '../domain/navigation';

export function useAppRoute() {
  const [route, setRoute] = useState(() => readRoute(window.location.search));
  useEffect(() => {
    const onBack = () => setRoute(readRoute(window.location.search));
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  const navigate = useCallback((next: AppRoute, replace = false) => {
    const url = routeUrl(next, window.location);
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    }
    setRoute(next);
  }, []);
  return { route, navigate };
}
