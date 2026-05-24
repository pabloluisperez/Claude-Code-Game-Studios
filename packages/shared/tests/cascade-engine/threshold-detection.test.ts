/**
 * Unit tests for ThresholdCrossing detection (runTick Step 5).
 *
 * Story: CASCADE-ENGINE-014
 * Acceptance Criteria: AC #1–14
 * Test Evidence: packages/shared/tests/cascade-engine/threshold-detection.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  detectCrossings,
  THRESHOLDS_MVP,
} from '../../src/sim/threshold-detector.js';
import { runTick } from '../../src/sim/cascade-engine.js';
import {
  defaultWorldState,
  type SimContext,
  type WorldState,
  type PlayerDecision,
  type ThresholdCrossing,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';
import { CASCADA_FC_GRAPH } from '../../src/sim/cascade-graph.js';

function makeCtx(
  currentWeek: number,
  prevState: Readonly<WorldState>,
  rng: () => number = () => 0.5,
  hasMatchThisWeek = false,
): SimContext {
  return { rng, currentWeek, hasMatchThisWeek, prevState };
}

const EMPTY_BUFFER: DelayedEffectsBuffer = [];

// ── Configuration sanity ──────────────────────────────────────────────────────

describe('THRESHOLDS_MVP configuration', () => {
  it('test_thresholds_mvp_has_seven_entries', () => {
    // AC #1 — exactly 7 thresholds per GDD table
    expect(THRESHOLDS_MVP.length).toBe(7);
  });

  it('test_thresholds_mvp_contains_all_blocking', () => {
    const blocking = THRESHOLDS_MVP.filter((t) => t.priority === 'BLOCKING');
    expect(blocking.length).toBe(3);
    const nodes = blocking.map((t) => t.nodeId).sort();
    expect(nodes).toEqual(['corruption_exposure', 'fan_momentum', 'player_happiness']);
  });

  it('test_thresholds_mvp_contains_all_advisory', () => {
    const advisory = THRESHOLDS_MVP.filter((t) => t.priority === 'ADVISORY');
    expect(advisory.length).toBe(4);
  });
});

// ── Direct detectCrossings tests ──────────────────────────────────────────────

describe('detectCrossings — direct calls', () => {
  it('test_ac_thr_01_fan_momentum_downward_blocking', () => {
    // AC #2 — fan_momentum 22 → 18 (BLOCKING below 20)
    const prev = { ...defaultWorldState(), fan_momentum: 22 };
    const next = { ...defaultWorldState(), fan_momentum: 18 };
    const crossings = detectCrossings(prev, next);
    const fm = crossings.find((c) => c.nodeId === 'fan_momentum' && c.threshold === 20);
    expect(fm).toBeDefined();
    expect(fm!.priority).toBe('BLOCKING');
    expect(fm!.direction).toBe('below');
    expect(fm!.previousValue).toBe(22);
    expect(fm!.newValue).toBe(18);
  });

  it('test_ac_thr_02_fan_momentum_upward_advisory', () => {
    // AC #3 — fan_momentum 73 → 77 (ADVISORY above 75)
    const prev = { ...defaultWorldState(), fan_momentum: 73 };
    const next = { ...defaultWorldState(), fan_momentum: 77 };
    const crossings = detectCrossings(prev, next);
    const fm = crossings.find((c) => c.threshold === 75);
    expect(fm).toBeDefined();
    expect(fm!.priority).toBe('ADVISORY');
    expect(fm!.direction).toBe('above');
  });

  it('test_ac_thr_03_multi_node_single_tick', () => {
    // AC #4 — multiple nodes cross simultaneously
    const prev = {
      ...defaultWorldState(),
      player_happiness: 30,
      injury_risk: 65,
    };
    const next = {
      ...defaultWorldState(),
      player_happiness: 22,
      injury_risk: 72,
    };
    const crossings = detectCrossings(prev, next);
    const ph = crossings.find((c) => c.nodeId === 'player_happiness');
    const ir = crossings.find((c) => c.nodeId === 'injury_risk');
    expect(ph).toBeDefined();
    expect(ph!.priority).toBe('BLOCKING');
    expect(ir).toBeDefined();
    expect(ir!.priority).toBe('ADVISORY');
    expect(crossings.length).toBeGreaterThanOrEqual(2);
  });

  it('test_ac_thr_04_no_double_fire_below', () => {
    // AC #5 — already below 20 → no new crossing
    const prev = { ...defaultWorldState(), fan_momentum: 18 };
    const next = { ...defaultWorldState(), fan_momentum: 14 };
    const crossings = detectCrossings(prev, next);
    const fm = crossings.find((c) => c.nodeId === 'fan_momentum' && c.threshold === 20);
    expect(fm).toBeUndefined();
  });

  it('test_ac_thr_05_no_double_fire_above', () => {
    // AC #6 — already above 80 → no new crossing
    const prev = { ...defaultWorldState(), corruption_exposure: 82 };
    const next = { ...defaultWorldState(), corruption_exposure: 87 };
    const crossings = detectCrossings(prev, next);
    const ce = crossings.find((c) => c.nodeId === 'corruption_exposure');
    expect(ce).toBeUndefined();
  });

  it('test_boundary_inclusivity_prev_at_threshold_no_movement', () => {
    // AC #12 — prev=20 next=20 → no crossing (no transition)
    const prev = { ...defaultWorldState(), fan_momentum: 20 };
    const next = { ...defaultWorldState(), fan_momentum: 20 };
    const crossings = detectCrossings(prev, next);
    expect(crossings.find((c) => c.nodeId === 'fan_momentum' && c.threshold === 20)).toBeUndefined();
  });

  it('test_boundary_inclusivity_prev_at_threshold_moves_through', () => {
    // AC #12 — prev=20 next=19 → BLOCKING fires
    const prev = { ...defaultWorldState(), fan_momentum: 20 };
    const next = { ...defaultWorldState(), fan_momentum: 19 };
    const crossings = detectCrossings(prev, next);
    expect(crossings.find((c) => c.nodeId === 'fan_momentum' && c.threshold === 20)).toBeDefined();
  });

  it('test_boundary_strict_destination_inclusive_origin', () => {
    // AC #12 — prev=21 next=20 → no crossing (next not strictly below 20)
    const prev = { ...defaultWorldState(), fan_momentum: 21 };
    const next = { ...defaultWorldState(), fan_momentum: 20 };
    const crossings = detectCrossings(prev, next);
    expect(crossings.find((c) => c.nodeId === 'fan_momentum' && c.threshold === 20)).toBeUndefined();
  });

  it('test_reason_strings_populated_from_gdd_table', () => {
    // AC #14 — reason exact GDD string
    const prev = { ...defaultWorldState(), corruption_exposure: 75 };
    const next = { ...defaultWorldState(), corruption_exposure: 83 };
    const crossings = detectCrossings(prev, next);
    const ce = crossings.find((c) => c.nodeId === 'corruption_exposure');
    expect(ce).toBeDefined();
    expect(ce!.reason).toContain('Escándalo de corrupción');
  });
});

// ── runTick Step 5 integration ────────────────────────────────────────────────

describe('runTick wiring — Step 5 emits crossings in TickResult', () => {
  it('test_runtick_threshold_crossings_is_array_when_empty', () => {
    // AC #13 — never undefined or null
    const state = defaultWorldState();
    const r = runTick(makeCtx(1, state), [], state, [], EMPTY_BUFFER);
    expect(Array.isArray(r.thresholdCrossings)).toBe(true);
    expect(r.thresholdCrossings.length).toBe(0);
  });

  it('test_ac_pld_03_ce_crossing_via_runtick', () => {
    // AC #8 — prev CE=75, PD +12, with C18a graph → next ≈ 83.25 → BLOCKING above 80
    const prev = { ...defaultWorldState(), corruption_exposure: 75 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'corruption_exposure', delta: +12, source: 'scandal_risk' },
    ];
    const c18a = CASCADA_FC_GRAPH.filter((e) => e.id === 'C18a');
    const r = runTick(makeCtx(1, prev), c18a, prev, decisions, EMPTY_BUFFER);
    const ce = r.thresholdCrossings.find((c) => c.nodeId === 'corruption_exposure');
    expect(ce).toBeDefined();
    expect(ce!.priority).toBe('BLOCKING');
    expect(ce!.direction).toBe('above');
  });

  it('test_ac_c18_02b_downward_crossing_via_runtick', () => {
    // AC #9 — prev CE=85 (guarded), PD -10 → next=75 → BLOCKING below
    const prev = { ...defaultWorldState(), corruption_exposure: 85 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'corruption_exposure', delta: -10, source: 'reduce_corruption' },
    ];
    const c18a = CASCADA_FC_GRAPH.filter((e) => e.id === 'C18a');
    const r = runTick(makeCtx(1, prev), c18a, prev, decisions, EMPTY_BUFFER);
    const ce = r.thresholdCrossings.find((c) => c.nodeId === 'corruption_exposure');
    expect(ce).toBeDefined();
    expect(ce!.direction).toBe('below');
    expect(ce!.previousValue).toBe(85);
    expect(ce!.newValue).toBe(75);
  });

  it('test_ac_c18_03_chained_crossings_two_in_one_tick', () => {
    // AC #10 — Setup: prev with CE just below 80 AND fan_momentum just above 20.
    // Apply PDs that push CE through 80 (BLOCKING up) AND fan_momentum through 20 (BLOCKING down).
    const prev = { ...defaultWorldState(), corruption_exposure: 75, fan_momentum: 25 };
    const decisions: readonly PlayerDecision[] = [
      { nodeId: 'corruption_exposure', delta: +12, source: 'scandal' },
      { nodeId: 'fan_momentum', delta: -30, source: 'scandal_fallout' },
    ];
    const c18a = CASCADA_FC_GRAPH.filter((e) => e.id === 'C18a');
    const r = runTick(makeCtx(1, prev), c18a, prev, decisions, EMPTY_BUFFER);
    const ce = r.thresholdCrossings.find((c) => c.nodeId === 'corruption_exposure');
    const fm = r.thresholdCrossings.find((c) => c.nodeId === 'fan_momentum');
    expect(ce, 'CE crossing must fire').toBeDefined();
    expect(fm, 'fan_momentum crossing must fire').toBeDefined();
    expect(ce!.priority).toBe('BLOCKING');
    expect(fm!.priority).toBe('BLOCKING');
  });

  it('test_ac_thr_06_default_state_no_crossings_100_ticks', () => {
    // AC #7 + AC #11 — 100 ticks with default state, no decisions, no match.
    // Default values are inside all threshold ranges → 0 crossings every tick.
    let state: WorldState = defaultWorldState();
    let buffer: DelayedEffectsBuffer = EMPTY_BUFFER;
    let totalCrossings = 0;

    for (let week = 1; week <= 100; week++) {
      const r = runTick(makeCtx(week, state), CASCADA_FC_GRAPH, state, [], buffer);
      totalCrossings += r.thresholdCrossings.length;
      state = r.nextState;
      buffer = r.newDelayedEffects as DelayedEffectsBuffer;
    }
    expect(totalCrossings).toBe(0);
  });
});

// ── Ordering and stability ────────────────────────────────────────────────────

describe('crossings array stability and ordering', () => {
  it('test_crossings_array_order_matches_config_order', () => {
    // Crossings emitted in THRESHOLDS_MVP iteration order
    const prev = {
      ...defaultWorldState(),
      corruption_exposure: 75,
      fan_momentum: 25,
    };
    const next = {
      ...defaultWorldState(),
      corruption_exposure: 85, // CE crosses up (config index 0)
      fan_momentum: 15, // fan_momentum crosses down (config index 1)
    };
    const crossings = detectCrossings(prev, next);
    // CE must appear before fan_momentum (matches config order)
    const ceIdx = crossings.findIndex((c) => c.nodeId === 'corruption_exposure');
    const fmIdx = crossings.findIndex((c) => c.nodeId === 'fan_momentum');
    expect(ceIdx).toBeGreaterThanOrEqual(0);
    expect(fmIdx).toBeGreaterThanOrEqual(0);
    expect(ceIdx).toBeLessThan(fmIdx);
  });

  it('test_detectCrossings_pure_no_mutation', () => {
    // Calling detectCrossings twice with same inputs → identical output
    const prev = { ...defaultWorldState(), injury_risk: 65 };
    const next = { ...defaultWorldState(), injury_risk: 72 };
    const r1 = detectCrossings(prev, next);
    const r2 = detectCrossings(prev, next);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// Type-safety smoke check — ensures the imported ThresholdCrossing type still includes new fields
const _typeProbe: ThresholdCrossing = {
  nodeId: 'fan_momentum',
  threshold: 20,
  direction: 'below',
  priority: 'BLOCKING',
  previousValue: 22,
  newValue: 18,
  reason: 'test',
};
void _typeProbe;
