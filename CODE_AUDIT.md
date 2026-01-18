# Dink Derby Code Audit & Refactoring Recommendations

**Date:** 2026-01-17
**Audited by:** Automated Code Review
**Scope:** Client and Server Applications

---

## Executive Summary

The Dink Derby codebase demonstrates a solid foundation with modern technologies (React, Fastify, Drizzle ORM, Dexie) and a well-thought-out local-first architecture. However, as the project scales, several architectural and code quality improvements are recommended to enhance maintainability, testability, security, and developer experience.

**Key Strengths:**
- Clear separation of client/server with shared types
- Local-first sync pattern is well-designed
- Modern tech stack with TypeScript throughout
- Zod schemas as source of truth

**Critical Areas for Improvement:**
- Separation of concerns (business logic mixed with UI/routes)
- Error handling and validation
- Security practices (hardcoded values, CORS configuration)
- Testing coverage
- Code organization and modularity

---

## 1. Server-Side Recommendations

### 1.1 Architecture & Structure

#### **CRITICAL: Implement Layered Architecture**

**Current State:**
Business logic is directly embedded in route handlers and sync processing. All database operations are performed directly in routes.

**Recommendation:**
Introduce a layered architecture with clear boundaries:

```
apps/server/src/
├── api/
│   ├── routes/          # Route definitions only
│   │   ├── sync.routes.ts
│   │   └── derby.routes.ts
│   └── middleware/      # Auth, validation, error handling
├── services/            # Business logic layer
│   ├── sync.service.ts
│   ├── derby.service.ts
│   ├── catch.service.ts
│   └── user.service.ts
├── repositories/        # Data access layer
│   ├── derby.repository.ts
│   ├── catch.repository.ts
│   └── user.repository.ts
├── domain/             # Domain models & validation
│   ├── models/
│   └── validators/
├── utils/              # Helpers, constants
└── config/             # Configuration management
```

**Benefits:**
- Testable business logic independent of HTTP layer
- Reusable services across different routes
- Clear data access patterns
- Easier to mock for testing

**Priority:** HIGH
**Effort:** Medium (2-3 days)
**Files Affected:** `apps/server/src/index.ts`, `apps/server/src/sync.ts`

---

#### **HIGH: Extract Sync Logic into Service**

**Current Issue:**
`apps/server/src/sync.ts:51-130` - The `applyOperation` function contains a 80-line switch statement handling all entity types inline.

**Recommendation:**
Create entity-specific handlers:

```typescript
// services/sync/handlers/derby.handler.ts
export class DerbyHandler implements EntityHandler {
  constructor(private repository: DerbyRepository) {}

  async apply(operation: SyncOutboxItem): Promise<void> {
    switch (operation.operation) {
      case 'create':
      case 'update':
        return this.repository.upsert(operation.payload);
      case 'delete':
        return this.repository.delete(operation.entityId);
    }
  }
}

// services/sync.service.ts
export class SyncService {
  private handlers: Map<EntityType, EntityHandler>;

  async processSync(request: SyncRequest): Promise<SyncResponse> {
    // Orchestration logic
  }
}
```

**Benefits:**
- Single Responsibility Principle
- Easier to test each handler independently
- Simpler to add new entity types
- Better error handling per entity type

**Priority:** HIGH
**Effort:** Medium (1-2 days)

---

### 1.2 Security Issues

#### **CRITICAL: Remove Hardcoded Database Credentials**

**Location:** `apps/server/src/db/index.ts:8`

```typescript
const connectionString = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/dink_derby';
```

**Issue:**
Fallback credentials expose database structure and create false sense of security.

**Recommendation:**
```typescript
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}
```

Add validation layer:
```typescript
// config/database.config.ts
import { z } from 'zod';

const DatabaseConfigSchema = z.object({
  url: z.string().url(),
  poolMax: z.number().default(10),
  poolMin: z.number().default(2),
});

export function getDatabaseConfig() {
  const config = DatabaseConfigSchema.parse({
    url: process.env.DATABASE_URL,
    poolMax: process.env.DB_POOL_MAX,
    poolMin: process.env.DB_POOL_MIN,
  });
  return config;
}
```

**Priority:** CRITICAL
**Effort:** Low (30 minutes)

---

