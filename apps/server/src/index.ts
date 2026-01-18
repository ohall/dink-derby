import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SyncRequestSchema, SyncResponseSchema } from '@dink-derby/shared-types';

import { processSync } from './sync';

export const buildServer = () => {
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
      const { clientId, outbox, lastSyncedAt } = request.body;

      request.log.info(`Sync request from client ${clientId} with ${outbox.length} items`);

      const result = await processSync(clientId, outbox, lastSyncedAt);

      return {
        serverTime: new Date().toISOString(),
        appliedOperationIds: result.appliedOperationIds,
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
