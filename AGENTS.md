# Dink Derby – `AGENTS.md`

A field guide for humans and bots hacking on the dumbest, greatest fishing scorekeeper on the internet.

---

## 1. What this repo is

Dink Derby is a **fishing derby scoring app** for a group of friends sitting in boats (or on a dock) arguing about whose tiny bass “definitely counted.”

Core goals:

- Simple enough for your most offline buddy to use.
- Works in spotty-signal fishing holes (local-first, sync when possible).
- Tracks derbies by:
  - **Length**
  - **Weight**
  - **Count** (number of fish)
- Future: **group chat** per derby so people can trash-talk in-app instead of blowing up the group text.

This monorepo has:

- A **web client** (initial POC).
- A **Node.js server** API.
- Shared types and utilities to make agentic/dev work easy.

Tone: informal, snarky, campfire vibes, but the code should be clean and boring.

---

## 2. Monorepo layout

Expected layout:

```text
.
├─ apps/
│  ├─ client/        # Web client (React/Vite)
│  └─ server/        # API server (Node + Fastify)
├─ packages/
│  ├─ shared-types/  # Zod schemas, TypeScript types, enums, DTOs
│  ├─ shared-utils/  # Cross-cutting helpers (ids, dates, sync, etc.)
│  └─ shared-config/ # ESLint, TS config, Prettier, etc.
└─ infra/
   ├─ db/            # Migrations, seed scripts
   └─ ops/           # Docker, deploy scripts, env templates
```

Agents and humans should **prefer adding new logic under `packages/`** when it’s shared between client and server.

---

## 3. Tech stack decisions

### 3.1 Client (web, later mobile)

**Language:** TypeScript

**Recommended stack:**

- **Framework:** React + Vite
  - Low ceremony, fast dev server, easy for AI tools to scaffold.
- **Routing:** TanStack Router or React Router
- **Data fetching / cache:** TanStack Query
  - Great for “local cache first, sync later” patterns.
- **Local-first storage:** Dexie (IndexedDB wrapper)
  - Stores:
    - User profile
    - Derbies
    - Catches
    - Pending sync actions (outbox)
    - Later: Chat messages
- **UI:** Headless + simple component lib
  - Use something minimal (e.g., Radix primitives + a tiny design system) instead of a huge UI kit.
  - Big buttons, high contrast, readable in bright sun.

---

### 3.2 Server

**Language:** TypeScript

**Recommended stack:**

- **Runtime:** Node.js (LTS)
- **Web framework:** **Fastify**
  - Faster, more structured than bare Express.
  - Great with schema-driven routes and OpenAPI generation.
- **Validation / types:** Zod or TypeBox
- **API style:**
  - REST-ish JSON endpoints (for simplicity), plus
  - A single **sync endpoint** for offline clients (see local-first section).
- **ORM / query builder:** Drizzle ORM
  - Good DX, typed queries, simple migration story.
- **Auth:** Start simple:
  - Anonymous user with per-device ID + optional display name.
  - Later: add proper auth (phone/email/social).


---

## 4. Data model

This is the starting point. Add fields carefully; evolve via migrations.

### 4.1 Core entities

#### `User`

Represents an angler, usually a friend in the group.

