import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Sliding-window rate limiter backed by Redis.
 * @param key   unique key per resource (e.g. `scan:${ip}`)
 * @param limit max requests allowed in the window
 * @param windowSeconds window duration in seconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowKey = `rl:${key}`;

    const multi = redis.multi();
    multi.zremrangebyscore(windowKey, 0, now - windowMs);
    multi.zcard(windowKey);
    multi.zadd(windowKey, now.toString(), `${now}:${Math.random()}`);
    multi.expire(windowKey, windowSeconds);

    const results = await multi.exec();
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    if (currentCount >= limit) {
      const oldest = await redis.zrange(windowKey, 0, 0, "WITHSCORES");
      const oldestTimestamp = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const retryAfterSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    }

    return { allowed: true, remaining: limit - currentCount - 1, retryAfterSeconds: 0 };
  } catch {
    // If Redis is down, allow the request rather than blocking users
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
