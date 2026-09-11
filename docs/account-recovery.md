# Recoverable angler accounts

Implementation uses Supabase email codes, retaining the existing anonymous user's ID. Guest play remains available. No app database migration or browser table grants are needed.

Status (September 11, 2026): implementation complete behind a default-off flag. Resend's sending domain and DNS are verified; Supabase SMTP credentials, auth configuration, and live email testing remain incomplete. This feature is **not enabled or deployed to production**. Production remains the separately documented resume-sync release.

## Email setup checkpoint

- Use the user's existing Resend account (`oakley349`), not a duplicate Vercel Marketplace resource. No paid plan or billing change was made.
- Sending domain: `auth.dinkderby.com`, region `us-east-1`, Resend domain ID `d1d19b81-b95a-44a7-a78e-76a86957d5e9`. Resend reports **Verified** (September 11, 1:57 PM, dashboard time). Sending is selected; receiving is off.
- DNS is hosted by GoDaddy (`ns27.domaincontrol.com`, `ns28.domaincontrol.com`). The user completed automatic configuration. Authoritative DNS confirms TXT `resend._domainkey.auth` matches Resend's DKIM key and MX `send.auth` points to `feedback-smtp.us-east-1.amazonses.com` (priority 10). GoDaddy's managed SPF record includes `dc-fd741b8612._spfm.send.auth.dinkderby.com`, which resolves to `v=spf1 include:amazonses.com ~all`; do not replace it merely because it differs from the literal example.
- Resend **Enforced TLS** was saved and verified. Receiving servers without TLS will reject delivery rather than receive plaintext authentication codes. Tracking has not been configured.
- Credential handoff: the [Resend API-key form](https://resend.com/api-keys?new=true) is prepared with name `Dink Derby Supabase SMTP`, permission **Sending access**, and domain **auth.dinkderby.com**. The user must create the key and paste it directly into Supabase; no key has been created by the agent or stored in the repository/frontend.
- Supabase SMTP remains an **unsaved draft**. Use sender `no-reply@auth.dinkderby.com`, sender name `Dink Derby`, host `smtp.resend.com`, port `465`, username `resend`, password equal to the Resend key, and minimum interval `60` seconds. Sender name and host were retained in the draft; sender email and username must be entered by the user because those fields did not retain automated input. The user must finish credential entry and save.
- Next: verify saved SMTP settings, configure code templates and manual linking, then test real delivery and recovery before enabling the production feature flag. DNS verification alone does not establish that auth email works.

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
