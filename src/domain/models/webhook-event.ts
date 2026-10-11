import { CloudEvent } from './cloud-event.js';
import { DeliveryAttempt } from './delivery-attempt.js';
import { RetryPolicy } from './subscription.js';

export type EventDeliveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'DEAD_LETTER';

export interface WebhookEventProps {
  readonly id: string;
  readonly subscriptionId: string;
  readonly cloudEvent: CloudEvent;
  readonly status: EventDeliveryStatus;
  readonly currentAttempt: number;
  readonly nextRetryAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly attempts?: readonly DeliveryAttempt[];
}

export class WebhookEvent {
  public readonly id: string;
  public readonly subscriptionId: string;
  public readonly cloudEvent: CloudEvent;
  private _status: EventDeliveryStatus;
  private _currentAttempt: number;
  private _nextRetryAt: Date | null;
  private _updatedAt: Date;
  private readonly _attempts: DeliveryAttempt[];

  constructor(props: WebhookEventProps) {
    this.id = props.id;
    this.subscriptionId = props.subscriptionId;
    this.cloudEvent = props.cloudEvent;
    this._status = props.status;
    this._currentAttempt = props.currentAttempt;
    this._nextRetryAt = props.nextRetryAt;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._attempts = props.attempts ? [...props.attempts] : [];
  }

  public readonly createdAt: Date;

  public get status(): EventDeliveryStatus {
    return this._status;
  }

  public get currentAttempt(): number {
    return this._currentAttempt;
  }

  public get nextRetryAt(): Date | null {
    return this._nextRetryAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public get attempts(): readonly DeliveryAttempt[] {
    return [...this._attempts];
  }

  /**
   * Registers a delivery attempt and computes next status & backoff time according to policy.
   */
  public recordAttempt(attempt: DeliveryAttempt, policy: RetryPolicy): void {
    this._attempts.push(attempt);
    this._currentAttempt = attempt.attemptNumber;
    this._updatedAt = new Date();

    if (attempt.isSuccessful()) {
      this._status = 'DELIVERED';
      this._nextRetryAt = null;
      return;
    }

    if (this._currentAttempt >= policy.maxAttempts) {
      this._status = 'DEAD_LETTER';
      this._nextRetryAt = null;
      return;
    }

    this._status = 'FAILED';
    this._nextRetryAt = this.calculateNextRetry(this._currentAttempt, policy);
  }

  /**
   * Exponential backoff algorithm with full jitter:
   * temp = min(maxInterval, initialInterval * (backoffMultiplier ^ attempt))
   * sleep = random(0, temp)
   */
  public calculateNextRetry(attempt: number, policy: RetryPolicy): Date {
    const rawBackoffSec =
      policy.initialIntervalSec * Math.pow(policy.backoffMultiplier, attempt - 1);
    const cappedBackoffSec = Math.min(policy.maxIntervalSec, rawBackoffSec);
    const jitteredBackoffSec = Math.random() * cappedBackoffSec;

    const nextRetryDate = new Date();
    nextRetryDate.setSeconds(nextRetryDate.getSeconds() + Math.max(1, Math.floor(jitteredBackoffSec)));
    return nextRetryDate;
  }
}