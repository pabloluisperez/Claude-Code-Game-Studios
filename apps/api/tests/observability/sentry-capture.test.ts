/**
 * Tests for the observability wrapper (Sentry + pino).
 *
 * Story 14-7 (Sprint 14 Release prep). Covers:
 *   - initObservability no-ops cleanly without SENTRY_DSN
 *   - initObservability initializes Sentry when SENTRY_DSN is set
 *   - captureException always logs locally
 *   - captureException forwards to Sentry only when initialized
 *   - sanitizeContext redacts known PII fields
 *   - Hono .onError wires captureException for uncaught throws
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import {
  initObservability,
  captureException,
  sanitizeContext,
  _resetObservabilityForTests,
} from '../../src/lib/observability';

const sentryInit = Sentry.init as unknown as ReturnType<typeof vi.fn>;
const sentryCapture = Sentry.captureException as unknown as ReturnType<typeof vi.fn>;

describe('sanitizeContext', () => {
  it('redacts password / passwordHash / sessionToken / session / cookie / authorization', () => {
    const out = sanitizeContext({
      password: 'hunter2',
      passwordHash: 'argon$...',
      sessionToken: 'abc',
      session: 'xyz',
      cookie: 'session=xyz',
      authorization: 'Bearer ...',
      keep: 'this is fine',
    });
    expect(out['password']).toBe('[redacted]');
    expect(out['passwordHash']).toBe('[redacted]');
    expect(out['sessionToken']).toBe('[redacted]');
    expect(out['session']).toBe('[redacted]');
    expect(out['cookie']).toBe('[redacted]');
    expect(out['authorization']).toBe('[redacted]');
    expect(out['keep']).toBe('this is fine');
  });

  it('partially redacts emails to keep local diagnostics but hide PII', () => {
    const out = sanitizeContext({ email: 'pablo.perez@convotis.com' });
    expect(out['email']).toBe('p***@convotis.com');
  });

  it('passes through unrelated keys unchanged', () => {
    const out = sanitizeContext({ playthroughId: 'uuid-1', count: 3 });
    expect(out['playthroughId']).toBe('uuid-1');
    expect(out['count']).toBe(3);
  });
});

describe('initObservability', () => {
  beforeEach(() => {
    _resetObservabilityForTests();
    sentryInit.mockClear();
    sentryCapture.mockClear();
    delete process.env['SENTRY_DSN'];
  });

  it('does NOT throw when SENTRY_DSN is missing — does not call Sentry.init', () => {
    expect(() => initObservability()).not.toThrow();
    expect(sentryInit).not.toHaveBeenCalled();
  });

  it('initializes Sentry when SENTRY_DSN is set', () => {
    process.env['SENTRY_DSN'] = 'https://example@sentry.io/123';
    initObservability();
    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@sentry.io/123',
      }),
    );
    delete process.env['SENTRY_DSN'];
  });
});

describe('captureException', () => {
  beforeEach(() => {
    _resetObservabilityForTests();
    sentryInit.mockClear();
    sentryCapture.mockClear();
    delete process.env['SENTRY_DSN'];
  });

  it('logs locally even when Sentry is NOT initialized — and does not call Sentry', () => {
    captureException(new Error('boom'), { playthroughId: 'uuid-1' });
    expect(sentryCapture).not.toHaveBeenCalled();
  });

  it('forwards to Sentry.captureException when initialized', () => {
    process.env['SENTRY_DSN'] = 'https://example@sentry.io/123';
    initObservability();
    captureException(new Error('boom'), { playthroughId: 'uuid-1' });
    expect(sentryCapture).toHaveBeenCalledTimes(1);
    expect(sentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ playthroughId: 'uuid-1' }),
      }),
    );
    delete process.env['SENTRY_DSN'];
  });

  it('strips PII before forwarding to Sentry', () => {
    process.env['SENTRY_DSN'] = 'https://example@sentry.io/123';
    initObservability();
    captureException(new Error('boom'), {
      password: 'hunter2',
      email: 'leak@example.com',
      ok: 'visible',
    });
    expect(sentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          password: '[redacted]',
          email: 'l***@example.com',
          ok: 'visible',
        }),
      }),
    );
    delete process.env['SENTRY_DSN'];
  });
});

describe('Hono .onError → captureException integration', () => {
  beforeEach(() => {
    _resetObservabilityForTests();
    sentryInit.mockClear();
    sentryCapture.mockClear();
    delete process.env['SENTRY_DSN'];
  });

  it('captures uncaught throws from a route handler', async () => {
    process.env['SENTRY_DSN'] = 'https://example@sentry.io/123';
    initObservability();

    const app = new Hono()
      .onError((err, c) => {
        captureException(err, { path: c.req.path });
        return c.json({ error: 'Internal' }, 500);
      })
      .get('/explode', () => {
        throw new Error('kaboom');
      });

    const res = await app.request('/explode');
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalledTimes(1);
    expect(sentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ path: '/explode' }),
      }),
    );
    delete process.env['SENTRY_DSN'];
  });
});
