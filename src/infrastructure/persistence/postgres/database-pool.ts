import pg from 'pg';

const { Pool } = pg;

export interface DatabaseConfig {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
}

export class DatabasePoolFactory {
  private static poolInstance: pg.Pool | null = null;

  public static getPool(config?: DatabaseConfig): pg.Pool {
    if (!this.poolInstance) {
      const connectionString =
        config?.connectionString ??
        process.env['DATABASE_URL'] ??
        'postgresql://postgres:postgrespassword@localhost:5433/webhook_gateway';

      this.poolInstance = new Pool({
        connectionString,
        max: config?.maxConnections ?? 20,
        idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
        connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5000,
      });

      this.poolInstance.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client:', err);
      });
    }

    return this.poolInstance;
  }

  public static async close(): Promise<void> {
    if (this.poolInstance) {
      await this.poolInstance.end();
      this.poolInstance = null;
    }
  }
}