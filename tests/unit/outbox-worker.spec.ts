import { describe, it, expect, vi } from 'vitest';
import { OutboxDispatcherWorker } from '../../src/infrastructure/workers/outbox-dispatcher.worker.js';
import { WebhookEvent } from '../../src/domain/models/webhook-event.js';
import { CloudEvent } from '../../src/domain/models/cloud-event.js';
import { WebhookEventRepositoryPort } from '../../src/domain/ports/webhook-event-repository.port.js';
import { DispatchWebhookEventUseCase } from '../../src/application/use-cases/dispatch-webhook-event.use-case.js';

describe('OutboxDispatcherWorker Unit Tests', () => {
  const dummyEvent = new WebhookEvent({
    id: 'whk_worker_test_1',
    subscriptionId: 'sub_1',
    cloudEvent: CloudEvent.create({
      specversion: '1.0',
      id: 'evt_w1',
      source: '/tests',
      type: 'test.dispatched',
      data: {},
    }),
    status: 'PENDING',
    currentAttempt: 0,
    nextRetryAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('should query pending events and invoke dispatchUseCase for each event in the batch', async () => {
    const mockRepo: WebhookEventRepositoryPort = {
      findPendingEventsForDispatch: vi.fn().mockResolvedValue([dummyEvent]),
      findById: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };

    const mockDispatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        webhookEventId: 'whk_worker_test_1',
        status: 'DELIVERED',
        attemptNumber: 1,
        isTerminal: true,
        nextRetryAt: null,
      }),
    } as unknown as DispatchWebhookEventUseCase;

    const worker = new OutboxDispatcherWorker(mockRepo, mockDispatchUseCase, {
      pollIntervalMs: 1000,
      batchSize: 10,
    });

    const processedCount = await worker.processBatch();

    expect(processedCount).toBe(1);
    expect(mockRepo.findPendingEventsForDispatch).toHaveBeenCalledWith(10, expect.any(Date));
    expect(mockDispatchUseCase.execute).toHaveBeenCalledWith({
      webhookEventId: 'whk_worker_test_1',
    });
  });

  it('should return 0 when no events are pending dispatch', async () => {
    const mockRepo: WebhookEventRepositoryPort = {
      findPendingEventsForDispatch: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };

    const mockDispatchUseCase = {
      execute: vi.fn(),
    } as unknown as DispatchWebhookEventUseCase;

    const worker = new OutboxDispatcherWorker(mockRepo, mockDispatchUseCase);
    const count = await worker.processBatch();

    expect(count).toBe(0);
    expect(mockDispatchUseCase.execute).not.toHaveBeenCalled();
  });
});