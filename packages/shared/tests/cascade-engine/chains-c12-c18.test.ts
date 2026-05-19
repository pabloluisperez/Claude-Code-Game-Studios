/**
 * Unit tests for C12 (desperation overtraining) + C18a (corruption decay with guard).
 *
 * C12 — consecutive_losses × training_intensity → team_fitness
 *       (delay 1, counterintuitive, player agency lever at I_train ≤ 50).
 * C18a — corruption_exposure → corruption_exposure (self-decay, delay 0,
 *       guarded when CE ≥ 80 to preserve clean BLOCKING threshold crossing).
 *
 * Story: CASCADE-ENGINE-013
 * Acceptance Criteria: AC #1–16
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  K_desperation,
  T_desperation_threshold,
  DESPERATION_EXP,
  DESPERATION_NORM,
  K_corruption_decay,
} from '../../src/sim/cascade-graph.js';
import { runTick } from '../../src/sim/cascade-engine.js';
import {
  defaultWorldState,
  type SimContext,
  type WorldState,
  type PlayerDecision,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';

function makeCtx(
  currentWeek: number,
  prevState: Readonly<WorldState>,
  rng: () => number = () => 0.5,
  hasMatchThisWeek = false,
): SimContext {
  return { rng, currentWeek, hasMatchThisWeek, prevState };
}

const EMPTY_BUFFER: DelayedEffectsBuffer = [];

function getEdge(id: string) {
  const edge = CASCADA_FC_GRAPH.find((e) => e.id === id);
  if (!edge) throw new Error(`Edge "${id}" not found`);
  return edge;
}

const edgeC12 = getEdge('C12');
const edgeC18a = getEdge('C18a');
const C12_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C12');
const C18A_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C18a');

// ── C12: Counterintuitive desperation overtraining ────────────────────────────

describe('chain C12 — desperation overtraining (counterintuitive)', () => {
  it('test_c12_baseline_5_losses_80_training', () => {
    // AC #1 — CL=5, I_train=80
    // intensity_mod = (80-50)/50 = 0.6
    // drainShape = 5^1.5 / 10^1.5 = 11.18/31.62 ≈ 0.3536
    // delta = -10 × 0.3536 × 0.6 = -2.121
    const prevState = { ...defaultWorldState(), consecutive_losses: 5, training_intensity: 80 };
    const delta = edgeC12.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(-2.121, 2);
  });

  it('test_c12_agency_lever_below_threshold_zero', () => {
    // AC #2 — MANDATORY cross-check: same losing streak, training=40 → delta=0 exactly
    const prevState = { ...defaultWorldState(), consecutive_losses: 5, training_intensity: 40 };
    const delta = edgeC12.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(0, 10);
  });

  it('test_c12_small_streak', () => {
    // AC #3 — CL=1, I_train=80
    // drainShape = 1/31.62 ≈ 0.0316; delta = -10 × 0.0316 × 0.6 = -0.19
    const prevState = { ...defaultWorldState(), consecutive_losses: 1, training_intensity: 80 };
    const delta = edgeC12.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(-0.19, 2);
  });

  it('test_c12_worst_case_10_losses_100_training', () => {
    // AC #4 — CL=10, I_train=100 → intensity_mod=1.0, drainShape=1.0 → delta=-10.0
    const prevState = { ...defaultWorldState(), consecutive_losses: 10, training_intensity: 100 };
    const delta = edgeC12.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(-10.0, 5);
  });

  it('test_c12_at_threshold_inclusive_safe', () => {
    // AC #5 — I_train=50 exactly → intensity_mod=max(0,0)/50=0 → delta=0
    const prevState = { ...defaultWorldState(), consecutive_losses: 5, training_intensity: 50 };
    const delta = edgeC12.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(0, 10);
  });

  it('test_c12_no_losses_no_damage', () => {
    // AC #6 — CL=0 → drainShape=0 → delta=0 regardless of training
    const prevState = { ...defaultWorldState(), consecutive_losses: 0, training_intensity: 100 };
    const delta = edgeC12.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(0, 10);
  });

  it('test_c12_delay_routing_applyAt_W_plus_1', () => {
    // AC #7 — C12 delay 1 → queued at W+1
    const prevState = { ...defaultWorldState(), consecutive_losses: 5, training_intensity: 80 };
    const result = runTick(makeCtx(3, prevState), C12_ONLY, prevState, [], EMPTY_BUFFER);
    const queued = result.newDelayedEffects.find((e) => e.edgeId === 'C12');
    expect(queued).toBeDefined();
    expect(queued!.applyAt).toBe(4);
    expect(queued!.toNode).toBe('team_fitness');
  });

  it('test_c12_determinism_pure', () => {
    // AC #16 — same prevState → identical delta
    const prevState = { ...defaultWorldState(), consecutive_losses: 7, training_intensity: 85 };
    const d1 = edgeC12.transferFn(prevState, makeCtx(1, prevState, () => 0.1));
    const d2 = edgeC12.transferFn(prevState, makeCtx(1, prevState, () => 0.9));
    expect(d1).toBe(d2);
  });
});

// ── C18a: Corruption decay with BLOCKING-zone guard ───────────────────────────

describe('chain C18a — corruption_exposure self-decay (guarded ≥80)', () => {
  it('test_c18a_decay_below_threshold', () => {
    // CE=75 → delta = -0.05 × 75 = -3.75
    const prevState = { ...defaultWorldState(), corruption_exposure: 75 };
    const delta = edgeC18a.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(-3.75, 5);
  });

  it('test_c18a_decay_at_zero', () => {
    // CE=0 → delta = 0
    const prevState = { ...defaultWorldState(), corruption_exposure: 0 };
    const delta = edgeC18a.transferFn(prevState, makeCtx(1, prevState));
    expect(delta).toBeCloseTo(0, 10);
  });

  it('test_c18a_guarded_when_at_blocking_zone_85', () => {
    // AC #11 — CE=85 (≥80) → guard active, decay skipped. 3 sustained ticks → CE stays at 85.
    let state: WorldState = { ...defaultWorldState(), corruption_exposure: 85 };
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;
    for (let week = 1; week <= 3; week++) {
      const r = runTick(makeCtx(week, state), C18A_ONLY, state, [], buffer);
      // Guard fires every tick
      const guardLog = r.log.find((e) => e.source === 'guarded' && e.edgeId === 'C18a');
      expect(guardLog, `tick ${week} should have C18a guarded`).toBeDefined();
      state = r.nextState;
      buffer = r.newDelayedEffects as DelayedEffectsBuffer;
      expect(state.corruption_exposure).toBe(85);
    }
  });

  it('test_c18a_acpld03_decay_then_decision_below_80', () => {
    // AC-PLD-03 / AC #8 — prevState.CE=75 (guard inactive), PD +12.
    // Step 2 decay: -3.75 → SP=71.25. Step 3 PD: +12 → 83.25.
    // We verify nextState.CE = 83.25 (>80; threshold crossing is story 014's domain).
    const prevState = { ...defaultWorldState(), corruption_exposure: 75 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'corruption_exposure', delta: +12, source: 'scandal_risk' },
    ];
    const r = runTick(makeCtx(1, prevState), C18A_ONLY, prevState, decisions, EMPTY_BUFFER);
    expect(r.nextState.corruption_exposure).toBeCloseTo(83.25, 2);
  });

  it('test_c18a_ac_c18_01_decay_absorbs_small_decisions', () => {
    // AC #10 — CE=78, PD +5. Decay: 78 - 3.9 = 74.1. PD +5 → 79.1 (< 80, no crossing).
    const prevState = { ...defaultWorldState(), corruption_exposure: 78 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'corruption_exposure', delta: +5, source: 'scandal_risk' },
    ];
    const r = runTick(makeCtx(1, prevState), C18A_ONLY, prevState, decisions, EMPTY_BUFFER);
    expect(r.nextState.corruption_exposure).toBeCloseTo(79.1, 2);
    expect(r.nextState.corruption_exposure).toBeLessThan(80);
  });

  it('test_c18a_ac_c18_02b_downward_crossing', () => {
    // AC #12 — CE=85 (guarded), PD -10. Decay: skipped. PD: 85 - 10 = 75.
    // Downward crossing 85 → 75 across 80. (Threshold detection itself in story 014.)
    const prevState = { ...defaultWorldState(), corruption_exposure: 85 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'corruption_exposure', delta: -10, source: 'reduce_corruption' },
    ];
    const r = runTick(makeCtx(1, prevState), C18A_ONLY, prevState, decisions, EMPTY_BUFFER);
    expect(r.nextState.corruption_exposure).toBe(75);
  });

  it('test_c18a_ac_c18_02b_continuation_guard_releases', () => {
    // AC #13 — Continuing the previous test from CE=75 (now < 80), guard should re-enable.
    // Decay: 75 - 3.75 = 71.25.
    const state = { ...defaultWorldState(), corruption_exposure: 75 };
    const r = runTick(makeCtx(2, state), C18A_ONLY, state, [], EMPTY_BUFFER);
    expect(r.nextState.corruption_exposure).toBeCloseTo(71.25, 2);
    // No 'guarded' entry this tick (CE<80)
    const guardLog = r.log.find((e) => e.source === 'guarded' && e.edgeId === 'C18a');
    expect(guardLog).toBeUndefined();
  });

  it('test_c18a_ac_c18_04_decay_then_pd_semantics', () => {
    // AC #14 — CE=60, PD -10. Per documented semantics: decay first then PD.
    // Decay: 60 × 0.95 = 57. PD: 57 - 10 = 47. NOT 50.
    const prevState = { ...defaultWorldState(), corruption_exposure: 60 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'corruption_exposure', delta: -10, source: 'reduce_corruption' },
    ];
    const r = runTick(makeCtx(1, prevState), C18A_ONLY, prevState, decisions, EMPTY_BUFFER);
    expect(r.nextState.corruption_exposure).toBeCloseTo(47, 1);
  });

  it('test_c18a_guard_toggle_invariant_100_ticks', () => {
    // AC #15 — Drive CE up and down with decisions; guard correctly toggles each tick.
    let state: WorldState = { ...defaultWorldState(), corruption_exposure: 75 };
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;
    let guardCount = 0;
    let decayCount = 0;

    for (let week = 1; week <= 100; week++) {
      // Oscillate aggressively: every 5 weeks push +40 above current; otherwise let decay work.
      // This guarantees crossings in both directions.
      const decisions: readonly PlayerDecision[] =
        week % 5 === 0 ? [{ nodeId: 'corruption_exposure', delta: +40, source: 'osc' }] : [];

      const wasGuarded = state.corruption_exposure >= 80;
      const r = runTick(makeCtx(week, state), C18A_ONLY, state, decisions, buffer);
      const guardLog = r.log.find((e) => e.source === 'guarded' && e.edgeId === 'C18a');

      if (wasGuarded) {
        expect(guardLog, `W=${week} CE_prev=${state.corruption_exposure} should be guarded`).toBeDefined();
        guardCount++;
      } else {
        expect(guardLog, `W=${week} CE_prev=${state.corruption_exposure} should NOT be guarded`).toBeUndefined();
        decayCount++;
      }

      state = r.nextState;
      buffer = r.newDelayedEffects as DelayedEffectsBuffer;
    }

    // Sanity: oscillation should have hit both branches
    expect(guardCount).toBeGreaterThan(0);
    expect(decayCount).toBeGreaterThan(0);
  });
});

// ── Constants sanity ──────────────────────────────────────────────────────────

describe('C12 + C18a constants match GDD', () => {
  it('test_c12_c18a_constants', () => {
    expect(K_desperation).toBeCloseTo(10.0, 5);
    expect(T_desperation_threshold).toBe(50);
    expect(DESPERATION_EXP).toBeCloseTo(1.5, 5);
    expect(DESPERATION_NORM).toBeCloseTo(Math.pow(10, 1.5), 5);
    expect(K_corruption_decay).toBeCloseTo(0.05, 5);
  });
});
