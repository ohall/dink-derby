# PWA installation

The home screen offers an **Install Dink Derby** reminder after onboarding and outside other dialogs. The header's labeled **Install app** button remains available in browser tabs even when the browser does not emit `beforeinstallprompt`.

- A native install event enables the browser's install dialog on a user click. Each event is consumed once; pending requests disable the button and failures open manual instructions.
- Otherwise the button opens iPhone/iPad, Android, or desktop browser instructions. This is not a promise that every browser supports installation.
- **Not now** hides the reminder for 30 days, not the header button. Legacy dismissal timestamps retain this reminder cooldown but no longer block manual installation or native event listeners.
- Closing instructions dismisses the reminder, while leaving the header button available.
- `appinstalled` and standalone display mode hide the installation controls. An ordinary browser tab cannot reliably detect every pre-existing installation.
- No API, database, manifest identity, authentication, or service-worker caching changes are needed for this UI fix.

## Browser constraints

Native automatic promotion is browser-controlled. Chrome can require engagement before firing the install event, and iOS uses its browser menu instead. The app cannot force the operating system to display or accept a native install dialog.

Some browsers keep installed apps' storage separate from browser tabs. Dink Derby still uses an anonymous angler identity; installing or switching browsers is not account migration. Check that the installed app has the expected profile/derbies. If it does not, return to the original browser and do not clear its data. Account linking/recovery remains separate work.

## Verification

- Hook tests: manual fallback, platform detection, legacy dismissal, native cancellation/failure, event consumption, installed-state races, standalone changes, blocked storage, and listener cleanup.
- `e2e/install.spec.ts`: 320px labeled/tappable controls, first-run reminder timing, dismissal/reload, iOS/Android instructions, simulated native install/failure, and standalone suppression.
- Native dialogs in these automated flows are simulated, not physical-device OS installations. Test a real Android Chrome/iPhone install before relying on it on the water.
- Use a production build or the public site to verify the manifest, icons, and service worker; ordinary Vite development mode does not enable the production PWA worker.

Sources checked September 8, 2026: [Chrome criteria](https://web.dev/articles/install-criteria), [Android Chrome installation](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid), [iPhone installation](https://support.apple.com/en-au/guide/iphone/iphea86e5236/ios), [Safari web apps on Mac](https://support.apple.com/en-us/104996), [one-use native prompt](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent/prompt).
