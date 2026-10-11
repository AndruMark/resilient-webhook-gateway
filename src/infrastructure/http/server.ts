import Fastify, { FastifyInstance } from 'fastify';
import { problemDetailsErrorHandler } from './middlewares/error-handler.js';
import { DatabasePoolFactory } from '../persistence/postgres/database-pool.js';
import { PostgresSubscriptionRepository } from '../persistence/postgres/postgres-subscription.repository.js';
import { PostgresWebhookEventRepository } from '../persistence/postgres/postgres-webhook-event.repository.js';
import { IngestWebhookEventUseCase } from '../../application/use-cases/ingest-webhook-event.use-case.js';
import { EventController } from './controllers/event.controller.js';
import { SubscriptionController } from './controllers/subscription.controller.js';
import { registerApiRoutes } from './routes/api.routes.js';
import { RedisClientFactory } from '../cache/redis-client.js';
import { RedisSlidingWindowRateLimiter } from '../cache/redis-rate-limiter.js';
import { RateLimitExceededException } from '../../domain/errors/domain-errors.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // Attach RFC 9457 Global Error Handler
  server.setErrorHandler(problemDetailsErrorHandler);

  // Rate Limiting Setup (Redis Sliding Window: 60s, max 100 requests per IP)
  const redisClient = RedisClientFactory.getClient();
  const rateLimiter = new RedisSlidingWindowRateLimiter(redisClient, {
    windowSec: 60,
    maxRequests: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
  });

  server.addHook('onRequest', async (request, reply) => {
    // Exclude healthcheck from rate limiting
    if (request.url === '/health') return;

    try {
      const clientId = request.ip || 'anonymous';
      const status = await rateLimiter.evaluate(clientId);

      reply.header('RateLimit-Limit', status.limit);
      reply.header('RateLimit-Remaining', status.remaining);
      reply.header('RateLimit-Reset', status.resetSec);

      if (!status.isAllowed) {
        reply.header('Retry-After', status.retryAfterSec);
        throw new RateLimitExceededException(status.retryAfterSec);
      }
    } catch (err) {
      // Re-throw genuine rate limit violations (RFC 9457 HTTP 429)
      if (err instanceof RateLimitExceededException) {
        throw err;
      }
      // Fail-open pattern: If Redis is unavailable, maintain API availability
      request.log.warn('Rate limiter store offline. Failing open to preserve availability.');
    }
  });

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