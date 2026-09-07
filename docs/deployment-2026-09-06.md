# Production deployment — September 6, 2026

Deployed the current working tree directly through Vercel; no commit or push was made.

- Frontend: https://dinkderby.com — `dpl_2djosiP16DJdCz6ADUkkHtA6JuQ4`
- API: https://api.dinkderby.com — `dpl_9rQqDgrQc1bCNrg2iDvLVHgvJzr4`
- Public frontend bundle: `index-63ffa56a.js`
- No production database migration was needed.

Includes organizer-only derby completion, historical results, late offline catch reconciliation, photo/draft memory safeguards, optional photos, single-fish entry, best-three/five scoring, separate biggest fish, removed app marketing copy, and derby-aware species defaults. Resumed drafts retain their existing species.

## Verified

- 44 client unit tests.
- 8 server tests, including real PostgreSQL integration against a disposable local container (never the production database).
- Three local mobile-Chromium browser tests.
- Production two-identity completion: non-organizer has no finish control, offline pre-cutoff catch syncs after completion, both identities receive results, history survives reload.
- Production photo flow: 12 MP image preparation, draft reload recovery, oversized-image rejection, offline saving, real upload, and a fresh browser downloading the photo.
- Existing Coco identity and Spam Derby survived upgrading the live browser.
- API health and service worker return HTTP 200.
- Production-only dependency audit: no findings. Build tooling still reports development dependency advisories and a frontend chunk-size warning.

Synthetic verification derbies were created under separate QA identities; existing user derbies were not changed. The disposable database container and its temporary test data were removed.

## Limitations

Actual phone RAM pressure and native camera handoff still need a physical-device field test. Safari/WebKit has not been validated in this run.

Completion closes new catch entry. Results may update as catches recorded before the end time arrive from offline phones; results are not immutable snapshots. No reopen flow is exposed.

## Repeatable checks

From `apps/client`, local checks use `npx playwright test --config=playwright.local.config.ts --project=mobile-chromium`.

Production checks require an explicit target and create synthetic data:

```
E2E_BASE_URL=https://dinkderby.com npx playwright test --config=playwright.production.config.ts
E2E_BASE_URL=https://dinkderby.com npx playwright test --config=playwright.memory.config.ts --project=mobile-chromium
```

Never run `test/sync.integration.test.ts` against production: its cleanup clears all application tables. Use only a disposable database.
