// VERTICAL SLICE - NOT FOR PRODUCTION
// Barrel exports for the sim module.
// Date: 2026-05-18

export * from "./types.js";
export { CASCADE_EDGES, THRESHOLDS } from "./cascade-graph.js";
export { runTick, mergeDelayedBuffer } from "./cascade-engine.js";
export { REAL_PUEBLO_INITIAL, SLICE_SEED, SLICE_SCHEDULE } from "./seed-data.js";
export type { SliceWeek } from "./seed-data.js";
export {
  simulateMatch,
  effectiveFitness,
  effectiveRating,
} from "./match-simulation.js";
export {
  generateLineup,
  REAL_PUEBLO,
  RIVALS,
  SLICE_HOME_FLAGS,
} from "./player-gen.js";
export type { ClubConfig } from "./player-gen.js";

// DB layer (Day 4) — optional, requires Postgres on port 5435
export * as repo from "../db/repo.js";
export { getDb, closeDb } from "../db/client.js";
export { generateRoundRobin, forceTargetSchedule } from "../db/fixture-gen.js";
export type { RawFixture } from "../db/fixture-gen.js";
export { SLICE_PLAYTHROUGH_ID, seedSlice, isSeeded } from "../db/seed.js";
