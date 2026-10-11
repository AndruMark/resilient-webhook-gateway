import { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Subscription } from '../../../domain/models/subscription.js';
import { SubscriptionRepositoryPort } from '../../../domain/ports/subscription-repository.port.js';
import { ProblemDetailsException } from '../../../domain/errors/problem-details.js';

interface CreateSubscriptionBody {
  targetUrl: string;
  secretKey: string;
  subscribedEvents: string[];
  maxAttempts?: number;
  initialIntervalSec?: number;
}

export class SubscriptionController {
  constructor(private readonly subscriptionRepo: SubscriptionRepositoryPort) {}

  public async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as CreateSubscriptionBody;

    if (!body || !body.targetUrl || !body.secretKey || !Array.isArray(body.subscribedEvents)) {
      throw new (class extends ProblemDetailsException {
        constructor() {
          super({
            type: 'https://gateway.internal/errors/invalid-subscription-payload',
            title: 'Unprocessable Subscription Payload',
            status: 422,
            detail: 'targetUrl, secretKey, and subscribedEvents array are mandatory.',
          });
        }
      })();
    }

    const subscription = new Subscription({
      id: `sub_${randomUUID()}`,
      targetUrl: body.targetUrl,
      secretKey: body.secretKey,
      subscribedEvents: body.subscribedEvents,
      isActive: true,
      retryPolicy: {
        maxAttempts: body.maxAttempts ?? 5,
        initialIntervalSec: body.initialIntervalSec ?? 2,
        maxIntervalSec: 300,
        backoffMultiplier: 2.0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.subscriptionRepo.save(subscription);

    await reply.status(201).send({
      id: subscription.id,
      targetUrl: subscription.targetUrl,
      subscribedEvents: subscription.subscribedEvents,
      isActive: subscription.isActive,
      retryPolicy: subscription.retryPolicy,
      createdAt: subscription.createdAt.toISOString(),
    });
  }
}