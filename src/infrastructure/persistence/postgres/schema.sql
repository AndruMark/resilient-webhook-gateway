-- Resilient Webhook Gateway - Canonical PostgreSQL Schema

CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    target_url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    subscribed_events TEXT[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    retry_max_attempts INT NOT NULL DEFAULT 5,
    retry_initial_interval_sec INT NOT NULL DEFAULT 2,
    retry_max_interval_sec INT NOT NULL DEFAULT 300,
    retry_backoff_multiplier REAL NOT NULL DEFAULT 2.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_is_active 
ON subscriptions (is_active);

CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(64) PRIMARY KEY,
    subscription_id VARCHAR(64) NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    cloud_event JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    current_attempt INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Partial index strictly covering undispatched or failed events requiring retry
CREATE INDEX IF NOT EXISTS idx_webhook_events_pending_dispatch 
ON webhook_events (next_retry_at, created_at) 
WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_webhook_events_subscription_id 
ON webhook_events (subscription_id);

CREATE TABLE IF NOT EXISTS delivery_attempts (
    id BIGSERIAL PRIMARY KEY,
    webhook_event_id VARCHAR(64) NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status_code INT,
    response_body_snippet TEXT,
    duration_ms INT NOT NULL,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_event_id 
ON delivery_attempts (webhook_event_id, attempt_number);