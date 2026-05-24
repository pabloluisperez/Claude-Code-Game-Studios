/**
 * Unit tests for player lifecycle + F7 fitness.
 * Story: PLAYER-MANAGEMENT-005
 * Acceptance Criteria: AC-PM-07..09, AC-PM-20, AC-PM-21
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FITNESS_DECAY_MAX,
  FITNESS_MAX,
  FITNESS_RECOVERY_WEEKLY,
  INJURY_MAX_WEEKS,
  INJURY_MIN_WEEKS,
  applyInjuryEvent,
  applyWeeklyRecovery,
  computeFitnessPostMatch,
  computeFitnessRecovery,
  type PlayerLifecycleState,
} from '../../src/sim/player-management/lifecycle.js';
import type { SimContext } from '../../src/sim/cascade-types.js';
import { defaultWorldState } from '../../src/sim/cascade-types.js';

function makeCtx(rng: () => number): SimContext {
  return { rng, currentWeek: 0, hasMatchThisWeek: true, prevState: defaultWorldState() };
}

const baseState: PlayerLifecycleState = {
  availability: 'available',
  injuredUntilWeek: null,
  fitness: 90,
  stamina: 70,
};

// ── Injury events ───────────────────────────────────────────────────────────

describe('applyInjuryEvent', () => {
  it('test_ac_pm_07_sets_status_and_recovery', () => {
    // rng()=0.5 → recoveryWeeks = 1 + floor(0.5 × 6) = 1 + 3 = 4 → injuredUntilWeek = 10 + 4 = 14
    const ctx = makeCtx(() => 0.5);
    const patch = applyInjuryEvent(baseState, 10, ctx);
    expect(patch.availability).toBe('injured');
    expect(patch.injuredUntilWeek).toBe(14);
  });

  it('test_injury_calls_rng_exactly_once', () => {
    const rngSpy = vi.fn(() => 0.5);
    applyInjuryEvent(baseState, 10, makeCtx(rngSpy));
    expect(rngSpy).toHaveBeenCalledTimes(1);
  });

  it('test_injury_min_max_bounds', () => {
    // rng=0 → MIN; rng=0.999 → MAX (within [MIN, MAX] inclusive)
    expect(applyInjuryEvent(baseState, 10, makeCtx(() => 0)).injuredUntilWeek).toBe(10 + INJURY_MIN_WEEKS);
    expect(applyInjuryEvent(baseState, 10, makeCtx(() => 0.999)).injuredUntilWeek).toBe(10 + INJURY_MAX_WEEKS);
  });
});

// ── Recovery ────────────────────────────────────────────────────────────────

describe('applyWeeklyRecovery', () => {
  it('test_ac_pm_08_recovery_at_or_past_target', () => {
    const injured: PlayerLifecycleState = {
      ...baseState,
      availability: 'injured',
      injuredUntilWeek: 15,
    };
    const patch = applyWeeklyRecovery(injured, 15);
    expect(patch.availability).toBe('available');
    expect(patch.injuredUntilWeek).toBeNull();
  });

  it('test_no_recovery_before_target', () => {
    const injured: PlayerLifecycleState = {
      ...baseState,
      availability: 'injured',
      injuredUntilWeek: 15,
    };
    const patch = applyWeeklyRecovery(injured, 14);
    expect(Object.keys(patch).length).toBe(0); // empty patch
  });

  it('test_no_op_on_available_player', () => {
    const patch = applyWeeklyRecovery(baseState, 10);
    expect(Object.keys(patch).length).toBe(0);
  });
});

// ── F7 fitness ──────────────────────────────────────────────────────────────

describe('F7 — computeFitnessPostMatch', () => {
  it('test_ac_pm_20_decay_known_values', () => {
    // fitness=70, stamina=70, minutes=90 → decay = 15 × 1 × 0.3 = 4.5 → 65.5
    expect(computeFitnessPostMatch(70, 70, 90)).toBe(65.5);
  });

  it('test_stamina_100_no_decay', () => {
    expect(computeFitnessPostMatch(90, 100, 90)).toBe(90);
  });

  it('test_zero_minutes_no_decay', () => {
    expect(computeFitnessPostMatch(90, 70, 0)).toBe(90);
  });

  it('test_clamp_at_zero', () => {
    expect(computeFitnessPostMatch(2, 40, 90)).toBe(0);
  });
});

describe('F7 — computeFitnessRecovery', () => {
  it('test_ac_pm_21_recovery', () => {
    // fitness=65, recovery=+8 → 73
    expect(computeFitnessRecovery(65)).toBe(65 + FITNESS_RECOVERY_WEEKLY);
  });

  it('test_clamp_at_100', () => {
    expect(computeFitnessRecovery(95)).toBe(FITNESS_MAX);
  });

  it('test_decay_constants_match_gdd', () => {
    expect(FITNESS_DECAY_MAX).toBe(15);
    expect(FITNESS_RECOVERY_WEEKLY).toBe(8.0);
  });
});
