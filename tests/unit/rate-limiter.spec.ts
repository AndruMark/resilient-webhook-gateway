import { describe, it, expect, vi } from 'vitest';
import { Redis } from 'ioredis';
import { RedisSlidingWindowRateLimiter } from '../../src/infrastructure/cache/redis-rate-limiter.js';

describe('RedisSlidingWindowRateLimiter Unit Tests', () => {
  it('should allow requests when current count is strictly below maximum threshold', async () => {
    const mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zrange: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0], // removed
        [null, 2], // current count = 2
        [null, []], // oldest entries
      ]),
    };

    const mockRedis = {
      pipeline: vi.fn().mockReturnValue(mockPipeline),
    } as unknown as Redis;

    const limiter = new RedisSlidingWindowRateLimiter(mockRedis, {
      windowSec: 60,
      maxRequests: 5,
    });

    const status = await limiter.evaluate('client_ip_1');

    expect(status.isAllowed).toBe(true);
    expect(status.remaining).toBe(2); // 5 - (2 + 1)
    expect(mockPipeline.zadd).toHaveBeenCalled();
  });

  it('should block requests and calculate retryAfterSec when maximum limit is reached', async () => {
    const now = Date.now();
    const mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zrange: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 5], // current count = 5 (limit is 5)
        [null, [`${now}-dummy-uuid`]],
      ]),
    };

    const mockRedis = {
      pipeline: vi.fn().mockReturnValue(mockPipeline),
    } as unknown as Redis;

    const limiter = new RedisSlidingWindowRateLimiter(mockRedis, {
      windowSec: 60,
      maxRequests: 5,
    });

    const status = await limiter.evaluate('client_ip_2');

    expect(status.isAllowed).toBe(false);
    expect(status.remaining).toBe(0);
    expect(status.retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});