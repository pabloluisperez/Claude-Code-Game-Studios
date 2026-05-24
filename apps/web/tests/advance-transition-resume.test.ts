/**
 * AdvanceTransition modal resume-from-day (Sprint 12 task 12-2).
 *
 * Verifies the modal honors the server-driven day cursor when resuming
 * after a STOP-event halt. Source-grep based; the actual animation tick
 * + browser interaction is covered by manual walkthrough Pablo (task
 * 12-4 Part B).
 *
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const modalPath = resolve(
  here,
  '..',
  'src',
  'lib',
  'components',
  'advance-transition.svelte',
);
const dashboardPagePath = resolve(
  here,
  '..',
  'src',
  'routes',
  'dashboard',
  '+page.svelte',
);
const dashboardServerPath = resolve(
  here,
  '..',
  'src',
  'routes',
  'dashboard',
  '+page.server.ts',
);
const layoutServerPath = resolve(
  here,
  '..',
  'src',
  'routes',
  '+layout.server.ts',
);

describe('Sprint 12 task 12-2 — AdvanceTransition resume-from-day', () => {
  describe('Modal props contract', () => {
    const source = readFileSync(modalPath, 'utf8');

    it('test_modal_declares_startDayOfWeek_prop', () => {
      expect(source).toMatch(/startDayOfWeek\??\s*:\s*number/);
    });

    it('test_modal_startDayOfWeek_defaults_to_zero', () => {
      // Default must preserve Sprint 11 behavior (clean week start).
      expect(source).toMatch(/startDayOfWeek\s*=\s*0/);
    });

    it('test_modal_startCycle_uses_startDayOfWeek_as_fallback', () => {
      // The resume priority order:
      //   1. localStorage resume key (explicit user cancel)
      //   2. server-driven startDayOfWeek
      //   3. default 0
      // Search ensures the prop is wired into the cycle initializer.
      expect(source).toMatch(/startDayOfWeek\s*>\s*0/);
      expect(source).toMatch(/startDayOfWeek\s*<\s*7/);
    });

    it('test_modal_startCycle_falls_through_to_zero_when_no_resume_or_day', () => {
      expect(source).toMatch(/dayIndex\s*=\s*0/);
    });
  });

  describe('Dashboard server load exposes day cursor', () => {
    const source = readFileSync(dashboardServerPath, 'utf8');

    it('test_dashboard_server_exposes_currentDayOfSeason', () => {
      expect(source).toMatch(/currentDayOfSeason/);
    });

    it('test_dashboard_server_exposes_dayInWeek', () => {
      // dayInWeek = currentDayOfSeason % 7. Used by the modal's startDayOfWeek.
      expect(source).toMatch(/dayInWeek/);
      expect(source).toMatch(/currentDayOfSeason\s*%\s*7/);
    });

    it('test_dashboard_server_exposes_daysRemaining', () => {
      // For UI badges / "X días restantes" display.
      expect(source).toMatch(/daysRemaining/);
    });

    it('test_dashboard_server_handles_legacy_null_day_cursor', () => {
      // Backward compat: legacy playthroughs may not have currentDayOfSeason
      // set yet (pre-Sprint-11 migration ran). The fallback is week * 7.
      expect(source).toMatch(/currentDayOfSeason\s*\?\?\s*\S*\.currentWeek\s*\*\s*7/);
    });
  });

  describe('Dashboard page passes startDayOfWeek to modal', () => {
    const source = readFileSync(dashboardPagePath, 'utf8');

    it('test_dashboard_page_passes_startDayOfWeek_to_AdvanceTransition', () => {
      expect(source).toMatch(/startDayOfWeek=\{/);
    });

    it('test_dashboard_page_sources_startDayOfWeek_from_data_dayInWeek', () => {
      expect(source).toMatch(/data\.dayInWeek/);
    });
  });

  describe('Layout server exposes currentDayOfSeason on activePlaythrough', () => {
    const source = readFileSync(layoutServerPath, 'utf8');

    it('test_layout_server_selects_currentDayOfSeason', () => {
      // Without this column in the SELECT, the dashboard cannot derive
      // dayInWeek (would always be 0 even mid-week).
      expect(source).toMatch(/currentDayOfSeason:\s*playthroughs\.currentDayOfSeason/);
    });
  });

  describe('Backward compatibility', () => {
    const source = readFileSync(modalPath, 'utf8');

    it('test_modal_keeps_localStorage_resume_key_priority', () => {
      // Sprint 9 introduced explicit-cancel resume via localStorage. The
      // Sprint 12 server-driven resume must NOT override an explicit user
      // pause — localStorage takes precedence.
      expect(source).toMatch(/readResume/);
      expect(source).toMatch(/RESUME_KEY/);
    });

    it('test_modal_startDayOfWeek_zero_means_clean_start', () => {
      // The doc comment must explicitly state default=0 preserves Sprint 11.
      expect(source).toMatch(/Sprint\s*11|preserves|preserve|default/i);
    });
  });
});
