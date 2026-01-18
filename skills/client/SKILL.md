---
name: client
description: React/Vite web client with local-first architecture using Dexie for IndexedDB. Use when building UI components, implementing offline-first patterns, or working on sync logic in apps/client/.
---

# Client Development

## Tech Stack

- **Framework**: React 18 + Vite
- **Local DB**: Dexie (IndexedDB wrapper) — see `src/db.ts`
- **Styling**: Tailwind CSS
- **Types**: Import from `@dink-derby/shared-types`

## Local-First Pattern

All data operations follow this flow:

1. **Write locally first** — Update Dexie immediately
2. **Queue for sync** — Add entry to `syncOutbox` table
3. **Read from local** — UI always reads from Dexie
4. **Sync in background** — POST to `/sync` when online

### Dexie Tables

```ts
// src/db.ts
users, derbies, derbyParticipants, catches, chatMessages
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
4. Follow existing patterns in `DerbyList.tsx`, `LogCatchForm.tsx`

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
  utils/            # Helpers (device ID, etc.)
```

## Testing

- Unit tests alongside components: `Component.test.tsx`
- Test setup in `src/test/setup.ts`
- E2E tests in `e2e/` using Playwright

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
