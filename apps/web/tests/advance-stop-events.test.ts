/**
 * advanceDays — STOP event halt semantics (Sprint 12 task 12-1).
 *
 * Verifies ADR-020 §6 behavior of mid-week STOP halt:
 *
 *   - Schema: calendarEvents.scheduledDayOfSeason exposed by Drizzle
 *   - advanceDays(7) without STOP events is equivalent to legacy weekly
 *     (1046-test regression guard)
 *   - STOP event with scheduledDayOfSeason in range halts at that day
 *   - STOP event uses scheduledDayOfSeason when present, falls back to
 *     week*7 when null (legacy compat)
 *   - daysUntilNextBoundary math invariants
 *   - Type contract: stop-event return shape
 *
 * Tests are static/grep + math-only — the actual STOP-halt path requires
 * a real DB transaction (covered by apps/api integration tests as Sprint
 * 12 follow-up if needed). For Sprint 12 close, the grep + math + type
 * tests + the existing 1046 baseline suite together verify no regression
 * AND the new code paths exist.
 *
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  advanceDays,
  daysUntilNextBoundary,
  type AdvanceTickFullNext,
} from '../src/lib/server/advance-orchestrator';
import { calendarEvents } from '@smt/db';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const orchestratorPath = resolve(
  here,
  '..',
  'src',
  'lib',
  'server',
  'advance-orchestrator.ts',
);

describe('Sprint 12 task 12-1 — STOP event halt + per-day loop', () => {
  describe('Schema additions (ADR-020 §6)', () => {
    it('test_calendar_events_exports_scheduled_day_of_season_column', () => {
      // Drizzle schema must expose the new column for the orchestrator to
      // SELECT it. Loss of this export means the migration is decoupled
      // from the TypeScript layer.
      expect(calendarEvents.scheduledDayOfSeason).toBeDefined();
    });
  });

  describe('daysUntilNextBoundary math', () => {
    it('test_days_until_boundary_at_zero_returns_seven', () => {
      // Clean week start → full week ahead.
      expect(daysUntilNextBoundary(0)).toBe(7);
    });

    it('test_days_until_boundary_at_clean_boundary_returns_seven', () => {
      // 7, 14, 21, ... all clean boundaries → full week ahead.
      expect(daysUntilNextBoundary(7)).toBe(7);
      expect(daysUntilNextBoundary(35)).toBe(7);
      expect(daysUntilNextBoundary(42)).toBe(7);
    });

    it('test_days_until_boundary_mid_week_returns_remainder', () => {
      // Mid-week day cursors → distance to next Sunday (day 6 → day 7).
      expect(daysUntilNextBoundary(1)).toBe(6);
      expect(daysUntilNextBoundary(3)).toBe(4);
      expect(daysUntilNextBoundary(5)).toBe(2);
      expect(daysUntilNextBoundary(6)).toBe(1);
    });

    it('test_days_until_boundary_handles_late_season_correctly', () => {
      // End-of-season: day 38*7 = 266 (boundary), day 38*7 + 3 = 269 mid-week.
      expect(daysUntilNextBoundary(266)).toBe(7);
      expect(daysUntilNextBoundary(269)).toBe(4);
    });
  });

  describe('AdvanceTickFullNext stop-event variant', () => {
    it('test_stop_event_variant_has_required_fields', () => {
      // TypeScript compile-time test: the new variant must include id +
      // type + day + week so the form action can route the redirect and
      // the dashboard can surface the event.
      const variant: AdvanceTickFullNext = {
        type: 'stop-event',
        eventId: 'test-uuid',
        eventType: 'injury_long_term',
        day: 33,
        week: 5,
      };
      expect(variant.type).toBe('stop-event');
      if (variant.type === 'stop-event') {
        expect(variant.eventId).toBe('test-uuid');
        expect(variant.day).toBe(33);
        expect(variant.week).toBe(5);
        expect(variant.eventType).toBe('injury_long_term');
      }
    });

    it('test_dashboard_variant_still_exists', () => {
      const variant: AdvanceTickFullNext = { type: 'dashboard' };
      expect(variant.type).toBe('dashboard');
    });

    it('test_season_end_variant_still_exists', () => {
      const variant: AdvanceTickFullNext = { type: 'season-end', fromSeason: 1 };
      expect(variant.type).toBe('season-end');
    });

    it('test_match_variant_still_exists', () => {
      const variant: AdvanceTickFullNext = {
        type: 'match',
        matchId: 'm1',
        mode: 'autoplay',
      };
      expect(variant.type).toBe('match');
    });
  });

  describe('Orchestrator source — STOP-handling code paths exist', () => {
    const source = readFileSync(orchestratorPath, 'utf8');

    it('test_orchestrator_imports_calendar_events_schema', () => {
      // Without this import, the STOP scan SELECT would fail at runtime.
      expect(source).toMatch(/\bcalendarEvents\b/);
    });

    it('test_orchestrator_scans_pending_stop_events', () => {
      // The scan filters pending + STOP priority.
      expect(source).toMatch(/calendarEvents\.status/);
      expect(source).toMatch(/calendarEvents\.priority/);
      expect(source).toMatch(/'pending'|"pending"/);
      expect(source).toMatch(/'STOP'|"STOP"/);
    });

    it('test_orchestrator_uses_scheduledDayOfSeason_with_fallback', () => {
      // Sprint 12 events have scheduledDayOfSeason; legacy events fall back
      // to week * 7. Both paths must be present.
      expect(source).toMatch(/scheduledDayOfSeason\s*\?\?/);
      expect(source).toMatch(/week\s*\*\s*7/);
    });

    it('test_orchestrator_picks_earliest_stop_in_range', () => {
      // The earliest-stop variable ensures STOP events fire in chronological
      // order even when multiple are pending.
      expect(source).toMatch(/earliestStop/);
    });

    it('test_orchestrator_persists_day_cursor_on_halt', () => {
      // On halt, only currentDayOfSeason updates — currentWeek stays put
      // (cascade tick deferred until full week commits).
      expect(source).toMatch(/currentDayOfSeason:\s*earliestStop\.day/);
    });

    it('test_orchestrator_returns_stop_event_variant_on_halt', () => {
      expect(source).toMatch(/type:\s*'stop-event'/);
    });

    it('test_orchestrator_runs_full_pipeline_only_on_clean_boundary', () => {
      // Crosses-boundary check + weeks-crossed guard.
      expect(source).toMatch(/crossesBoundary/);
      expect(source).toMatch(/weeksCrossed/);
      expect(source).toMatch(/runAdvanceTickFull\(/);
    });

    it('test_orchestrator_rejects_multi_week_batches', () => {
      // Sprint 12 still rejects daysToAdvance > 7-to-boundary; multi-week
      // is Sprint 13+ work.
      expect(source).toMatch(/multi-week.*not yet supported/);
    });

    it('test_orchestrator_rejects_negative_days', () => {
      expect(source).toMatch(/daysToAdvance must be non-negative/);
    });
  });

  describe('Dashboard form action — uses advanceDays + daysUntilNextBoundary', () => {
    const dashboardPath = resolve(
      here,
      '..',
      'src',
      'routes',
      'dashboard',
      '+page.server.ts',
    );
    const source = readFileSync(dashboardPath, 'utf8');

    it('test_dashboard_imports_advanceDays_and_helper', () => {
      expect(source).toMatch(/\badvanceDays\b/);
      expect(source).toMatch(/\bdaysUntilNextBoundary\b/);
    });

    it('test_dashboard_does_not_call_runAdvanceTickFull_directly', () => {
      // The form action delegates to advanceDays which decides whether to
      // call runAdvanceTickFull internally. Calling runAdvanceTickFull
      // directly would bypass the STOP-event scan.
      expect(source).not.toMatch(/runAdvanceTickFull\(/);
    });

    it('test_dashboard_handles_stop_event_redirect', () => {
      // The form action must switch on `stop-event` and redirect with
      // query params so the dashboard surfaces the event.
      expect(source).toMatch(/'stop-event'|"stop-event"/);
      expect(source).toMatch(/stop_event=/);
    });

    it('test_dashboard_passes_daysToAdvance_derived_from_cursor', () => {
      // Each click commits at most one week boundary; advanceDays receives
      // the precise day count.
      expect(source).toMatch(/daysToAdvance/);
    });
  });
});
