/**
 * In-memory rate limiter for SvelteKit server actions / endpoints.
 *
 * Story 14-1 (Sprint 14): protects the `/dashboard?/advance` form action and
 * any other write-heavy form action from spam. Mirrors the design of
 * `apps/api/src/lib/rate-limit.ts` but lives in the SvelteKit process so it
 * applies to actions that never reach the Hono API.
 *
 * Swap to Redis (ioredis INCR + EXPIRE) when scaling to multiple node
 * processes — the public surface is engine-agnostic.
 */

export type RateLimitConfig = {
  /** Maximum requests allowed in the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
};

export const RATE_LIMITS = {
  /** /dashboard?/advance form action. */
  advance: { max: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function _resetRateLimiterForTests(): void {
  buckets.clear();
}

export function checkLimit(
  key: string,
  cfg: RateLimitConfig,
  now: number = Date.now(),
): { allowed: boolean; remaining: number; resetAt: number; retryAfterSec: number } {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + cfg.windowMs };
    buckets.set(key, fresh);
    return { allowed: true, remaining: cfg.max - 1, resetAt: fresh.resetAt, retryAfterSec: 0 };
  }
  if (existing.count >= cfg.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return {
    allowed: true,
    remaining: cfg.max - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}
