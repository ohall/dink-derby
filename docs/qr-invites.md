# QR derby invitations

Any participant can open a derby → **Invite anglers** to show its QR code. A new angler can use their phone's normal camera, or Dink Derby → **Join a derby** → **Scan QR code**. Scanning fills the invite code; **Join derby** still requires an explicit confirmation. The original copy/type-code flow remains available.

## Behavior and boundaries

- QR codes are generated locally as high-contrast SVGs with a four-module quiet zone. No external QR-generation service sees an invite.
- The payload is the current app origin followed by `/#join=DINK-…`. URL fragments keep the invite out of HTTP requests and referrers. Query-string `join` links are also accepted for compatibility.
- Only canonical Dink Derby links, same-origin app links, and well-formed DINK codes are decoded. Arbitrary URLs, credentials in URLs, unexpected paths, ambiguous duplicate parameters, and oversized payloads are rejected. Scanned content never triggers navigation or arbitrary network requests.
- Incoming invitations survive first-time profile setup and refresh, and take precedence over reopening an unrelated catch draft. Joining or closing removes the invite from the URL.
- The existing authenticated `/join` endpoint remains authoritative for membership. No database or API changes are needed. A new derby must sync before others can join; joining requires a connection. Already-saved derbies can display their invite offline once the app's QR assets are cached.
- Profiles remain browser-specific. Opening a QR in a different browser can create a separate angler, as described in the existing profile screen.

## Camera and memory safeguards

Camera access only starts after **Scan QR code**. No audio is requested. Capture prefers the rear camera at 640×480, caps capture dimensions at 1280×720 and frame rate at 15, and reuses a 400×400 decode canvas. At most four non-overlapping decodes run per second.

The camera tracks, decode worker, timers and event listeners are released on recognition, cancellation, sheet close/unmount, page hide, backgrounding, errors and timeouts. Late camera permission grants are immediately stopped after cancellation. Returning from the background requires an explicit retry. Startup has a 20-second deadline; idle scanning stops after 90 seconds. No camera frames are uploaded or saved.

QR generation and decoding are separate dynamic imports. The [qrcode.react API](https://github.com/zpao/qrcode.react) generates the SVG; [qr-scanner](https://github.com/nimiq/qr-scanner) provides native BarcodeDetector or a worker fallback. Dink Derby owns the camera lifecycle and bounded capture constraints instead of using the library's higher-resolution, multi-attempt camera setup.

## Verification

- `npm run test -w @dink-derby/client`: invite parsing, URL consumption, bounded decoding, native/worker no-code handling, resource cleanup, delayed permissions and timeouts.
- `cd apps/client && npx playwright test --config=playwright.local.config.ts --project=mobile-chromium`: 320/375/1280px layout, real generated QR pixels decoded from a video stream, native and worker decoder paths, first-run onboarding, explicit join, offline fallback, denied camera, cancel/reopen and late-permission cleanup.
- `E2E_BASE_URL=https://dinkderby.com npx playwright test --config=playwright.production.config.ts qr-join.spec.ts`: opt-in live test creates a dedicated QA derby, joins a non-admin participant via camera link, scans that participant's QR on a third browser, verifies authenticated server membership and reload persistence, then completes the QA derby.

Automated camera tests replace hardware with a canvas-backed MediaStream, not the QR decoder. Physical-device camera focus, glare, and real permission prompts still need an on-water phone check. Safari/WebKit is not verified by the Chromium suite.
