export interface IngestEventCommand {
  readonly rawPayload: unknown;
  readonly idempotencyKey?: string;
}

export interface IngestEventResult {
  readonly cloudEventId: string;
  readonly eventType: string;
  readonly generatedWebhookEventIds: readonly string[];
  readonly subscriptionsMatchedCount: number;
  readonly timestamp: string;
}