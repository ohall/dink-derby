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
  scoringStyle: z.enum(['biggest', 'best_n', 'total']).optional(),
  bestN: z.number().int().positive().max(20).optional(),
  speciesFilter: z.string().optional(),
  inviteCode: z.string().optional(),
  status: z.enum(['draft', 'active', 'finished', 'cancelled']).optional(),
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
  photoMediaId: z.string().optional(),
  note: z.string().max(500).optional(),
  caughtAt: z.string(), // ISO
  // AI-assisted fields, filled by /catches/:id/identify via OpenRouter
  speciesGuessed: z.string().optional(),
  guessLengthInInches: z.number().optional(),
  guessWeightInPounds: z.number().optional(),
  fromAI: z.boolean().optional(),
  rejectedAsNonFish: z.boolean().optional(),
  // Optional catch coordinates picked up from browser geolocation at save-time
  locationLat: z.number().optional(),
  locationLon: z.number().optional(),
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

export const SyncEntityTypeSchema = z.enum(['user', 'derby', 'derbyParticipant', 'catch', 'chatMessage', 'reaction', 'media', 'device']);

export const ReactionSchema = z.object({
  id: z.string(),
  derbyId: z.string(),
  userId: z.string(),
  targetType: z.enum(['catch', 'chatMessage']),
  targetId: z.string(),
  reaction: z.enum(['fire', 'fish', 'laugh', 'trophy']),
  createdAt: z.string(),
  updatedAt: z.string(),
  clientId: z.string(),
  isPendingSync: z.boolean(),
});

export type Reaction = z.infer<typeof ReactionSchema>;

export const MediaSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  derbyId: z.string(),
  catchId: z.string().optional(),
  contentHash: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  remoteUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  clientId: z.string(),
  isPendingSync: z.boolean(),
});

export type Media = z.infer<typeof MediaSchema>;

export const DerbyEventSchema = z.object({
  id: z.string(),
  derbyId: z.string(),
  sequence: z.number().int().nonnegative(),
  entityType: SyncEntityTypeSchema.optional(),
  entityId: z.string().optional(),
  type: z.string(),
  payload: z.unknown(),
  serverCreatedAt: z.string(),
});

export type DerbyEvent = z.infer<typeof DerbyEventSchema>;

export const DeviceSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  createdAt: z.string(),
});

export type Device = z.infer<typeof DeviceSchema>;

// --- Sync & Outbox ---

export const SyncOutboxItemSchema = z.object({
  id: z.string(),
  derbyId: z.string().optional(),
  entityType: SyncEntityTypeSchema,
  entityId: z.string(),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.any(), // Snapshot of the data
  createdAt: z.string(),
  attempts: z.number().int().nonnegative().optional(),
  status: z.enum(['pending', 'sending', 'failed']).optional(),
  lastError: z.string().optional(),
});

export type SyncOutboxItem = z.infer<typeof SyncOutboxItemSchema>;

export const SyncRequestSchema = z.object({
  clientId: z.string(),
  userId: z.string(),
  derbyId: z.string().optional(),
  cursor: z.number().int().nonnegative().optional(),
  lastSyncedAt: z.string().optional(),
  outbox: z.array(SyncOutboxItemSchema),
});

export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResponseSchema = z.object({
  serverTime: z.string(),
  appliedOperationIds: z.array(z.string()),
  rejected: z.array(z.object({
    operationId: z.string(),
    code: z.string(),
    message: z.string(),
  })),
  events: z.array(DerbyEventSchema),
  nextCursor: z.number().int().nonnegative(),
  patches: z.object({
    users: z.array(UserSchema),
    derbies: z.array(DerbySchema),
    derbyParticipants: z.array(DerbyParticipantSchema),
    catches: z.array(CatchSchema),
    chatMessages: z.array(ChatMessageSchema),
    reactions: z.array(ReactionSchema),
    media: z.array(MediaSchema),
  }),
});

export type SyncResponse = z.infer<typeof SyncResponseSchema>;

export const JoinDerbyRequestSchema = z.object({
  inviteCode: z.string().trim().min(4).max(32),
  user: UserSchema,
  device: DeviceSchema,
});

export type JoinDerbyRequest = z.infer<typeof JoinDerbyRequestSchema>;

export const DerbySnapshotSchema = z.object({
  users: z.array(UserSchema),
  derbies: z.array(DerbySchema),
  derbyParticipants: z.array(DerbyParticipantSchema),
  catches: z.array(CatchSchema),
  chatMessages: z.array(ChatMessageSchema),
  reactions: z.array(ReactionSchema),
  media: z.array(MediaSchema),
});

export type DerbySnapshot = z.infer<typeof DerbySnapshotSchema>;

export const JoinDerbyResponseSchema = z.object({
  derby: DerbySchema,
  participant: DerbyParticipantSchema,
  snapshot: DerbySnapshotSchema,
});

export type JoinDerbyResponse = z.infer<typeof JoinDerbyResponseSchema>;

export const MediaUploadRequestSchema = z.object({
  mediaId: z.string(),
  contentType: z.string().min(1).max(100),
});

export const MediaUploadResponseSchema = z.object({
  bucket: z.string(),
  path: z.string(),
  token: z.string(),
});

export const MediaCompleteRequestSchema = z.object({
  path: z.string().min(1).max(500),
});

export const MediaDownloadResponseSchema = z.object({
  signedUrl: z.string().url(),
});

// --- Fish identification via OpenRouter ---

export const IdentifyCatchResponseSchema = z.object({
  isFish: z.boolean(),
  species: z.string().optional(),
  guessLengthInInches: z.number().optional(),
  guessWeightInPounds: z.number().optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  reason: z.string().optional(),
});

export type IdentifyCatchResponse = z.infer<typeof IdentifyCatchResponseSchema>;
