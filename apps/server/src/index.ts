import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import {
  JoinDerbyRequestSchema,
  JoinDerbyResponseSchema,
  MediaCompleteRequestSchema,
  MediaDownloadResponseSchema,
  MediaUploadRequestSchema,
  MediaUploadResponseSchema,
  SyncRequestSchema,
  SyncResponseSchema,
} from '@dink-derby/shared-types';
import { and, eq } from 'drizzle-orm';

import { getDerbySnapshot, processSync } from './sync';
import { db } from './db';
import { derbyParticipants, derbies, devices, media, users } from './db/schema';
import { authenticate, httpError } from './auth';
import { createMediaDownload, createMediaUpload, mediaBucket } from './storage';

type SyncProcessor = typeof processSync;

export const buildServer = (syncProcessor: SyncProcessor = processSync) => {
  const app = Fastify({
    logger: true,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError || (error instanceof Error && error.name === 'ZodError' && 'issues' in error)) {
      request.log.warn({ issues: 'issues' in error ? error.issues : [] }, 'Request or response validation failed');
      return reply.status(400).send({ message: 'The request is invalid.', issues: 'issues' in error ? error.issues : [] });
    }
    const failure = error instanceof Error ? error : new Error('Unknown server error');
    const statusCode = 'statusCode' in failure && typeof failure.statusCode === 'number' ? failure.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: failure }, 'Unhandled request failure');
    return reply.status(statusCode).send({ message: statusCode >= 500 ? 'Dink Derby hit a server snag.' : failure.message });
  });

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed by Dink Derby.'), false);
    },
  });
  app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX || 120),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  });

  app.get('/', async () => {
    return { message: 'Dink Derby API is running' };
  });

  app.post(
    '/sync',
    async (request) => {
      const body = SyncRequestSchema.parse(request.body);
      const { clientId, userId, derbyId, cursor, outbox, lastSyncedAt } = body;
      const actorId = await authenticate(request, userId);

      request.log.info(`Sync request from client ${clientId} with ${outbox.length} items`);

      const result = await syncProcessor(clientId, actorId, outbox, lastSyncedAt, cursor, derbyId);

      return SyncResponseSchema.parse({
        serverTime: new Date().toISOString(),
        appliedOperationIds: result.appliedOperationIds,
        rejected: result.rejected,
        events: result.events,
        nextCursor: result.nextCursor,
        patches: result.patches,
      });
    }
  );

  app.post('/join', async (request) => {
    const body = JoinDerbyRequestSchema.parse(request.body);
    const actorId = await authenticate(request, body.user.id);
    const inviteCode = body.inviteCode.trim().toUpperCase();
    const [derby] = await db.select().from(derbies).where(eq(derbies.inviteCode, inviteCode)).limit(1);
    if (!derby) throw httpError(404, 'That invite code does not match an active derby.');
    if (derby.status === 'cancelled') throw httpError(409, 'That derby has been cancelled.');

    await db.transaction(async (transaction) => {
      await transaction.insert(users).values({
        ...body.user,
        id: actorId,
        createdAt: new Date(body.user.createdAt),
        updatedAt: new Date(body.user.updatedAt),
      }).onConflictDoUpdate({ target: users.id, set: {
        displayName: body.user.displayName,
        avatarUrl: body.user.avatarUrl,
        updatedAt: new Date(body.user.updatedAt),
      } });
      await transaction.insert(devices).values({
        ...body.device,
        userId: actorId,
        createdAt: new Date(body.device.createdAt),
      }).onConflictDoUpdate({ target: devices.id, set: { userId: actorId } });
      await transaction.insert(derbyParticipants).values({
        id: crypto.randomUUID(),
        derbyId: derby.id,
        userId: actorId,
        nickname: body.user.displayName,
        isAdmin: false,
      }).onConflictDoNothing();
    });

    const [participant] = await db.select().from(derbyParticipants)
      .where(and(eq(derbyParticipants.derbyId, derby.id), eq(derbyParticipants.userId, actorId))).limit(1);
    if (!participant) throw httpError(500, 'The derby membership could not be created.');
    const snapshot = await getDerbySnapshot(derby.id);
    const joinedDerby = snapshot.derbies[0];
    if (!joinedDerby) throw httpError(404, 'That derby is no longer available.');
    return JoinDerbyResponseSchema.parse({
      derby: joinedDerby,
      participant: {
        id: participant.id,
        derbyId: participant.derbyId,
        userId: participant.userId,
        nickname: participant.nickname ?? undefined,
        isAdmin: participant.isAdmin,
        createdAt: participant.createdAt.toISOString(),
      },
      snapshot,
    });
  });

  app.post('/media/upload-url', async (request) => {
    const body = MediaUploadRequestSchema.parse(request.body);
    const actorId = await authenticate(request);
    const [record] = await db.select().from(media).where(eq(media.id, body.mediaId)).limit(1);
    if (!record || record.ownerId !== actorId) throw httpError(404, 'That catch photo is not available.');
    const extension = body.contentType === 'image/png' ? 'png' : body.contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${record.derbyId}/${record.id}.${extension}`;
    const upload = await createMediaUpload(path);
    return MediaUploadResponseSchema.parse({ bucket: mediaBucket, path, token: upload.token });
  });

  app.post('/media/:id/complete', async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = MediaCompleteRequestSchema.parse(request.body);
    const actorId = await authenticate(request);
    const [record] = await db.select().from(media).where(eq(media.id, params.id)).limit(1);
    if (!record || record.ownerId !== actorId) throw httpError(404, 'That catch photo is not available.');
    if (!body.path.startsWith(`${record.derbyId}/${record.id}.`)) throw httpError(400, 'The uploaded photo path is invalid.');
    await db.update(media).set({ remoteUrl: body.path, updatedAt: new Date() }).where(eq(media.id, record.id));
    return { ok: true as const };
  });

  app.get('/media/:id/download-url', async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const actorId = await authenticate(request);
    const [record] = await db.select().from(media).where(eq(media.id, params.id)).limit(1);
    if (!record?.remoteUrl) throw httpError(404, 'That catch photo has not finished uploading.');
    const [membership] = await db.select().from(derbyParticipants)
      .where(and(eq(derbyParticipants.derbyId, record.derbyId), eq(derbyParticipants.userId, actorId))).limit(1);
    if (!membership) throw httpError(403, 'Join this derby to view its catch photos.');
    return MediaDownloadResponseSchema.parse({ signedUrl: await createMediaDownload(record.remoteUrl) });
  });

  return app;
};

const start = async () => {
  const app = buildServer();
  try {
    await app.listen({ port: Number(process.env.PORT || 3000), host: process.env.HOST || '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}
