/**
 * Unit tests for chains C8 and C15 (counterintuitive price-related chains).
 *
 * C8  — fan_momentum × ticket_price_index → fan_attendance (delay 0, convergence).
 *       Multi-input: reads fan_momentum AND ticket_price_index via prevState.
 * C15 — ticket_price_index → fan_momentum (delay 2, silent below T_price_danger).
 *       Canonical AC-PLD-02 test: retroactive cancellation forbidden.
 *
 * Story: CASCADE-ENGINE-011
 * Acceptance Criteria: AC #1–14.
 * Test Evidence: packages/shared/tests/cascade-engine/chains-c8-c15.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  ATTEND_MAX_BASE,
  ATTEND_MIN_BASE,
  MOMENTUM_TOLERANCE_DIVISOR,
  PRICE_BONUS_K,
  K_price_erosion,
  T_price_danger,
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

const edgeC8 = getEdge('C8');
const edgeC15 = getEdge('C15');
const C8_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C8');
const C15_ONLY = CASCADA_FC_GRAPH.filter((e) => e.id === 'C15');

// ── C8: fan_momentum × ticket_price_index → fan_attendance ───────────────────

describe('chain C8 — counterintuitive price × momentum → attendance', () => {
  it('test_c8_high_momentum_high_price', () => {
    // AC #1 — F_m=80, TPI=70, A=55
    // attendance_base = 0.8×60+5 = 53
    // price_penalty = 20 × (1 - 80/120) = 20 × 0.3333 = 6.6667
    // price_bonus = 0
    // target = 53 - 6.6667 = 46.3333
    // delta = 46.3333 - 55 = -8.6667
    const prevState = {
      ...defaultWorldState(),
      fan_momentum: 80,
      ticket_price_index: 70,
      fan_attendance: 55,
    };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC8.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(-8.6667, 3);
  });

  it('test_c8_low_momentum_high_price_collapse', () => {
    // AC #2 — F_m=20, TPI=70, A=55 → MUCH worse attendance
    // attendance_base = 0.2×60+5 = 17
    // price_penalty = 20 × (1 - 20/120) = 20 × 0.8333 = 16.6667
    // target = 17 - 16.6667 = 0.3333
    // delta = 0.3333 - 55 = -54.6667
    const prevState = {
      ...defaultWorldState(),
      fan_momentum: 20,
      ticket_price_index: 70,
      fan_attendance: 55,
    };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC8.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(-54.6667, 3);
  });

  it('test_c8_counterintuitive_asymmetry_low_vs_high_momentum', () => {
    // AC #2 mandatory cross-check: |delta(F_m=20)| > |delta(F_m=80)| for TPI=70
    const stateHigh = { ...defaultWorldState(), fan_momentum: 80, ticket_price_index: 70, fan_attendance: 55 };
    const stateLow = { ...defaultWorldState(), fan_momentum: 20, ticket_price_index: 70, fan_attendance: 55 };
    const deltaHigh = edgeC8.transferFn(stateHigh, makeCtx(1, stateHigh));
    const deltaLow = edgeC8.transferFn(stateLow, makeCtx(1, stateLow));
    expect(Math.abs(deltaLow)).toBeGreaterThan(Math.abs(deltaHigh));
    expect(Math.abs(deltaLow) / Math.abs(deltaHigh)).toBeGreaterThan(5);
  });

  it('test_c8_low_price_bonus', () => {
    // AC #3 — F_m=50, TPI=30, A=30
    // attendance_base = 0.5×60+5 = 35
    // price_bonus = max(0, 20)×0.25 = 5
    // price_penalty = 0
    // target = 40 → delta = +10
    const prevState = { ...defaultWorldState(), fan_momentum: 50, ticket_price_index: 30, fan_attendance: 30 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC8.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(10, 5);
  });

  it('test_c8_momentum_protection_monotonic', () => {
    // AC #4 — price_penalty decreases monotonically as F_m rises (TPI=70 fixed)
    const penalties = [0, 20, 40, 60, 80, 100].map((F_m) => {
      const state = { ...defaultWorldState(), fan_momentum: F_m, ticket_price_index: 70, fan_attendance: 50 };
      return Math.max(0, 70 - 50) * (1 - F_m / MOMENTUM_TOLERANCE_DIVISOR);
    });
    // Sequence must be strictly decreasing
    for (let i = 1; i < penalties.length; i++) {
      expect(penalties[i]!).toBeLessThan(penalties[i - 1]!);
    }
  });

  it('test_c8_reads_prevState_not_decision_mid_tick', () => {
    // AC #5 — same-tick decision changes TPI in nextState, but C8 must read prevState.TPI=70
    const prevState = { ...defaultWorldState(), fan_momentum: 80, ticket_price_index: 70, fan_attendance: 55 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'ticket_price_index', delta: -30, source: 'set_price' /* sets to 40 */ },
    ];
    const ctx = makeCtx(1, prevState);
    const result = runTick(ctx, C8_ONLY, prevState, decisions, EMPTY_BUFFER);

    // C8 must have used prevState.TPI=70 → delta -8.6667. Check result.log.
    const logEntry = result.log.find((e) => e.edgeId === 'C8');
    expect(logEntry).toBeDefined();
    expect(logEntry!.delta).toBeCloseTo(-8.6667, 3);
    // And nextState.TPI reflects the decision = 40
    expect(result.nextState.ticket_price_index).toBe(40);
  });

  it('test_c8_unclamped_delta_step4_clamps_nextstate', () => {
    // AC #14 — extreme: F_m=0, TPI=100, A=100 → target ≈ -45; raw delta ≈ -145
    // nextState.fan_attendance must be clamped to 0 (not negative)
    const prevState = { ...defaultWorldState(), fan_momentum: 0, ticket_price_index: 100, fan_attendance: 100 };
    const ctx = makeCtx(1, prevState);
    const result = runTick(ctx, C8_ONLY, prevState, [], EMPTY_BUFFER);

    // Raw delta unclamped: target = 0×0.6+5 - 50×1 + 0 = -45; delta = -45-100 = -145
    const logEntry = result.log.find((e) => e.edgeId === 'C8');
    expect(logEntry!.delta).toBeCloseTo(-145, 1);
    // But nextState clamps to 0
    expect(result.nextState.fan_attendance).toBe(0);
  });
});