#### **HIGH: Restrict CORS Configuration**

**Location:** `apps/server/src/index.ts:17-19`

```typescript
app.register(cors, {
  origin: '*', // For dev
});
```

**Issue:**
Wildcard CORS is a security vulnerability in production.

**Recommendation:**
```typescript
// config/cors.config.ts
export function getCorsConfig() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

  return {
    origin: process.env.NODE_ENV === 'production'
      ? allowedOrigins
      : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  };
}

// index.ts
app.register(cors, getCorsConfig());
```

**Priority:** HIGH
**Effort:** Low (15 minutes)

---

### 1.3 Error Handling

#### **HIGH: Implement Consistent Error Handling**

**Current Issue:**
`apps/server/src/sync.ts:12-18` - Errors are logged but not reported to client:

```typescript
for (const item of outbox) {
  try {
    await applyOperation(item);
    appliedOperationIds.push(item.id);
  } catch (e) {
    console.error(`Failed to apply operation ${item.id}`, e);
    // Client never knows this failed!
  }
}
```

**Recommendation:**

1. Create custom error classes:
```typescript
// domain/errors/index.ts
export class SyncError extends Error {
  constructor(
    message: string,
    public readonly operationId: string,
    public readonly entityType: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

2. Return sync errors to client:
```typescript
export const SyncResponseSchema = z.object({
  serverTime: z.string(),
  appliedOperationIds: z.array(z.string()),
  failedOperations: z.array(z.object({
    operationId: z.string(),
    error: z.string(),
    retryable: z.boolean(),
  })),
  patches: z.object({
    // ...
  }),
});
```

3. Add error handling middleware:
```typescript
// api/middleware/error-handler.ts
export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  if (error instanceof ValidationError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      field: error.field,
    });
  }

  // Don't leak internal errors
  return reply.status(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}
```

**Priority:** HIGH
**Effort:** Medium (1 day)

---

### 1.4 Data Access

#### **MEDIUM: Implement Repository Pattern**

**Current Issue:**
Database queries are scattered throughout the codebase. Direct imports of schema and db make testing difficult.

**Recommendation:**

```typescript
// repositories/base.repository.ts
export abstract class BaseRepository<T> {
  constructor(protected db: DrizzleDB) {}

  abstract findById(id: string): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<void>;
}

// repositories/derby.repository.ts
export class DerbyRepository extends BaseRepository<Derby> {
  async findById(id: string): Promise<Derby | null> {
    const result = await this.db.select()
      .from(derbies)
      .where(eq(derbies.id, id))
      .limit(1);
    return result[0] || null;
  }

  async findByCreator(userId: string): Promise<Derby[]> {
    return this.db.select()
      .from(derbies)
      .where(eq(derbies.createdByUserId, userId));
  }

  async findActiveByParticipant(userId: string): Promise<Derby[]> {
    return this.db.select()
      .from(derbies)
      .leftJoin(derbyParticipants, eq(derbies.id, derbyParticipants.derbyId))
      .where(
        and(
          eq(derbyParticipants.userId, userId),
          eq(derbies.isArchived, false)
        )
      );
  }

  // Sync-specific query
  async findModifiedSince(date: Date): Promise<Derby[]> {
    return this.db.select()
      .from(derbies)
      .where(gt(derbies.updatedAt, date));
  }
}
```

**Benefits:**
- Centralized query logic
- Easier to test with mocks
- Can add caching layer later
- Clear API for data access
- Type-safe query builders

**Priority:** MEDIUM
**Effort:** Medium (2-3 days)

---

### 1.5 Testing

#### **HIGH: Expand Test Coverage**

**Current State:**
Only one test file (`apps/server/test/server.test.ts`) with 2 basic tests.

**Recommendation:**

Create comprehensive test suite:

```
apps/server/test/
├── unit/
│   ├── services/
│   │   ├── sync.service.test.ts
│   │   ├── derby.service.test.ts
│   │   └── catch.service.test.ts
│   ├── repositories/
│   │   └── derby.repository.test.ts
│   └── utils/
├── integration/
│   ├── sync-flow.test.ts
│   └── derby-lifecycle.test.ts
└── helpers/
    ├── fixtures.ts
    └── test-db.ts
