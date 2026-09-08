# Production deployment — September 8, 2026

## Deploy result

- **URL:** https://dinkderby.com
- **Target:** production
- **Status:** READY; production-configured build staged, checked and promoted
- **Commit:** `9ebfd74` — add derby catch maps with opt-in location capture
- **Framework:** React/Vite frontend; existing Fastify API and Supabase services unchanged
- **Build duration:** exact duration not reported in the captured CLI output
- **Deployment:** `dpl_8EWezuNr1wUwWpuoarAbef6vnJG5`
- **Unique URL:** https://dink-derby-7k2dx64xw-oakley349-3454s-projects.vercel.app
- **Frontend bundle:** `index-c645dd11.js`
- **Lazy map bundle:** `CatchMapCanvas-70d11ff9.js` (158.32 kB; 46.61 kB gzip)
- **Database/API changes:** none

## Included

The [catch map guide](catch-map.md) documents controls, consent, offline behavior,
memory precautions and repeatable checks. The Map tab is available in active and
completed derbies, with personal/all-angler filters, numbered catch locations,
individual catch details and handling for shared coordinates. Location capture is
visible and opt-in; failures do not prevent saving the fish.

## Verification report

**Story:** An angler opts into location when saving a fish. Coordinates are stored
locally, sent through the existing authenticated sync endpoint to the database,
and appear on another derby member's map and in historical results.

| Boundary | Status | Evidence |
| --- | --- | --- |
| UI and local persistence | Passed | 63 client unit/component tests; local coordinate capture, ordering, validation, completion cutoff and permission/deadline behavior |
| Browser controls | Passed | 12 local Chromium browser tests, including map layouts at 320px, 375px and 1280px; pins, popups, 44px controls, reload, repeated mount/unmount, offline/tile errors and completion |
| Existing photo/catch flows | Passed | Local photo-memory, scoring, corrections and UX regression tests |
| Client → API → persisted data → second client | Passed | Production two-user map test; second QA user receives `44.28000, -73.98000` through sync and sees the correct angler and catch details |
| Shared removal and restoration | Passed | The second QA user's pin disappears when the owner removes the catch and returns on restoration |
| Historical map | Passed | Completion closes entry; the second user opens the map again after completion and reload |
| Deployment and provider availability | Passed | Custom domain serves the new bundle and resolves to the new deployment; one identified HEAD request to an OSM tile returned HTTP 200 and image/png |

The production test created **Map QA mtsoksif**, under dedicated synthetic users,
and finished that derby. Existing user derbies were not modified. All automated
basemap requests were intercepted with a fixture; tests do not bulk-fetch or pan
the public tile service. Real-device GPS, permission prompts, terrain detail and
low-memory on-water endurance remain field-test requirements.

All workspace builds and whitespace checks passed. Production dependency audit:
zero known vulnerabilities. Existing development-tool advisories and the main
JavaScript bundle size warning remain.

## Post-deploy observability

- **Error scan:** no error-level log entries returned for the new frontend deployment
  (30-minute query) or the API project (10-minute query) during verification.
- **Drains:** configuration not audited or changed in this release.
- **Monitoring:** point-in-time deployment, HTTP and cross-device browser checks;
  no new recurring monitor was created.

## Git checkpoint and rollback

The feature commit was pushed before deployment. Separate edits to the sync service
and its tests appeared afterward; those were left untouched and are not part of
this map deployment. This report is a documentation-only follow-up checkpoint.

Previous frontend deployment: `dpl_8M9Vm2xEFtQvm5n5n7EVXkYodPKd`.
Frontend rollback requires no database migration or API rollback.
