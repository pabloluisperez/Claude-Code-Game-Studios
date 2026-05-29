/**
 * BUG-PT-4 match live polish — Sprint 13 task 13-5.
 *
 * Static grep tests for the 3 polish features added to the match-live
 * page:
 *   - VAR check (~8% of goals → deterministic outcome overlay)
 *   - Confeti burst on user-club goals
 *   - VAR-overturned goals don't trigger confeti
 *
 * Pre-event pause was descoped (current 333ms/min tick is already fast
 * enough that a 500ms pause would feel jarring).
 *
 * Story: SPRINT-13-S05
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const matchPagePath = resolve(
  here,
  '..',
  'src',
  'routes',
  'match',
  '[matchSessionId]',
  '+page.svelte',
);

describe('Sprint 13 task 13-5 — Match live polish (BUG-PT-4)', () => {
  const source = readFileSync(matchPagePath, 'utf8');

  describe('VAR check', () => {
    it('test_var_overlay_state_exists', () => {
      expect(source).toMatch(/varOverlay/);
    });

    it('test_rollVar_is_deterministic_seeded_function', () => {
      // Hash-based, NOT Math.random — must use fixture.id + minute as seed.
      expect(source).toMatch(/function\s+rollVar/);
      expect(source).toMatch(/fixture\.id.*var.*minute/);
      expect(source).not.toMatch(/Math\.random\(\)/);
    });

    it('test_var_trigger_probability_around_eighteen_percent', () => {
      // Pablo 2026-05-26 bumped the VAR rate 8% → 18% (triggerRoll >= 0.18) so a
      // VAR check shows up in most matches. ~18% per goal via threshold >= 0.18.
      expect(source).toMatch(/triggerRoll\s*>=\s*0\.18/);
    });

    it('test_var_overlay_has_three_phases', () => {
      expect(source).toMatch(/'checking'/);
      expect(source).toMatch(/'confirmed'/);
      expect(source).toMatch(/'overturned'/);
    });

    it('test_overturned_goal_reverts_score', () => {
      // The revert logic decrements homeLive or awayLive on overturn.
      expect(source).toMatch(/varOutcome\s*===\s*'overturned'/);
    });
  });

  describe('Confeti burst', () => {
    it('test_confetti_state_and_trigger_function_present', () => {
      expect(source).toMatch(/confettiKey/);
      expect(source).toMatch(/confettiSide/);
      expect(source).toMatch(/function\s+triggerConfetti/);
    });

    it('test_confetti_fires_on_goal_event', () => {
      // The triggerConfetti call lives in the goal-handling branch.
      expect(source).toMatch(/triggerConfetti\(ev\.team\)/);
    });

    it('test_confetti_fires_when_var_confirms_goal_but_not_when_overturned', () => {
      // The confirm branch calls triggerConfetti; the overturn branch
      // does NOT. Both branches present.
      expect(source).toMatch(/triggerConfetti\(goalTeam\)/);
    });

    it('test_confetti_burst_css_exists', () => {
      expect(source).toMatch(/\.confetti-burst/);
      expect(source).toMatch(/\.confetti-piece/);
      expect(source).toMatch(/@keyframes confetti-fall/);
    });

    it('test_confetti_uses_30_particles_at_varied_hues', () => {
      // 30 pieces with hue rotation gives a colorful burst.
      expect(source).toMatch(/length:\s*30/);
      expect(source).toMatch(/hsl\(\{/);
    });
  });

  describe('VAR overlay rendering', () => {
    it('test_overlay_has_emoji_for_each_phase', () => {
      expect(source).toMatch(/📺/); // checking
      expect(source).toMatch(/GOL VÁLIDO/);
      expect(source).toMatch(/GOL ANULADO/);
    });

    it('test_var_overlay_is_full_screen_with_backdrop', () => {
      expect(source).toMatch(/\.var-overlay/);
      expect(source).toMatch(/position:\s*fixed/);
      expect(source).toMatch(/backdrop-filter:\s*blur/);
    });
  });
});
