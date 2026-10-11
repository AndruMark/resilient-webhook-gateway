import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export interface RateLimiterOptions {
  readonly windowSec: number;
  readonly maxRequests: number;
}

export interface RateLimitStatus {
  readonly isAllowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetSec: number;
  readonly retryAfterSec: number;
}

export class RedisSlidingWindowRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly options: RateLimiterOptions = { windowSec: 60, maxRequests: 100 }
  ) {}

  public async evaluate(clientIdentifier: string): Promise<RateLimitStatus> {
    const key = `ratelimit:${clientIdentifier}`;
    const nowMs = Date.now();
    const windowStartMs = nowMs - this.options.windowSec * 1000;
    const requestMember = `${nowMs}-${randomUUID()}`;

    // Atomic transaction via pipeline
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStartMs);
    pipeline.zcard(key);
    // Passing '0' as string satisfies ioredis stop parameter type constraint (string | Buffer)
    pipeline.zrange(key, 0, '0');

    const results = await pipeline.exec();

    const currentCount = (results?.[1]?.[1] as number) ?? 0;
    const oldestEntries = results?.[2]?.[1] as string[] | undefined;

    const limit = this.options.maxRequests;
    const isAllowed = currentCount < limit;

    if (isAllowed) {
      const commitPipeline = this.redis.pipeline();
      commitPipeline.zadd(key, nowMs, requestMember);
      commitPipeline.expire(key, this.options.windowSec);
      await commitPipeline.exec();

      return {
        isAllowed: true,
        limit,
        remaining: Math.max(0, limit - (currentCount + 1)),
        resetSec: this.options.windowSec,
        retryAfterSec: 0,
      };
    }

    // Extract timestamp embedded directly in the member format: `${nowMs}-${uuid}`
    const oldestMember = oldestEntries?.[0];
    const oldestTimestamp = oldestMember ? Number(oldestMember.split('-')[0]) : nowMs;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestTimestamp + this.options.windowSec * 1000 - nowMs) / 1000)
    );

    return {
      isAllowed: false,
      limit,
      remaining: 0,
      resetSec: retryAfterSec,
      retryAfterSec,
    };
  }
}