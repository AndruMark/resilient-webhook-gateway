import { Redis } from 'ioredis';

export class RedisClientFactory {
  private static instance: Redis | null = null;

  public static getClient(): Redis {
    if (!this.instance) {
      const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
      this.instance = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false, // Do not hang requests if Redis is unreachable
        connectTimeout: 1000,
        lazyConnect: false,
        retryStrategy: (times) => {
          if (times > 3) return null; // Stop reconnect loop during disconnected test runs
          return Math.min(times * 100, 1000);
        },
      });

      this.instance.on('error', (err) => {
        // Handled silently to avoid polluting logs during graceful offline fallback
        if (!err.message.includes('ECONNREFUSED')) {
          console.error('[Redis] Unexpected error:', err.message);
        }
      });
    }

    return this.instance;
  }

  public static async close(): Promise<void> {
    if (this.instance) {
      try {
        await this.instance.quit();
      } catch {
        this.instance.disconnect();
      } finally {
        this.instance = null;
      }
    }
  }
}