```

Example test:
```typescript
// test/unit/services/sync.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from '../../../src/services/sync.service';
import { DerbyRepository } from '../../../src/repositories/derby.repository';

describe('SyncService', () => {
  let syncService: SyncService;
  let mockDerbyRepo: DerbyRepository;

  beforeEach(() => {
    mockDerbyRepo = {
      upsert: vi.fn(),
      findModifiedSince: vi.fn(),
    } as any;

    syncService = new SyncService({
      derbyRepository: mockDerbyRepo,
      // ... other dependencies
    });
  });

  it('should apply create operations', async () => {
    const operation = createMockOperation('derby', 'create', mockDerby);

    await syncService.applyOperation(operation);

    expect(mockDerbyRepo.upsert).toHaveBeenCalledWith(mockDerby);
  });

  it('should return failed operations with retry flag', async () => {
    mockDerbyRepo.upsert.mockRejectedValue(new Error('DB error'));

    const result = await syncService.processSync({
      clientId: 'test',
      outbox: [createMockOperation('derby', 'create', mockDerby)],
    });

    expect(result.failedOperations).toHaveLength(1);
    expect(result.failedOperations[0].retryable).toBe(true);
  });
});
```

**Test Coverage Goals:**
- Services: 90%+
- Repositories: 85%+
- Routes: 80%+
- Utilities: 95%+

**Priority:** HIGH
**Effort:** High (3-5 days)

---

### 1.6 Code Quality

#### **MEDIUM: Add Input Validation Beyond Schema**

**Current State:**
Only Zod schema validation at route level.

**Recommendation:**

Add business logic validation:

```typescript
// domain/validators/derby.validator.ts
export class DerbyValidator {
  validateCreate(data: Derby): ValidationResult {
    const errors: string[] = [];

    // Business rules
    if (data.startsAt && data.endsAt) {
      const start = new Date(data.startsAt);
      const end = new Date(data.endsAt);

      if (end <= start) {
        errors.push('End time must be after start time');
      }

      if (start < new Date()) {
        errors.push('Cannot create derby with past start time');
      }
    }

    if (data.scoringMode === 'length' && !data.scoringUnit) {
      errors.push('Length mode requires a scoring unit');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// services/derby.service.ts
async createDerby(data: Derby): Promise<Derby> {
  const validation = this.validator.validateCreate(data);
  if (!validation.valid) {
    throw new ValidationError(validation.errors.join(', '));
  }

  return this.repository.create(data);
}
```

**Priority:** MEDIUM
**Effort:** Low (1 day)

---

#### **MEDIUM: Add Request Logging Middleware**

**Recommendation:**

```typescript
// api/middleware/request-logger.ts
export function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
) {
  const startTime = Date.now();

  reply.addHook('onSend', (request, reply, payload, done) => {
    const duration = Date.now() - startTime;

    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      clientId: request.body?.clientId,
    });

    done();
  });

  done();
}

// index.ts
app.addHook('onRequest', requestLogger);
```

**Priority:** MEDIUM
**Effort:** Low (1 hour)

---

## 2. Client-Side Recommendations

### 2.1 Component Architecture

#### **HIGH: Extract Business Logic from Components**

**Current Issue:**
Components like `CreateDerbyForm.tsx` and `LogCatchForm.tsx` contain direct database access, validation, and sync logic.

**Example from** `apps/client/src/components/CreateDerbyForm.tsx:11-56`:
```typescript
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setIsSubmitting(true);

  // Business logic mixed with UI
  const formData = new FormData(e.currentTarget);
  const deviceId = await getOrCreateDeviceId();
  const derbyId = crypto.randomUUID();

  const newDerby: Derby = {
    id: derbyId,
    name,
    // ... 10 more lines of object construction
  };

  // Database access in component
  await db.transaction('rw', db.derbies, db.syncOutbox, async () => {
    await db.derbies.add(newDerby);
    await db.syncOutbox.add(outboxItem);
  });
}
```

**Recommendation:**

Create custom hooks for business logic:

```typescript
// hooks/useDerby.ts
export function useDerby() {
  const queryClient = useQueryClient();

  const createDerby = useMutation({
    mutationFn: async (data: CreateDerbyInput) => {
      const deviceId = await getOrCreateDeviceId();
      const derbyId = crypto.randomUUID();
      const now = new Date().toISOString();

      const newDerby: Derby = {
        id: derbyId,
        ...data,
        createdByUserId: deviceId,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      await derbyService.create(newDerby);
      return newDerby;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['derbies']);
    },
  });

  return { createDerby };
}

