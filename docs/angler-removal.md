# Remove an angler

The original derby creator opens **Manage anglers**, chooses **Remove** beside an angler, and confirms in the confirmation window. **Keep angler** cancels and receives default focus. Other participants can view the roster but cannot remove anyone. The creator cannot remove themself.

Removal requires an online server confirmation; it is deliberately not an optimistic/offline write. The confirmation names the angler and derby and explains the effects:

- The removed profile loses future derby access and cannot rejoin with an invite code or QR code.
- Existing catches and messages remain in history. The angler's catches no longer count toward standings or biggest fish.
- An offline phone learns about removal when it reconnects. Previously downloaded content and unexpired signed photo URLs cannot be recalled.
- There is no readmission control. This is a profile-level restriction, not a person-wide ban: anonymous users can obtain a different identity in a new browser profile.

## Implementation

`POST /derbies/:derbyId/anglers/:userId/remove` authenticates the caller and checks the derby's original `createdByUserId`, not a client-provided admin flag. A short transaction locks the membership, sets `removed_at`, and records one removal event. Repeated requests return the same result. Generic sync operations cannot update/delete memberships or overwrite a removal.

Sync excludes removed memberships from data visibility and rejects new activity. Photo upload, completion, download, and fish identification also require active membership. Sync returns `removedDerbyIds`; the client persists these IDs, hides the derby, blocks its controls, and cancels now-ineligible outbox submissions without deleting original catch/draft records. Removed membership patches are monotonic so a stale response cannot undo them.

Database migration: `apps/server/drizzle/0006_participant_removal.sql`. Apply this additive migration before releasing the API, then release the client. Older clients remain server-restricted but may display cached data until updated.

## Verification

- Client component tests: creator-only controls, safe cancellation, success, offline/error handling.
- Domain/data tests: scoring exclusion, preserved history, scoped outbox cancellation, monotonic removal.
- PostgreSQL integration tests: authentication, creator/self/admin/other-derby boundaries, idempotency, generic sync bypass prevention, blocked rejoin/activity/photo access, scoped snapshots.
- `playwright.removal.config.ts`: two real browser identities against the API/database, removal and cancellation, reconnect/reload, history/scoring, blocked rejoin, and 320/375/1280px layouts. Defaults to a disposable local database; set `E2E_BASE_URL` for an explicitly authorized live QA run.
