# Resilient Webhook Gateway

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-black.svg?logo=fastify)](https://www.fastify.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg?logo=postgresql)](https://www.postgresql.org/)
[![CNCF CloudEvents](https://img.shields.io/badge/CNCF-CloudEvents_v1.0.2-blueviolet.svg)](https://cloudevents.io/)
[![RFC 9457](https://img.shields.io/badge/RFC-9457_Problem_Details-informational.svg)](https://datatracker.ietf.org/doc/html/rfc9457)
[![RFC 2104](https://img.shields.io/badge/RFC-2104_HMAC--SHA256-brightgreen.svg)](https://datatracker.ietf.org/doc/html/rfc2104)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An enterprise-grade, high-throughput **Webhook Ingestion and Asynchronous Dispatch Gateway** designed under **Hexagonal Architecture (Ports and Adapters)** and Domain-Driven Design (DDD) principles.

This gateway addresses the dual-write problem, transient downstream failures, network partitions, and timing attack vulnerabilities common in distributed event-driven systems.

---

## Table of Contents

- [Architectural Overview](#architectural-overview)
- [System Design & C4 Diagrams](#system-design--c4-diagrams)
- [Core Engineering Patterns & Protocols](#core-engineering-patterns--protocols)
  - [Transactional Outbox Pattern with Partial Indexing](#transactional-outbox-pattern-with-partial-indexing)
  - [CNCF CloudEvents v1.0.2 Compliance](#cncf-cloudevents-v102-compliance)
  - [RFC 9457 Standardized Error Handling](#rfc-9457-standardized-error-handling)
  - [Cryptographic Security (RFC 2104 HMAC-SHA256)](#cryptographic-security-rfc-2104-hmac-sha256)
  - [Exponential Backoff with Full Jitter](#exponential-backoff-with-full-jitter)
  - [Graceful Shutdown & Batch Concurrency Control](#graceful-shutdown--batch-concurrency-control)
- [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
- [Project Layout](#project-layout)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Database Migrations](#database-migrations)
  - [Running the Gateway](#running-the-gateway)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [End-to-End Live Demonstration](#end-to-end-live-demonstration)

---

## Architectural Overview

The gateway is decoupled into three strict concentric layers adhering to Hexagonal Architecture:

1. **Domain Layer (Core):** Pure business logic with zero framework or infrastructure dependencies. Contains the `WebhookEvent` aggregate root, `CloudEvent` value object, `Subscription` entity, `DeliveryAttempt` audit model, and the exponential backoff calculation engine.
2. **Application Layer:** Orchestrates business interactions via use cases (`IngestWebhookEventUseCase`, `DispatchWebhookEventUseCase`) using input/output DTOs and abstract Port interfaces.
3. **Infrastructure Layer:** Implements external adapters: Fastify HTTP server, RFC 9457 problem details middleware, PostgreSQL relational persistence, native `fetch` dispatchers with `AbortSignal` timeouts, and Node.js `crypto` constant-time verifiers.

---

## System Design & C4 Diagrams

### C4 Container Diagram (Ingestion & Dispatch Lifecycles)

```mermaid
flowchart TD
    subgraph Client Applications
        Publisher["Event Publisher / Microservice"]
        Consumer["Target Webhook Subscriber"]
    end

    subgraph Resilient Webhook Gateway
        direction TB
        HTTP["Fastify HTTP Ingestion Server\n(/api/v1/events)"]
        IngestUC["IngestWebhookEventUseCase"]
        OutboxWorker["OutboxDispatcherWorker\n(Background Polling Loop)"]
        DispatchUC["DispatchWebhookEventUseCase"]
        Crypto["HMAC-SHA256 Verifier\n(RFC 2104 & Constant-Time)"]
    end

    subgraph Persistence
        PG[("PostgreSQL 16\nTransactional Outbox")]
    end

    Publisher -->|POST CloudEvent v1.0.2| HTTP
    HTTP --> IngestUC
    IngestUC -->|Atomic INSERT status=PENDING| PG
    HTTP -.->|202 Accepted| Publisher

    OutboxWorker -->|SELECT ... WHERE status IN ('PENDING','FAILED')| PG
    OutboxWorker --> DispatchUC
    DispatchUC --> Crypto
    DispatchUC -->|POST Signed Webhook| Consumer
    Consumer -.->|200 OK or 5xx Error| DispatchUC
    DispatchUC -->|UPDATE status, next_retry_at, attempts| PG
```

### Event Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Ingestion (HTTP 202 Accepted)
    PENDING --> PROCESSING: Worker Batch Lock
    PROCESSING --> DELIVERED: HTTP 2xx (Success)
    PROCESSING --> FAILED: HTTP Non-2xx / Network Timeout
    FAILED --> PROCESSING: Retry at next_retry_at (Backoff + Jitter)
    FAILED --> DEAD_LETTER: max_attempts Exhausted
    DELIVERED --> [*]
    DEAD_LETTER --> [*]
```

---

## Core Engineering Patterns & Protocols

### Transactional Outbox Pattern with Partial Indexing

To guarantee **at-least-once delivery** without distributed 2-phase commits, incoming events are persisted into a relational outbox table within the local ingestion boundary. 

To eliminate performance degradation as the database scales to millions of historic records, PostgreSQL uses a targeted **Partial Index**:

```sql
CREATE INDEX IF NOT EXISTS idx_webhook_events_pending_dispatch 
ON webhook_events (next_retry_at, created_at) 
WHERE status IN ('PENDING', 'FAILED');
```

This ensures the polling worker scans exclusively active or retryable events without table scans or bloated B-tree index traversal over historical `DELIVERED` records.

### CNCF CloudEvents v1.0.2 Compliance

Incoming payloads must satisfy the CloudEvents v1.0.2 standard JSON structured format. Mandatory attributes (`specversion`, `id`, `source`, `type`, `data`) and RFC 3339 timestamps are strictly validated inside the `CloudEvent` domain value object before acceptance.

### RFC 9457 Standardized Error Handling

All HTTP errors are formatted and returned using the standard MIME type `Content-Type: application/problem+json; charset=utf-8`.

Example payload emitted upon schema validation failure:

```json
{
  "type": "https://gateway.internal/errors/invalid-cloud-event",
  "title": "Invalid CloudEvent Specification",
  "status": 400,
  "detail": "CloudEvent validation failed against specification rules.",
  "instance": "/api/v1/events",
  "invalidParams": [
    {
      "name": "specversion",
      "reason": "Must be exactly '1.0' according to CloudEvents v1.0.2 specification."
    }
  ]
}
```

### Cryptographic Security (RFC 2104 HMAC-SHA256)

Every outbound webhook delivery is signed with an HMAC-SHA256 signature using the subscriber's private shared secret. 

To defend against **Timing Attacks** (where an adversary measures microsecond variations in string comparison to extract cryptographic secrets), verification uses Node.js `crypto.timingSafeEqual` over identical byte-length buffers:

```typescript
const providedBuffer = Buffer.from(signature, 'utf8');
const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

if (providedBuffer.length !== expectedBuffer.length) {
  return false;
}

return timingSafeEqual(providedBuffer, expectedBuffer);
```

### Exponential Backoff with Full Jitter

Transient target outages are handled via exponential backoff randomized with **Full Jitter** to eliminate thundering herd synchronization:

$$\text{sleep} = \text{random}(0, \min(T_{\text{max}}, T_{\text{initial}} \times M^{\text{attempt}-1}))$$

Where:
- $T_{\text{initial}}$: Configurable initial interval (default: $2\text{s}$)
- $M$: Backoff multiplier (default: $2.0$)
- $T_{\text{max}}$: Upper backoff boundary (default: $300\text{s}$)

### Graceful Shutdown & Batch Concurrency Control

The worker executes dispatches in discrete batches bounded by `Promise.allSettled`. 

Upon receiving termination signals (`SIGINT`, `SIGTERM`), the engine drains in-flight HTTP requests, closes server sockets, flushes the database connection pool, and exits with code `0` to prevent orphaned socket connections or unhandled reconnections during cluster rolling updates.

---

## Architecture Decision Records (ADRs)

### ADR-001: Transactional Outbox Pattern vs. External Message Broker
- **Status:** Accepted
- **Context:** Ingestion must never lose an event if an external broker (e.g., RabbitMQ, Kafka) is unreachable at the instant of the HTTP request.
- **Decision:** Use PostgreSQL with a partial index as the Transactional Outbox.
- **Consequences:** Eliminates distributed dual-write inconsistencies. Database storage overhead is mitigated by index-partitioning terminal states (`DELIVERED`, `DEAD_LETTER`).

### ADR-002: Fastify over Express
- **Status:** Accepted
- **Context:** The gateway serves as a high-throughput proxy layer requiring low CPU overhead and high concurrent request throughput.
- **Decision:** Adopt Fastify due to its low routing overhead and integrated schema support.
- **Consequences:** Native asynchronous request handling, reduced memory usage, and out-of-the-box structured JSON logging via Pino.

### ADR-003: CloudEvents v1.0.2 as Canonical Schema
- **Status:** Accepted
- **Context:** Proprietary webhook payloads increase consumer coupling and complicate cross-platform integration.
- **Decision:** Enforce CNCF CloudEvents specification as the domain ingestion contract.
- **Consequences:** Standards compliance simplifies event schema registry integrations, tracing, and multi-tenant subscriptions.

---

## Project Layout

```text
├── scripts/
│   └── e2e-demo.ts                 # Full end-to-end integration simulation
├── src/
│   ├── domain/                     # Pure Enterprise Business Rules
│   │   ├── models/                 # Aggregates, Entities, Value Objects
│   │   ├── errors/                 # RFC 9457 Domain Exceptions
│   │   └── ports/                  # Inbound and Outbound Port Interfaces
│   ├── application/                # Application Business Rules
│   │   ├── use-cases/              # Ingest & Dispatch Use Cases
│   │   └── dto/                    # Command & Result Data Transfer Objects
│   ├── infrastructure/             # Frameworks, Drivers, and Adapters
│   │   ├── crypto/                 # HMAC-SHA256 Timing-Safe Verifier
│   │   ├── http/                   # Fastify Server, Controllers, Routes
│   │   ├── persistence/postgres/   # Relational Repositories & SQL Schema
│   │   └── workers/                # Transactional Outbox Dispatch Worker
│   └── index.ts                    # Composition Root & Entry Point
├── tests/
│   ├── unit/                       # Isolated Domain and Worker Unit Tests
│   └── integration/                # Fastify HTTP & RFC 9457 Inject Tests
├── docker-compose.yml              # PostgreSQL 16 & Redis 7 Infrastructure
├── start-env.ps1                   # Environment startup automation
├── stop-env.ps1                    # Environment cleanup & RAM reclamation
└── package.json                    # Dependencies & execution scripts
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) `>= 20.0.0` (Tested on Node.js v24 LTS)
- [pnpm](https://pnpm.io/) `>= 10.0.0`
- [Docker](https://www.docker.com/) & Docker Compose (or WSL2 engine)

### Environment Setup

1. Clone repository and install dependencies:
   ```bash
   git clone https://github.com/<your-user>/resilient-webhook-gateway.git
   cd resilient-webhook-gateway
   pnpm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Ensure `.env` matches your local database settings:
   ```env
   NODE_ENV=development
   PORT=3000
   HOST=0.0.0.0
   DATABASE_URL=postgresql://postgres:postgrespassword@127.0.0.1:5433/webhook_gateway
   REDIS_URL=redis://127.0.0.1:6379
   HMAC_SECRET_KEY=dev_secret_key_change_in_production_min_32_chars
   ```

3. Launch infrastructure services:
   ```powershell
   .\start-env.ps1
   # Or manually: docker compose up -d
   ```

### Database Migrations

Apply the canonical DDL schema and indexes:

```bash
pnpm db:migrate
```

### Running the Gateway

```bash
pnpm start
```

The gateway listens on `http://127.0.0.1:3000` while the background outbox worker polls for events ready for dispatch.

---

## Testing & Quality Assurance

The test suite runs using [Vitest](https://vitest.dev/) with strict coverage of domain invariants, timing resistance, and HTTP error compliance:

```bash
# Run all unit and integration test suites
pnpm test

# Run TypeScript static type-checking
pnpm typecheck
```

---

## End-to-End Live Demonstration

To observe the end-to-end flow—including ingestion, HMAC signing, simulated consumer failure (`HTTP 500`), and automatic retry recovery:

1. **Terminal 1 (Start Gateway):**
   ```bash
   pnpm start
   ```

2. **Terminal 2 (Run E2E Simulation):**
   ```bash
   pnpm tsx scripts/e2e-demo.ts
   ```

Expected output:
```text
🎯 Mock Receiver listening on http://localhost:4000/webhook
1️⃣  Registering subscription in Gateway...
✅ Subscription registered: sub_bd05c57c...
2️⃣  Ingesting CNCF CloudEvent v1.0.2 into Gateway...
✅ Ingestion HTTP Status: 202 Accepted

📩 [Mock Receiver] Received Incoming Webhook:
   - Event Type: com.ecommerce.order.created
   - Delivery Attempt: #1
   - Signature Authenticity: ✅ VALID (Authentic)
   - ⚠️ [Mock Receiver] Simulating target server failure (HTTP 500)...

📩 [Mock Receiver] Received Incoming Webhook:
   - Delivery Attempt: #2
   - Signature Authenticity: ✅ VALID (Authentic)
   - 🟢 [Mock Receiver] Processing successfully (HTTP 200 OK)
✨ Live Demonstration Finished.
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.