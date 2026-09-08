# Nearby water suggestions

Start a derby → **Use my location** → select a named water. The Water field stays editable, and nothing replaces its current value until a suggestion is selected. Only the confirmed text is saved as `bodyOfWaterName`, through the existing local-first derby/sync flow.

## Coverage and accuracy

Initial coverage is **U.S. named waters**, using the [USGS National Hydrography Dataset](https://www.usgs.gov/national-hydrography/national-hydrography-dataset). The [published NHD service](https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer) supplies lake/pond/reservoir polygons (layer 12), river polygons (9), and river/canal lines (6). No account or map-provider key is required.

The server searches within 5 km, compares distance to actual boundaries/river lines, and ranks a containing polygon first. Polygon holes/islands are respected; river paths are not closed. Segments with the same GNIS identifier are deduplicated. Up to six named candidates reach the phone—never the upstream geometry. Distances are approximate, not navigation guidance or a guarantee of the correct water. The angler confirms the selection. Missing, unnamed, non-U.S., or incorrectly mapped waters can always be entered manually.

Provider queries follow [Esri's map-layer query contract](https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/). Geometries are simplified to roughly 5m angular resolution. No nearby street-address reverse geocoder is used.

## Privacy, load and failures

- No automatic GPS on form open, continuous tracking, or background lookup. Location is requested only by the button, with a 5-second device deadline.
- The UI explains that approximate location is sent to USGS. Coordinates are rounded to four decimal places before the authenticated POST to `/waters/nearby`; the server rounds again. Neither identity nor derby data goes to USGS.
- Lookup coordinates are not saved in IndexedDB, the derby, or Postgres. App logs do not intentionally record lookup bodies, upstream URLs, or geometry. The external service receives coordinates in its query and has its own logging policies.
- The server's bounded, ephemeral cache holds up to 100 rounded coordinate keys and small suggestion responses for five minutes. No geometry or identity is cached. This is process-local, not durable storage.
- The API requires the existing verified Supabase identity. Limits are five lookups per authenticated angler per minute per server instance, with at most three distinct in-flight provider lookups per process. Same-location requests coalesce. These are POC safeguards, not a globally coordinated anti-abuse quota.
- Each of three parallel layer responses is capped at 2 MB and 200 features, with a shared 12-second timeout. Failed or truncated layers produce an explicit incomplete-data notice; all-layer failure returns 503. Incomplete responses are not cached.
- The phone has a separate 15-second network/auth deadline and a cancel action. Closing/saving the form aborts the lookup. Late results cannot change typed text.
- Offline, denied GPS, timeout, provider failure and empty results leave manual creation available. Nearby-water lookup itself requires a connection; it is not an offline hydrography database.
- Runtime schema validation is lazy-loaded for this action. No new mapping SDK, tracking subscription, or dependency was added.

## Verification and operations

Unit/API tests cover geometry, islands, deduplication, six-result cap, request validation, authentication, per-angler rate limits, timeouts, partial responses, payload limits, caching, cancellation, manual-entry protection and offline fallbacks. Playwright tests cover 320/375/1280px layouts and saved/reloaded names. The production-only test creates a dedicated QA derby, checks live USGS matching, joins from a second browser, checks persisted water text, and finishes the QA derby.

No database migration or environment variable is needed. Deploy the API before the client. Public USGS service availability and data quality remain external dependencies; manual entry is the fallback. Before growing substantially, evaluate provider capacity and globally coordinated quotas. The existing sync/join route registration is outside this change; the new route is registered after the rate-limit plugin so its route-specific hook is active.
