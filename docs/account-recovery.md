# Recoverable angler accounts

Implementation uses Supabase email codes, retaining the existing anonymous user's ID. Guest play remains available. No app database migration or browser table grants are needed.

Status (September 13, 2026): implementation complete behind a default-off flag. Manual linking is enabled with explicit approval; email confirmation and anonymous sign-ins remain enabled. Real **Supabase account-save and sign-in codes were delivered**, and the live two-origin test passed same-ID conversion, history restoration, invalid-code handling, cross-device sync, private-photo download, and reload persistence. The rotated SMTP key is working, but the chat-exposed predecessor remains active pending revocation approval. Intermittent API authentication failures observed during the test are under investigation. This feature is **not enabled or deployed to production**. Production remains the separately documented resume-sync release.

## Email setup checkpoint

- Use the user's existing Resend account (`oakley349`), not a duplicate Vercel Marketplace resource. No paid plan or billing change was made.
- Sending domain: `auth.dinkderby.com`, region `us-east-1`, Resend domain ID `d1d19b81-b95a-44a7-a78e-76a86957d5e9`. Resend reports **Verified** (September 11, 1:57 PM, dashboard time). Sending is selected; receiving is off.
- DNS is hosted by GoDaddy (`ns27.domaincontrol.com`, `ns28.domaincontrol.com`). The user completed automatic configuration. Authoritative DNS confirms TXT `resend._domainkey.auth` matches Resend's DKIM key and MX `send.auth` points to `feedback-smtp.us-east-1.amazonses.com` (priority 10). GoDaddy's managed SPF record includes `dc-fd741b8612._spfm.send.auth.dinkderby.com`, which resolves to `v=spf1 include:amazonses.com ~all`; do not replace it merely because it differs from the literal example.
- Resend **Enforced TLS** was saved and verified. Receiving servers without TLS will reject delivery rather than receive plaintext authentication codes. Tracking has not been configured.
- Credential handoff completed by the user. The Resend key list confirms `Dink Derby Supabase SMTP` exists with **Sending access** and currently reports **No activity**. The creation form was scoped to **auth.dinkderby.com**. No secret key was read or stored in the repository/frontend.
- September 13 credential-backup checkpoint: saved the owner-supplied Resend key in **Dink Derby Supabase SMTP**, an **API Credential** item in the user's **Private** 1Password vault. Its concealed `credential` field was read back and verified to match exactly, without displaying the value. The key was supplied in chat, so rotate it before enabling production recovery; the item includes this warning. This does not verify that the supplied key matches the one currently configured in Supabase. No Resend key was created or revoked, and Supabase SMTP was not changed. No secret was written to repository files, temporary files, environment variables, or command arguments.
- 1Password CLI save caveat: direct Node subprocess input was silently ignored by `op item edit`; a real shell pipeline recognized the JSON input in a non-mutating dry-run and then saved successfully. Always verify the stored value after an update. Pass secrets through hidden input and an in-memory JSON pipe, never field assignments in command arguments.
- The user designated **Resend Key** in the **Private** 1Password vault as the item to use going forward (Password category, concealed `password` field). An initial non-disclosing comparison found the old key. The owner subsequently reported rotating this item and completed the replacement-password handoff in Supabase; the dashboard confirmed the settings update. A later 1Password verification attempt timed out, so the current vault value has not been independently compared. Do not reuse the earlier backup. No key was revoked by the agent.
- September 13 live SMTP check: authenticated to `smtp.resend.com:465` using `resend` and that key over **TLS 1.3 with certificate verification**. Resend accepted one plainly labeled delivery-test email with SMTP **250**, and its Emails dashboard reported **Delivered** to the owner-approved mailbox. This tested Resend SMTP directly; it did **not** test a Supabase-generated OTP or account restoration. No SMTP settings or keys were changed/revoked by this check.
- September 13 availability check: management API reports `ACTIVE_HEALTHY`; `select 1` succeeds; Auth `/health` and `/settings` return **200**; the deployed Dink Derby API responds. The project dashboard displayed an inconsistent Unhealthy warning. No restart, schema change, or infrastructure upgrade was performed.
- Supabase custom SMTP is **enabled**, and the previously locked template editors are available. Visually verified the saved sender `no-reply@auth.dinkderby.com`, sender name `Dink Derby`, host `smtp.resend.com`, port `465`, username `resend`, and minimum interval `60` seconds on September 13. Sender/username values are visible in screenshots but omitted from the accessibility view. Following the user's replacement-password save, the real app's `updateUser({ email })` request succeeded and Resend reported the resulting email **Delivered** (message `73ef16a2-8043-4dce-91d4-cf9cee18f8ac`). This verifies Supabase's SMTP path, not only a direct Resend test.
- Saved and revisited the **Magic link or OTP** template: subject `Sign in to Dink Derby` and a body displaying `{{ .Token }}`. The **Change email address** body displays the code and account-save instructions. The first real email exposed a duplicated subject; replaced it with exactly `Save your Dink Derby account`, visually checked it, and saved. Accessibility and DOM form-value reads can omit existing text: use select-all/paste and a screenshot for exact subject edits. A transient template-validation fetch error previously cleared on retry.
- Changed the Site URL from `http://localhost:3000` to `https://dinkderby.com` and saved. The redirect allowlist is empty; no wildcard/preview redirects were added.
- Email provider, email confirmation, secure email change, and anonymous sign-ins remain enabled. Email OTPs are **8 digits**, expiring in **3600 seconds**. Existing rate limits were left unchanged (the email-send quota was not readable in the automation view).
- **Allow manual linking is enabled** with explicit owner approval. Reload verification showed linking, email confirmation, anonymous sign-ins, and new-user signups all still enabled. No provider, database grants, or production feature flag were changed.

