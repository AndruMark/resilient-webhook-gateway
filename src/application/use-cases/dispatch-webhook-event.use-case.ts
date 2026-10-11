import { DeliveryAttempt } from '../../domain/models/delivery-attempt.js';
import { SubscriptionNotFoundException } from '../../domain/errors/domain-errors.js';
import { ProblemDetailsException } from '../../domain/errors/problem-details.js';
import { WebhookEventRepositoryPort } from '../../domain/ports/webhook-event-repository.port.js';
import { SubscriptionRepositoryPort } from '../../domain/ports/subscription-repository.port.js';
import { WebhookDispatcherPort } from '../../domain/ports/webhook-dispatcher.port.js';
import { SignatureVerifierPort } from '../../domain/ports/signature-verifier.port.js';
import { DispatchEventCommand, DispatchEventResult } from '../dto/dispatch-event.dto.js';

export class WebhookEventNotFoundException extends ProblemDetailsException {
  constructor(id: string) {
    super({
      type: 'https://gateway.internal/errors/webhook-event-not-found',
      title: 'Webhook Event Not Found',
      status: 404,
      detail: `Webhook event with ID '${id}' was not found.`,
    });
  }
}

export class DispatchWebhookEventUseCase {
  constructor(
    private readonly webhookEventRepo: WebhookEventRepositoryPort,
    private readonly subscriptionRepo: SubscriptionRepositoryPort,
    private readonly dispatcher: WebhookDispatcherPort,
    private readonly signatureVerifier: SignatureVerifierPort
  ) {}

  public async execute(command: DispatchEventCommand): Promise<DispatchEventResult> {
    const event = await this.webhookEventRepo.findById(command.webhookEventId);
    if (!event) {
      throw new WebhookEventNotFoundException(command.webhookEventId);
    }

    const subscription = await this.subscriptionRepo.findById(event.subscriptionId);
    if (!subscription || !subscription.isActive) {
      throw new SubscriptionNotFoundException(event.subscriptionId);
    }

    // 1. Serialize payload according to CloudEvents JSON Structured Mode
    const serializedPayload = JSON.stringify(event.cloudEvent.toJSON());

    // 2. Cryptographic signing with HMAC-SHA256 (RFC 2104)
    const signature = this.signatureVerifier.signPayload(
      serializedPayload,
      subscription.secretKey
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/cloudevents+json; charset=utf-8',
      'X-Webhook-Id': event.id,
      'X-Webhook-Event-Type': event.cloudEvent.type,
      'X-Webhook-Attempt': (event.currentAttempt + 1).toString(),
      'X-Webhook-Signature': signature,
      'User-Agent': 'Resilient-Webhook-Gateway/1.0.0',
    };

    // 3. Execute HTTP Dispatch via Port
    const dispatchResult = await this.dispatcher.dispatch(
      subscription.targetUrl,
      serializedPayload,
      headers
    );

    // 4. Create attempt audit log and evaluate domain lifecycle state transition
    const attempt = new DeliveryAttempt({
      attemptNumber: event.currentAttempt + 1,
      attemptedAt: new Date(),
      statusCode: dispatchResult.statusCode,
      responseBodySnippet: dispatchResult.responseBodySnippet,
      durationMs: dispatchResult.durationMs,
      errorMessage: dispatchResult.errorMessage,
    });

    event.recordAttempt(attempt, subscription.retryPolicy);

    // 5. Update persistence state
    await this.webhookEventRepo.updateStatus(
      event.id,
      event.status,
      event.currentAttempt,
      event.nextRetryAt
    );

    const isTerminal = event.status === 'DELIVERED' || event.status === 'DEAD_LETTER';

    return {
      webhookEventId: event.id,
      status: event.status,
      attemptNumber: event.currentAttempt,
      isTerminal,
      nextRetryAt: event.nextRetryAt,
      statusCode: dispatchResult.statusCode,
    };
  }
}