import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchWebhookEventUseCase } from '../../src/application/use-cases/dispatch-webhook-event.use-case.js';
import { WebhookEvent } from '../../src/domain/models/webhook-event.js';
import { CloudEvent } from '../../src/domain/models/cloud-event.js';
import { Subscription } from '../../src/domain/models/subscription.js';
import { WebhookEventRepositoryPort } from '../../src/domain/ports/webhook-event-repository.port.js';
import { SubscriptionRepositoryPort } from '../../src/domain/ports/subscription-repository.port.js';
import { WebhookDispatcherPort } from '../../src/domain/ports/webhook-dispatcher.port.js';
import { SignatureVerifierPort } from '../../src/domain/ports/signature-verifier.port.js';

describe('DispatchWebhookEventUseCase', () => {
  let mockWebhookEventRepo: WebhookEventRepositoryPort;
  let mockSubscriptionRepo: SubscriptionRepositoryPort;
  let mockDispatcher: WebhookDispatcherPort;
  let mockSignatureVerifier: SignatureVerifierPort;
  let useCase: DispatchWebhookEventUseCase;

  const testSubscription = new Subscription({
    id: 'sub_test_01',
    targetUrl: 'https://consumer.app/webhook',
    secretKey: 'secure_webhook_secret',
    subscribedEvents: ['*'],
    isActive: true,
    retryPolicy: {
      maxAttempts: 2,
      initialIntervalSec: 1,
      maxIntervalSec: 5,
      backoffMultiplier: 2,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const testCloudEvent = CloudEvent.create({
    specversion: '1.0',
    id: 'evt_dispatch_1',
    source: '/test',
    type: 'order.shipped',
    data: { tracking: 'TRK12345' },
  });

  beforeEach(() => {
    mockSignatureVerifier = {
      signPayload: vi.fn().mockReturnValue('sha256=mocked_hex_signature'),
      verify: vi.fn().mockReturnValue(true),
    };
    mockDispatcher = {
      dispatch: vi.fn(),
    };
  });

  it('should deliver event on HTTP 200, compute signature, and transition status to DELIVERED', async () => {
    const testWebhookEvent = new WebhookEvent({
      id: 'whk_dispatch_test',
      subscriptionId: testSubscription.id,
      cloudEvent: testCloudEvent,
      status: 'PENDING',
      currentAttempt: 0,
      nextRetryAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockWebhookEventRepo = {
      findById: vi.fn().mockResolvedValue(testWebhookEvent),
      save: vi.fn(),
      findPendingEventsForDispatch: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    mockSubscriptionRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(testSubscription),
      findActiveByEventType: vi.fn(),
    };
    mockDispatcher.dispatch = vi.fn().mockResolvedValue({
      statusCode: 200,
      durationMs: 38,
      responseBodySnippet: '{"ok":true}',
    });

    useCase = new DispatchWebhookEventUseCase(
      mockWebhookEventRepo,
      mockSubscriptionRepo,
      mockDispatcher,
      mockSignatureVerifier
    );

    const result = await useCase.execute({ webhookEventId: 'whk_dispatch_test' });

    expect(result.status).toBe('DELIVERED');
    expect(result.attemptNumber).toBe(1);
    expect(result.isTerminal).toBe(true);
    expect(mockSignatureVerifier.signPayload).toHaveBeenCalled();
    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      'https://consumer.app/webhook',
      expect.any(String),
      expect.objectContaining({
        'X-Webhook-Signature': 'sha256=mocked_hex_signature',
        'Content-Type': 'application/cloudevents+json; charset=utf-8',
      })
    );
    expect(mockWebhookEventRepo.updateStatus).toHaveBeenCalledWith(
      'whk_dispatch_test',
      'DELIVERED',
      1,
      null
    );
  });

  it('should mark status as DEAD_LETTER when maximum retry attempts are exhausted', async () => {
    const failedEvent = new WebhookEvent({
      id: 'whk_exhausted_test',
      subscriptionId: testSubscription.id,
      cloudEvent: testCloudEvent,
      status: 'FAILED',
      currentAttempt: 1, // Next will be attempt 2, which equals maxAttempts (2)
      nextRetryAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockWebhookEventRepo = {
      findById: vi.fn().mockResolvedValue(failedEvent),
      save: vi.fn(),
      findPendingEventsForDispatch: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    mockSubscriptionRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(testSubscription),
      findActiveByEventType: vi.fn(),
    };
    mockDispatcher.dispatch = vi.fn().mockResolvedValue({
      statusCode: 500,
      durationMs: 150,
      errorMessage: 'Internal Server Error',
    });

    useCase = new DispatchWebhookEventUseCase(
      mockWebhookEventRepo,
      mockSubscriptionRepo,
      mockDispatcher,
      mockSignatureVerifier
    );

    const result = await useCase.execute({ webhookEventId: 'whk_exhausted_test' });

    expect(result.status).toBe('DEAD_LETTER');
    expect(result.attemptNumber).toBe(2);
    expect(result.isTerminal).toBe(true);
    expect(result.nextRetryAt).toBeNull();
    expect(mockWebhookEventRepo.updateStatus).toHaveBeenCalledWith(
      'whk_exhausted_test',
      'DEAD_LETTER',
      2,
      null
    );
  });
});