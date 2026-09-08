import { useEffect, useRef, useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import type { NearbyWatersResponse, WaterSuggestion } from '@dink-derby/shared-types';
import { findNearbyWaters } from '../lib/api';
import { getCatchLocation } from '../utils/location';

function locationLabel(water: WaterSuggestion) {
  if (water.containsLocation) return 'At your mapped location';
  if (water.distanceMeters < 50) return 'Near your location';
  return `About ${(water.distanceMeters / 1609.344).toFixed(1)} mi away`;
}

export function WaterSuggestions({ value, onSelect, disabled }: { value: string; onSelect: (name: string) => void; disabled: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'locating' | 'searching'>('idle');
  const [result, setResult] = useState<NearbyWatersResponse>();
  const [message, setMessage] = useState('');
  const task = useRef<AbortController>();
  const busy = phase !== 'idle';
  useEffect(() => () => { task.current?.abort(); task.current = undefined; }, []);

  function cancel() {
    task.current?.abort(); setPhase('idle'); setMessage('Lookup canceled. You can enter the water name yourself.');
  }

  async function locate() {
    task.current?.abort();
    const controller = new AbortController(); task.current = controller;
    setResult(undefined); setMessage('');
    if (!navigator.onLine) { setMessage('You’re offline. Enter the water name yourself, or try location when connected.'); return; }
    setPhase('locating');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const position = await getCatchLocation();
      if (controller.signal.aborted) return;
      if (position.error) { setMessage(`${position.error} Enter the water name yourself or try again.`); return; }
      setPhase('searching');
      timer = setTimeout(() => controller.abort('timeout'), 15_000);
      // Also bound time spent acquiring an auth token before fetch can start.
      const canceled = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Lookup canceled')), { once: true }));
      const nearby = await Promise.race([findNearbyWaters(position.lat!, position.lon!, controller.signal), canceled]);
      if (controller.signal.aborted) return;
      setResult(nearby);
      setMessage(nearby.suggestions.length ? 'Choose the water you’re fishing. Your entry won’t change until you select one.' : 'No named waters found nearby in the U.S. dataset. Enter the water name yourself.');
    } catch {
      if (task.current === controller && (!controller.signal.aborted || controller.signal.reason === 'timeout')) setMessage('Could not look up nearby waters. Enter the water name yourself or try again.');
    } finally {
      clearTimeout(timer);
      if (task.current === controller) setPhase('idle');
    }
  }

  return <div className="water-suggestions">
    <div className="water-lookup-actions">
      <button type="button" className="button button--paper" disabled={disabled || busy} onClick={() => void locate()}><MapPin size={18} />{phase === 'locating' ? 'Getting location…' : phase === 'searching' ? 'Finding nearby waters…' : 'Use my location'}</button>
      {busy && <button type="button" className="button button--paper" onClick={cancel}>Cancel lookup</button>}
    </div>
    <p className="water-lookup-help">Suggests nearby U.S. waters. Your approximate location is sent to USGS for this lookup only.</p>
    <div role="status" aria-live="polite">{message && <p className="water-lookup-message">{message}</p>}</div>
    {result?.partial && <p className="water-lookup-message">Some water data could not load. Suggestions may be incomplete.</p>}
    {!!result?.suggestions.length && <ul aria-label="Nearby water suggestions" className="water-results">
      {result.suggestions.map(water => <li key={water.id}><button type="button" disabled={disabled} aria-pressed={value === water.name} onClick={() => onSelect(water.name)}>
        <span><strong>{water.name}</strong><small>{water.kind} · {locationLabel(water)}</small></span>{value === water.name ? <Check size={20} aria-hidden="true" /> : <span className="water-use-label">Use</span>}
      </button></li>)}
    </ul>}
    {result && <p className="water-source">Source: <a href="https://www.usgs.gov/national-hydrography/national-hydrography-dataset" target="_blank" rel="noopener noreferrer">USGS National Hydrography Dataset</a>. Search radius: about 3 miles. Names and GPS positions may be approximate.</p>}
  </div>;
}
