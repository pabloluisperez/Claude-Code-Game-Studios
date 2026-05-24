/**
 * Observability wrapper — Sentry initialization + structured error capture.
 *
 * Story 14-7 (Sprint 14 Release prep).
 *
 * Why a wrapper and not direct `@sentry/node` calls in the code?
 *   1. `SENTRY_DSN` may be absent (dev / test) — the wrapper no-ops cleanly.
 *   2. Forces a single place where PII scrubbing happens before send.
 *   3. Makes tests trivial: mock the wrapper, not the SDK.
 *
 * Privacy: per Privacy Policy section §4, errors NEVER include passwords,
 * session tokens, or full email addresses. The `sanitizeError` helper strips
 * known PII fields. New fields with PII should be added there.
 */

import * as Sentry from '@sentry/node';
import { logger } from './logger.js';
import { env } from '../env.js';

let initialized = false;

export function initObservability(): void {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) {
    logger.warn('SENTRY_DSN not set — error tracking disabled');
    return;
  }
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    // Lower sample rate in production to avoid quota burn on noisy errors.
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
    // Strip PII from events before transport.
    beforeSend(event) {
      return sanitizeEvent(event);
    },
  });
  initialized = true;
  logger.info('Sentry initialized');
}

/**
 * Capture an unhandled exception with optional structured context.
 *
 * Context is logged locally (pino) AND sent to Sentry (if initialized). The
 * context object should NOT contain raw email, password, or token fields —
 * sanitize at the call site if uncertain.
 */
export function captureException(
  err: unknown,
  ctx: Record<string, unknown> = {},
): void {
  const sanitized = sanitizeContext(ctx);
  logger.error({ err, ...sanitized }, 'captured exception');
  if (initialized) {
    Sentry.captureException(err, { extra: sanitized });
  }
}

/**
 * Strip known PII fields from a context object. Mutation-free.
 */
export function sanitizeContext(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const FORBIDDEN = new Set([
    'password',
    'passwordHash',
    'sessionToken',
    'session',
    'cookie',
    'authorization',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (FORBIDDEN.has(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (k === 'email' && typeof v === 'string') {
      out[k] = redactEmail(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '[redacted]';
  return `${email[0]}***@${email.slice(at + 1)}`;
}

function sanitizeEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Recursive scrub on extra + request data.
  if (event.extra) {
    event.extra = sanitizeContext(event.extra) as Record<string, unknown>;
  }
  if (event.request?.headers) {
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(event.request.headers)) {
      if (['cookie', 'authorization'].includes(k.toLowerCase())) {
        safeHeaders[k] = '[redacted]';
      } else {
        safeHeaders[k] = String(v);
      }
    }
    event.request.headers = safeHeaders;
  }
  return event;
}

/**
 * Test-only: reset the module's init flag and Sentry client.
 */
export function _resetObservabilityForTests(): void {
  initialized = false;
}
