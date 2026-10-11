export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialIntervalSec: number;
  readonly maxIntervalSec: number;
  readonly backoffMultiplier: number;
}

export interface SubscriptionProps {
  readonly id: string;
  readonly targetUrl: string;
  readonly secretKey: string;
  readonly subscribedEvents: readonly string[]; // Types of CloudEvents subscribed to, or ['*']
  readonly isActive: boolean;
  readonly retryPolicy: RetryPolicy;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Subscription {
  public readonly id: string;
  public readonly targetUrl: string;
  public readonly secretKey: string;
  public readonly subscribedEvents: readonly string[];
  public readonly isActive: boolean;
  public readonly retryPolicy: RetryPolicy;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: SubscriptionProps) {
    this.id = props.id;
    this.targetUrl = props.targetUrl;
    this.secretKey = props.secretKey;
    this.subscribedEvents = props.subscribedEvents;
    this.isActive = props.isActive;
    this.retryPolicy = props.retryPolicy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public matchesEvent(eventType: string): boolean {
    if (!this.isActive) return false;
    return this.subscribedEvents.includes('*') || this.subscribedEvents.includes(eventType);
  }
}