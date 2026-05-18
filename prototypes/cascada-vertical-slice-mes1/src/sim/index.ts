// VERTICAL SLICE - NOT FOR PRODUCTION
// Barrel exports for the sim module.
// Date: 2026-05-18

export * from "./types.js";
export { CASCADE_EDGES, THRESHOLDS } from "./cascade-graph.js";
export { runTick, mergeDelayedBuffer } from "./cascade-engine.js";
export { REAL_PUEBLO_INITIAL, SLICE_SEED, SLICE_SCHEDULE } from "./seed-data.js";
export type { SliceWeek } from "./seed-data.js";
