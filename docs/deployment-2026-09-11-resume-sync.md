# Resume-sync release — September 11, 2026

- Source commit: `ff71ff8`, pushed to main.
- Frontend deployment: `dpl_4Wt1LknEDrbZEEe1oiuTbxKKKUDj`.
- Immutable URL: https://dink-derby-9fxgjqnks-oakley349-3454s-projects.vercel.app
- Production: https://dinkderby.com
- Artifact: `index-8844c430.js`.
- Vercel build: Node 24.x, 25.952 seconds; READY, then promoted after HTML/artifact verification.
- API: unchanged.

Verification: 10 sync unit tests, production build, and mobile Chromium resume regression passed locally. The same regression passed against the promoted production domain (1 test, 13.8 seconds): with polling timers paused, changing visibility from hidden to visible without a focus event issued exactly one successful sync request and restored the synced indicator. Error-level log queries for frontend and API in the checked 10-minute window returned no entries. These checks are not physical-phone or camera-memory testing.

The account recovery implementation in subsequent commits is separate from this release. Do not infer that email recovery is enabled merely because this resume fix is live.
