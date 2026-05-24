// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Is the slice's cascade tick truly deterministic (same seed → same output)?
// Date: 2026-05-18

import { describe, expect, it } from "vitest";
import seedrandom from "seedrandom";
import {
  mergeDelayedBuffer,
  runTick,
} from "../cascade-engine.js";
import {
  REAL_PUEBLO_INITIAL,
  SLICE_SCHEDULE,
  SLICE_SEED,
} from "../seed-data.js";
import type {
  DelayedEffect,
  PlayerDecisions,
  TickResult,
  WorldState,
} from "../types.js";

interface RunSummary {
  finalState: WorldState;
  thresholdCrossings: { week: number; reason: string; value: number }[];
  delayedBufferCount: number;
}

function runMonth(decisions: readonly PlayerDecisions[]): RunSummary {
  const rngFactory = seedrandom(SLICE_SEED);
  const rng = (): number => rngFactory.double();
  let state: WorldState = { ...REAL_PUEBLO_INITIAL };
  let buffer: DelayedEffect[] = [];
  const crossings: { week: number; reason: string; value: number }[] = [];

  for (let i = 0; i < SLICE_SCHEDULE.length; i++) {
    const week = SLICE_SCHEDULE[i]!;
    if (week.hasMatchThisWeek && week.syntheticMpi !== undefined) {
      state = { ...state, match_performance_index: week.syntheticMpi };
    }
    const result: TickResult = runTick({
      prevState: state,
      delayedBuffer: buffer,
      decisions: decisions[i] ?? {},
      rng,
      hasMatchThisWeek: week.hasMatchThisWeek,
      currentWeek: week.weekNumber,
    });
    state = result.nextState;
    buffer = mergeDelayedBuffer(buffer, result.newDelayedEffects, week.weekNumber);
    for (const x of result.thresholdCrossings) {
      crossings.push({ week: week.weekNumber, reason: x.reason, value: x.value });
    }
  }

  return {
    finalState: state,
    thresholdCrossings: crossings,
    delayedBufferCount: buffer.length,
  };
}

describe("cascade-engine determinism", () => {
  const naiveDecisions: PlayerDecisions[] = [
    { training_intensity: 80, ticket_price_index: 70 },
    { training_intensity: 80, ticket_price_index: 70 },
    { training_intensity: 80, ticket_price_index: 70 },
    { training_intensity: 80, ticket_price_index: 70 },
  ];

  it("two runs with the same seed and decisions produce identical state", () => {
    const a = runMonth(naiveDecisions);
    const b = runMonth(naiveDecisions);
    expect(b.finalState).toEqual(a.finalState);
    expect(b.thresholdCrossings).toEqual(a.thresholdCrossings);
    expect(b.delayedBufferCount).toBe(a.delayedBufferCount);
  });

  it("identical decisions but different seeds diverge", () => {
    // Build a parallel run with a different seed
    const rngA = seedrandom(SLICE_SEED);
    const rngB = seedrandom("alt-seed-for-divergence");
    let stateA: WorldState = { ...REAL_PUEBLO_INITIAL };
    let stateB: WorldState = { ...REAL_PUEBLO_INITIAL };
    let bufferA: DelayedEffect[] = [];
    let bufferB: DelayedEffect[] = [];

    for (let i = 0; i < SLICE_SCHEDULE.length; i++) {
      const wk = SLICE_SCHEDULE[i]!;
      const dec = naiveDecisions[i] ?? {};
      if (wk.hasMatchThisWeek && wk.syntheticMpi !== undefined) {
        stateA = { ...stateA, match_performance_index: wk.syntheticMpi };
        stateB = { ...stateB, match_performance_index: wk.syntheticMpi };
      }
      const ra = runTick({
        prevState: stateA,
        delayedBuffer: bufferA,
        decisions: dec,
        rng: () => rngA.double(),
        hasMatchThisWeek: wk.hasMatchThisWeek,
        currentWeek: wk.weekNumber,
      });
      const rb = runTick({
        prevState: stateB,
        delayedBuffer: bufferB,
        decisions: dec,
        rng: () => rngB.double(),
        hasMatchThisWeek: wk.hasMatchThisWeek,
        currentWeek: wk.weekNumber,
      });
      stateA = ra.nextState;
      stateB = rb.nextState;
      bufferA = mergeDelayedBuffer(bufferA, ra.newDelayedEffects, wk.weekNumber);
      bufferB = mergeDelayedBuffer(bufferB, rb.newDelayedEffects, wk.weekNumber);
    }

    // Should not match because the noise terms (C4, C14) used different RNG streams.
    expect(stateB.team_fitness).not.toBe(stateA.team_fitness);
  });
});

