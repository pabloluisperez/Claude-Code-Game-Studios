// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can we observe the full 4-week cascade flow on the CLI before any UI exists?
// Date: 2026-05-18

import seedrandom from "seedrandom";
import {
  mergeDelayedBuffer,
  runTick,
} from "./cascade-engine.js";
import {
  REAL_PUEBLO_INITIAL,
  SLICE_SCHEDULE,
  SLICE_SEED,
} from "./seed-data.js";
import type {
  DelayedEffect,
  PlayerDecisions,
  TickResult,
  WorldState,
} from "./types.js";

/**
 * Runs the 4-week month deterministically and prints the cascade trace.
 * Used as a Day 3 sunk-cost smoke check: the loop must produce coherent
 * output from the CLI before any UI work begins.
 *
 * The decisions below are a fixed "naive new manager" script — keep
 * intensity high to "show effort" + bump prices to "fix finances".
 * This script is designed to exercise the counterintuitive cascades:
 *   - C4 high-intensity training degrades fitness
 *   - C15 sustained high price erodes fan_momentum after 2 weeks
 *   - C6 the bad match in week 4 punishes fan_momentum harshly
 */
const NAIVE_DECISIONS: readonly PlayerDecisions[] = [
  { training_intensity: 80, ticket_price_index: 70 }, // Week 1
  { training_intensity: 80, ticket_price_index: 70 }, // Week 2
  { training_intensity: 80, ticket_price_index: 70 }, // Week 3 — C15 of week 1 lands here
  { training_intensity: 80, ticket_price_index: 70 }, // Week 4 — C15 of week 2 lands here
];

function formatState(state: WorldState): string {
  return [
    `fit=${state.team_fitness.toFixed(1)}`,
    `morale=${state.staff_morale.toFixed(1)}`,
    `fan=${state.fan_momentum.toFixed(1)}`,
    `att=${state.fan_attendance.toFixed(1)}`,
    `MPI=${state.match_performance_index.toFixed(1)}`,
  ].join("  ");
}

function main(): void {
  const rngFactory = seedrandom(SLICE_SEED);
  // Single RNG stream for the whole month — re-seed only once.
  const rng = (): number => rngFactory.double();

  let state: WorldState = { ...REAL_PUEBLO_INITIAL };
  let delayedBuffer: DelayedEffect[] = [];

  console.log("=== Cascada FC — Vertical Slice smoke run ===");
  console.log(`Seed: ${SLICE_SEED}`);
  console.log(`Initial: ${formatState(state)}\n`);

  for (let i = 0; i < SLICE_SCHEDULE.length; i++) {
    const week = SLICE_SCHEDULE[i]!;
    const decisions = NAIVE_DECISIONS[i] ?? {};

    // Stamp the synthetic MPI in state so C6 can read it on match weeks.
    if (week.hasMatchThisWeek && week.syntheticMpi !== undefined) {
      state = { ...state, match_performance_index: week.syntheticMpi };
    }

    const result: TickResult = runTick({
      prevState: state,
      delayedBuffer,
      decisions,
      rng,
      hasMatchThisWeek: week.hasMatchThisWeek,
      currentWeek: week.weekNumber,
    });

    state = result.nextState;
    delayedBuffer = mergeDelayedBuffer(
      delayedBuffer,
      result.newDelayedEffects,
      week.weekNumber,
    );

    console.log(`── ${week.label} ──`);
    console.log(`State: ${formatState(state)}`);
    for (const entry of result.log) {
      if (Math.abs(entry.delta) < 0.05) continue;
      const sched =
        entry.delay > 0 ? `  [delay ${entry.delay}w → W${entry.scheduledFor}]` : "";
      console.log(
        `  ${entry.edgeId.padEnd(20)} → ${entry.to.padEnd(28)} ${
          entry.delta >= 0 ? "+" : ""
        }${entry.delta.toFixed(2)}${sched}`,
      );
    }
    for (const x of result.thresholdCrossings) {
      console.log(
        `  ⚠ THRESHOLD ${x.priority} ${x.nodeId} ${x.direction} ${x.threshold} → ${x.value.toFixed(1)} (${x.reason})`,
      );
    }
    console.log();
  }

  console.log("=== End of month ===");
  console.log(`Final: ${formatState(state)}`);
  console.log(`Delayed buffer remaining: ${delayedBuffer.length} effect(s)`);
}

main();
