import { WebhookEvent, EventDeliveryStatus } from '../models/webhook-event.js';

export interface WebhookEventRepositoryPort {
  save(event: WebhookEvent): Promise<void>;
  findById(id: string): Promise<WebhookEvent | null>;
  findPendingEventsForDispatch(batchSize: number, now: Date): Promise<readonly WebhookEvent[]>;
  updateStatus(
    id: string,
    status: EventDeliveryStatus,
    currentAttempt: number,
    nextRetryAt: Date | null
  ): Promise<void>;
}