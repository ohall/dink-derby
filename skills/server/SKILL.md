---
name: server
description: Fastify API server with Drizzle ORM and PostgreSQL. Use when building API routes, database operations, or the sync endpoint in apps/server/.
---

# Server Development

## Tech Stack

- **Runtime**: Node.js (LTS)
- **Framework**: Fastify
- **ORM**: Drizzle
- **Database**: PostgreSQL
- **Validation**: Zod (via `@dink-derby/shared-types`)

## Project Structure

```
src/
  auth.ts           # Supabase bearer-token verification
  index.ts          # Fastify app setup and routes
  storage.ts        # Private Supabase Storage signed URLs
  sync.ts           # Sync endpoint handler
  db/
    index.ts        # Drizzle client
    schema.ts       # Table definitions
    migrate.ts      # Migration runner
drizzle/
  *.sql             # Generated migrations
```

## Database Schema

Tables defined in `src/db/schema.ts`:

- `users` — anglers
- `derbies` — competitions
- `derby_participants` — who's in each derby
- `catches` — fish caught (soft delete via `deletedAt`)
- `chat_messages` — group chat
- `reactions` — reactions to catches and messages
- `media` — locally captured catch-photo metadata
- `processed_operations` — idempotency records for sync retries
- `derby_events` — ordered event stream for reconciliation

Key patterns:
- IDs are client-generated UUIDs stored as `text`
- Timestamps use `timestamp` type with `defaultNow()`
- Foreign keys reference parent tables

## API Routes

### Core Endpoints

```
GET    /                     # Health check
POST   /sync                 # Offline sync endpoint
POST   /join                 # Join by invite code and return a scoped snapshot
POST   /media/upload-url     # Create a signed private photo upload URL
POST   /media/:id/complete   # Mark an uploaded photo ready
GET    /media/:id/download-url # Create a short-lived private download URL
```

### Route Pattern

```ts
fastify.post('/derbies', async (request, reply) => {
  const body = CreateDerbySchema.parse(request.body);
  const derby = await db.insert(derbies).values({ ...body }).returning();
  return derby[0];
});
```

## Sync Endpoint

The `/sync` endpoint handles offline-first reconciliation.

### Request

```ts
{
  userId: string,
  clientId: string,
  derbyId?: string,
  cursor?: string,
  lastSyncedAt?: string,      // ISO timestamp, retained for patches
  outbox: SyncOutboxItem[]    // Pending operations
}
```

### Response

```ts
{
  serverTime: string,
  appliedOperationIds: string[],  // Successfully processed
  rejected: Array<{ operationId: string, error: string }>,
  events: DerbyEvent[],
  nextCursor: string,
  patches: {
    users: User[],
    derbies: Derby[],
    derbyParticipants: DerbyParticipant[],
    catches: Catch[],
    chatMessages: ChatMessage[],
    reactions: Reaction[],
    media: Media[]
  }
}
```

### Processing Logic

1. For each outbox item, apply the operation (create/update/delete)
2. Record a processed operation so a retry is idempotent
3. Emit derby events and return entity patches
4. Return acknowledgements, rejections, and a next cursor

## Drizzle Patterns

### Queries

```ts
import { db } from './db';
import { derbies, catches } from './db/schema';
import { eq, gte } from 'drizzle-orm';

// Select
const derby = await db.select().from(derbies).where(eq(derbies.id, id));

// Insert
await db.insert(catches).values({ ...data });

// Update
await db.update(catches).set({ species: 'Bass' }).where(eq(catches.id, id));

// Soft delete
await db.update(catches).set({ deletedAt: new Date() }).where(eq(catches.id, id));
```

### Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Run migrations
npm run db:migrate
```

## Common Tasks

### Add a new entity

1. Add Zod schema to `packages/shared-types`
2. Add table to `src/db/schema.ts`
3. Generate and run migration
4. Update the sync handler in `src/sync.ts`

### Add a new route

1. Define request/response schemas (use Zod)
2. Add route in `src/index.ts`
3. Validate input with `.parse()`
4. Use Drizzle for DB operations
5. Return typed response

## Environment

Required env vars (see `.env.example`):

```
DATABASE_URL=postgres://...
SUPABASE_URL=https://project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

Use `DIRECT_DATABASE_URL` for migrations and the transaction pooler in `DATABASE_URL` for Vercel runtime connections. `PORT`, `HOST`, CORS, rate-limit, and bucket settings are optional outside production.

## Testing

- Unit tests in `test/server.test.ts`
- PostgreSQL integration coverage in `test/sync.integration.test.ts` when `TEST_DATABASE_URL` is set
- Test both happy paths, authorization boundaries, and error cases
