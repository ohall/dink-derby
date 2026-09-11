# Dink Derby TODO

## Current work

- [ ] Release and verify resume-triggered sync when returning from the camera or another app.
- [ ] Add recoverable accounts and cross-device sign-in, preserving existing angler IDs and history.
- [ ] Decide on logging/analytics after reviewing a free-tier proposal. Do not enable collection before approval.

## Field testing — Oakley and the kids

- [ ] Oakley will arrange the next test and report back; no date scheduled here.
- [ ] Check Android Chrome, iPhone Safari, and installed PWA behavior with camera switching, repeated photos, lock/unlock, poor signal, offline catches, and reconnection.
- [ ] Confirm both phones show the same catches, standings, final results, and history.

## Release hardening — backlog, not part of the current implementation

- [ ] Expand CI beyond Chromium to WebKit; cover production-build PWA/offline reload and account recovery.
- [ ] Verify the existing GitHub CI pipeline passes and make required checks gate releases.
- [ ] Upgrade vulnerable development/build dependencies in small tested batches; preserve the lockfile and review audit findings.
- [ ] Reduce the main client bundle and measure memory on a physical low-memory phone.
- [ ] Verify database backup coverage, retention, and restore procedure using an isolated recovery target.
- [ ] Verify private catch-photo backup/recovery separately from the database; document the complete restore procedure.
- [ ] Document a repeatable clean-commit deployment, smoke-test, and rollback checklist.

## Later product decisions

- [ ] Creator rule corrections and safe reopening of accidentally finished derbies.
- [ ] Clear presentation of completed results that can still receive pre-cutoff offline catches.
- [ ] Exportable derby history/results.
- [ ] Reconcile old documentation with current location defaults and the actual offline limitations.
