import Fastify, { FastifyInstance } from 'fastify';
import { problemDetailsErrorHandler } from './middlewares/error-handler.js';
import { DatabasePoolFactory } from '../persistence/postgres/database-pool.js';
import { PostgresSubscriptionRepository } from '../persistence/postgres/postgres-subscription.repository.js';
import { PostgresWebhookEventRepository } from '../persistence/postgres/postgres-webhook-event.repository.js';
import { IngestWebhookEventUseCase } from '../../application/use-cases/ingest-webhook-event.use-case.js';
import { EventController } from './controllers/event.controller.js';
import { SubscriptionController } from './controllers/subscription.controller.js';
import { registerApiRoutes } from './routes/api.routes.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // Attach RFC 9457 Global Error Handler
  server.setErrorHandler(problemDetailsErrorHandler);

  // Dependency Injection Composition Root
  const pool = DatabasePoolFactory.getPool();
  const subscriptionRepo = new PostgresSubscriptionRepository(pool);
  const webhookEventRepo = new PostgresWebhookEventRepository(pool);

  const ingestUseCase = new IngestWebhookEventUseCase(subscriptionRepo, webhookEventRepo);

  const eventController = new EventController(ingestUseCase);
  const subscriptionController = new SubscriptionController(subscriptionRepo);

  // Register Routes
  registerApiRoutes(server, eventController, subscriptionController);

  return server;
}