export interface DeliveryAttemptProps {
  readonly attemptNumber: number;
  readonly attemptedAt: Date;
  readonly statusCode?: number;
  readonly responseBodySnippet?: string;
  readonly durationMs: number;
  readonly errorMessage?: string;
}

export class DeliveryAttempt {
  public readonly attemptNumber: number;
  public readonly attemptedAt: Date;
  public readonly statusCode?: number;
  public readonly responseBodySnippet?: string;
  public readonly durationMs: number;
  public readonly errorMessage?: string;

  constructor(props: DeliveryAttemptProps) {
    this.attemptNumber = props.attemptNumber;
    this.attemptedAt = props.attemptedAt;
    this.statusCode = props.statusCode;
    this.responseBodySnippet = props.responseBodySnippet;
    this.durationMs = props.durationMs;
    this.errorMessage = props.errorMessage;
  }

  public isSuccessful(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 200 && this.statusCode < 300;
  }
}