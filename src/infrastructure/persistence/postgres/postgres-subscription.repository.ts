import pg from 'pg';
import { Subscription, SubscriptionProps } from '../../../domain/models/subscription.js';
import { SubscriptionRepositoryPort } from '../../../domain/ports/subscription-repository.port.js';

interface SubscriptionRow {
  id: string;
  target_url: string;
  secret_key: string;
  subscribed_events: string[];
  is_active: boolean;
  retry_max_attempts: number;
  retry_initial_interval_sec: number;
  retry_max_interval_sec: number;
  retry_backoff_multiplier: number;
  created_at: Date;
  updated_at: Date;
}

export class PostgresSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly pool: pg.Pool) {}

  public async findById(id: string): Promise<Subscription | null> {
    const query = `
      SELECT * FROM subscriptions 
      WHERE id = $1 
      LIMIT 1;
    `;
    const result = await this.pool.query<SubscriptionRow>(query, [id]);
    const row = result.rows[0];

    return row ? this.mapRowToEntity(row) : null;
  }

  public async findActiveByEventType(eventType: string): Promise<readonly Subscription[]> {
    const query = `
      SELECT * FROM subscriptions 
      WHERE is_active = TRUE 
        AND ($1 = ANY(subscribed_events) OR '*' = ANY(subscribed_events));
    `;
    const result = await this.pool.query<SubscriptionRow>(query, [eventType]);
    return result.rows.map((row) => this.mapRowToEntity(row));
  }

  public async save(subscription: Subscription): Promise<void> {
    const query = `
      INSERT INTO subscriptions (
        id, target_url, secret_key, subscribed_events, is_active,
        retry_max_attempts, retry_initial_interval_sec, retry_max_interval_sec,
        retry_backoff_multiplier, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        target_url = EXCLUDED.target_url,
        secret_key = EXCLUDED.secret_key,
        subscribed_events = EXCLUDED.subscribed_events,
        is_active = EXCLUDED.is_active,
        retry_max_attempts = EXCLUDED.retry_max_attempts,
        retry_initial_interval_sec = EXCLUDED.retry_initial_interval_sec,
        retry_max_interval_sec = EXCLUDED.retry_max_interval_sec,
        retry_backoff_multiplier = EXCLUDED.retry_backoff_multiplier,
        updated_at = EXCLUDED.updated_at;
    `;

    await this.pool.query(query, [
      subscription.id,
      subscription.targetUrl,
      subscription.secretKey,
      subscription.subscribedEvents,
      subscription.isActive,
      subscription.retryPolicy.maxAttempts,
      subscription.retryPolicy.initialIntervalSec,
      subscription.retryPolicy.maxIntervalSec,
      subscription.retryPolicy.backoffMultiplier,
      subscription.createdAt,
      subscription.updatedAt,
    ]);
  }

  private mapRowToEntity(row: SubscriptionRow): Subscription {
    const props: SubscriptionProps = {
      id: row.id,
      targetUrl: row.target_url,
      secretKey: row.secret_key,
      subscribedEvents: row.subscribed_events,
      isActive: row.is_active,
      retryPolicy: {
        maxAttempts: row.retry_max_attempts,
        initialIntervalSec: row.retry_initial_interval_sec,
        maxIntervalSec: row.retry_max_interval_sec,
        backoffMultiplier: row.retry_backoff_multiplier,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return new Subscription(props);
  }
}