## Live recovery verification

- Isolated local origin: `http://127.0.0.1:5177/`, with account recovery enabled only in the dev process. Its loopback-only `/__live-api` proxy targets the deployed API; the real Supabase project handles auth directly. Production CORS rejects localhost origins, so the development proxy makes server-side API requests while forwarding the normal bearer authorization. No production CORS allowlist or authorization check was weakened. This is not a deployed release.
- Created a synthetic angler, **Recovery Test Sept 13**, and completed **Recovery verification — Sept 13**, with a 2.5 lb test catch, best-three weight scoring, and a clearly labeled test chat message. Location was excluded and no photo was added. API `/sync` requests returned 200; the UI displayed synced completed results and the 2.50 lb biggest fish.
- Read-only database verification established the pre-link baseline: angler `64fd3e1a-5e30-4fa9-b9bd-123e4beb7e4d` is anonymous/unconfirmed; derby `489f02fa-8386-4dfb-af9d-532f417f6704` is finished with `best_n = 3`; catch `7572c66d-c40f-4c5b-ae4f-12e0ffe35a7f` weighs 2.5 lb.
- Verified the owner-supplied account-save code through the app. The UI displayed **Account saved**; a read-only database check confirmed the original angler ID is unchanged, `is_anonymous = false`, and email is confirmed. The completed derby and 2.5 lb catch remained intact.
- Opened `http://localhost:5177/` as a fresh origin with separate browser storage. It started with a different anonymous angler and no derbies. **Sign in to saved account** sent a real OTP (Resend message `a4049a11-1f65-4444-88ef-32ef2300ec49`, **Delivered**, correct `Sign in to Dink Derby` subject). One deliberately invalid code was rejected without switching the guest. The owner-supplied valid code restored **Recovery Test Sept 13**, the completed derby, organizer controls, best-three scoring, and 2.50 lb biggest fish. Reload retained the saved account.
- Created a second synthetic derby after linking: **Recovery photo and sync test** (`04f913e4-3ec1-4cd0-b1a4-762f2fb8a244`). Added a 1.25 lb test catch using the repository's public 192px app logo as a non-personal photo fixture, with location excluded. Upload authorization and completion returned 200; the restored session downloaded the private image (200, decoded 192×192). The recovered session sent a chat message and finished this derby; the original session received completion. Both test derbies are now finished. Database verification shows the same confirmed angler on two registered devices and private-photo metadata on the second catch.
- The corrected account-save subject persisted after reload. Both OTP templates now have verified, non-duplicated subjects. No code, bearer token, or API secret was written to the repository.
- The client build and all 154 tests were rerun successfully. Live checks do not replace the physical-phone/on-water test. Expired/reused/throttled codes, offline/draft protection, and wrong-account merge prevention still rely on existing automated coverage rather than this live run.
- Follow-up before release: resolve intermittent API 401 responses observed amid successful sync/media requests. The API currently converts every Supabase `getUser` failure into 401, hiding whether the upstream problem was temporary. Vercel runtime-log connector returned 403 (not an empty log result); Supabase dashboard log investigation is in progress. The automatic optional fish-identification call returned 503, while catch saving/photo sync succeeded.
- Resend's key list confirms the replacement is in use and the superseded chat-exposed **Onboarding** key (`5aabb950-1ede-4404-8d28-55442c72c2e3`) still exists. Revocation approval requested; no keys have been deleted. Keep the production recovery flag off until remaining release checks are resolved.

