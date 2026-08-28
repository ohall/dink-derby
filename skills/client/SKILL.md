---
name: client
description: React/Vite web client with local-first architecture using Dexie for IndexedDB. Use when building UI components, implementing offline-first patterns, or working on sync logic in apps/client/.
---

# Client Development

## Tech Stack

- **Framework**: React 18 + Vite
- **Local DB**: Dexie (IndexedDB wrapper) — see `src/db.ts`
- **Identity**: Supabase anonymous auth in deployed environments; generated local identity in offline development
- **Styling**: Component classes in `src/index.css`
- **Types**: Import from `@dink-derby/shared-types`

## Local-First Pattern

All data operations follow this flow:

1. **Write locally first** — Update Dexie immediately
2. **Queue for sync** — Add entry to `syncOutbox` table
3. **Read from local** — UI always reads from Dexie
4. **Sync in background** — POST to `/sync` when online; apply acknowledgements, rejections, patches, and the returned cursor

### Dexie Tables

```ts
// src/db.ts
users, derbies, derbyParticipants, catches, chatMessages, reactions, media
syncOutbox  // pending operations
device      // local device identity
```

### Sync Outbox Entry

```ts
{
  id: string,
  entityType: 'user' | 'derby' | 'catch' | ...,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  payload: <entity snapshot>,
  createdAt: string
}
```

## Component Patterns

### Adding a New Component

1. Create in `src/components/`
2. Use Dexie hooks (`useLiveQuery`) for reactive data
3. Handle loading/error states
4. Follow the screen and sheet patterns in `HomeScreen.tsx`, `DerbyScreen.tsx`, and `Sheets.tsx`

### Form Pattern

```tsx
const [field, setField] = useState('');

const handleSubmit = async () => {
  const entity = { id: crypto.randomUUID(), ...fields, createdAt: new Date().toISOString() };
  await db.tableName.add(entity);
  await db.syncOutbox.add({ id: crypto.randomUUID(), entityType: '...', entityId: entity.id, operation: 'create', payload: entity, createdAt: new Date().toISOString() });
};
```

## UX Rules (Non-Negotiable)

Target user: phone at 7% battery, squinting in bright sun.

- **Big tap targets** — minimum 44x44px
- **Big text** — readable in sunlight
- **Minimal navigation** — one screen for "add catch"
- **Offline indicator** — show sync state clearly, never block
- **Fast feedback** — local writes feel instant

### Add Catch Screen

Single screen with:
- Species (optional text)
- Measurement (adapts to derby's `scoringMode`)
- Optional photo
- Submit button

## File Structure

```
src/
  App.tsx           # Main router/layout
  db.ts             # Dexie database setup
  components/       # UI components
  sync/             # Sync logic
  data/             # Local-first operations and first-run identity
  domain/           # Pure scoring and leaderboard logic
  lib/              # Authenticated API and Supabase clients
```

## Testing

- Unit tests cover pure domain logic in `src/domain/`
- E2E tests in `e2e/` use Playwright, including a two-browser-context sync flow

## Common Tasks

### Add a new entity type

1. Add Zod schema to `packages/shared-types`
2. Add Dexie table to `src/db.ts`
3. Create component in `src/components/`
4. Add to sync outbox handling

### Show offline state

```tsx
const isOnline = navigator.onLine;
// Show banner when offline, but never block user actions
```
