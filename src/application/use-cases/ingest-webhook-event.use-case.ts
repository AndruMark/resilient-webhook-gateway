import { randomUUID } from 'node:crypto';
import { CloudEvent } from '../../domain/models/cloud-event.js';
import { WebhookEvent } from '../../domain/models/webhook-event.js';
import { SubscriptionRepositoryPort } from '../../domain/ports/subscription-repository.port.js';
import { WebhookEventRepositoryPort } from '../../domain/ports/webhook-event-repository.port.js';
import { IngestEventCommand, IngestEventResult } from '../dto/ingest-event.dto.js';

export class IngestWebhookEventUseCase {
  constructor(
    private readonly subscriptionRepo: SubscriptionRepositoryPort,
    private readonly webhookEventRepo: WebhookEventRepositoryPort
  ) {}

  public async execute(command: IngestEventCommand): Promise<IngestEventResult> {
    // 1. Strict validation via Domain Value Object (Throws RFC 9457 exception on failure)
    const cloudEvent = CloudEvent.create(command.rawPayload);

    // 2. Discover active subscriptions matched to the CloudEvent type
    const matchingSubscriptions = await this.subscriptionRepo.findActiveByEventType(cloudEvent.type);

    const generatedIds: string[] = [];
    const now = new Date();

    // 3. Materialize and persist one WebhookEvent outbox entry per subscription
    for (const subscription of matchingSubscriptions) {
      const webhookEventId = `whk_${randomUUID()}`;

      const webhookEvent = new WebhookEvent({
        id: webhookEventId,
        subscriptionId: subscription.id,
        cloudEvent,
        status: 'PENDING',
        currentAttempt: 0,
        nextRetryAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await this.webhookEventRepo.save(webhookEvent);
      generatedIds.push(webhookEventId);
    }

    return {
      cloudEventId: cloudEvent.id,
      eventType: cloudEvent.type,
      generatedWebhookEventIds: generatedIds,
      subscriptionsMatchedCount: matchingSubscriptions.length,
      timestamp: now.toISOString(),
    };
  }
}