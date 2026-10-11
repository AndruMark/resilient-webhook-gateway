import pg from 'pg';
import {
  WebhookEvent,
  EventDeliveryStatus,
  WebhookEventProps,
} from '../../../domain/models/webhook-event.js';
import { CloudEvent, CloudEventPayload } from '../../../domain/models/cloud-event.js';
import { DeliveryAttempt } from '../../../domain/models/delivery-attempt.js';
import { WebhookEventRepositoryPort } from '../../../domain/ports/webhook-event-repository.port.js';

interface WebhookEventRow {
  id: string;
  subscription_id: string;
  cloud_event: CloudEventPayload;
  status: EventDeliveryStatus;
  current_attempt: number;
  next_retry_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DeliveryAttemptRow {
  attempt_number: number;
  attempted_at: Date;
  status_code: number | null;
  response_body_snippet: string | null;
  duration_ms: number;
  error_message: string | null;
}

export class PostgresWebhookEventRepository implements WebhookEventRepositoryPort {
  constructor(private readonly pool: pg.Pool) {}

  public async save(event: WebhookEvent): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const queryEvent = `
        INSERT INTO webhook_events (
          id, subscription_id, cloud_event, status, current_attempt, next_retry_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          current_attempt = EXCLUDED.current_attempt,
          next_retry_at = EXCLUDED.next_retry_at,
          updated_at = EXCLUDED.updated_at;
      `;

      await client.query(queryEvent, [
        event.id,
        event.subscriptionId,
        JSON.stringify(event.cloudEvent.toJSON()),
        event.status,
        event.currentAttempt,
        event.nextRetryAt,
        event.createdAt,
        event.updatedAt,
      ]);

      for (const attempt of event.attempts) {
        const queryAttempt = `
          INSERT INTO delivery_attempts (
            webhook_event_id, attempt_number, attempted_at, status_code,
            response_body_snippet, duration_ms, error_message
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT DO NOTHING;
        `;
        await client.query(queryAttempt, [
          event.id,
          attempt.attemptNumber,
          attempt.attemptedAt,
          attempt.statusCode ?? null,
          attempt.responseBodySnippet ?? null,
          attempt.durationMs,
          attempt.errorMessage ?? null,
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async findById(id: string): Promise<WebhookEvent | null> {
    const query = `
      SELECT * FROM webhook_events 
      WHERE id = $1 
      LIMIT 1;
    `;
    const result = await this.pool.query<WebhookEventRow>(query, [id]);
    const row = result.rows[0];
    if (!row) return null;

    const attemptsQuery = `
      SELECT * FROM delivery_attempts 
      WHERE webhook_event_id = $1 
      ORDER BY attempt_number ASC;
    `;
    const attemptsResult = await this.pool.query<DeliveryAttemptRow>(attemptsQuery, [id]);

    const attempts = attemptsResult.rows.map(
      (a) =>
        new DeliveryAttempt({
          attemptNumber: a.attempt_number,
          attemptedAt: a.attempted_at,
          statusCode: a.status_code ?? undefined,
          responseBodySnippet: a.response_body_snippet ?? undefined,
          durationMs: a.duration_ms,
          errorMessage: a.error_message ?? undefined,
        })
    );

    const props: WebhookEventProps = {
      id: row.id,
      subscriptionId: row.subscription_id,
      cloudEvent: CloudEvent.create(row.cloud_event),
      status: row.status,
      currentAttempt: row.current_attempt,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      attempts,
    };

    return new WebhookEvent(props);
  }

  public async findPendingEventsForDispatch(
    batchSize: number,
    now: Date
  ): Promise<readonly WebhookEvent[]> {
    const query = `
      SELECT * FROM webhook_events 
      WHERE status IN ('PENDING', 'FAILED')
        AND (next_retry_at IS NULL OR next_retry_at <= $1)
      ORDER BY created_at ASC
      LIMIT $2;
    `;
    const result = await this.pool.query<WebhookEventRow>(query, [now, batchSize]);

    return result.rows.map((row) => {
      return new WebhookEvent({
        id: row.id,
        subscriptionId: row.subscription_id,
        cloudEvent: CloudEvent.create(row.cloud_event),
        status: row.status,
        currentAttempt: row.current_attempt,
        nextRetryAt: row.next_retry_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });
  }

  public async updateStatus(
    id: string,
    status: EventDeliveryStatus,
    currentAttempt: number,
    nextRetryAt: Date | null
  ): Promise<void> {
    const query = `
      UPDATE webhook_events 
      SET status = $1,
          current_attempt = $2,
          next_retry_at = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4;
    `;
    await this.pool.query(query, [status, currentAttempt, nextRetryAt, id]);
  }
}