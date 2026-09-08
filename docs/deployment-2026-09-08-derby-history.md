# Every angler's derby history — September 8, 2026

## Deploy result

- URL: https://dinkderby.com (API: https://api.dinkderby.com)
- Target: production
- Status: READY, API promoted before client
- Commit: `fd47891`, pushed to `main`; clean detached release checkout excludes the unrelated visibility/resume-sync edits
- Framework: React/Vite client, Fastify API, Node 24.x on Vercel
- Build duration: client 31 seconds; API 28 seconds
- Client deployment: `dpl_HnUUYW7AwGb3mMtsQHJwdG5PRPVi`, https://dink-derby-3l11tqr0i-oakley349-3454s-projects.vercel.app
- API deployment: `dpl_9Jm23XE7EME3Ki6c35gsWt1fnVwo`, https://dink-derby-bm193b4t0-oakley349-3454s-projects.vercel.app
- Public client asset: `index-cf039ceb.js`

The API deploy command reported a transport-level `fetch failed`; inspecting that exact deployment showed READY and its health check passed. It was promoted without creating a duplicate deployment. No database migration or permissions change was required.

## Behavior

Removal ends participation, not access to personal derby history. Every past or present participant retains server-backed read access to derby results, catches, photo downloads, map, and chat history. Former participants' derbies appear under **Past derbies**, even if the derby is still running for others. The UI distinguishes **Participation ended** from a completed derby and shows the angler's catch count.

Former participants cannot add/edit/restore catches, post messages/reactions, upload photos, identify fish, or rejoin. Outsiders cannot read derby data or photos. Existing RLS and API-only table permissions remain unchanged. The confirmation now explicitly states that history is retained. Historical catch drafts remain saved but do not reopen automatically.

History follows the shared derby record, including completion and subsequent offline-sync results; it is not frozen at removal. The same profile must be retained: losing anonymous authentication credentials is different from clearing cached derby data. Profile recovery/linking across devices is not included.

## Verification

- Clean install, full production build, 123 client tests, 32 server tests (with real local PostgreSQL), and 3 shared-schema tests passed.
- 24 mobile Chromium regression tests passed; 3 explicitly live-only scenarios were skipped in the local regression config.
- The updated two-browser history flow passed locally: removal/cancellation, read-only controls, reload, server restoration after clearing derby caches while keeping identity, mapped catch preservation, personal history grouping, final results after completion, and rejected rejoining.
- The same flow passed on production from the clean checkout in 23.3 seconds. Synthetic derby `History QA mtt40w82` was created, tested, and marked completed; no existing angler's membership was changed.
- Server tests verify historical photo-download authorization using a stubbed signer, while uploads and outsider downloads remain denied.
- 320/375/1280px layout checks passed; the 320px history card was visually inspected. Browser checks used Chromium emulation, not physical mobile Safari.
- Public asset and API health match the new deployments. Production dependency audit: zero vulnerabilities; pre-existing development/build-tool advisories and the main-bundle warning remain.

## Post-deploy observability

- Error scan: no error-level logs returned for either Vercel project in the 10-minute release window; the live browser flow reported no page errors.
- Drains: none configured; external log retention/alerting remains a gap. No new monitoring service was installed.

See [angler-removal.md](angler-removal.md) for the current access model; this history policy supersedes the earlier release's all-access removal behavior.