// services/derby.service.ts (client-side)
export class DerbyService {
  async create(derby: Derby): Promise<void> {
    const outboxItem: SyncOutboxItem = {
      id: crypto.randomUUID(),
      entityType: 'derby',
      entityId: derby.id,
      operation: 'create',
      payload: derby,
      createdAt: new Date().toISOString(),
    };

    await db.transaction('rw', db.derbies, db.syncOutbox, async () => {
      await db.derbies.add(derby);
      await db.syncOutbox.add(outboxItem);
    });
  }

  async update(id: string, updates: Partial<Derby>): Promise<void> {
    // Similar pattern
  }
}

// components/CreateDerbyForm.tsx (simplified)
export function CreateDerbyForm() {
  const navigate = useNavigate();
  const { createDerby } = useDerby();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await createDerby.mutateAsync({
        name: formData.get('name') as string,
        bodyOfWaterName: formData.get('bodyOfWaterName') as string,
        scoringMode: formData.get('scoringMode') as Derby['scoringMode'],
      });
      navigate({ to: '/' });
    } catch (err) {
      // Error handling
    }
  };

  // Just UI rendering...
}
```

**Benefits:**
- Testable business logic
- Reusable across components
- Better separation of concerns
- Easier to add optimistic updates

**Priority:** HIGH
**Effort:** Medium (2-3 days)
**Files Affected:** All form components

---

### 2.2 Configuration Management

#### **CRITICAL: Move API URL to Environment Variables**

**Location:** `apps/client/src/sync/index.ts:6`

```typescript
const API_URL = 'http://localhost:3000';
```

**Recommendation:**

```typescript
// config/api.config.ts
export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  syncInterval: Number(import.meta.env.VITE_SYNC_INTERVAL_MS) || 10000,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 30000,
} as const;

// Validate at startup
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  throw new Error('VITE_API_URL is required in production');
}
```

Create `.env.example`:
```bash
VITE_API_URL=http://localhost:3000
VITE_SYNC_INTERVAL_MS=10000
VITE_API_TIMEOUT_MS=30000
```

**Priority:** CRITICAL
**Effort:** Low (15 minutes)

---

### 2.3 Error Handling

#### **HIGH: Replace alert() with Proper Error UI**

**Current Issues:**
- `apps/client/src/components/CreateDerbyForm.tsx:53` - `alert('Failed to create derby')`
- `apps/client/src/components/DerbyDetails.tsx:69` - `alert('Failed to join derby')`
- `apps/client/src/components/LogCatchForm.tsx:64` - `alert('Failed to log catch')`

**Recommendation:**

Create error notification system:

```typescript
// components/ui/Toast.tsx
import { createContext, useContext, useState } from 'react';

type Toast = {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
};

const ToastContext = createContext<{
  showToast: (toast: Omit<Toast, 'id'>) => void;
}>(null!);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { ...toast, id }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`p-4 rounded-lg shadow-lg ${
              toast.type === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-green-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// Usage in components
const { showToast } = useToast();

try {
  await createDerby();
  showToast({ type: 'success', message: 'Derby created!' });
} catch (err) {
  showToast({ type: 'error', message: 'Failed to create derby' });
}
```

**Priority:** HIGH
**Effort:** Low (1 day)

---

#### **MEDIUM: Add Error Boundaries**

**Recommendation:**

```typescript
// components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="text-center p-8">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-slate-400 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// App.tsx
<ErrorBoundary>
  <RouterProvider router={router} />
</ErrorBoundary>
```

**Priority:** MEDIUM
**Effort:** Low (2 hours)

---

### 2.4 Sync Service Improvements

#### **MEDIUM: Make Sync Service Testable**

**Current Issue:**
`apps/client/src/sync/index.ts:8-97` - SyncService is a singleton with hardcoded dependencies.

**Recommendation:**