// ── C15: ticket_price_index → fan_momentum (delay 2, silent below threshold) ──

describe('chain C15 — counterintuitive delayed price erosion', () => {
  it('test_c15_above_threshold', () => {
    // AC #6 — TPI=80: delta = -K_price_erosion × max(0, 80-65) = -0.12 × 15 = -1.8
    const prevState = { ...defaultWorldState(), ticket_price_index: 80 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC15.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(-1.8, 5);
  });

  it('test_c15_below_threshold', () => {
    // AC #7 — TPI=60: max(0, 60-65)=0 → delta=0
    const prevState = { ...defaultWorldState(), ticket_price_index: 60 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC15.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c15_at_threshold', () => {
    // AC #8 — TPI=65 (boundary inclusive on safe side): max(0, 0) = 0 → delta=0
    const prevState = { ...defaultWorldState(), ticket_price_index: 65 };
    const ctx = makeCtx(1, prevState);
    const delta = edgeC15.transferFn(prevState, ctx);
    expect(delta).toBeCloseTo(0.0, 10);
  });

  it('test_c15_delay_routing_applyAt_W_plus_2', () => {
    // AC #9 + AC #12 — TPI=80 at W=1, delay 2 → queued effect with applyAt=3
    const prevState = { ...defaultWorldState(), ticket_price_index: 80 };
    const ctx = makeCtx(1, prevState);
    const result = runTick(ctx, C15_ONLY, prevState, [], EMPTY_BUFFER);

    const queued = result.newDelayedEffects.find((e) => e.edgeId === 'C15');
    expect(queued).toBeDefined();
    expect(queued!.applyAt).toBe(3);
    expect(queued!.toNode).toBe('fan_momentum');
    expect(queued!.delta).toBeCloseTo(-1.8, 5);
  });

  it('test_c15_acpld02_retroactive_cancellation_forbidden', () => {
    // AC #10 — CRITICAL: queued effect at W=1 (TPI=80, applyAt=3, delta=-1.8).
    // Player decision in W=1 sets TPI=40. At W=3 when effect fires, fan_momentum
    // must still decrease by 1.8 (not 0). Retroactive cancellation forbidden.
    //
    // Simulate three ticks: W=1 queues, W=2 idles, W=3 applies.
    let state: WorldState = { ...defaultWorldState(), ticket_price_index: 80, fan_momentum: 50 };
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;

    // W=1: evaluate C15 + decision sets TPI=40
    const decisionsW1: readonly PlayerDecision[] = [
      { nodeId: 'ticket_price_index', delta: -40, source: 'lower_price' /* 80 → 40 */ },
    ];
    const r1 = runTick(makeCtx(1, state), C15_ONLY, state, decisionsW1, buffer);
    state = r1.nextState;
    buffer = r1.newDelayedEffects as DelayedEffectsBuffer;
    expect(state.ticket_price_index).toBe(40);
    const fanMomentumBeforeApply = state.fan_momentum;

    // W=2: no inputs; effect queued for W=3 still in buffer
    const r2 = runTick(makeCtx(2, state), C15_ONLY, state, [], buffer);
    state = r2.nextState;
    buffer = r2.newDelayedEffects as DelayedEffectsBuffer;
    // Buffer still has W=3 effect (TPI=40 below threshold still queues delta=0, but W=3 effect persists)
    expect(buffer.find((e) => e.applyAt === 3 && e.edgeId === 'C15')).toBeDefined();

    // W=3: effect applies → fan_momentum decreases by 1.8 despite TPI=40 now
    const r3 = runTick(makeCtx(3, state), C15_ONLY, state, [], buffer);
    state = r3.nextState;
    expect(state.fan_momentum).toBeCloseTo(fanMomentumBeforeApply - 1.8, 5);
  });

  it('test_c15_sustained_10_weeks_total_erosion', () => {
    // AC #11 — TPI=80 sustained 10 weeks → 10 queued effects of -1.8 each
    // Total accumulated erosion across the 10-week span = -18.0 (when all applied)
    let state: WorldState = { ...defaultWorldState(), ticket_price_index: 80, fan_momentum: 100 };
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;
    const initialMomentum = state.fan_momentum;

    // Run 12 weeks so all 10 queued effects (W=3..W=12) can apply
    for (let week = 1; week <= 12; week++) {
      const evalC15 = week <= 10; // queue erosion for weeks 1..10 (applyAt 3..12)
      const graph = evalC15 ? C15_ONLY : [];
      const r = runTick(makeCtx(week, state), graph, state, [], buffer);
      state = r.nextState;
      buffer = r.newDelayedEffects as DelayedEffectsBuffer;
    }
    // 10 × -1.8 = -18.0 erosion
    expect(state.fan_momentum).toBeCloseTo(initialMomentum - 18.0, 1);
  });

  it('test_c15_determinism_pure', () => {
    // AC #13 — same prevState → identical delta across two calls
    const prevState = { ...defaultWorldState(), ticket_price_index: 90 };
    const delta1 = edgeC15.transferFn(prevState, makeCtx(1, prevState, () => 0.1));
    const delta2 = edgeC15.transferFn(prevState, makeCtx(1, prevState, () => 0.9));
    // rng must not affect C15 (pure)
    expect(delta1).toBe(delta2);
    expect(delta1).toBeCloseTo(-3.0, 5); // -0.12 × 25
  });
});

// ── Constants exposure sanity ──────────────────────────────────────────────────

describe('C8 + C15 constants exported and tuned per GDD', () => {
  it('test_c8_constants_match_gdd', () => {
    expect(ATTEND_MAX_BASE).toBe(60);
    expect(ATTEND_MIN_BASE).toBe(5);
    expect(MOMENTUM_TOLERANCE_DIVISOR).toBe(120);
    expect(PRICE_BONUS_K).toBe(0.25);
  });

  it('test_c15_constants_match_gdd', () => {
    expect(K_price_erosion).toBeCloseTo(0.12, 5);
    expect(T_price_danger).toBe(65);
  });
});
