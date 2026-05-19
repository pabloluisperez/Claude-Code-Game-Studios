/**
 * Unit tests for chains C6, C7, C11, C14.
 *
 * C6  — match_performance_index → fan_momentum (delay 0, counterintuitive asymmetric hysteresis).
 * C7  — consecutive_wins → fan_momentum (delay 0, quadratic streak bonus).
 * C11 — staff_morale → match_performance_index (delay 0, guarded by hasMatchThisWeek).
 * C14 — field_quality → match_performance_index (delay 0, guarded + noisy).
 *
 * Story: CASCADE-ENGINE-010
 * Acceptance Criteria: AC #1–18 (all 18 ACs from the story).
 * Test Evidence: packages/shared/tests/cascade-engine/chains-c6-c7-c11-c14.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  getEdgesByTarget,
  K_win_base,
  K_loss_base,
  K_streak_base,
  C7_DENOM,
  K_morale_perf,
  K_home_advantage,
  NOISE_C14_AMP,
} from '../../src/sim/cascade-graph.js';
import { runTick } from '../../src/sim/cascade-engine.js';
import {
  defaultWorldState,
  type SimContext,
  type WorldState,
  type PlayerDecision,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';

// ── Test helpers ───────────────────────────────────────────────────────────────

/**
 * Minimal SimContext factory.
 * rng defaults to () => 0.5 (zero noise for C14).
 * hasMatchThisWeek defaults to false; pass true for C11/C14 guard tests.
 */
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

const edgeC6  = getEdge('C6');
const edgeC7  = getEdge('C7');
const edgeC11 = getEdge('C11');
const edgeC14 = getEdge('C14');

const C6_ONLY  = CASCADA_FC_GRAPH.filter((e) => e.id === 'C6');
const C7_ONLY  = CASCADA_FC_GRAPH.filter((e) => e.id === 'C7');
const C11_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C11');
const C14_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C14');
const MPI_GUARDS = CASCADA_FC_GRAPH.filter((e) =>
  ['C11', 'C14', 'C16b'].includes(e.id),
);

// ── C6: match_performance_index → fan_momentum (counterintuitive asymmetric) ─

