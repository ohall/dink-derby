# PWA install discoverability — September 9, 2026

## Deploy result

- URL: https://dinkderby.com
- Target: production; status: READY
- Commit: `a1b64f4`, pushed to `main`
- Framework: React/Vite; Node 24.x on Vercel
- Build duration: 28.76 seconds
- Deployment: `dpl_7PGncMxA9LRTYoFou4LR4AVtpNrQ`
- Deployment URL: https://dink-derby-mi8ybeju3-oakley349-3454s-projects.vercel.app
- Public asset: `index-cf7bfda3.js`
- Scope: frontend only; no database, API, environment, manifest identity, or worker configuration changes

The release used a clean detached checkout. Unrelated visibility/resume-sync changes in the main checkout remain untouched and were not committed or deployed. The CLI lost its connection while monitoring the build (`fetch failed`); inspection confirmed this exact deployment was READY. Its HTML was verified using `vercel curl`, then it was promoted without creating a duplicate deployment.

## Fix

The former install UI depended on `beforeinstallprompt`, hid its label on mobile, and could disappear for 30 days after dismissal. The new home reminder is visible after onboarding, and the labeled, minimum-44px **Install app** control remains available after dismissal. It uses the native prompt when available and browser-specific instructions otherwise. Prompt failure, one-time event consumption, installed-state races, and blocked dismissal storage are covered. See [pwa-installation.md](pwa-installation.md).

## Verification

- Clean dependency install, production client build, and all 132 clean client tests passed.
- All six install browser scenarios passed in mobile Chromium, including iOS/Android user-agent emulation and 320px layout.
- The broader local regression run passed 27 scenarios, skipped three live-only scenarios, and timed out on the photo test while waiting to click **Start a derby**, before image processing. That photo scenario passed independently on rerun (4.8 seconds). An earlier misconfigured run selected server-backed checks against the intentionally offline development API; it was stopped and rerun using the correct local configuration.
- Production: new home reminder, 320px no-overflow layout, dismissal/reload with persistent install control, and failed-native-prompt fallback all passed with no page errors. The expected public asset and manifest were served; Chromium reported `installabilityErrors: []`.
- The live manifest and 192/512/maskable icon dimensions were checked; the service worker registered successfully.
- Physical-device OS installation was not performed. Native browser dialogs were simulated for UI tests, and iOS instructions were tested with Chromium user-agent emulation, not physical Safari.
- Anonymous identity recovery remains out of scope. Instructions warn that some installed-app/browser storage contexts are separate; keep the original browser data if the installed app does not show the expected derbies.

## Post-deploy observability

- Error scan: no error-level Vercel logs returned in the 10-minute check; no live browser page errors.
- Drains: zero configured; external log retention/alerting remains a gap. No monitoring integration was added.
- Production dependency audit: zero vulnerabilities. Development/build-tool advisories (13 in the local clean install) and the existing main-bundle size warning remain; no dependency versions were changed.
