/**
 * Tests for the shared rate-limit primitive used by Hono routes.
 *
 * Story 14-1 (Sprint 14). Covers:
 *   - Allow within limit
 *   - 429 at limit
 *   - Independent counters per key
 *   - Window expiry resets the counter
 *   - Headers (X-RateLimit-* and Retry-After) attached
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  checkLimit,
  rateLimit,
  RATE_LIMITS,
  _resetRateLimiterForTests,
} from '../../src/lib/rate-limit';

describe('checkLimit (primitive)', () => {
  beforeEach(() => {
    _resetRateLimiterForTests();
  });

  it('allows first request and decrements remaining', () => {
    const verdict = checkLimit('test:a', { max: 3, windowMs: 1000 }, 1000);
    expect(verdict.allowed).toBe(true);
    expect(verdict.remaining).toBe(2);
  });

  it('blocks request N+1 and surfaces retryAfterSec', () => {
    const cfg = { max: 2, windowMs: 1000 };
    checkLimit('test:b', cfg, 1000);
    checkLimit('test:b', cfg, 1000);
    const verdict = checkLimit('test:b', cfg, 1000);
    expect(verdict.allowed).toBe(false);
    expect(verdict.remaining).toBe(0);
    expect(verdict.retryAfterSec).toBeGreaterThan(0);
  });

  it('keeps independent buckets per key', () => {
    const cfg = { max: 1, windowMs: 1000 };
    expect(checkLimit('user:a', cfg, 1000).allowed).toBe(true);
    expect(checkLimit('user:b', cfg, 1000).allowed).toBe(true);
    expect(checkLimit('user:a', cfg, 1000).allowed).toBe(false);
    // user:b's bucket is independent — still has capacity? No, max=1, second hit blocks.
    expect(checkLimit('user:b', cfg, 1000).allowed).toBe(false);
  });

  it('resets the counter once the window expires', () => {
    const cfg = { max: 1, windowMs: 1000 };
    checkLimit('test:c', cfg, 1000);
    expect(checkLimit('test:c', cfg, 1500).allowed).toBe(false);
    // Cross the window boundary
    const after = checkLimit('test:c', cfg, 2100);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(0); // max-1=0
  });
});

describe('rateLimit middleware (Hono integration)', () => {
  beforeEach(() => {
    _resetRateLimiterForTests();
  });

  it('returns 429 with Retry-After + JSON body after N+1 requests', async () => {
    const app = new Hono().get('/ping', rateLimit('matchStart'), (c) =>
      c.json({ ok: true }),
    );

    const { max } = RATE_LIMITS.matchStart;
    // Issue `max` requests — all should pass with 200.
    for (let i = 0; i < max; i++) {
      const res = await app.request('/ping', { headers: { 'x-forwarded-for': '10.0.0.1' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe(String(max));
    }
    // The next one is blocked.
    const blocked = await app.request('/ping', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    const body = (await blocked.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toMatch(/rate limit/i);
    expect(body.retryAfterSec).toBeGreaterThan(0);
  });

  it('does not collapse two distinct IPs into the same bucket', async () => {
    const app = new Hono().get('/ping', rateLimit('matchStart'), (c) =>
      c.json({ ok: true }),
    );
    const { max } = RATE_LIMITS.matchStart;

    // Burn IP A's bucket
    for (let i = 0; i < max; i++) {
      await app.request('/ping', { headers: { 'x-forwarded-for': '10.0.0.1' } });
    }
    const blockedA = await app.request('/ping', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(blockedA.status).toBe(429);

    // IP B is still fresh
    const okB = await app.request('/ping', {
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    expect(okB.status).toBe(200);
  });

  it('attaches X-RateLimit-* headers to allowed responses', async () => {
    const app = new Hono().get('/ping', rateLimit('matchStart'), (c) =>
      c.json({ ok: true }),
    );
    const res = await app.request('/ping', { headers: { 'x-forwarded-for': '10.0.0.3' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(RATE_LIMITS.matchStart.max));
    expect(res.headers.get('X-RateLimit-Remaining')).toBe(
      String(RATE_LIMITS.matchStart.max - 1),
    );
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });

  it('matchDecision has a higher cap than matchStart', () => {
    expect(RATE_LIMITS.matchDecision.max).toBeGreaterThan(RATE_LIMITS.matchStart.max);
  });
});
