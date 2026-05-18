// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does the full 4-week loop work end-to-end with DB persistence?
// Date: 2026-05-18

import { advanceOneWeek } from "../api/advance.js";
import type { PlayerDecisions } from "../sim/types.js";
import { closeDb } from "./client.js";
import { isSeeded, seedSlice, SLICE_PLAYTHROUGH_ID } from "./seed.js";
import * as repo from "./repo.js";

const NAIVE_DECISIONS: readonly PlayerDecisions[] = [
  { training_intensity: 80, ticket_price_index: 70 },
  { training_intensity: 80, ticket_price_index: 70 },
  { training_intensity: 80, ticket_price_index: 70 },
  { training_intensity: 80, ticket_price_index: 70 },
];

async function main(): Promise<void> {
  console.log("=== Cascada FC — DB smoke (Day 4-5) ===");

  if (!(await isSeeded())) {
    console.log("Not seeded yet — running seed…");
    await seedSlice();
  } else {
    console.log("Already seeded — resetting…");
    await seedSlice();
  }

  for (let i = 0; i < 4; i++) {
    const decisions = NAIVE_DECISIONS[i]!;
    const result = await advanceOneWeek(SLICE_PLAYTHROUGH_ID, decisions);
    console.log(`\n── Week ${result.weekProcessed} processed ──`);
    if (result.playerMatchOutcome) {
      const o = result.playerMatchOutcome;
      console.log(`  Match: ${o.homeScore}-${o.awayScore} (winner: ${o.winner})`);
    }
    console.log(
      `  State: fit=${result.finalState.team_fitness.toFixed(1)}  fan=${result.finalState.fan_momentum.toFixed(1)}  att=${result.finalState.fan_attendance.toFixed(1)}  MPI=${result.finalState.match_performance_index.toFixed(1)}`,
    );
    if (result.thresholdCrossings.length) {
      console.log(`  Thresholds:`, result.thresholdCrossings);
    }
    if (result.events.length) {
      console.log(`  Events:`);
      for (const e of result.events) {
        console.log(`    [${e.priority}] ${e.title}`);
      }
    }
  }

  console.log("\n── Final standings (top 8) ──");
  const standings = await repo.getStandings(SLICE_PLAYTHROUGH_ID);
  for (const row of standings.slice(0, 8)) {
    console.log(
      `  ${row.position.toString().padStart(2)} ${row.clubShortName.padEnd(4)} ${row.clubName.padEnd(28)}  ${row.played}p ${row.wins}w ${row.draws}d ${row.losses}l  ${row.goalsFor}:${row.goalsAgainst}  ${row.points}pts`,
    );
  }
  const playerRow = standings.find(
    (r) => r.clubShortName === "RPC" || r.clubName === "Real Pueblo CF",
  );
  if (playerRow && playerRow.position > 8) {
    console.log(`  …`);
    console.log(
      `  ${playerRow.position.toString().padStart(2)} ${playerRow.clubShortName.padEnd(4)} ${playerRow.clubName.padEnd(28)}  ${playerRow.played}p ${playerRow.wins}w ${playerRow.draws}d ${playerRow.losses}l  ${playerRow.goalsFor}:${playerRow.goalsAgainst}  ${playerRow.points}pts`,
    );
  }

  await closeDb();
}

main().catch((err) => {
  console.error("smoke-db failed:", err);
  process.exit(1);
});
