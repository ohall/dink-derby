# Production deployment — September 7, 2026

## Deploy result

- **URL:** https://dinkderby.com
- **API:** https://api.dinkderby.com
- **Target:** production
- **Status:** READY; both builds staged with production configuration and promoted
- **Source at deployment:** working tree based on `072db60`, deployed before the Git checkpoint. The tested release source is captured in the commit adding this report.
- **Framework:** React/Vite client, Fastify API, existing Supabase database/storage/auth
- **Build duration:** API build reported 20 seconds; frontend build duration was not reported in the captured CLI output
- **Frontend deployment:** `dpl_8M9Vm2xEFtQvm5n5n7EVXkYodPKd`
- **API deployment:** `dpl_5FVZy9RHMaheNpjQcE9FNerExdgn`
- **Public frontend bundle:** `index-57e7fc8e.js`
- **Database migration:** none required; removal uses the existing `deletedAt` field

## Included

- All changes from the [UX review](ux-review-2026-09-07.md): visible Finish derby,
  one persistent catch action, measurement-first entry, optional details,
  clearer invitations, larger controls, consistent dialogs, draft-write recovery,
  and historical-results navigation.
- Owner-only catch editing, removal confirmation, and restoration while active.
  Catch time, device, identity, and photo are preserved by corrections.
- Soft-deleted catches remain in snapshots so other devices remove them from the
  feed and standings. Replayed creates cannot overwrite corrections or resurrect
  a removed catch. Completed results reject score/detail corrections.
- Query-based derby/section/history routes, reload persistence, Back/Forward,
  and a useful missing-derby screen with Join with code.
- New catch edits are protected from older in-flight sync responses. A queued
  finish is sent after catch corrections, not before them. Rejected changes stay
  visible; rejected edits can be dismissed without discarding new fish.
- Test configuration prevents inheriting live auth/database settings. Destructive
  integration cleanup requires a loopback database with a `_test` name.
- Explicit deployment exclusions keep environment files out of uploaded sources.

## Verification report

**Story:** An angler edits or removes their catch, the change is stored locally,
sent through the authenticated sync API to Postgres, then appears correctly on
another angler's device; finishing closes entry and preserves navigable results.

| Boundary | Result | Evidence |
| --- | --- | --- |
| UI | Passed | Eight local Chromium browser tests; 320px, 375px, and 1280px layouts; manual browser inspection of the edit form |
| Local persistence | Passed | 53 client unit/component tests including correction rollback, draft recovery, pending-edit protection, and sync ordering |
| API/database | Passed | Eight server tests including real disposable Postgres integration, forged-owner rejection, immutable timestamps, tombstones, restoration, and closed-derby rejection |
| Live cross-device correction | Passed | `catch-corrections.spec.ts`: second identity observes edited weight, removal, and restoration; results/history/reload/back-forward work |
| Live completion | Passed | `production-completion.spec.ts`: organizer finishes, guest has no finish control, pre-cutoff offline catch arrives later and updates the winner |
| Live photos | Passed | `photo-memory.spec.ts`: 12 MP photo preparation, oversized-photo rejection, offline save, reload recovery, real upload and another browser's download |
| Production routing | Passed | Custom domains resolve to the new deployment IDs; root/API health and current JS bundle return successfully |

All builds and `git diff --check` passed. Production dependency audit: zero
reported vulnerabilities. Existing build-tool advisories and the >500KB client
bundle warning remain.

Synthetic production verification derbies include `Corrections QA mtrv7z5f` and
`Deployment completion check mtrv7z6p`, under separate QA identities. Existing user
derbies were not modified. The disposable local container
`dink-derby-verify-20260907` and its test data were removed after testing; those
synthetic fixtures can be recreated by rerunning the tests.

## Post-deploy observability

- Error scan: no matching error-level entries returned for either new deployment
  in the post-deploy 30-minute query.
- Drains: external drain configuration was not audited or changed in this release.
- Monitoring: deployment health, live smoke tests, and request-log inspection;
  no recurring monitor was created.

## Remaining limitations

Browser-bound identity/recovery, rules editing, and reopening completed derbies
remain separate product work. Physical Android/iOS camera/keyboard behavior and
low-memory on-water endurance still require a real-device field test. Chromium
automation does not establish that the prior mobile out-of-memory issue is gone.

## Repeatable checks

```sh
npm run test -w @dink-derby/client
npm run build
```

In `apps/client`:

```sh
npx playwright test --config=playwright.local.config.ts --project=mobile-chromium --workers=3
E2E_BASE_URL=https://dinkderby.com npx playwright test --config=playwright.production.config.ts --workers=2
E2E_BASE_URL=https://dinkderby.com npx playwright test --config=playwright.memory.config.ts --project=mobile-chromium
```

Production browser checks create dedicated QA data. Database integration tests
must use a disposable local database; never point them at Supabase production.

## Rollback references

Previous frontend: `dpl_2djosiP16DJdCz6ADUkkHtA6JuQ4`.
Previous API: `dpl_9rQqDgrQc1bCNrg2iDvLVHgvJzr4`.

No schema changes require a database rollback. If reverting the correction UI,
prefer retaining the new API's tombstone behavior: the prior API's catch-create
upsert could overwrite a tombstone if an old device replays an existing catch.