```typescript
// services/sync.service.ts
export interface SyncServiceConfig {
  apiUrl: string;
  syncInterval: number;
  db: DinkDerbyDatabase;
}

export class SyncService {
  private isSyncing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private config: SyncServiceConfig) {}

  async sync(): Promise<SyncResult> {
    // Existing logic, but now testable
  }

  // Make event listeners injectable for testing
  start(listeners?: EventListeners) {
    if (this.timer) return;

    this.sync();
    this.timer = setInterval(() => this.sync(), this.config.syncInterval);

    if (listeners) {
      window.addEventListener('online', listeners.onOnline || (() => this.sync()));
      window.addEventListener('focus', listeners.onFocus || (() => this.sync()));
    }
  }
}

// Create instance with dependency injection
export const syncService = new SyncService({
  apiUrl: API_CONFIG.baseUrl,
  syncInterval: API_CONFIG.syncInterval,
  db,
});
```

**Test example:**
```typescript
describe('SyncService', () => {
  it('should sync on start', async () => {
    const mockDb = createMockDb();
    const service = new SyncService({
      apiUrl: 'http://test',
      syncInterval: 1000,
      db: mockDb,
    });

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(/* ... */);

    await service.sync();

    expect(fetchSpy).toHaveBeenCalledWith('http://test/sync', /* ... */);
  });
});
```

**Priority:** MEDIUM
**Effort:** Low (1 day)

---

### 2.5 Form Handling

#### **MEDIUM: Add Form Validation Library**

**Current State:**
Only HTML5 validation with required attributes.

**Recommendation:**

Use React Hook Form + Zod:

```typescript
// hooks/useDerbyForm.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const CreateDerbyFormSchema = z.object({
  name: z.string()
    .min(3, 'Derby name must be at least 3 characters')
    .max(100, 'Derby name is too long'),
  bodyOfWaterName: z.string()
    .min(2, 'Body of water name is required')
    .max(100),
  scoringMode: z.enum(['length', 'weight', 'count']),
});

export type CreateDerbyFormData = z.infer<typeof CreateDerbyFormSchema>;

export function useDerbyForm() {
  return useForm<CreateDerbyFormData>({
    resolver: zodResolver(CreateDerbyFormSchema),
    defaultValues: {
      scoringMode: 'length',
    },
  });
}

// components/CreateDerbyForm.tsx
export function CreateDerbyForm() {
  const { register, handleSubmit, formState: { errors } } = useDerbyForm();
  const { createDerby } = useDerby();

  const onSubmit = async (data: CreateDerbyFormData) => {
    await createDerby.mutateAsync(data);
    navigate({ to: '/' });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span className="text-red-500">{errors.name.message}</span>}
      {/* ... */}
    </form>
  );
}
```

**Benefits:**
- Client-side validation with great UX
- Type-safe forms
- Reusable validation schemas
- Better error messages

**Priority:** MEDIUM
**Effort:** Medium (1-2 days)

---

### 2.6 Styling Consistency

#### **MEDIUM: Standardize Component Styling**

**Current Issue:**
`apps/client/src/components/LogCatchForm.tsx:73-130` uses different styling (white background, stone colors) vs other components (dark theme, cyan/blue gradients).

**Recommendation:**

1. Create design system documentation
2. Extract reusable UI components
3. Update LogCatchForm to match design system

```typescript
// components/ui/Card.tsx
export function Card({ children, className, ...props }) {
  return (
    <div className={cn("card-tactile p-6", className)} {...props}>
      {children}
    </div>
  );
}

// components/ui/Input.tsx
export function Input({ label, error, ...props }) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">
        {label}
      </label>
      <input
        className="input-field text-lg font-medium"
        {...props}
      />
      {error && <span className="text-red-400 text-sm mt-1">{error}</span>}
    </div>
  );
}

// components/LogCatchForm.tsx (updated)
<Card>
  <Input
    label="Species"
    {...register('species')}
    error={errors.species?.message}
  />
</Card>
```

**Priority:** MEDIUM
**Effort:** Low (1 day)

---

### 2.7 Performance

#### **LOW: Implement Optimistic Updates**

**Recommendation:**