describe('chain C6 — MPI to fan_momentum (counterintuitive asymmetric hysteresis)', () => {
  it('test_c6_victory_positive_delta', () => {
    // AC #1 — MPI=70: P_win=0.4 → K_win_base × ln(1.4) ≈ +2.692 (AC says ±0.05)
    const prevState = { ...defaultWorldState(), match_performance_index: 70 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC6.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(K_win_base * Math.log1p(0.4), 5);
    // Within story tolerance ±0.05 of +2.71
    expect(delta).toBeGreaterThan(2.66);
    expect(delta).toBeLessThan(2.76);
  });

  it('test_c6_defeat_negative_delta', () => {
    // AC #2 — MPI=30: P_loss=0.4 → -K_loss_base × (1 + 0.16) = -9.28
    // NOTE: GDD line 337 shows -8.32 but that has an arithmetic error (0.4²=0.16 not 0.04).
    // The authoritative R4-corrected value is -9.28 from AC-CTI-C6.
    const prevState = { ...defaultWorldState(), match_performance_index: 30 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC6.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(-K_loss_base * (1 + 0.4 * 0.4), 5); // -9.28
    expect(delta).toBeCloseTo(-9.28, 2);
  });

  it('test_c6_asymmetry_ratio_at_least_3x', () => {
    // AC #3 (mandatory asymmetry proof): |loss delta| / |win delta| ≥ 3.0
    // At MPI=30/70: ratio ≈ 9.28 / 2.69 ≈ 3.45
    const prevWin  = { ...defaultWorldState(), match_performance_index: 70 };
    const prevLoss = { ...defaultWorldState(), match_performance_index: 30 };
    const ctxWin  = makeCtx(1, prevWin);
    const ctxLoss = makeCtx(1, prevLoss);
    const deltaWin  = edgeC6.transferFn(prevWin, ctxWin);
    const deltaLoss = edgeC6.transferFn(prevLoss, ctxLoss);
    const ratio = Math.abs(deltaLoss) / Math.abs(deltaWin);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    // Both signs correct
    expect(deltaWin).toBeGreaterThan(0);
    expect(deltaLoss).toBeLessThan(0);
  });

  it('test_c6_equilibrium_at_mpi_50', () => {
    // AC #4 — MPI=50 exactly uses positive branch (per GDD line 536); P_win=0 → delta=0
    const prevState = { ...defaultWorldState(), match_performance_index: 50 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC6.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c6_extreme_loss_mpi_0', () => {
    // AC #5 — MPI=0: P_loss=1.0 → -8.0 × (1+1) = -16.0
    const prevState = { ...defaultWorldState(), match_performance_index: 0 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC6.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(-16.0, 5);
    expect(delta).toBeCloseTo(-K_loss_base * 2, 5);
  });

  it('test_c6_boundary_mpi_49_first_loss_branch', () => {
    // MPI=49: first point in loss branch. P_loss = 1/50 = 0.02
    // delta = -K_loss_base × (1 + 0.02²) = -8.0 × 1.0004 = -8.0032
    const prevState = { ...defaultWorldState(), match_performance_index: 49 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC6.transferFn(prevState, ctx);
    const P_loss = 1 / 50;
    expect(delta).toBeCloseTo(-K_loss_base * (1 + P_loss * P_loss), 5);
    expect(delta).toBeLessThan(0);
  });

  it('test_c6_extreme_win_mpi_100', () => {
    // AC #6 — MPI=100: P_win=1.0 → 8.0 × ln(2) ≈ +5.545
    const prevState = { ...defaultWorldState(), match_performance_index: 100 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC6.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(K_win_base * Math.LN2, 4);
    expect(delta).toBeGreaterThan(5.5);
    expect(delta).toBeLessThan(5.6);
  });
});

// ── C7: consecutive_wins → fan_momentum (quadratic streak bonus) ──────────────

describe('chain C7 — consecutive_wins to fan_momentum (quadratic streak)', () => {
  it('test_c7_baseline_five_wins', () => {
    // AC #7 — CW=5: 2.0 × 5 × 6 / 110 = 60/110 ≈ 0.5454 ≈ +0.55
    const prevState = { ...defaultWorldState(), consecutive_wins: 5 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC7.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(K_streak_base * 5 * 6 / C7_DENOM, 5);
    expect(delta).toBeCloseTo(0.545, 2);
  });

  it('test_c7_max_ten_wins', () => {
    // AC #8 — CW=10: 2.0 × 10 × 11 / 110 = 220/110 = +2.0 (denominator saturates)
    const prevState = { ...defaultWorldState(), consecutive_wins: 10 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC7.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(2.0, 5);
  });

  it('test_c7_zero_wins', () => {
    // AC #9 — CW=0: 2.0 × 0 × 1 / 110 = 0.0
    const prevState = { ...defaultWorldState(), consecutive_wins: 0 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC7.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c7_next_tick_after_step3_decision', () => {
    // AC #10 — C7 reads prevState.consecutive_wins from the PREVIOUS tick.
    // Tick 1: prevState CW=3, Step 3 decision +1 → nextState.CW=4.
    // Tick 2: prevState CW=4 → C7 delta = 2.0 × 4 × 5 / 110 ≈ +0.364.
    const prevStateT1: Readonly<WorldState> = { ...defaultWorldState(), consecutive_wins: 3 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'consecutive_wins', delta: +1, source: 'win' },
    ];
    const ctxT1 = makeCtx(1, prevStateT1);
    const resultT1 = runTick(ctxT1, C7_ONLY, prevStateT1, decisions, EMPTY_BUFFER);

    // Verify CW updated to 4 in nextState
    expect(resultT1.nextState.consecutive_wins).toBe(4);

    // Tick 2: use T1 nextState as prevState; C7 should now see CW=4
    const prevStateT2 = resultT1.nextState;
    const ctxT2 = makeCtx(2, prevStateT2);
    const deltaC7T2 = edgeC7.transferFn(prevStateT2, ctxT2);
    // 2.0 × 4 × 5 / 110 ≈ 0.364
    expect(deltaC7T2).toBeCloseTo(K_streak_base * 4 * 5 / C7_DENOM, 5);
  });
});

// ── C11: staff_morale → match_performance_index (guarded) ────────────────────

describe('chain C11 — staff_morale to MPI (guarded by hasMatchThisWeek)', () => {
  it('test_c11_baseline_low_morale_with_match', () => {
    // AC #11 — morale=20, hasMatch=true → 8.0 × (20-50)/50 = -4.8
    const prevState = { ...defaultWorldState(), staff_morale: 20 };
    const ctx = makeCtx(1, prevState, () => 0.5, true);
    const delta = edgeC11.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(-4.8, 5);
    expect(delta).toBeCloseTo(K_morale_perf * (20 - 50) / 50, 5);
  });

  it('test_c11_guarded_no_match', () => {
    // AC #12 — hasMatchThisWeek=false → C11 suppressed; log has 'guarded' entry
    const prevState = { ...defaultWorldState(), staff_morale: 20 };
    const ctx = makeCtx(1, prevState, () => 0.5, false);
    const result = runTick(ctx, C11_ONLY, prevState, [], EMPTY_BUFFER);
    const guardedLog = result.log.find((e) => e.source === 'guarded' && e.edgeId === 'C11');
    expect(guardedLog).toBeDefined();
    // MPI unchanged
    expect(result.nextState.match_performance_index).toBe(prevState.match_performance_index);
  });
});

// ── C14: field_quality → match_performance_index (guarded + noisy) ────────────

describe('chain C14 — field_quality to MPI (guarded + noisy)', () => {
  it('test_c14_baseline_with_match_zero_noise', () => {
    // AC #13 — fq=80, hasMatch=true, rng=0.5 (zero noise) → 6.0 × 30/50 = +3.6
    const prevState = { ...defaultWorldState(), field_quality: 80 };
    const ctx = makeCtx(1, prevState, () => 0.5, true);
    const delta = edgeC14.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(3.6, 5);
    expect(delta).toBeCloseTo(K_home_advantage * (80 - 50) / 50, 5);
  });

  it('test_c14_noise_positive_rng_1', () => {
    // AC #14 — fq=80, rng=1.0 → 3.6 + 1.0 = +4.6
    const prevState = { ...defaultWorldState(), field_quality: 80 };
    const ctxBase = makeCtx(1, prevState, () => 0.5, true);
    const ctxNoisy = makeCtx(1, prevState, () => 1.0, true);
    const base = edgeC14.transferFn(prevState, ctxBase);
    const noisy = edgeC14.transferFn(prevState, ctxNoisy);
    expect(noisy - base).toBeCloseTo(NOISE_C14_AMP / 2, 5); // +1.0
    expect(noisy).toBeCloseTo(4.6, 5);
  });

  it('test_c14_noise_negative_rng_0', () => {
    // AC #14 — fq=80, rng=0.0 → 3.6 - 1.0 = +2.6
    const prevState = { ...defaultWorldState(), field_quality: 80 };
    const ctxBase = makeCtx(1, prevState, () => 0.5, true);
    const ctxNoisy = makeCtx(1, prevState, () => 0.0, true);
    const base = edgeC14.transferFn(prevState, ctxBase);
    const noisy = edgeC14.transferFn(prevState, ctxNoisy);
    expect(noisy - base).toBeCloseTo(-NOISE_C14_AMP / 2, 5); // -1.0
    expect(noisy).toBeCloseTo(2.6, 5);
  });

  it('test_c14_guarded_no_match', () => {
    // AC #15 — hasMatchThisWeek=false → C14 suppressed; log has 'guarded'
    const prevState = { ...defaultWorldState(), field_quality: 80 };
    const ctx = makeCtx(1, prevState, () => 0.5, false);
    const result = runTick(ctx, C14_ONLY, prevState, [], EMPTY_BUFFER);
    const guardedLog = result.log.find((e) => e.source === 'guarded' && e.edgeId === 'C14');
    expect(guardedLog).toBeDefined();
    expect(result.nextState.match_performance_index).toBe(prevState.match_performance_index);
  });

  it('test_c14_determinism_same_seed', () => {
    // AC #18 — two calls with identical rng → identical delta.
    // Uses a 5-step counter to verify the rng sequence (not just first value)
    // is consumed identically in both calls.
    const prevState = { ...defaultWorldState(), field_quality: 70 };
    // seq[0] = 0.1 is the one rng() call C14 makes per evaluation
    const seq = [0.1, 0.3, 0.7, 0.5, 0.9];
    let i1 = 0;
    let i2 = 0;
    const ctx1 = makeCtx(1, prevState, () => seq[i1++ % seq.length]!, true);
    const ctx2 = makeCtx(1, prevState, () => seq[i2++ % seq.length]!, true);
    const delta1 = edgeC14.transferFn(prevState, ctx1);
    const delta2 = edgeC14.transferFn(prevState, ctx2);
    expect(delta1).toBe(delta2);
    // Verify exactly 1 rng call was consumed per evaluation
    expect(i1).toBe(1);
    expect(i2).toBe(1);
  });
});

// ── MPI fan-in spot check ─────────────────────────────────────────────────────

describe('match_performance_index fan-in (AC #16)', () => {
  it('test_mpi_fan_in_has_exactly_c11_c14_c16b', () => {
    // AC #16 — only C11, C14, C16b are allowed to write to MPI.
    const edges = getEdgesByTarget('match_performance_index');
    const ids = new Set(edges.map((e) => e.id));
    expect(ids.has('C11')).toBe(true);
    expect(ids.has('C14')).toBe(true);
    expect(ids.has('C16b')).toBe(true);
    expect(ids.size).toBe(3);
  });
});

// ── AC-THR-06 precondition: MPI unchanged on non-match weeks ─────────────────

describe('AC-THR-06 precondition — MPI stays at default on non-match weeks', () => {
  it('test_mpi_unchanged_100_non_match_ticks', () => {
    // AC #17 — 100 ticks with hasMatchThisWeek=false, all MPI-writing edges guarded.
    // match_performance_index must stay at its default (50) throughout.
    let state = defaultWorldState();
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;
    const defaultMPI = state.match_performance_index; // 50

    for (let week = 1; week <= 100; week++) {
      const ctx = makeCtx(week, state, () => 0.5, false /* no match */);
      const result = runTick(ctx, MPI_GUARDS, state, [], buffer);
      state = result.nextState;
      buffer = result.newDelayedEffects as DelayedEffectsBuffer;
      expect(state.match_performance_index).toBe(defaultMPI);
    }
  });
});
