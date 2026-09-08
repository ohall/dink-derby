# Water suggestions — production release, September 8, 2026

## Deploy result

- **URLs:** [Dink Derby](https://dinkderby.com), [API](https://api.dinkderby.com)
- **Target / status:** production / READY, both custom-domain targets inspected after promotion.
- **API commit:** `9445c18` — nearby-water feature.
- **Client commit:** `e14f82b` — same feature plus subpixel-tolerance test correction.
- **Frameworks:** React/Vite client; Fastify API; Vercel Node 24 runtime.
- **API deployment:** `dpl_9fjhxze6a7NZL8hJ7cxr4A7KZ3Eu`, [immutable URL](https://dink-derby-c9wwlr7fm-oakley349-3454s-projects.vercel.app). Build completed in 18 seconds.
- **Client deployment:** `dpl_2ahF3wzQh5pT8pfgGJnJjD5WA46B`, [immutable URL](https://dink-derby-brq46o2fx-oakley349-3454s-projects.vercel.app). Build duration was not captured separately.
- **Client assets:** `index-e5bf6c6a.js`, `index-68fb635e.css`; lazy runtime schemas `index-9097af7f.js`.
- **Release method:** clean detached worktree; stage with production settings and `--skip-domain`, smoke-check with `vercel curl`, then promote API before client. No database migration, environment change, or provider account required.
- Feature and test commits pushed to `origin/main`. The original checkout's uncommitted `apps/client/src/sync/index.ts` and `index.test.ts` changes were preserved and **not included in either deployment**.

## Verification report

**Story:** Start a derby → explicitly request GPS → authenticated API → USGS named water geometry → select a suggestion → local save/sync → second angler sees the confirmed water name.

| Boundary | Result | Evidence |
| --- | --- | --- |
| UI | Passed | Dev browser loads without JS errors; mobile controls and manual edits checked at 320, 375 and 1280px |
| Client → API | Passed | Live POST `/waters/nearby` returned 200; unauthenticated staged request returned 401 |
| API → USGS | Passed | Test location `44.285, -73.984` returned Mirror Lake first, about 82m away; no partial-data flag |
| Response → selection | Passed | Mirror Lake populated Water only after the test selected it |
| Local save → Supabase → second browser | Passed | Dedicated `Water QA mtspkc53` derby joined from a separate browser; Mirror Lake survived reload |
| Completion | Passed | QA derby finished; the second browser received Derby results |

- Clean-release build passed for all workspaces.
- **104 unit/API tests passed:** 72 client, 29 server, 3 shared schema tests. One database integration test skipped because no local test database was configured; never pointed it at production.
- **17 local Chromium browser tests passed**, including existing scoring, photo, catch correction, map and completion regression checks. Two production-only cases skipped in this local run.
- **1 live production water-lookup/cross-device test passed** in 23.6 seconds. Only the dedicated QA derby and test identities were created; no existing angler's derby was changed.
- An existing map target-size assertion initially failed on a reported `43.9999993px` for a 44px target. A 0.01px test tolerance fixed that numerical issue; the final clean-checkout suite passed.
- Safari/WebKit **not validated**: the cached browser lacked `pw_run.sh`; a reinstall stalled and was stopped. Real-device Safari and on-water GPS accuracy remain follow-up checks, not claimed passes.
- `npm audit --omit=dev`: **0 vulnerabilities**. Existing build-tool dependency advisories and the >500kB main-chunk warning remain; no dependencies were added in this feature.

## Post-deploy observability

- Error scan: Vercel returned no error-level logs for either project during the checked 10-minute release window.
- Drains: not inspected; no new monitoring integration configured.
- Monitoring gap: external USGS availability remains a dependency, with bounded timeouts, partial/failed-lookup notices and manual-entry fallback. No ongoing monitor was scheduled.

## Rollback

Restore the previous client first with Vercel's promote/rollback flow: `dpl_8EWezuNr1wUwWpuoarAbef6vnJG5` ([previous client](https://dink-derby-7k2dx64xw-oakley349-3454s-projects.vercel.app)). If needed, then restore API `dpl_5FVZy9RHMaheNpjQcE9FNerExdgn` ([previous API](https://dink-derby-6ijkep2vg-oakley349-3454s-projects.vercel.app)). No data rollback is needed: only the existing water-name field is persisted.

See [water-suggestions.md](water-suggestions.md) for coverage, privacy, provider limits and fallback behavior.
