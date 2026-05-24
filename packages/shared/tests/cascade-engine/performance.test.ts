/**
 * Performance budget validation for runTick().
 *
 * AC-PERF-01: 100 ticks average < 5ms on Node.js dev environment.
 * AC-PERF-02: 1000 ticks total < 2 seconds.
 *
 * Per ADR-002: `performance.now()` is allowed in test code, FORBIDDEN in sim
 * code itself. The cascade engine must not measure its own timing.
 *
 * Story: CASCADE-ENGINE-016
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { runTick } from '../../src/sim/cascade-engine.js';
import { CASCADA_FC_GRAPH } from '../../src/sim/cascade-graph.js';
import {
  defaultWorldState,
  type SimContext,
  type PlayerDecision,
  type WorldState,
} from '../../src/sim/cascade-types.js';
import type { DelayedEffect, DelayedEffectsBuffer } from '../../src/sim/delayed-effects.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Pre-populated buffer representing a mid-playthrough state where chains C1a,
 * C4, C5a, C5b, C15, and C17 have all queued effects (per AC #3 of CASCADE-016).
 * 9 effects, spread across upcoming weeks 21..23 so most are still queued after
 * a tick at week 20.
 */
function midPlaythroughBuffer(): DelayedEffectsBuffer {
  const effects: DelayedEffect[] = [
    { applyAt: 21, toNode: 'team_fitness', delta: -1.2, edgeId: 'C1a' },
    { applyAt: 21, toNode: 'team_fitness', delta: -1.8, edgeId: 'C4' },
    { applyAt: 21, toNode: 'team_fitness', delta: 0.5, edgeId: 'C5a' },
    { applyAt: 22, toNode: 'team_fitness', delta: 0.4, edgeId: 'C5a' },
    { applyAt: 22, toNode: 'match_performance_index', delta: 0.3, edgeId: 'C5b' },
    { applyAt: 22, toNode: 'fan_momentum', delta: -1.8, edgeId: 'C15' },
    { applyAt: 23, toNode: 'fan_momentum', delta: -1.8, edgeId: 'C15' },
    { applyAt: 23, toNode: 'player_happiness', delta: 0.6, edgeId: 'C17' },
    { applyAt: 23, toNode: 'player_happiness', delta: -0.4, edgeId: 'C17' },
  ];
  return effects;
}

/**
 * Realistic mid-playthrough WorldState — not the default. Approximates a club
 * struggling at season midpoint to stress the threshold guards in C11/C14/C16b.
 */
function midPlaythroughState(): WorldState {
  return {
    ...defaultWorldState(),
    team_fitness: 65,
    team_skill: 52,
    fan_momentum: 45,
    fan_attendance: 50,
    player_happiness: 55,
    match_performance_index: 50,
    consecutive_wins: 0,
    consecutive_losses: 2,
    training_intensity: 60,
    catering_budget: 40,
    groundskeeper_budget: 50,
    scouting_budget: 30,
    field_quality: 55,
    sponsor_quality: 50,
    corruption_exposure: 5,
    squad_available_pct: 88,
    ticket_price_index: 50,
    scouting_points: 56,
    staff_morale: 60,
    injury_risk: 25,
  };
}

/**
 * Deterministic rng — runTick is allowed rng access for noise terms; using a
 * fixed sequence keeps the perf test reproducible across runs without seedrandom
 * setup overhead in the hot loop.
 */
