import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { MapPin } from 'lucide-react';
import type { Catch, Derby, User } from '@dink-derby/shared-types';
import { buildCatchMap } from '../domain/catchMap';
import { catchScore, formatScore, scoringLabel } from '../domain/leaderboard';
import { isDerbyComplete } from '../domain/derbyLifecycle';
import type { CatchMapCanvasProps } from './CatchMapCanvas';

export function DerbyMap({ derby, catches, users, currentUserId, suspended }: {
  derby: Derby; catches: Catch[]; users: User[]; currentUserId?: string; suspended?: boolean;
}) {
  const [scope, setScope] = useState<'mine' | 'all'>(currentUserId ? 'mine' : 'all');
  const [selectedId, setSelectedId] = useState<string>();
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [limit, setLimit] = useState(20);
  const [Canvas, setCanvas] = useState<ComponentType<CatchMapCanvasProps>>();
  const [loadError, setLoadError] = useState(false);
  const { points, missingCount, totalCount } = useMemo(() => buildCatchMap(derby, catches, scope === 'mine' ? currentUserId : undefined), [derby, catches, scope, currentUserId]);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user.displayName])), [users]);
  const hasPoints = points.length > 0;
  const selected = points.find(point => point.item.id === selectedId);

  useEffect(() => {
    if (!hasPoints || suspended || Canvas) return;
    let active = true;
    setLoadError(false);
    import('./CatchMapCanvas').then(module => {
      if (active) setCanvas(() => module.CatchMapCanvas);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [hasPoints, suspended, Canvas]);

  function changeScope(next: 'mine' | 'all') {
    setScope(next); setSelectedId(undefined); setLimit(20);
  }

  function selectCatch(id: string) {
    setSelectedId(id); setSelectionRequest(value => value + 1);
  }

  return <section className="derby-map" aria-label="Derby catch map">
    <div className="map-heading"><div><h2>Catch map</h2><p>{points.length} of {totalCount} catch{totalCount === 1 ? '' : 'es'} mapped</p></div>
      <div className="map-filter" role="group" aria-label="Map catches">
        {currentUserId && <button type="button" aria-pressed={scope === 'mine'} onClick={() => changeScope('mine')}>My catches</button>}
        <button type="button" aria-pressed={scope === 'all'} onClick={() => changeScope('all')}>All catches</button>
      </div>
    </div>
    {missingCount > 0 && <p className="map-missing">{missingCount} catch{missingCount === 1 ? ' has' : 'es have'} no saved location.</p>}
    {!hasPoints ? <div className="map-empty"><MapPin size={32} aria-hidden="true" /><h3>No catch locations {scope === 'mine' ? 'for you ' : ''}yet</h3>
      <p>{isDerbyComplete(derby) ? 'Only locations saved with a catch can be shown. Earlier locations cannot be recovered.' : 'New catches include your location by default. Allow location access when saving, or uncheck “Include my location” to save without it.'}</p>
      {scope === 'mine' && <button type="button" className="button button--paper" onClick={() => changeScope('all')}>Show all anglers’ catches</button>}
    </div> : <>
      {suspended ? <p className="map-loading">Map paused while you log a catch.</p> : Canvas ?
        <Canvas points={points} derby={derby} userById={userById} selectedId={selectedId} selectionRequest={selectionRequest} onSelect={selectCatch} /> :
        <div className="map-loading" role="status">{loadError ? <><p>Map could not load. Your saved catch locations are listed below.</p><button className="button button--paper" type="button" onClick={() => window.location.reload()}>Reload to retry map</button></> : 'Loading map…'}</div>}
      <p className="map-help">Tap a pin or a catch below. Numbers run from first catch to last; a + means catches share a location.</p>
      {selected && <div className="map-selection" role="status"><strong>Catch {selected.number}: {selected.item.species || 'Fish'}</strong><span>{formatScore(derby, catchScore(derby, selected.item))} {scoringLabel(derby)} · {userById.get(selected.item.userId) || 'Angler'}</span><time dateTime={selected.item.caughtAt}>{new Date(selected.item.caughtAt).toLocaleString()}</time></div>}
      <ol className="map-catch-list" aria-label="Mapped catches">
        {points.slice(0, limit).map(({ item, number }) => <li key={item.id}>
          <button type="button" aria-pressed={selectedId === item.id} onClick={() => selectCatch(item.id)}>
            <span className="map-catch-number" aria-hidden="true">{number}</span>
            <span className="map-catch-copy"><strong>Catch {number} · {item.species || 'Fish'}</strong><span>{userById.get(item.userId) || 'Angler'} · {formatScore(derby, catchScore(derby, item))} {scoringLabel(derby)}</span><time dateTime={item.caughtAt}>{new Date(item.caughtAt).toLocaleString()}</time><small>{item.locationLat.toFixed(5)}, {item.locationLon.toFixed(5)}{item.isPendingSync ? ' · Waiting to sync' : ''}</small></span>
          </button>
        </li>)}
      </ol>
      {limit < points.length && <button className="button button--paper" type="button" onClick={() => setLimit(value => value + 20)}>Show more catches ({points.length - limit} remaining)</button>}
    </>}
  </section>;
}