describe("cascade-engine semantic checks", () => {
  it("C15 (price erosion) lands with a 2-week delay", () => {
    // Week 1 decision: high price → C15 delta should NOT have applied to fan_momentum yet at end of W1
    const decisions: PlayerDecisions[] = [
      { training_intensity: 50, ticket_price_index: 80 },
      {},
      {},
      {},
    ];
    const rngFactory = seedrandom(SLICE_SEED);
    const rng = (): number => rngFactory.double();
    let state: WorldState = { ...REAL_PUEBLO_INITIAL };
    let buffer: DelayedEffect[] = [];

    const fanMomentumAtStart = state.fan_momentum;

    // Week 1 — high price set as decision
    const r1 = runTick({
      prevState: state,
      delayedBuffer: buffer,
      decisions: decisions[0]!,
      rng,
      hasMatchThisWeek: false, // skip match effects for isolation
      currentWeek: 1,
    });
    state = r1.nextState;
    buffer = mergeDelayedBuffer(buffer, r1.newDelayedEffects, 1);

    // C15 emits with delay=2 from week 1 → applies at week 3
    expect(buffer.some((e) => e.sourceEdgeId === "C15" && e.applyAtWeek === 3)).toBe(
      true,
    );
    // Direct fan_momentum effect from price (via C15) NOT yet applied
    // — only consecutive_losses bumps, no MPI on this week. So fan_momentum should be unchanged from C15.
    // It may still have changed due to other 0-delay edges, but C15 specifically must be in buffer.
    expect(state.fan_momentum).toBe(fanMomentumAtStart);
  });

  it("C11 and C14 are skipped on non-match weeks", () => {
    const rngFactory = seedrandom("c11-c14-test");
    const rng = (): number => rngFactory.double();
    const state: WorldState = { ...REAL_PUEBLO_INITIAL };

    const noMatch = runTick({
      prevState: state,
      delayedBuffer: [],
      decisions: {},
      rng,
      hasMatchThisWeek: false,
      currentWeek: 1,
    });

    const edgeIds = noMatch.log.map((e) => e.edgeId);
    expect(edgeIds).not.toContain("C11");
    expect(edgeIds).not.toContain("C14");
  });

  it("the counterintuitive parabola C4 punishes both extremes", () => {
    const baseState: WorldState = { ...REAL_PUEBLO_INITIAL, staff_morale: 60 };

    function deltaC4(intensity: number): number {
      const state = { ...baseState, training_intensity: intensity };
      const rng = (): number => 0.5; // noise = 0
      // Disable other edges by reading only C4's log entry
      const r = runTick({
        prevState: state,
        delayedBuffer: [],
        decisions: {},
        rng,
        hasMatchThisWeek: false,
        currentWeek: 1,
      });
      const c4 = r.log.find((e) => e.edgeId === "C4");
      return c4?.delta ?? 0;
    }

    const sweet = deltaC4(50);
    const tooMuch = deltaC4(90);
    const tooLittle = deltaC4(10);

    // Sweet spot should be the largest positive delta
    expect(sweet).toBeGreaterThan(tooMuch);
    expect(sweet).toBeGreaterThan(tooLittle);
    // Both extremes should be NEGATIVE (the counterintuitive payoff)
    expect(tooMuch).toBeLessThan(0);
    expect(tooLittle).toBeLessThan(0);
  });

  it("C6 hysteresis is asymmetric: same-distance loss > same-distance win", () => {
    function deltaC6(mpi: number): number {
      const state: WorldState = { ...REAL_PUEBLO_INITIAL, match_performance_index: mpi };
      const rng = (): number => 0.5;
      const r = runTick({
        prevState: state,
        delayedBuffer: [],
        decisions: {},
        rng,
        hasMatchThisWeek: false,
        currentWeek: 1,
      });
      const c6 = r.log.find((e) => e.edgeId === "C6");
      return c6?.delta ?? 0;
    }
    const winDelta = deltaC6(70); // +20 from 50
    const lossDelta = deltaC6(30); // -20 from 50
    expect(Math.abs(lossDelta)).toBeGreaterThan(winDelta);
  });
});
