import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SyncRequestSchema, SyncResponseSchema } from '@dink-derby/shared-types';

import { processSync } from './sync';

type SyncProcessor = typeof processSync;

export const buildServer = (syncProcessor: SyncProcessor = processSync) => {
  const app = Fastify({
    logger: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, {
    origin: '*', // For dev
  });

  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get('/', async () => {
    return { message: 'Dink Derby API is running' };
  });

  server.post(
    '/sync',
    {
      schema: {
        body: SyncRequestSchema,
        response: {
          200: SyncResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { clientId, derbyId, cursor, outbox, lastSyncedAt } = request.body;

      request.log.info(`Sync request from client ${clientId} with ${outbox.length} items`);

      const result = await syncProcessor(clientId, outbox, lastSyncedAt, cursor, derbyId);

      return {
        serverTime: new Date().toISOString(),
        appliedOperationIds: result.appliedOperationIds,
        rejected: result.rejected,
        events: result.events,
        nextCursor: result.nextCursor,
        patches: result.patches,
      };
    }
  );

  return app;
};

const start = async () => {
  const app = buildServer();
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}
