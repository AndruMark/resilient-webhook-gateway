import { FastifyInstance } from 'fastify';
import { EventController } from '../controllers/event.controller.js';
import { SubscriptionController } from '../controllers/subscription.controller.js';

export function registerApiRoutes(
  server: FastifyInstance,
  eventController: EventController,
  subscriptionController: SubscriptionController
): void {
  server.get('/health', async (_request, reply) => {
    await reply.status(200).send({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  server.post('/api/v1/events', async (request, reply) => {
    await eventController.ingest(request, reply);
  });

  server.post('/api/v1/subscriptions', async (request, reply) => {
    await subscriptionController.create(request, reply);
  });
}