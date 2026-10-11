import 'dotenv/config';
import { buildServer } from './infrastructure/http/server.js';
import { DatabasePoolFactory } from './infrastructure/persistence/postgres/database-pool.js';
import { PostgresWebhookEventRepository } from './infrastructure/persistence/postgres/postgres-webhook-event.repository.js';
import { PostgresSubscriptionRepository } from './infrastructure/persistence/postgres/postgres-subscription.repository.js';
import { FetchWebhookDispatcher } from './infrastructure/http/fetch-webhook-dispatcher.js';
import { NodeCryptoSignatureVerifier } from './infrastructure/crypto/node-crypto-signature-verifier.js';
import { DispatchWebhookEventUseCase } from './application/use-cases/dispatch-webhook-event.use-case.js';
import { OutboxDispatcherWorker } from './infrastructure/workers/outbox-dispatcher.worker.js';

const port = Number(process.env['PORT'] ?? 3000);
const host = process.env['HOST'] ?? '0.0.0.0';

const pool = DatabasePoolFactory.getPool();
const webhookEventRepo = new PostgresWebhookEventRepository(pool);
const subscriptionRepo = new PostgresSubscriptionRepository(pool);
const dispatcher = new FetchWebhookDispatcher(5000);
const signatureVerifier = new NodeCryptoSignatureVerifier();

const dispatchUseCase = new DispatchWebhookEventUseCase(
  webhookEventRepo,
  subscriptionRepo,
  dispatcher,
  signatureVerifier
);

const worker = new OutboxDispatcherWorker(webhookEventRepo, dispatchUseCase, {
  pollIntervalMs: 2000,
  batchSize: 20,
});

const server = buildServer();

async function start() {
  try {
    await server.listen({ port, host });
    console.log(`🚀 Gateway HTTP API listening on http://${host}:${port}`);

    // Start background asynchronous outbox worker
    worker.start();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown handling
const signals = ['SIGINT', 'SIGTERM'] as const;
for (const signal of signals) {
  process.on(signal, () => {
    void (async () => {
      console.log(`\n🛑 Received ${signal}, closing gracefully...`);
      await worker.stop();
      await server.close();
      await DatabasePoolFactory.close();
      console.log('✅ Services cleanly terminated.');
      process.exit(0);
    })();
  });
}

void start();