import { EventDeliveryStatus } from '../../domain/models/webhook-event.js';

export interface DispatchEventCommand {
  readonly webhookEventId: string;
}

export interface DispatchEventResult {
  readonly webhookEventId: string;
  readonly status: EventDeliveryStatus;
  readonly attemptNumber: number;
  readonly isTerminal: boolean;
  readonly nextRetryAt: Date | null;
  readonly statusCode?: number;
}