```typescript
// hooks/useDerby.ts
export function useDerby() {
  const queryClient = useQueryClient();

  const createDerby = useMutation({
    mutationFn: async (data: CreateDerbyInput) => {
      return derbyService.create(data);
    },
    // Optimistic update
    onMutate: async (newDerby) => {
      await queryClient.cancelQueries(['derbies']);
      const previous = queryClient.getQueryData(['derbies']);

      queryClient.setQueryData(['derbies'], (old: Derby[] = []) => [
        ...old,
        { ...newDerby, id: 'temp-' + Date.now() }
      ]);

      return { previous };
    },
    onError: (err, newDerby, context) => {
      // Rollback on error
      queryClient.setQueryData(['derbies'], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries(['derbies']);
    },
  });

  return { createDerby };
}
```

**Benefits:**
- Instant UI feedback
- Better perceived performance
- Automatic rollback on errors

**Priority:** LOW
**Effort:** Medium (2 days)

---

## 3. Shared Types Improvements

### 3.1 Type Safety

#### **MEDIUM: Add DTO Types**

**Current Issue:**
Using domain types (Derby, Catch) directly in API requests exposes internal fields like `isPendingSync`.

**Recommendation:**

```typescript
// packages/shared-types/src/dtos/derby.dto.ts
export const CreateDerbyDtoSchema = DerbySchema.pick({
  name: true,
  bodyOfWaterName: true,
  scoringMode: true,
  scoringUnit: true,
  startsAt: true,
  endsAt: true,
});

export type CreateDerbyDto = z.infer<typeof CreateDerbyDtoSchema>;

export const UpdateDerbyDtoSchema = CreateDerbyDtoSchema.partial();
export type UpdateDerbyDto = z.infer<typeof UpdateDerbyDtoSchema>;

export const DerbyResponseDtoSchema = DerbySchema.omit({
  // Internal fields not sent to client
});
export type DerbyResponseDto = z.infer<typeof DerbyResponseDtoSchema>;
```

**Priority:** MEDIUM
**Effort:** Medium (1 day)

---

### 3.2 Validation Helpers

#### **LOW: Export Validation Functions**

**Recommendation:**

```typescript
// packages/shared-types/src/validators/index.ts
export function validateUser(data: unknown): User {
  return UserSchema.parse(data);
}

export function isValidDerby(data: unknown): data is Derby {
  return DerbySchema.safeParse(data).success;
}

export function validatePartial<T extends z.ZodType>(
  schema: T,
  data: unknown
): Partial<z.infer<T>> {
  return schema.partial().parse(data);
}
```

**Priority:** LOW
**Effort:** Low (2 hours)

---

## 4. Repository Structure

### 4.1 Package Organization

#### **MEDIUM: Create Additional Shared Packages**

**Recommendation:**

```
packages/
├── shared-types/        # Existing
├── shared-utils/        # NEW
│   ├── src/
│   │   ├── id/          # ID generation (cuid, uuid)
│   │   ├── date/        # Date formatting, parsing
│   │   ├── validation/  # Common validators
│   │   └── crypto/      # Hash functions, etc.
├── shared-config/       # NEW
│   ├── eslint.config.js
│   ├── tsconfig.base.json
│   └── prettier.config.js
└── shared-test-utils/   # NEW
    ├── fixtures/
    ├── factories/
    └── mocks/
```

**Priority:** MEDIUM
**Effort:** Medium (1-2 days)

---

### 4.2 Documentation

#### **HIGH: Add JSDoc Comments**

**Recommendation:**

```typescript
/**
 * Processes a sync request from a client device.
 *
 * Applies all pending operations from the client's outbox, then returns
 * all entities modified since the client's last sync.
 *
 * @param clientId - Unique identifier for the client device
 * @param outbox - Array of pending operations to apply
 * @param lastSyncedAt - ISO timestamp of last successful sync
 * @returns Sync response with applied operations and patches
 * @throws {SyncError} If critical sync operation fails
 *
 * @example
 * ```ts
 * const result = await processSync('device-123', [], '2024-01-01T00:00:00Z');
 * console.log(result.patches.derbies); // All derbies modified since Jan 1
 * ```
 */
export async function processSync(
  clientId: string,
  outbox: SyncOutboxItem[],
  lastSyncedAt?: string
): Promise<SyncResponse> {
  // ...
}
```

**Priority:** HIGH
**Effort:** Medium (2-3 days for full codebase)

---

## 5. Testing Strategy

### 5.1 Test Coverage Requirements

**Recommended Coverage by Layer:**

