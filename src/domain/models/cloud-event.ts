import { InvalidCloudEventException } from '../errors/domain-errors.js';
import { InvalidParamDetail } from '../errors/problem-details.js';

export interface CloudEventPayload<T = unknown> {
  readonly id: string;
  readonly source: string;
  readonly specversion: string;
  readonly type: string;
  readonly datacontenttype?: string;
  readonly dataschema?: string;
  readonly subject?: string;
  readonly time?: string;
  readonly data: T;
  readonly [key: string]: unknown;
}

export class CloudEvent<T = unknown> {
  public readonly id: string;
  public readonly source: string;
  public readonly specversion: string;
  public readonly type: string;
  public readonly datacontenttype?: string;
  public readonly dataschema?: string;
  public readonly subject?: string;
  public readonly time: string;
  public readonly data: T;

  private constructor(payload: CloudEventPayload<T>) {
    this.id = payload.id;
    this.source = payload.source;
    this.specversion = payload.specversion;
    this.type = payload.type;
    this.datacontenttype = payload.datacontenttype ?? 'application/json';
    this.dataschema = payload.dataschema;
    this.subject = payload.subject;
    this.time = payload.time ?? new Date().toISOString();
    this.data = payload.data;
  }

  /**
   * Factory method to create and validate a CloudEvent following CNCF v1.0.2 specification.
   * Throws InvalidCloudEventException (RFC 9457) if validation fails.
   */
  public static create<T = unknown>(raw: unknown): CloudEvent<T> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new InvalidCloudEventException('The event payload must be a non-null JSON object.');
    }

    const payload = raw as Record<string, unknown>;
    const invalidParams: InvalidParamDetail[] = [];

    // specversion validation
    if (typeof payload['specversion'] !== 'string' || payload['specversion'] !== '1.0') {
      invalidParams.push({
        name: 'specversion',
        reason: "Must be exactly '1.0' according to CloudEvents v1.0.2 specification.",
      });
    }

    // id validation
    if (typeof payload['id'] !== 'string' || payload['id'].trim().length === 0) {
      invalidParams.push({
        name: 'id',
        reason: 'Attribute is mandatory and must be a non-empty string.',
      });
    }

    // source validation (must be valid URI-reference)
    if (typeof payload['source'] !== 'string' || payload['source'].trim().length === 0) {
      invalidParams.push({
        name: 'source',
        reason: 'Attribute is mandatory and must be a valid URI-reference string.',
      });
    }

    // type validation
    if (typeof payload['type'] !== 'string' || payload['type'].trim().length === 0) {
      invalidParams.push({
        name: 'type',
        reason: 'Attribute is mandatory and must be a non-empty string describing the event.',
      });
    }

    // time validation (RFC 3339 string if provided)
    if (payload['time'] !== undefined) {
      if (typeof payload['time'] !== 'string' || Number.isNaN(Date.parse(payload['time']))) {
        invalidParams.push({
          name: 'time',
          reason: 'Attribute must be a valid RFC 3339 timestamp (e.g., 2026-10-10T23:00:00Z).',
        });
      }
    }

    // data payload validation
    if (payload['data'] === undefined) {
      invalidParams.push({
        name: 'data',
        reason: 'Event data section is required.',
      });
    }

    if (invalidParams.length > 0) {
      throw new InvalidCloudEventException(
        'CloudEvent validation failed against specification rules.',
        invalidParams
      );
    }

    return new CloudEvent<T>(payload as unknown as CloudEventPayload<T>);
  }

  public toJSON(): CloudEventPayload<T> {
    return {
      id: this.id,
      source: this.source,
      specversion: this.specversion,
      type: this.type,
      datacontenttype: this.datacontenttype,
      ...(this.dataschema && { dataschema: this.dataschema }),
      ...(this.subject && { subject: this.subject }),
      time: this.time,
      data: this.data,
    };
  }
}