```ts
User {
  id: string;           // cuid/uuid
  displayName: string;  // "Oakley", "Trout Daddy"
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### `Derby`

Represents a single competition session.

```ts
Derby {
  id: string;
  name: string;                // "Memorial Day Dink Fest"
  bodyOfWaterName: string;     // "Rock Pond", user-entered
  scoringMode: 'length' | 'weight' | 'count';
  scoringUnit?: 'in' | 'cm' | 'lb' | 'kg'; // if applicable
  createdByUserId: string;
  startsAt?: string;           // optional scheduling
  endsAt?: string;             // optional scheduling
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
```

#### `DerbyParticipant`

Who’s in a derby and their role.

```ts
DerbyParticipant {
  id: string;
  derbyId: string;
  userId: string;
  nickname?: string;      // per-derby fun names
  isAdmin: boolean;       // can edit derby settings
  createdAt: string;
}
```

#### `Catch`

One fish, one argument.

```ts
Catch {
  id: string;
  derbyId: string;
  userId: string;               // angler
  species?: string;             // free text ("Largemouth", "Bluegill")
  lengthInInches?: number;      // only for length mode
  weightInPounds?: number;      // only for weight mode
  count: number;                // usually 1, but keep flexible
  photoUrl?: string;            // optional photo proof
  caughtAt: string;             // ISO
  createdAt: string;
  updatedAt: string;

  // Local-first metadata
  clientId: string;             // which device created this
  isPendingSync: boolean;       // local only; not stored on server
  deletedAt?: string;           // soft delete
}
```

#### `ChatMessage` (future-friendly)

```ts
ChatMessage {
  id: string;
  derbyId: string;
  userId: string;
  text: string;
  sentAt: string;
  createdAt: string;
  updatedAt: string;

  // Local-first
  clientId: string;
  isPendingSync: boolean;
}
```

#### `Device`

Local device identity, not necessarily a fully “logged in” user.

```ts
Device {
  id: string;                // random ID stored locally
  userId?: string;           // optional link if authenticated
  createdAt: string;
}
```

---

## 5. Database implementation

### 5.1 Server-side DB

Goal: simple, durable, portable, easy for agents to reason about.

Recommended:

- **Primary DB:** Postgres (or any Postgres-compatible managed service)
- **Data access:** Drizzle ORM

Reasoning:

- SQL is plenty for derby + chat.
- Postgres handles future features gracefully:
  - Chat (ordered by time)
  - Metadata / analytics (e.g., “who actually wins most often”)
  - JSON fields if we want to store weird one-off data.

Tables roughly:

- `users`
- `derbies`
- `derby_participants`
- `catches`
- `chat_messages`
- `devices`

### 5.2 Client-side DB (local-first)

For the web client:

- **Storage:** IndexedDB via Dexie
- **Pattern:** Local DB is always used for reads; server sync is best-effort.

Local DB tables (mirrors server + extras):

- `users`
- `derbies`
- `derbyParticipants`
- `catches`
- `chatMessages`
- `syncOutbox` (local-only)

**`syncOutbox` entry shape:**

```ts
SyncOutboxItem {
  id: string;
  entityType: 'user' | 'derby' | 'derbyParticipant' | 'catch' | 'chatMessage';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;         // snapshot for server
  createdAt: string;
}
```

---

## 6. Local-first + sync strategy

Basic loop:

1. **Create/update/delete locally first.**
   - Write to Dexie.
   - Push a `SyncOutboxItem`.
2. **UI always reads from local DB.**
   - App works even with no network.
3. **Background sync job** (on focus, timer, or user tap “Sync now”):
   - POST `/sync` with:
     - `outbox` (unsynced operations)
     - `lastSyncedAt`
   - Server processes operations, resolves conflicts, and returns:
     - `appliedOperationIds` (so client can mark them as synced)
     - `patches` (new/updated entities from other devices/users)
4. **Conflict strategy (simple version):**
   - For now: **last-write-wins** by `updatedAt` timestamp.

---

## 7. UX rules (non-negotiable)

Target user: the guy whose phone is at 7% and brightness maxed, squinting over polarized sunglasses.

- Big tap targets, big text.
- Minimal navigation.
- “Add catch” → one screen:
  - Species (optional)
  - Measurement (adapts to scoring mode)
  - Optional photo
- Show offline state clearly.
- Sync banner is fine, but don’t block.

---

## 8. API rough sketch

```text
POST   /sync
GET    /derbies
POST   /derbies
GET    /derbies/:id
PATCH  /derbies/:id
POST   /derbies/:id/join

GET    /derbies/:id/catches
POST   /derbies/:id/catches
PATCH  /catches/:id
DELETE /catches/:id

# future
GET    /derbies/:id/chat
POST   /derbies/:id/chat
```

`/sync` shape:

```ts
POST /sync
Request:
{
  clientId: string;
  lastSyncedAt?: string;
  outbox: SyncOutboxItem[];
}

Response:
{
  serverTime: string;
  appliedOperationIds: string[];
  patches: {
    users: User[];
    derbies: Derby[];
    derbyParticipants: DerbyParticipant[];
    catches: Catch[];
    chatMessages: ChatMessage[];
  };
}
```

---

## 9. Coding conventions

- Modern JS (ES modules, async/await).
- Shared configs in `packages/shared-config`.
- Zod schemas = source of truth.
- IDs: cuid/uuid, client-generated.
- Timestamps: ISO UTC.
- Feature flags kept simple.
- Maintain a suite of unit tests and update them with ever change.

---

## 10. Run locally

```
npm install
npm run dev

# individual apps
cd apps/server && npm run dev
cd apps/client && npm run dev

# db
cd infra/db
npm run migrate
npm run seed
```

---

## 11. Agentic workflow rules

1. Respect shared types.
2. Support offline-first always.
3. UI must stay simple.
4. APIs: define schemas, add Fastify routes, provide client hooks.
5. Scoring logic in shared utils.
6. Chat reuses sync/outbox patterns.

---

## 12. Vibe guidelines

Campfire snark, but clarity first. Examples:

- “Add a fish”
- “Offline, but chill—we saved it.”
- Avoid enterprise jargon.

---

That’s the contract. If you’re a human, grab a coffee.  
If you’re an agent, grab the schemas and get to work.