# Dink Derby

A fishing derby scoring app for friends arguing about whose tiny bass "definitely counted."

## Project Goals

- **Local-first**: Works in spotty-signal fishing holes. Sync when possible.
- **Simple UX**: Big buttons, minimal screens. Target user is squinting at 7% battery.
- **Scoring modes**: Length, weight, or fish count per derby.
- **Community**: In-app group chat and reactions for trash talk.

## Monorepo Structure

```
apps/
  client/     # React + Vite web client
  server/     # Fastify API server
packages/
  shared-types/   # Zod schemas (source of truth)
infra/
  ops/        # Docker, deploy scripts
```

## Key Conventions

- **Types**: Zod schemas in `packages/shared-types` are canonical. Import from `@dink-derby/shared-types`.
- **IDs**: Client-generated UUIDs.
- **Timestamps**: ISO 8601 UTC strings.
- **Offline**: All writes go to local IndexedDB first, then the sync outbox. The sync API returns acknowledgements, rejections, patches, and an event cursor.
- **Testing**: Unit tests required for non-trivial logic. Update tests with changes.
- **Commits**: Agents do not commit—humans only.

## Skills

Domain-specific instructions are in `skills/`:

- `skills/client/` — React, Dexie, UI patterns, local-first sync
- `skills/server/` — Fastify, Drizzle, API routes, sync endpoint

Load the relevant skill when working in that area.

## Quick Start

```bash
npm install
npm run dev          # runs both client and server

# or individually
cd apps/client && npm run dev
cd apps/server && npm run dev
```

## Tone

Campfire snark, but code stays clean and boring. Examples:
- "Add a fish"
- "Offline, but chill—we saved it."