| Layer | Target Coverage | Priority |
|-------|----------------|----------|
| Services | 90%+ | CRITICAL |
| Repositories | 85%+ | HIGH |
| Routes/API | 80%+ | HIGH |
| Components | 75%+ | MEDIUM |
| Hooks | 85%+ | MEDIUM |
| Utils | 95%+ | HIGH |

---

### 5.2 E2E Testing

**Current State:**
Good E2E test coverage with Playwright (`apps/client/e2e/`).

**Recommendation:**

Expand E2E tests to cover:

```typescript
// e2e/offline-sync.spec.ts
test('should work offline and sync when online', async ({ page, context }) => {
  // Go offline
  await context.setOffline(true);

  // Create derby offline
  await page.goto('/new');
  await page.fill('[name="name"]', 'Offline Derby');
  await page.click('button[type="submit"]');

  // Verify stored locally
  const derbies = await page.evaluate(() => {
    return indexedDB.databases();
  });
  expect(derbies).toContainEqual(expect.objectContaining({
    name: 'DinkDerbyDB'
  }));

  // Go online
  await context.setOffline(false);

  // Wait for sync
  await page.waitForTimeout(2000);

  // Verify synced to server
  const response = await fetch('http://localhost:3000/derbies');
  const serverDerbies = await response.json();
  expect(serverDerbies).toContainEqual(
    expect.objectContaining({ name: 'Offline Derby' })
  );
});

// e2e/conflict-resolution.spec.ts
test('should handle sync conflicts', async ({ page, browser }) => {
  // Two clients editing same derby
  const page2 = await browser.newPage();

  // Both load same derby
  await page.goto('/derbies/derby-1');
  await page2.goto('/derbies/derby-1');

  // Both edit name
  await page.click('button:has-text("Edit")');
  await page.fill('[name="name"]', 'Client 1 Name');
  await page.click('button[type="submit"]');

  await page2.click('button:has-text("Edit")');
  await page2.fill('[name="name"]', 'Client 2 Name');
  await page2.click('button[type="submit"]');

  // Wait for sync
  await page.waitForTimeout(3000);
  await page2.waitForTimeout(3000);

  // Verify conflict resolution (last-write-wins)
  await page.reload();
  const finalName = await page.textContent('h1');
  expect(['Client 1 Name', 'Client 2 Name']).toContain(finalName);
});
```

**Priority:** MEDIUM
**Effort:** Medium (2-3 days)

---

## 6. Security Checklist

### 6.1 Current Security Issues

| Issue | Severity | Location | Status |
|-------|----------|----------|--------|
| Hardcoded DB credentials | CRITICAL | `apps/server/src/db/index.ts:8` | Open |
| Wildcard CORS | HIGH | `apps/server/src/index.ts:18` | Open |
| No rate limiting | HIGH | All routes | Open |
| No authentication | MEDIUM | All routes | Known limitation |
| localStorage for sync state | LOW | `apps/client/src/sync/index.ts:38` | Open |
| No HTTPS enforcement | MEDIUM | Server config | Open |
| Missing input sanitization | MEDIUM | All forms | Open |
| No CSRF protection | LOW | Not applicable (no auth yet) | Deferred |

---

### 6.2 Security Recommendations

#### **HIGH: Add Rate Limiting**

```typescript
// server/api/middleware/rate-limit.ts
import rateLimit from '@fastify/rate-limit';

export function setupRateLimiting(app: FastifyInstance) {
  app.register(rateLimit, {
    max: 100, // Max requests per window
    timeWindow: '15 minutes',
    cache: 10000,
    allowList: ['127.0.0.1'], // Whitelist for dev
    redis: process.env.REDIS_URL, // Optional Redis for distributed rate limiting
  });

  // Stricter limits for sync endpoint
  app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
  }, { prefix: '/sync' });
}
```

**Priority:** HIGH
**Effort:** Low (1 hour)

---

#### **MEDIUM: Add Request Size Limits**

```typescript
// index.ts
const app = Fastify({
  logger: true,
  bodyLimit: 1048576, // 1MB
  requestIdLogLabel: 'reqId',
  disableRequestLogging: process.env.NODE_ENV === 'production',
});
```

**Priority:** MEDIUM
**Effort:** Low (15 minutes)

---

