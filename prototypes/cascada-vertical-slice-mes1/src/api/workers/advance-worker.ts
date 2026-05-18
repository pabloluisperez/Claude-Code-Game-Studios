// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { Worker } from "bullmq";
import { advanceOneWeek } from "../advance.js";
import { getRedisConnection, type AdvanceJobData } from "../queue.js";

/**
 * Worker that processes one advance() job per game-week.
 * Run with: `npm run dev:worker` (after `npm run db:up`).
 */
export function startAdvanceWorker(): Worker<AdvanceJobData> {
  const worker = new Worker<AdvanceJobData>(
    "advance",
    async (job) => {
      const { playthroughId, decisions } = job.data;
      const result = await advanceOneWeek(playthroughId, decisions);
      return {
        weekProcessed: result.weekProcessed,
        playerMatchScore: result.playerMatchOutcome
          ? `${result.playerMatchOutcome.homeScore}-${result.playerMatchOutcome.awayScore}`
          : null,
        thresholdCount: result.thresholdCrossings.length,
        eventsCount: result.events.length,
      };
    },
    { connection: getRedisConnection() },
  );

  worker.on("completed", (job, result) => {
    console.log(`[advance-worker] week ${result?.weekProcessed} done`, result);
  });
  worker.on("failed", (job, err) => {
    console.error(`[advance-worker] job ${job?.id} failed:`, err);
  });

  return worker;
}

// CLI: `tsx src/api/workers/advance-worker.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Starting advance worker on Redis…");
  const worker = startAdvanceWorker();
  process.on("SIGINT", async () => {
    console.log("\nShutting down advance worker…");
    await worker.close();
    process.exit(0);
  });
}
