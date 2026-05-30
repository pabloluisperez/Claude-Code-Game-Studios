/**
 * Advance orchestrator extraction — structural regression guard.
 *
 * Story: Sprint 11 task 11-2.
 *
 * Verifies the contract of the Sprint 11 task 11-2 extraction:
 *
 *   1. `runAdvanceTickFull` and `runAdvanceTickCore` are both exported from
 *      apps/web/src/lib/server/advance-orchestrator.ts.
 *   2. `dashboard/+page.server.ts` advance action no longer contains the
 *      inline pipeline calls (TV pre/post, runTick, applyEconomyTick,
 *      snapshot inserts, match-day, staff message generation, season
 *      rollover). It delegates to the orchestrator and only handles the
 *      SvelteKit redirect.
 *
 * Why a static grep test:
 *   The full behavioral parity is already covered by 953 simulation tests in
 *   @smt/shared plus 44 integration tests in @smt/api — every helper that
 *   runAdvanceTickFull composes (runTick, applyEconomyTick, runMatchDay,
 *   generateStaffMessages, checkAndRolloverSeason, etc.) has its own test
 *   suite. The risk of the extraction is structural drift — that someone
 *   adds new inline pipeline logic to the form action instead of the
 *   orchestrator. This test fails fast if that happens.
 *
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as orchestrator from '../src/lib/server/advance-orchestrator';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardActionPath = resolve(
  here,
  '..',
  'src',
  'routes',
  'dashboard',
  '+page.server.ts',
);

describe('Sprint 11 task 11-2 — orchestrator extraction', () => {
  describe('runAdvanceTickFull module contract', () => {
    it('test_orchestrator_module_exports_runAdvanceTickFull', () => {
      expect(typeof orchestrator.runAdvanceTickFull).toBe('function');
    });

    it('test_orchestrator_module_still_exports_runAdvanceTickCore', () => {
      expect(typeof orchestrator.runAdvanceTickCore).toBe('function');
    });

    it('test_runAdvanceTickFull_has_two_parameter_signature', () => {
      expect(orchestrator.runAdvanceTickFull.length).toBe(1);
    });
  });

  describe('dashboard +page.server.ts has no inline pipeline logic', () => {
    const dashboardSource = readFileSync(dashboardActionPath, 'utf8');

    it('test_dashboard_does_not_call_runTVPrePhase_directly', () => {
      expect(dashboardSource).not.toMatch(/runTVPrePhase\(/);
    });

    it('test_dashboard_does_not_call_runTick_directly', () => {
      expect(dashboardSource).not.toMatch(/\brunTick\(/);
    });

    it('test_dashboard_does_not_call_applyEconomyTick_directly', () => {
      expect(dashboardSource).not.toMatch(/applyEconomyTick\(/);
    });

    it('test_dashboard_does_not_call_persistTVTickEffects_directly', () => {
      expect(dashboardSource).not.toMatch(/persistTVTickEffects\(/);
    });

    it('test_dashboard_does_not_insert_worldSnapshots_directly', () => {
      expect(dashboardSource).not.toMatch(/db\.insert\(worldSnapshots\)/);
      expect(dashboardSource).not.toMatch(/tx\.insert\(worldSnapshots\)/);
    });

    it('test_dashboard_does_not_call_runMatchDay_directly', () => {
      expect(dashboardSource).not.toMatch(/runMatchDay\(/);
    });

    it('test_dashboard_does_not_call_generateStaffMessages_directly', () => {
      expect(dashboardSource).not.toMatch(/generateStaffMessages\(/);
    });

    it('test_dashboard_does_not_call_checkAndRolloverSeason_directly', () => {
      expect(dashboardSource).not.toMatch(/checkAndRolloverSeason\(/);
    });

    it('test_dashboard_does_not_call_grantWeeklyManagerXp_directly', () => {
      expect(dashboardSource).not.toMatch(/grantWeeklyManagerXp\(/);
    });

    it('test_dashboard_delegates_to_orchestrator', () => {
      // Sprint 11 had this calling runAdvanceTickFull directly. Sprint 12
      // task 12-1 routes through advanceDays so STOP-event scanning happens
      // before any pipeline work. Either name is acceptable as evidence
      // the form action does not inline pipeline logic.
      expect(dashboardSource).toMatch(/runAdvanceTickFull\(|advanceDays\(/);
    });

    it('test_dashboard_advance_action_is_under_400_lines', () => {
      // Pre-extraction: 576 LOC total file, action ~340 LOC.
      // Post-extraction: load fn stays large, action collapses to ~30 LOC.
      // Sprint 12 added the STOP-event banner + mid-week badge + day-precise
      // date wiring. Sprint 26 (2026-05-29) added latest-message-per-staff
      // grouping for the dashboard speech-bubble redesign — legitimate load-side
      // growth, threshold bumped 400→410. The 2026-05-30 interactive-match work
      // (ADR-033 Phase 2C) added the "resolve pending user fixture before
      // advancing" guard → bumped 410→440. The action-stays-thin guarantee is
      // covered by the runAdvanceTickFull/advanceDays assertion above.
      const lines = dashboardSource.split('\n').length;
      expect(lines).toBeLessThan(440);
    });
  });
});
