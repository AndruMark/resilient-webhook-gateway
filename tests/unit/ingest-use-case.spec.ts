import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestWebhookEventUseCase } from '../../src/application/use-cases/ingest-webhook-event.use-case.js';
import { Subscription } from '../../src/domain/models/subscription.js';
import { WebhookEventRepositoryPort } from '../../src/domain/ports/webhook-event-repository.port.js';
import { SubscriptionRepositoryPort } from '../../src/domain/ports/subscription-repository.port.js';
import { InvalidCloudEventException } from '../../src/domain/errors/domain-errors.js';

describe('IngestWebhookEventUseCase', () => {
  let mockSubscriptionRepo: SubscriptionRepositoryPort;
  let mockWebhookEventRepo: WebhookEventRepositoryPort;
  let useCase: IngestWebhookEventUseCase;

  const sampleSubscription = new Subscription({
    id: 'sub_tenant_01',
    targetUrl: 'https://api.partner.com/webhook',
    secretKey: 'top_secret_hmac_key',
    subscribedEvents: ['com.payment.succeeded'],
    isActive: true,
    retryPolicy: {
      maxAttempts: 3,
      initialIntervalSec: 1,
      maxIntervalSec: 10,
      backoffMultiplier: 2,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    mockSubscriptionRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findActiveByEventType: vi.fn().mockResolvedValue([sampleSubscription]),
    };
    mockWebhookEventRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findPendingEventsForDispatch: vi.fn(),
      updateStatus: vi.fn(),
    };
    useCase = new IngestWebhookEventUseCase(mockSubscriptionRepo, mockWebhookEventRepo);
  });

  it('should ingest a valid CloudEvent and create pending WebhookEvent per subscription', () => {
    return (async () => {
      const validPayload = {
        specversion: '1.0',
        id: 'evt_ingest_100',
        source: '/billing/gateway',
        type: 'com.payment.succeeded',
        data: { amount: 2500, currency: 'USD' },
      };

      const result = await useCase.execute({ rawPayload: validPayload });

      expect(result.cloudEventId).toBe('evt_ingest_100');
      expect(result.eventType).toBe('com.payment.succeeded');
      expect(result.subscriptionsMatchedCount).toBe(1);
      expect(result.generatedWebhookEventIds).toHaveLength(1);
      expect(mockWebhookEventRepo.save).toHaveBeenCalledTimes(1);
    })();
  });

  it('should throw InvalidCloudEventException and avoid persisting when payload is invalid', async () => {
    const invalidPayload = {
      specversion: '1.0',
      // missing id, source, and type
      data: {},
    };

    await expect(useCase.execute({ rawPayload: invalidPayload })).rejects.toThrow(
      InvalidCloudEventException
    );
    expect(mockWebhookEventRepo.save).not.toHaveBeenCalled();
  });
});