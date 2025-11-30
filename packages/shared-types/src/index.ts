import { z } from 'zod';

// --- Core Entities ---

export const UserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  createdAt: z.string(), // ISO date string
  updatedAt: z.string(), // ISO date string
});

export type User = z.infer<typeof UserSchema>;

export const DerbySchema = z.object({
  id: z.string(),
  name: z.string(),
  bodyOfWaterName: z.string(),
  scoringMode: z.enum(['length', 'weight', 'count']),
  scoringUnit: z.enum(['in', 'cm', 'lb', 'kg']).optional(),
  createdByUserId: z.string(),
  startsAt: z.string().optional(), // ISO
  endsAt: z.string().optional(),   // ISO
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Derby = z.infer<typeof DerbySchema>;

export const DerbyParticipantSchema = z.object({
  id: z.string(),
  derbyId: z.string(),
  userId: z.string(),
  nickname: z.string().optional(),
  isAdmin: z.boolean(),
  createdAt: z.string(),
});

export type DerbyParticipant = z.infer<typeof DerbyParticipantSchema>;

export const CatchSchema = z.object({
  id: z.string(),
  derbyId: z.string(),
  userId: z.string(),
  species: z.string().optional(),
  lengthInInches: z.number().optional(),
  weightInPounds: z.number().optional(),
  count: z.number(),
  photoUrl: z.string().optional(),
  caughtAt: z.string(), // ISO
  createdAt: z.string(),
  updatedAt: z.string(),
  
  // Local-first metadata
  clientId: z.string(),
  isPendingSync: z.boolean(),
  deletedAt: z.string().optional(),
});

export type Catch = z.infer<typeof CatchSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  derbyId: z.string(),
  userId: z.string(),
  text: z.string(),
  sentAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  
  // Local-first metadata
  clientId: z.string(),
  isPendingSync: z.boolean(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const DeviceSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  createdAt: z.string(),
});

export type Device = z.infer<typeof DeviceSchema>;

// --- Sync & Outbox ---

export const SyncOutboxItemSchema = z.object({
  id: z.string(),
  entityType: z.enum(['user', 'derby', 'derbyParticipant', 'catch', 'chatMessage']),
  entityId: z.string(),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.any(), // Snapshot of the data
  createdAt: z.string(),
});

export type SyncOutboxItem = z.infer<typeof SyncOutboxItemSchema>;

export const SyncRequestSchema = z.object({
  clientId: z.string(),
  lastSyncedAt: z.string().optional(),
  outbox: z.array(SyncOutboxItemSchema),
});

export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResponseSchema = z.object({
  serverTime: z.string(),
  appliedOperationIds: z.array(z.string()),
  patches: z.object({
    users: z.array(UserSchema),
    derbies: z.array(DerbySchema),
    derbyParticipants: z.array(DerbyParticipantSchema),
    catches: z.array(CatchSchema),
    chatMessages: z.array(ChatMessageSchema),
  }),
});

export type SyncResponse = z.infer<typeof SyncResponseSchema>;
