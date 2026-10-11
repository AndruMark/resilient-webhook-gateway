import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';
import { DatabasePoolFactory } from './database-pool.js';

async function runMigration() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const schemaPath = join(__dirname, 'schema.sql');
  const ddl = readFileSync(schemaPath, 'utf8');

  console.log('🔄 Connecting to PostgreSQL and executing DDL migration schema...');
  const pool = DatabasePoolFactory.getPool();

  try {
    await pool.query(ddl);
    console.log('✅ PostgreSQL schema successfully migrated:');
    console.log('   - Table: subscriptions');
    console.log('   - Table: webhook_events (with partial index idx_webhook_events_pending_dispatch)');
    console.log('   - Table: delivery_attempts');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await DatabasePoolFactory.close();
  }
}

void runMigration();