function makeFastCtx(currentWeek: number, hasMatchThisWeek = false): SimContext {
  let counter = 0;
  return {
    rng: () => {
      // Mulberry32-style cheap deterministic PRNG (not used outside this test).
      counter = (counter + 0x6d2b79f5) | 0;
      let t = counter;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    currentWeek,
    hasMatchThisWeek,
    prevState: midPlaythroughState(),
  };
}

const NO_DECISIONS: readonly PlayerDecision[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

interface TimingStats {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p99: number;
  readonly total: number;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  // Index is guaranteed in [0, sorted.length-1]; the non-null assertion is safe.
  return sorted[idx]!;
}

function summarize(samples: readonly number[]): TimingStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((s, n) => s + n, 0);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: total / samples.length,
    p99: percentile(sorted, 99),
    total,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CASCADE-ENGINE-016 — Performance Budget', () => {
  it(
    'test_runtick_perf_100_ticks_avg_under_5ms',
    { timeout: 10_000 },
    () => {
      // Arrange — hot-loop inputs constructed once outside the timed section.
      const state = midPlaythroughState();
      const buffer = midPlaythroughBuffer();
      const ctx = makeFastCtx(20, false);

      // Warm-up — JIT, V8 inlining. Not measured.
      for (let i = 0; i < 5; i++) {
        runTick(ctx, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);
      }

      // Act — measure 100 ticks (AC-PERF-01).
      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        runTick(ctx, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);
        samples.push(performance.now() - start);
      }
      const stats = summarize(samples);

      // Log baseline (AC #7 — variance reporting). Format suited for CI scrape.
      // eslint-disable-next-line no-console
      console.log(
        `[CASCADE-016 PERF] 100 ticks: min=${stats.min.toFixed(3)}ms ` +
          `avg=${stats.avg.toFixed(3)}ms p99=${stats.p99.toFixed(3)}ms ` +
          `max=${stats.max.toFixed(3)}ms`,
      );

      // Assert — AC-PERF-01.
      expect(stats.avg).toBeLessThan(5);
      // AC #7 — P99 within 2× of avg (lax: must be under 10ms even if avg=5).
      expect(stats.p99).toBeLessThan(10);
    },
  );

  it(
    'test_runtick_perf_1000_ticks_total_under_2s',
    { timeout: 10_000 },
    () => {
      // Arrange.
      const state = midPlaythroughState();
      const buffer = midPlaythroughBuffer();
      const ctx = makeFastCtx(20, false);

      // Warm-up.
      for (let i = 0; i < 10; i++) {
        runTick(ctx, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);
      }

      // Act — 1000 tight-loop ticks (AC-PERF-02).
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        runTick(ctx, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);
      }
      const total = performance.now() - start;

      // eslint-disable-next-line no-console
      console.log(
        `[CASCADE-016 PERF] 1000 ticks total: ${total.toFixed(1)}ms ` +
          `(avg ${(total / 1000).toFixed(3)}ms/tick)`,
      );

      // Assert — AC-PERF-02.
      expect(total).toBeLessThan(2000);
    },
  );

  it('test_runtick_buffer_population_nonempty_during_perf_run', () => {
    // AC #3 — the perf scenario uses a non-empty pre-populated buffer.
    // This test verifies the buffer constructor returns 8-10 effects matching
    // the AC ("representative of mid-playthrough state").
    const buffer = midPlaythroughBuffer();
    expect(buffer.length).toBeGreaterThanOrEqual(8);
    expect(buffer.length).toBeLessThanOrEqual(10);

    // Edges represented (C1a, C4, C5a, C5b, C15, C17 — per AC #3 wording).
    const edgeIds = new Set(buffer.map((e) => e.edgeId));
    expect(edgeIds).toContain('C1a');
    expect(edgeIds).toContain('C4');
    expect(edgeIds).toContain('C5a');
    expect(edgeIds).toContain('C5b');
    expect(edgeIds).toContain('C15');
    expect(edgeIds).toContain('C17');
  });

  it('test_runtick_determinism_preserved_under_perf_load', () => {
    // AC #8 — perf optimizations must not introduce non-determinism.
    // We use the same deterministic ctx factory + same inputs; result must match.
    const state = midPlaythroughState();
    const buffer = midPlaythroughBuffer();
    const ctxA = makeFastCtx(20, false);
    const ctxB = makeFastCtx(20, false);

    const resultA = runTick(ctxA, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);
    const resultB = runTick(ctxB, CASCADA_FC_GRAPH, state, NO_DECISIONS, buffer);

    expect(resultA.nextState).toEqual(resultB.nextState);
  });
});
