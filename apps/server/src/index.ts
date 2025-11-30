import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SyncRequestSchema, SyncResponseSchema } from '@dink-derby/shared-types';

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

      // TODO: Implement actual sync logic
      // 1. Process outbox (apply changes to DB)
      // 2. Fetch updates since lastSyncedAt
      // 3. Return applied IDs and new data

      return {
        serverTime: new Date().toISOString(),
        appliedOperationIds: outbox.map((item) => item.id), // Optimistic success for now
        patches: {
          users: [],
          derbies: [],
          derbyParticipants: [],
          catches: [],
          chatMessages: [],
        },
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
