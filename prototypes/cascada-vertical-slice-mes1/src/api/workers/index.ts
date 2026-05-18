// VERTICAL SLICE - NOT FOR PRODUCTION
// Single entry point that starts all slice workers.
// Date: 2026-05-18

import { startAdvanceWorker } from "./advance-worker.js";

console.log("=== Cascada slice workers ===");
const advance = startAdvanceWorker();
console.log("- advance worker started");

process.on("SIGINT", async () => {
  console.log("\nShutting down workers…");
  await advance.close();
  process.exit(0);
});