## Verification completed

- Client build and 154 unit/component tests pass, including same-ID linking, invalid codes, failed restore, draft/history protection, restored catch weights/private photo metadata, device-only outbox, and token/local-account agreement.
- Two mobile Chromium account browser tests pass using mocked Supabase/email/API responses: save-in-place with invalid-code recovery, and restored history/results in a separate database, retained guest cache, cross-tab account change, and reload persistence. No page errors in these account flows. These tests do **not** prove actual SMTP delivery or live Supabase email configuration.
- Twelve mobile Chromium regression tests pass covering existing scoring, completion/history, installation, and controls at multiple widths. Resume regression also passes locally; the earlier resume-only release was independently tested on production.
- Account controls were visually checked at mobile size. Account modules are lazy-loaded; auth/private network responses no longer use the shared service-worker runtime cache. The account feature adds no telemetry SDK.

## User flow

1. Profile → **Save my account** → enter email → enter emailed code in the same browser/PWA.
2. On a new phone/browser: Profile → **Sign in to saved account** → same email → emailed code.
3. The app restores the angler's synced profile, memberships (including former membership history), derbies, catches, messages, reactions, and private-photo metadata. Photos are downloaded through the existing authorized API as needed.

Only synced data can be restored to another device. Unsynced catches, photo bytes, and drafts remain on their original device. Do not clear browser data before syncing and saving the account.

Existing guest IDs are linked, not replaced. Sign-in is verified in an isolated in-memory auth client. Restoring another account uses a separate IndexedDB and never uploads the current guest's outbox. The first browser's existing database stays intact. If that browser already has a different angler's derby data, switching is blocked rather than silently merging or abandoning it. Use another browser or save the existing guest account first. Account merging, sign-out/account-picker UX, and email-address changes are not part of this release.

## Production gate

Keep `VITE_ACCOUNT_RECOVERY_ENABLED=false` (or absent) until all checks below pass. This flag controls discoverability, not authorization; Supabase and the API enforce access.

- Configure custom SMTP with a verified sender for dinkderby.com. Supabase's default SMTP only delivers to project-team addresses and is not suitable for real users. Do not disable email confirmation to work around this. [SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
- Rotate the chat-exposed Resend key, save the replacement in **Resend Key**, update Supabase SMTP and verify delivery before revoking the superseded key. Never put the replacement in chat, repository files, or command arguments.
- Enable email auth and manual identity linking. Keep anonymous sign-ins enabled. [Anonymous conversion guide](https://supabase.com/docs/guides/auth/auth-anonymous)
- Set the Site URL to `https://dinkderby.com`; review redirect allowlist. The app uses typed codes and deliberately ignores URL-delivered sessions.
- Configure **Magic Link** and **Change Email Address** templates to show `{{ .Token }}`. Do not require users to click a link that could open a different browser. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [OTP guide](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- Verify email-confirmation policy, code expiration, and rate limits. Test missing, invalid, expired, reused, and throttled codes.
- On a synthetic test angler with history, verify email linking leaves its ID unchanged and a second browser restores that same ID, scoring, memberships, and photos. Verify first device still syncs.
- Verify a wrong-account attempt with existing local catches is blocked, and offline/draft data survives.
- Enable the flag in Vercel only after real delivery and recovery work; rebuild and deploy. No email or token belongs in a committed env file.

## Suggested email template

Use the appropriate subject (“Save your Dink Derby account” or “Sign in to Dink Derby”) and this body in the corresponding template:

```html
<h2>Your Dink Derby code</h2>
<p>Enter this code in the Dink Derby app:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request this code, ignore this email. Do not share it.</p>
```
