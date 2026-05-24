/**
 * Seeded PRNG helper.
 *
 * Wraps seedrandom so workspace consumers (apps/web, future tooling) can get
 * a deterministic `() => number` without taking a direct dependency on the
 * underlying library. Returns a stateless float-only PRNG; use the
 * football match-prng module (`sim/sports/football/match-prng.ts`) when you
 * need the `{ state: true }` variant for save/restore.
 *
 * Story: HUD-UI onboarding follow-up
 * Control Manifest: 2026-05-19
 */

import seedrandom from 'seedrandom';

/**
 * Create a deterministic `() => number` PRNG returning floats in [0, 1).
 *
 * @param seed Any string. Same seed → same sequence on every call.
 */
export function createSeededRng(seed: string): () => number {
  return seedrandom(seed);
}
