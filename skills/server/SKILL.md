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
  index.ts          # Fastify app setup and routes
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
- `chat_messages` — future group chat

Key patterns:
- IDs are `text` (client-generated CUIDs)
- Timestamps use `timestamp` type with `defaultNow()`
- Foreign keys reference parent tables

## API Routes

### Core Endpoints

```
GET    /derbies              # List derbies
POST   /derbies              # Create derby
GET    /derbies/:id          # Get derby details
PATCH  /derbies/:id          # Update derby
POST   /derbies/:id/join     # Join a derby

GET    /derbies/:id/catches  # List catches
POST   /derbies/:id/catches  # Log a catch
PATCH  /catches/:id          # Update catch
DELETE /catches/:id          # Soft delete catch

POST   /sync                 # Offline sync endpoint
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
  clientId: string,
  lastSyncedAt?: string,      // ISO timestamp
  outbox: SyncOutboxItem[]    // Pending operations
}
```

### Response

```ts
{
  serverTime: string,
  appliedOperationIds: string[],  // Successfully processed
  patches: {
    users: User[],
    derbies: Derby[],
    derbyParticipants: DerbyParticipant[],
    catches: Catch[],
    chatMessages: ChatMessage[]
  }
}
```

### Processing Logic

1. For each outbox item, apply the operation (create/update/delete)
2. Use **last-write-wins** by `updatedAt` for conflicts
3. Return all entities modified since `lastSyncedAt`
4. Return list of successfully applied operation IDs

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
npx drizzle-kit generate

# Run migrations
npm run migrate
```

## Common Tasks

### Add a new entity

1. Add Zod schema to `packages/shared-types`
2. Add table to `src/db/schema.ts`
3. Generate and run migration
4. Add CRUD routes in `src/index.ts`
5. Update sync handler in `src/sync.ts`

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
PORT=3000
```

## Testing

- Tests in `test/server.test.ts`
- Use in-memory or test database
- Test both happy paths and error cases
