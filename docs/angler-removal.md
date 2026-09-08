# Remove an angler

The original derby creator opens **Manage anglers**, chooses **Remove** beside an angler, and confirms in the confirmation window. **Keep angler** cancels and receives default focus. Other participants can view the roster but cannot remove anyone. The creator cannot remove themself.

Removal requires an online server confirmation; it is deliberately not an optimistic/offline write. The confirmation names the angler and derby and explains the effects:

- The removed profile keeps read-only history for this derby under **Past derbies**, including results, catches, photos, map, and chat history. Removal ends participation, not history access.
- The profile cannot add/edit/restore catches, post messages or reactions, upload photos, invite through the UI, or rejoin with an invite code or QR code.
- Existing catches and messages remain in history. The angler's catches no longer count toward standings or biggest fish.
- An offline phone learns about removal when it reconnects. Previously downloaded content and unexpired signed photo URLs cannot be recalled.
- There is no readmission control. This is a profile-level restriction, not a person-wide ban: anonymous users can obtain a different identity in a new browser profile.

## Implementation

`POST /derbies/:derbyId/anglers/:userId/remove` authenticates the caller and checks the derby's original `createdByUserId`, not a client-provided admin flag. A short transaction locks the membership, sets `removed_at`, and records one removal event. Repeated requests return the same result. Generic sync operations cannot update/delete memberships or overwrite a removal.

Sync retains read access for every membership, including removed memberships, and rejects new activity from removed profiles. Photo upload, completion, and fish identification require active membership; photo downloads require any past or present membership. Nonparticipants still cannot read a derby or its photos. Sync returns `removedDerbyIds`; the client persists these IDs, moves the derby into personal history, blocks participation controls, and cancels now-ineligible outbox submissions without deleting original catch/draft records. Historical drafts no longer auto-open. Removed membership patches are monotonic so a stale response cannot undo them.

History is server-backed and can be restored after the derby cache is cleared, as long as the angler retains the same identity. Anonymous profiles are still device/browser identities; account recovery or linking identities across phones is not provided by this change. The history view follows the shared derby record (including eventual completion and late synced results), not a frozen removal-time snapshot. A derby still in progress is clearly labeled and is not falsely marked completed when one angler is removed.

Database migration: `apps/server/drizzle/0006_participant_removal.sql`. Apply this additive migration before releasing the API, then release the client. Older clients remain server-restricted but may display cached data until updated.

Migration `0007_api_only_app_tables.sql` closes a pre-existing direct database bypass: all ten app tables enable RLS with no browser policies and revoke `PUBLIC`, `anon`, and `authenticated` privileges (including TRUNCATE and the event sequence). The Fastify table-owner connection remains authorized. Supabase Auth and private Storage are unchanged. These tables deliberately do not offer a direct Data API; future app tables must also enable RLS and restrict grants.

## Verification

- Client component tests: creator-only controls, safe cancellation, success, offline/error handling.
- Domain/data tests: scoring exclusion, preserved history, scoped outbox cancellation, monotonic removal.
- PostgreSQL integration tests: authentication, creator/self/admin/other-derby boundaries, idempotency, generic sync bypass prevention, blocked rejoin/writes/uploads, permitted historical snapshots/photo downloads, and blocked outsider access.
- `playwright.removal.config.ts`: two real browser identities against the API/database, removal and cancellation, reconnect/reload, history/scoring, blocked rejoin, and 320/375/1280px layouts. Defaults to a disposable local database; set `E2E_BASE_URL` for an explicitly authorized live QA run.