## 7. Implementation Roadmap

### Phase 1: Critical Issues (Week 1)

**Priority: Fix Security & Configuration**

- [ ] Remove hardcoded database credentials
- [ ] Fix CORS configuration
- [ ] Move API URL to environment variables
- [ ] Add .env.example files for both apps
- [ ] Add rate limiting to server

**Estimated Effort:** 1-2 days

---

### Phase 2: Architecture (Week 2-3)

**Priority: Establish Clean Architecture**

- [ ] Implement server-side layered architecture
  - [ ] Create service layer
  - [ ] Create repository layer
  - [ ] Extract sync logic into service
- [ ] Extract client-side business logic from components
  - [ ] Create custom hooks for data operations
  - [ ] Create client-side service layer
- [ ] Add comprehensive error handling
  - [ ] Custom error classes
  - [ ] Error handler middleware (server)
  - [ ] Toast notifications (client)
  - [ ] Error boundaries (client)

**Estimated Effort:** 7-10 days

---

### Phase 3: Testing (Week 4)

**Priority: Increase Test Coverage**

- [ ] Write unit tests for services
- [ ] Write unit tests for repositories
- [ ] Write integration tests for sync flow
- [ ] Expand E2E tests (offline, conflicts)
- [ ] Set up test fixtures and factories

**Estimated Effort:** 4-5 days

---

### Phase 4: Developer Experience (Week 5)

**Priority: Improve Maintainability**

- [ ] Add JSDoc comments throughout codebase
- [ ] Create shared-utils package
- [ ] Create shared-config package
- [ ] Add form validation library
- [ ] Standardize component styling
- [ ] Add DTOs for API layer

**Estimated Effort:** 4-5 days

---

### Phase 5: Performance & Polish (Week 6)

**Priority: Optimize User Experience**

- [ ] Implement optimistic updates
- [ ] Add request logging
- [ ] Move sync state from localStorage to IndexedDB
- [ ] Add loading state standardization
- [ ] Performance profiling and optimization

**Estimated Effort:** 3-4 days

---

## 8. Metrics & Success Criteria

### Code Quality Metrics

**Current Baseline:**
- Lines of Code: ~1,200 (client), ~400 (server)
- Test Coverage: ~15%
- Number of Tests: 3
- Cyclomatic Complexity: Low-Medium

**Target After Refactoring:**
- Test Coverage: 85%+
- Number of Tests: 100+
- Documented Functions: 95%+
- No critical security issues
- No hardcoded secrets

---

### Architectural Health

**Success Indicators:**
- ✅ Clear separation of concerns (UI, business logic, data access)
- ✅ All services are unit tested
- ✅ No direct database access from components
- ✅ Consistent error handling throughout app
- ✅ All configuration externalized
- ✅ Security checklist items resolved

---

## 9. Quick Wins (Do These First)

If time is limited, prioritize these high-impact, low-effort improvements:

1. **Remove hardcoded DB credentials** (15 min)
2. **Fix CORS config** (15 min)
3. **Move API URL to env vars** (15 min)
4. **Replace alert() with toast notifications** (2 hours)
5. **Add error boundaries** (2 hours)
6. **Add rate limiting** (1 hour)
7. **Add request logging** (1 hour)
8. **Fix LogCatchForm styling** (1 hour)

**Total Quick Wins Effort: 1 day**
**Impact: High security & UX improvements**

---

## 10. Conclusion

The Dink Derby codebase has a solid foundation and clear architectural vision as outlined in AGENTS.md. The recommendations in this audit focus on:

1. **Security**: Eliminating critical vulnerabilities before production
2. **Maintainability**: Separating concerns for long-term development
3. **Testability**: Building confidence through comprehensive testing
4. **User Experience**: Improving error handling and offline support

By following the phased roadmap, the codebase will be production-ready with:
- ✅ Clean, testable architecture
- ✅ Comprehensive test coverage
- ✅ Security best practices
- ✅ Excellent developer experience

The project already follows many best practices (TypeScript, Zod validation, local-first design). These improvements will take it from a solid POC to a production-grade application.

---

**Next Steps:**
1. Review this audit with the team
2. Prioritize recommendations based on timeline
3. Create GitHub issues for tracked work
4. Start with Phase 1 (Critical Issues)

