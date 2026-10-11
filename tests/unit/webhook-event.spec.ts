import { describe, it, expect } from 'vitest';
import { WebhookEvent } from '../../src/domain/models/webhook-event.js';
import { CloudEvent } from '../../src/domain/models/cloud-event.js';
import { DeliveryAttempt } from '../../src/domain/models/delivery-attempt.js';
import { RetryPolicy } from '../../src/domain/models/subscription.js';

describe('WebhookEvent Lifecycle & Backoff State Machine', () => {
  const dummyCloudEvent = CloudEvent.create({
    specversion: '1.0',
    id: 'evt_abc_1',
    source: '/test',
    type: 'test.event',
    data: {},
  });

  const retryPolicy: RetryPolicy = {
    maxAttempts: 3,
    initialIntervalSec: 2,
    maxIntervalSec: 60,
    backoffMultiplier: 2,
  };

  it('should mark event as DELIVERED when delivery attempt succeeds with 200 OK', () => {
    const event = new WebhookEvent({
      id: 'wh_1',
      subscriptionId: 'sub_1',
      cloudEvent: dummyCloudEvent,
      status: 'PENDING',
      currentAttempt: 0,
      nextRetryAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const attempt = new DeliveryAttempt({
      attemptNumber: 1,
      attemptedAt: new Date(),
      statusCode: 200,
      durationMs: 45,
    });

    event.recordAttempt(attempt, retryPolicy);

    expect(event.status).toBe('DELIVERED');
    expect(event.currentAttempt).toBe(1);
    expect(event.nextRetryAt).toBeNull();
  });

  it('should transition to FAILED and schedule nextRetryAt when attempt fails below maxAttempts', () => {
    const event = new WebhookEvent({
      id: 'wh_2',
      subscriptionId: 'sub_1',
      cloudEvent: dummyCloudEvent,
      status: 'PENDING',
      currentAttempt: 0,
      nextRetryAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const failedAttempt = new DeliveryAttempt({
      attemptNumber: 1,
      attemptedAt: new Date(),
      statusCode: 503,
      durationMs: 120,
      errorMessage: 'Service Unavailable',
    });

    event.recordAttempt(failedAttempt, retryPolicy);

    expect(event.status).toBe('FAILED');
    expect(event.currentAttempt).toBe(1);
    expect(event.nextRetryAt).toBeInstanceOf(Date);
    expect(event.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should move to DEAD_LETTER when maximum retry attempts are exhausted', () => {
    const event = new WebhookEvent({
      id: 'wh_3',
      subscriptionId: 'sub_1',
      cloudEvent: dummyCloudEvent,
      status: 'FAILED',
      currentAttempt: 2,
      nextRetryAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const finalAttempt = new DeliveryAttempt({
      attemptNumber: 3, // equals maxAttempts
      attemptedAt: new Date(),
      statusCode: 500,
      durationMs: 95,
      errorMessage: 'Internal Server Error',
    });

    event.recordAttempt(finalAttempt, retryPolicy);

    expect(event.status).toBe('DEAD_LETTER');
    expect(event.currentAttempt).toBe(3);
    expect(event.nextRetryAt).toBeNull();
  });
});