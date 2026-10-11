import { ProblemDetailsException, InvalidParamDetail } from './problem-details.js';

export class InvalidCloudEventException extends ProblemDetailsException {
  constructor(detail: string, invalidParams?: readonly InvalidParamDetail[]) {
    super({
      type: 'https://gateway.internal/errors/invalid-cloud-event',
      title: 'Invalid CloudEvent Specification',
      status: 400,
      detail,
      invalidParams,
    });
  }
}

export class DuplicateEventException extends ProblemDetailsException {
  constructor(eventId: string) {
    super({
      type: 'https://gateway.internal/errors/duplicate-event',
      title: 'Conflict - Duplicate Event Detected',
      status: 409,
      detail: `An event with idempotency key or identifier '${eventId}' has already been processed.`,
    });
  }
}

export class SubscriptionNotFoundException extends ProblemDetailsException {
  constructor(subscriptionId: string) {
    super({
      type: 'https://gateway.internal/errors/subscription-not-found',
      title: 'Subscription Not Found',
      status: 404,
      detail: `The requested webhook subscription '${subscriptionId}' does not exist or is inactive.`,
    });
  }
}

export class InvalidSignatureException extends ProblemDetailsException {
  constructor(detail = 'HMAC signature verification failed.') {
    super({
      type: 'https://gateway.internal/errors/invalid-signature',
      title: 'Unauthorized - Invalid Webhook Signature',
      status: 401,
      detail,
    });
  }
}