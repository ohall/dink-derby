import { useEffect, useMemo, useRef, useState } from 'react';
import { divIcon, latLngBounds, type Marker as LeafletMarker } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Derby } from '@dink-derby/shared-types';
import { groupCatchLocations, type CatchMapPoint } from '../domain/catchMap';
import { catchScore, formatScore, scoringLabel } from '../domain/leaderboard';
import 'leaflet/dist/leaflet.css';

export type CatchMapCanvasProps = { points: CatchMapPoint[]; derby: Derby; userById: Map<string, string>; selectedId?: string; selectionRequest: number; onSelect: (id: string) => void };

function MapContents({ points, derby, userById, selectedId, selectionRequest, onSelect }: CatchMapCanvasProps) {
  const map = useMap();
  const groups = useMemo(() => groupCatchLocations(points), [points]);
  const markers = useRef(new Map<string, LeafletMarker>());
  const [tileError, setTileError] = useState(false);
  const [tileAttempt, setTileAttempt] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const failedTiles = useRef(new Set<string>());
  const bounds = useMemo(() => latLngBounds(points.map(({ item }) => [item.locationLat, item.locationLon])), [points]);

  useEffect(() => {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15, animate: false });
  }, [map, bounds]);

  useEffect(() => {
    const marker = selectedId ? markers.current.get(selectedId) : undefined;
    if (marker) { map.panTo(marker.getLatLng(), { animate: false }); marker.openPopup(); }
  }, [map, selectedId, selectionRequest]);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      observer.disconnect();
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      markers.current.clear();
    };
  }, [map]);

  const tileEvents = useMemo(() => ({
    tileerror: (event: { tile: HTMLImageElement }) => { failedTiles.current.add(event.tile.src); setTileError(true); },
    tileload: (event: { tile: HTMLImageElement }) => { failedTiles.current.delete(event.tile.src); setTileError(failedTiles.current.size > 0); },
  }), []);

  return <>
    <TileLayer key={tileAttempt} url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution={'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}
      maxZoom={18} keepBuffer={0} updateWhenIdle updateWhenZooming={false} detectRetina={false} noWrap
      referrerPolicy="strict-origin-when-cross-origin" eventHandlers={tileEvents} />
    {groups.map(group => {
      const first = group[0];
      const selected = group.some(point => point.item.id === selectedId);
      const shown = group.find(point => point.item.id === selectedId) || first;
      const title = group.length > 1 ? `Catch ${first.number} and ${group.length - 1} more at this location` : `Catch ${first.number}: ${first.item.species || 'Fish'}`;
      return <Marker key={first.item.id} position={[first.item.locationLat, first.item.locationLon]}
        title={title}
        alt={`Catch ${first.number}`} riseOnHover
        icon={divIcon({ className: `catch-map-pin${selected ? ' catch-map-pin--selected' : ''}`, html: `<span>${first.number}${group.length > 1 ? '+' : ''}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] })}
        ref={marker => {
          marker?.getElement()?.setAttribute('aria-label', title);
          for (const point of group) { if (marker) markers.current.set(point.item.id, marker); else markers.current.delete(point.item.id); }
        }}
        eventHandlers={{ click: () => onSelect(first.item.id) }}>
        <Popup autoPan={false} maxWidth={220} minWidth={170}>
          <div className="map-popup-detail"><strong>Catch {shown.number}: {shown.item.species || 'Fish'}</strong><span>{formatScore(derby, catchScore(derby, shown.item))} {scoringLabel(derby)} · {userById.get(shown.item.userId) || 'Angler'}</span><time dateTime={shown.item.caughtAt}>{new Date(shown.item.caughtAt).toLocaleString()}</time>
            {group.length > 1 && <><small>{group.length} catches at this location</small><div className="map-popup-catches">{group.slice(0, 5).map(point => <button key={point.item.id} type="button" aria-pressed={point.item.id === shown.item.id} onClick={() => onSelect(point.item.id)}>Catch {point.number}</button>)}</div>{group.length > 5 && <small>All catches are available in the list below.</small>}</>}
          </div>
        </Popup>
      </Marker>;
    })}
    <div className="map-overlay-controls" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      <button type="button" className="button button--paper" onClick={event => { event.stopPropagation(); map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15, animate: false }); }}>Fit all catches</button>
    </div>
    {(!online || tileError) && <div className="map-tile-notice" role="status" onPointerDown={event => event.stopPropagation()}>
      <span>{!online ? 'Offline — map background may be unavailable.' : 'Map background unavailable.'} Saved pins and the catch list still work.</span>
      {online && <button type="button" onClick={event => { event.stopPropagation(); failedTiles.current.clear(); setTileError(false); setTileAttempt(value => value + 1); }}>Retry background</button>}
    </div>}
  </>;
}

export function CatchMapCanvas(props: CatchMapCanvasProps) {
  return <div className="catch-map-frame" role="region" aria-label="Catch locations map">
    <MapContainer className="catch-map-canvas" center={[props.points[0].item.locationLat, props.points[0].item.locationLon]} zoom={13} minZoom={2} maxZoom={18}
      scrollWheelZoom={false} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false}>
      <MapContents {...props} />
    </MapContainer>
  </div>;
}
