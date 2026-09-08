# Catch location enabled by default — September 8, 2026

## Deploy result

- **URL / target / status:** [dinkderby.com](https://dinkderby.com) / production / READY.
- **Commit:** `f8c2313` — catch location default-on, with per-draft opt-out persistence.
- **Deployment:** `dpl_BKa3wNarzyCPJJ4C599K2q82jPe2`, [immutable URL](https://dink-derby-6va9qxfct-oakley349-3454s-projects.vercel.app).
- **Framework:** React/Vite on Vercel, Node 24 build runtime. Build duration was not captured separately.
- **Main asset:** `index-41bf7af7.js`.
- **Scope:** client-only. No API deployment, Postgres migration or environment change. Released from a clean detached worktree; unrelated sync implementation/tests and in-progress resume-sync files were excluded.

## Behavior

New catches start with **Include my location** checked. Unchecking it persists with the draft across close/reopen and reload; the next new catch starts enabled. Legacy drafts with no stored choice use the new default. GPS is requested only on Save catch, still subject to browser permission and the existing five-second deadline. Denied, unavailable, invalid or timed-out locations do not prevent saving the catch. Coordinates remain shared only through the derby's existing authenticated catch sync. No continuous tracking was added, and the separate nearby-water suggestion button remains opt-in.

This supersedes the location-default descriptions in the earlier catch-map and UX release reports. Current behavior is documented in [catch-map.md](catch-map.md).

## Verification

**Story:** default-enabled catch form → one-shot GPS on save → local catch/outbox → shared derby sync → second angler's map and historical results.

- 76 client unit/component tests passed in the clean release checkout, including default selection, no GPS on form open, durable opt-out, legacy draft compatibility, and saving after GPS denial.
- Full workspace build passed; clean client release build passed. Existing build-tool audit advisories and bundle-size warning are unchanged.
- 17 local mobile-Chromium browser tests passed. Eight map/UX cases were also rerun from the clean checkout, covering 320/375/1280px, opt-out across page reload, coordinates, map persistence, and failure behavior.
- Live production cross-device map test passed using the untouched default-enabled checkbox. Dedicated `Map QA mtsq6e2x` derby verified location sharing, catch removal/restoration and historical map persistence; the QA derby was finished. No existing angler's derby was modified.
- Browser automation uses synthetic GPS and fixture map tiles. It does not establish physical-device GPS accuracy or field endurance. Safari was not retested for this small client change.

## Post-deploy observability and rollback

- Error scan: Vercel returned no client error-level logs in the checked 10-minute release window; custom-domain inspection resolved to the new READY deployment.
- Drains: not inspected or changed. No new continuous monitoring configured.
- Rollback target: previous client `dpl_2ahF3wzQh5pT8pfgGJnJjD5WA46B` ([previous URL](https://dink-derby-brq46o2fx-oakley349-3454s-projects.vercel.app)). No data rollback is needed; the added draft property is optional and non-indexed.
