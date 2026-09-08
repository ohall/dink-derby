# Participant QR invitations — September 8, 2026

## Deploy result

- **URL / target / status:** [dinkderby.com](https://dinkderby.com) / production / READY.
- **Commit:** `65150fb` — participant QR display, in-app scanning, and camera-link onboarding.
- **Deployment:** `dpl_A3easnbu6v8kL9m3nGkswzUzGkQk`, [immutable URL](https://dink-derby-od13xm0cf-oakley349-3454s-projects.vercel.app).
- **Framework:** React/Vite, Vercel Node 24 build runtime. Build duration was not captured separately.
- **Main asset:** `index-616fd30c.js`. QR worker asset returned HTTP 200 with JavaScript content type before promotion.
- **Scope:** client-only, no API, database, or environment changes. Includes previously committed PWA install support (`b226104`). Released from a clean detached worktree; unfinished sync/resume work in the main checkout was neither committed nor deployed.

## User flow

Any participant opens **Invite anglers** inside the derby. Another person scans with their phone camera or **Join a derby → Scan QR code**, then confirms **Join derby**. First-time anglers can set their display name without losing the invitation. Typed/copied codes remain available. See [QR invitations](qr-invites.md) for camera lifecycle, validation and privacy details.

## Verification

**Story:** participant's locally generated QR → camera decode or standard HTTPS link → profile/confirmation → existing authenticated join endpoint → persisted membership → derby view after reload.

- 112 client unit/component tests passed in the clean release checkout, including 27 new parsing and scanner lifecycle checks.
- Client production build passed both locally and on Vercel. Production dependency audit returned zero vulnerabilities; existing development/build-tool advisories and the existing main-bundle size warning remain.
- Full local mobile-Chromium suite: 24 passed, 3 intentionally skipped live tests. Clean release checkout QR/UX subset: 9 passed, 1 intentionally skipped live test.
- QR checks cover 320/375/1280px, real native and worker decoding of generated QR pixels, explicit confirmation, first-run onboarding, refresh, invalid links, offline join retry, denied camera, repeated cancel/reopen, backgrounding and late permission cleanup.
- Live production three-browser test passed: `QR QA mtsz1blg`. A non-admin participant joined from the camera link, displayed their own QR, and a third browser decoded it with the production scanner. `/join` returned HTTP 200 and a three-participant snapshot. Reload preserved membership; completion synced to the third browser. The dedicated QA derby was finished; no existing user's derby was changed.
- Agent-browser verified the development UI loads with meaningful controls and no page errors. Phone camera hardware is simulated with a canvas MediaStream in automated tests; physical-device focus/glare and actual permission prompts still need field testing. Safari/WebKit was not verified by this Chromium run.

## Post-deploy observability and rollback

- Custom-domain inspection resolves to the new READY deployment. Client error-level log scan over the release's 10-minute window returned no logs.
- Drains were not inspected or changed. No new continuous monitoring was configured.
- Rollback target: `dpl_BKa3wNarzyCPJJ4C599K2q82jPe2`, [previous client](https://dink-derby-6va9qxfct-oakley349-3454s-projects.vercel.app). No data rollback is required. Old clients can still use the printed invite code, but cannot interpret the new join link until updated.
