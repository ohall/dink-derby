# Angler removal release — September 8, 2026

## Deploy result

- URL: https://dinkderby.com (API: https://api.dinkderby.com)
- Target: production
- Status: READY; both deployments promoted after smoke checks
- Commits: `f509b4a` (feature), `cc84ebc` (database access protection), pushed to `main`
- Framework: React/Vite client; Fastify API; Node 24.x on Vercel
- Build duration: client 22 seconds; API 29 seconds
- Client: `dpl_AxrqDSw1NDuzJS5qzFv1kwbBWWfX`, https://dink-derby-n5k6hitdr-oakley349-3454s-projects.vercel.app
- API: `dpl_5tH7eW34LWYASxwWanTWktVozr2G`, https://dink-derby-hv0304sb4-oakley349-3454s-projects.vercel.app
- Public client asset: `index-13835d6d.js`

Released from a clean detached worktree at `cc84ebc`; the unrelated uncommitted visibility/resume-sync work was preserved and excluded.

## Database

Verified the six installed migration hashes against the repository, then applied generated migrations `0006_participant_removal` and `0007_api_only_app_tables` to Supabase project `ransmkddelledmnucwki` using a verified session-pooler connection. Membership row count was unchanged. Verified RLS on all ten app tables and no table privileges for `anon` or `authenticated`. The production API still accesses these tables using its authorized server connection.

The direct Supabase REST endpoint returned a pre-existing schema-cache 503 during the preflight probe; no app flow depends on that endpoint. Database permissions were verified directly instead of treating the 503 as access protection. Supabase Auth and Storage were not changed.

## Verification

- Clean install and full workspace production build passed.
- Clean-release tests: 119 client, 32 server (including real PostgreSQL integration), 3 shared-schema tests passed.
- Local mobile Chromium regression suite: 24 passed; 3 explicitly live-only tests skipped.
- New two-browser removal flow passed locally before and after RLS protection, then on production from the clean release checkout.
- Live QA derby `Removal QA mtt3c2fd` was created with two synthetic identities, exercised creator-only controls/cancel/confirmation, scoring and preserved history, offline reconnect/reload, blocked rejoin, and was marked completed. No existing user's membership was changed.
- Confirmation visually checked at mobile widths; automated layout checks covered 320, 375, and 1280px. This was Chromium emulation, not a physical iPhone/Safari run.
- Production API health passed; unauthenticated removal returned 401; public client asset matches the release.
- Production dependency audit: zero vulnerabilities. Existing development/build-tool advisories and the existing main-bundle size warning remain outside this feature.

## Post-deploy observability

- Error scan: no error-level logs returned for either Vercel project over the 10-minute post-release window, including the live test.
- Drains: none configured in the Vercel team; external log retention/alerting remains a monitoring gap.
- Supabase security advisors: no errors; existing leaked-password-protection warning remains. The current app uses anonymous profiles, not password sign-in.
- Monitoring: one-time release checks completed; no new monitoring services or alerts configured.

See [angler-removal.md](angler-removal.md) for the user flow, security model, offline behavior, and profile-level ban limitations.
