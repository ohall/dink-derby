# Derby catch map

Open a derby and select **Map**. The map defaults to **My catches**; **All catches**
shows locations shared by derby members. It is also available in completed derbies.
Numbers follow catch time, from first to last. Tap a pin or a catch in the list for
the angler, species, measurement and time. Catches at the same coordinates share a
numbered `+` pin and remain individually selectable. **Fit all catches** resets the view.

## Location capture and privacy

- **Include my location** is visible in the catch form and off by default.
- A fresh, one-shot browser position is requested only when saving with this option enabled.
- Coordinates are shared through the existing authenticated derby sync, not a public catch endpoint.
- The browser permission prompt and GPS have a five-second independent deadline.
  Denied, invalid or missing locations do not prevent saving; the confirmation explains the omission.
- No continuous tracking, route reconstruction, geocoding, photo metadata extraction or inferred catch locations.
- Old catches without coordinates remain unmapped, with an explicit count. Removed and post-cutoff catches are excluded.

## Resource and network behavior

- Leaflet is already a project dependency. The map renderer and its CSS are loaded
  through a separate dynamic import only when there are located catches to display.
- Map instances are unmounted on navigation and while the catch/photo form is open.
  Event listeners and resize observers are cleaned up. No photos are loaded into map markers or popups.
- Raster tiles use no retina multiplier or offscreen tile buffer. The catch list renders
  twenty entries initially, with an explicit Show more button.
- App JS/CSS may be precached to disk by the existing PWA. Map tiles are **not**
  prefetched, bulk-downloaded or put in a custom service-worker cache.
- Basemap tiles come from OpenStreetMap with visible attribution and normal browser HTTP caching.
  Tile requests necessarily reveal the area being viewed to the provider, not catch names or measurements.
  The app sends an origin-only cross-origin Referer, not the derby URL query.
- A missing background or lost connection leaves saved pins and the coordinate list usable.
  Offline basemap availability is not guaranteed. Failed renderer loading keeps the coordinate list available.

Provider references: [Leaflet API](https://leafletjs.com/reference.html),
[OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).
Use an appropriately licensed commercial/offline tile provider if guaranteed service,
offline basemaps or large-scale traffic becomes necessary.

## Verification

The initial feature checkpoint passed 63 client unit/component tests, all workspace
builds, and 12 local Chromium browser tests. Map layouts cover 320px, 375px and
1280px; tests exercise selection, duplicate coordinates, touch targets, repeated
mount/unmount, denied permission, offline/tile failure, reload and completion.
Production dependencies report zero known vulnerabilities; existing build-tool
advisories and the main-bundle size warning remain.

```sh
npm run test -w @dink-derby/client
npm run build
cd apps/client
npx playwright test --config=playwright.local.config.ts --project=mobile-chromium --workers=3
```

The explicit deployed check creates a dedicated QA derby with two synthetic users,
verifies location sync, removal/restoration and historical maps:

```sh
E2E_BASE_URL=https://dinkderby.com npx playwright test --config=playwright.production.config.ts catch-map.spec.ts --grep 'shared coordinates'
```

All automated map tests intercept tile requests with a fixture rather than generating
headless pan/zoom traffic against the public tile service. Browser tests do not prove
physical Android/iOS GPS quality, native permission behavior or low-memory field endurance.
