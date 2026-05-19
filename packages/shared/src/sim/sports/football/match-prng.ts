/**
 * Stateful PRNG factory for match simulation.
 *
 * Per ADR-013 Option B: the match session snapshot stores the serialized PRNG
 * state so the match worker can resume exactly from any pause point.
 * The key distinction from ADR-002's createSimContext():
 *   - ADR-002 uses seedrandom(seed, { state: false }) — .state() returns undefined
 *   - This factory uses { state: true } — .state() returns a serializable object
 *
 * THE SLICE GOTCHA: seedrandom(seed) without { state: true } makes .state()
 * return undefined silently. Always use { state: true } here.
 *
 * Story: MATCH-SIM-002
 * Control Manifest: 2026-05-19
 */

import seedrandom from 'seedrandom';
import type { SimContext } from '../../cascade-types.js';
import { defaultWorldState } from '../../cascade-types.js';

/**
 * The stateful seedrandom PRNG type (Arc4 algorithm with state support).
 * Using { state: true } overload gives us StatefulPRNG<Arc4> which has .state().
 */
export type StatefulPRNG = seedrandom.StatefulPRNG<seedrandom.State.Arc4>;

/**
 * Creates a SimContext for match simulation with a PRNG that supports
 * state serialization for ADR-013 Option B re-enqueue pattern.
 *
 * UNLIKE createSimContext() from ADR-002, this factory uses { state: true }.
 * The raw stateful PRNG is returned alongside the context to enable serialization
 * without modifying the SimContext interface.
 */
export function createMatchSimContext(
  seed: string,
  worldClock: number,
): { ctx: SimContext; rng: StatefulPRNG } {
  const rng = seedrandom(seed, { state: true });
  const ctx: SimContext = {
    rng: () => rng(),
    currentWeek: worldClock,
    hasMatchThisWeek: true,
    prevState: defaultWorldState(),
  };
  // advance state only via ctx.rng — rng is exposed for serialization (serializeRngState) only
  return { ctx, rng };
}

/**
 * Serializes the PRNG state to a JSON string for storage in
 * MatchSessionSnapshot.prngState.
 * Per ADR-013 Option B: the state is persisted between re-enqueue boundaries.
 */
export function serializeRngState(rng: StatefulPRNG): string {
  return JSON.stringify(rng.state());
}

/**
 * Rehydrates a PRNG from a serialized state, restoring the exact stream position.
 * Per ADR-013 §PRNG Reproducibility: "seedrandom('', { state }) ignores the empty
 * seed — the state alone determines the next value."
 *
 * @param seed - The original seed (for debugging only — ignored when state is provided)
 * @param serializedState - JSON string from serializeRngState()
 */
export function rehydrateRng(_seed: string, serializedState: string): StatefulPRNG {
  // _seed is ignored — the state alone determines the next value (per seedrandom docs).
  return seedrandom('', { state: JSON.parse(serializedState) as seedrandom.State.Arc4 });
}

/**
 * Creates a SimContext resumed from a serialized PRNG state.
 * Used by the match worker when re-enqueueing a paused match session.
 *
 * @param seed - The original match seed (ignored for PRNG, kept for debugging)
 * @param worldClock - The current world clock week number
 * @param prngState - JSON string from serializeRngState(), stored in MatchSessionSnapshot
 */
export function createMatchSimContextFromSnapshot(
  seed: string,
  worldClock: number,
  prngState: string,
): { ctx: SimContext; rng: StatefulPRNG } {
  const rng = rehydrateRng(seed, prngState);
  const ctx: SimContext = {
    rng: () => rng(),
    currentWeek: worldClock,
    hasMatchThisWeek: true,
    prevState: defaultWorldState(),
  };
  return { ctx, rng };
}
