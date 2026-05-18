// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can we observe the full 4-week cascade + match flow end-to-end on the CLI?
// Date: 2026-05-18 (Day 3 — match-sim integrated)

import seedrandom from "seedrandom";
import { mergeDelayedBuffer, runTick } from "./cascade-engine.js";
import { simulateMatch } from "./match-simulation.js";
import {
  generateLineup,
  REAL_PUEBLO,
  RIVALS,
  SLICE_HOME_FLAGS,
} from "./player-gen.js";
import {
  REAL_PUEBLO_INITIAL,
  SLICE_SCHEDULE,
  SLICE_SEED,
} from "./seed-data.js";
import type {
  DelayedEffect,
  MatchOutcome,
  PlayerDecisions,
  TickResult,
  WorldState,
} from "./types.js";

/**
 * Runs the full 4-week month deterministically.
 *
 * Per-week flow (slice subset of the production loop):
 *   1. Simulate match (pure function, returns MatchOutcome)
 *   2. Apply MatchOutcome.worldStateDeltas:
 *        - match_performance_index = 50 + delta  (reset-and-apply semantics)
 *        - injury_risk             += delta      (cumulative)
 *   3. Run cascade tick (reads prevState.MPI, propagates to fan_momentum via C6)
 *   4. Apply player decisions for next week
 *
 * The Day 2 smoke used a fixed synthetic MPI per week. Day 3 replaces that
 * with real simulateMatch output driven by procedurally-generated lineups.
 */
const NAIVE_DECISIONS: readonly PlayerDecisions[] = [
  { training_intensity: 80, ticket_price_index: 70 }, // Week 1
  { training_intensity: 80, ticket_price_index: 70 }, // Week 2
  { training_intensity: 80, ticket_price_index: 70 }, // Week 3
  { training_intensity: 80, ticket_price_index: 70 }, // Week 4
];

function formatState(state: WorldState): string {
  return [
    `fit=${state.team_fitness.toFixed(1)}`,
    `morale=${state.staff_morale.toFixed(1)}`,
    `fan=${state.fan_momentum.toFixed(1)}`,
    `att=${state.fan_attendance.toFixed(1)}`,
    `MPI=${state.match_performance_index.toFixed(1)}`,
    `injRisk=${state.injury_risk.toFixed(1)}`,
  ].join("  ");
}

function describeMatch(
  outcome: MatchOutcome,
  homeName: string,
  awayName: string,
): string {
  const score = `${outcome.homeScore}-${outcome.awayScore}`;
  const verdict =
    outcome.winner === "draw"
      ? "draw"
      : outcome.winner === "home"
        ? `${homeName} W`
        : `${awayName} W`;
  const goals = outcome.events.filter((e) => e.type === "goal").length;
  const yellows = outcome.events.filter((e) => e.type === "yellow_card").length;
  const injuries = outcome.events.filter((e) => e.type === "injury").length;
  return `${homeName} ${score} ${awayName} (${verdict}) · ${goals}g ${yellows}y ${injuries}inj`;
}

function main(): void {
  const cascadeRngFactory = seedrandom(SLICE_SEED);
  const cascadeRng = (): number => cascadeRngFactory.double();

  let state: WorldState = { ...REAL_PUEBLO_INITIAL };
  let delayedBuffer: DelayedEffect[] = [];

  console.log("=== Cascada FC — Vertical Slice smoke (Day 3 — match-sim integrated) ===");
  console.log(`Seed: ${SLICE_SEED}`);
  console.log(`Initial: ${formatState(state)}\n`);

  for (let i = 0; i < SLICE_SCHEDULE.length; i++) {
    const week = SLICE_SCHEDULE[i]!;
    const decisions = NAIVE_DECISIONS[i] ?? {};
    const rival = RIVALS[i]!;
    const isHome = SLICE_HOME_FLAGS[i] ?? true;

    // ── Step 1-2: simulate match and apply worldStateDeltas ─────────────────
    if (week.hasMatchThisWeek) {
      const matchSeed = `${SLICE_SEED}:match:${week.weekNumber}`;
      const homeClub = isHome ? REAL_PUEBLO : rival;
      const awayClub = isHome ? rival : REAL_PUEBLO;
      const homeLineup = generateLineup(matchSeed, homeClub.baseSkill, homeClub.slug);
      const awayLineup = generateLineup(matchSeed, awayClub.baseSkill, awayClub.slug);
      const outcome = simulateMatch({
        homeClubId: homeClub.id,
        awayClubId: awayClub.id,
        homeLineup,
        awayLineup,
        worldState: state,
        playerClubSide: isHome ? "home" : "away",
        seed: matchSeed,
      });

      // Apply deltas to the WorldState that cascade tick will read as prevState
      state = {
        ...state,
        match_performance_index: 50 + outcome.worldStateDeltas.match_performance_index,
        injury_risk: Math.min(
          100,
          state.injury_risk + outcome.worldStateDeltas.injury_risk,
        ),
      };

      console.log(`── ${week.label} ──`);
      console.log(`Match: ${describeMatch(outcome, homeClub.name, awayClub.name)}`);
      console.log(
        `  Deltas → MPI ${outcome.worldStateDeltas.match_performance_index >= 0 ? "+" : ""}${outcome.worldStateDeltas.match_performance_index} · injuryRisk +${outcome.worldStateDeltas.injury_risk}`,
      );
    } else {
      console.log(`── ${week.label} ──`);
    }

    // ── Step 3: cascade tick ─────────────────────────────────────────────────
    const result: TickResult = runTick({
      prevState: state,
      delayedBuffer,
      decisions,
      rng: cascadeRng,
      hasMatchThisWeek: week.hasMatchThisWeek,
      currentWeek: week.weekNumber,
    });

    state = result.nextState;
    delayedBuffer = mergeDelayedBuffer(
      delayedBuffer,
      result.newDelayedEffects,
      week.weekNumber,
    );

    console.log(`State: ${formatState(state)}`);
    for (const entry of result.log) {
      if (Math.abs(entry.delta) < 0.1) continue;
      const sched =
        entry.delay > 0 ? `  [delay ${entry.delay}w → W${entry.scheduledFor}]` : "";
      console.log(
        `  ${entry.edgeId.padEnd(22)} → ${entry.to.padEnd(28)} ${
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
