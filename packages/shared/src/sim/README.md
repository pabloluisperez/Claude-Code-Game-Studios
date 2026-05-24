# Simulation Engines

This directory contains **deterministic, pure-function** simulation code shared
between `apps/api` (authoritative) and `apps/web` (preview/client-side).

## Rules

1. **No side effects.** Every function takes inputs and returns outputs.
2. **No random state.** Pass a seeded RNG as a parameter — never call `Math.random()` directly.
3. **No external deps.** No database, no HTTP, no file I/O.
4. **Same result everywhere.** The same inputs must produce the same output on server and client.

## Planned Modules

- `match-sim.ts` — Sport-agnostic match simulation engine (plug-in sport rules)
- `cascade-engine.ts` — Cascade graph evaluator (club decisions → ripple effects)
- `city-growth.ts` — City tier progression based on club metrics
- `manager-xp.ts` — Manager RPG skill progression calculator

## Seeded RNG Pattern

```ts
// Use a seeded PRNG, not Math.random()
import { mulberry32 } from './rng.js';

export function simulateMatch(seed: number, home: TeamStats, away: TeamStats): MatchResult {
  const rand = mulberry32(seed);
  // ... use rand() instead of Math.random()
}
```
