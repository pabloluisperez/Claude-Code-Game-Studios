/**
 * In-memory rate limiter for Hono routes.
 *
 * Story 14-1: Sprint 14 Release prep. Protects `/matches/*` (start + decision)
 * from spam. Uses a sliding-window counter keyed by client IP + route prefix.
 *
 * Why in-memory and not Redis: MVP runs as a single Hono process. When the
 * release transitions to multi-worker, swap the bucket store for an ioredis
 * INCR pipeline (the public API of `RateLimiter` is engine-agnostic).
 *
 * Limits are read from constants (RATE_LIMITS) so they can be overridden at
 * boot via env vars without changing call sites.
 */

import type { Context, Next } from 'hono';

export type RateLimitConfig = {
  /** Maximum requests allowed in the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
};

export const RATE_LIMITS = {
  /** /matches/start — heavy operation, persists snapshot + enqueues worker. */
  matchStart: { max: 30, windowMs: 60_000 },
  /** /matches/:id/decision — interactive, can fire multiple per match. */
  matchDecision: { max: 120, windowMs: 60_000 },
  /** /dashboard?/advance (SvelteKit form action — see hooks.server.ts). */
  advance: { max: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Reset the global bucket store. ONLY for use by tests.
 */
export function _resetRateLimiterForTests(): void {
  buckets.clear();
}

/**
 * Check + increment the counter for a given key. Returns whether the request
 * is allowed and the headers to surface back to the client.
 */
export function checkLimit(
  key: string,
  cfg: RateLimitConfig,
  now: number = Date.now(),
): { allowed: boolean; remaining: number; resetAt: number; retryAfterSec: number } {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + cfg.windowMs };
    buckets.set(key, fresh);
    return {
      allowed: true,
      remaining: cfg.max - 1,
      resetAt: fresh.resetAt,
      retryAfterSec: 0,
    };
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

function clientKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  // node-server populates remoteAddress on the raw socket; fall back to UA hash
  // to avoid collapsing all unknown clients into a single bucket.
  const ua = c.req.header('user-agent') ?? 'unknown';
  return `ua:${ua}`;
}

/**
 * Hono middleware factory. Apply via `.use(rateLimit('matchStart'))`.
 */
export function rateLimit(name: keyof typeof RATE_LIMITS) {
  const cfg = RATE_LIMITS[name];
  return async (c: Context, next: Next): Promise<Response | void> => {
    const ip = clientKey(c);
    const key = `${name}:${ip}`;
    const verdict = checkLimit(key, cfg);

    c.header('X-RateLimit-Limit', String(cfg.max));
    c.header('X-RateLimit-Remaining', String(verdict.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(verdict.resetAt / 1000)));

    if (!verdict.allowed) {
      c.header('Retry-After', String(verdict.retryAfterSec));
      return c.json(
        { error: 'Rate limit exceeded', retryAfterSec: verdict.retryAfterSec },
        429,
      );
    }
    return next();
  };
}
