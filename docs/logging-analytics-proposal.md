# Logging and analytics proposal

Status: proposal only; no SDK, account, drain, or collection enabled. Checked September 11, 2026.

## Recommendation: PostHog Cloud, free plan

Use one tool for explicit product events, browser/API error tracking, and structured API logs. Current monthly allowances are **1 million analytics events**, **100,000 exceptions**, and **10 GB log ingestion**, with unlimited team members and one project. No card is required; the no-card plan stops at the free limits. [Official pricing](https://posthog.com/pricing)

PostHog accepts OpenTelemetry logs directly, including from Node.js. Its logs guide specifies 14-day default log retention; do not assume the pricing page's general retention statement applies to logs. [Logs setup and retention](https://posthog.com/docs/logs/start-here)

For Dink Derby, direct application log export would avoid depending on a paid Vercel drain. Keep existing Fastify/Vercel logs as the fallback. Vercel drains require Pro or Enterprise. [Vercel drain availability](https://vercel.com/docs/drains)

## Proposed scope

- Errors: failed sync, rejected operations, photo preparation/upload failure, auth/recovery failure, uncaught browser exceptions. Group by release, route template, browser family, and installed-PWA status.
- Analytics: derby created/joined/completed, catch saved, catch upload succeeded, history opened, install instructions opened, install completed, account saved/recovered.
- Logs: API request ID, route template, status, latency, release, coarse operation counts, and a redacted error category. Export warnings/errors first; sample successful requests.
- Dashboard: catch-save success, sync recovery after resume, upload failure rate, and account-recovery completion.
- Alerts: sustained API failure spikes and repeated sync/photo failures. Test alert delivery before relying on it.

## Guardrails before enabling

- **No session replay, autocapture, input/DOM capture, console capture, heatmaps, or automatic person profiles.** Especially important with children and catch locations.
- No names, emails, precise/coarse location, water names, photos, chat, invite codes, authorization headers, OTPs, request bodies, or raw URLs/query strings. Explicit property allowlist; redact errors before sending. Disable IP-based geolocation enrichment and review vendor retention/deletion controls.
- Use short-lived random diagnostic IDs, not angler IDs. Owner approval and an appropriate privacy notice before collection; review the intended use with children before rollout. This is a technical proposal, not a legal compliance assessment.
- Load telemetry after the app is interactive. Bounded batches, short timeouts, and a small capped queue; drop telemetry when offline instead of competing with catch storage. Telemetry failures must never block catches or sync.
- A browser killed for out-of-memory may never emit an exception. Interrupted-session signals are only clues, not proof; physical-phone testing remains essential.
- Keep the account without a payment card and set an internal monthly usage alert. Review real usage after the first field test.
- Verify source maps are uploaded privately, not publicly served. Measure JS size and memory before/after installation. Test redaction and offline behavior.

## Decision needed

Approve PostHog and the data-minimal scope above. Then create the free project, configure environment-specific ingestion, implement instrumentation, and verify that real failures reach the dashboard without private data. Do not install or enable it merely because this proposal exists.
