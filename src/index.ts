import 'dotenv/config';
import { buildServer } from './infrastructure/http/server.js';
import { DatabasePoolFactory } from './infrastructure/persistence/postgres/database-pool.js';

const port = Number(process.env['PORT'] ?? 3000);
const host = process.env['HOST'] ?? '0.0.0.0';

const server = buildServer();

async function start() {
  try {
    await server.listen({ port, host });
    console.log(`🚀 Resilient Webhook Gateway active on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown handling (SIGINT, SIGTERM)
const signals = ['SIGINT', 'SIGTERM'] as const;
for (const signal of signals) {
  process.on(signal, () => {
    void (async () => {
      console.log(`\n🛑 Received ${signal}, closing server gracefully...`);
      await server.close();
      await DatabasePoolFactory.close();
      console.log('✅ Connections closed. Process terminated.');
      process.exit(0);
    })();
  });
}

void start();