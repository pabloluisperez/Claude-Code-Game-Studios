---
Story: MATCH-SIM-003
Status: Pending
Type: Logic
GDD Requirement: AC-MATCH-07 (F1 effective_fitness decay + clamp to 0), AC-MATCH-08 (F2 effective_rating composite)
Governing ADR: ADR-007 (FootballPlugin formulas), ADR-002 (no Math.random — formulas are pure)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/effective-stats.test.ts
---

# Story: F1 effective_fitness + F2 effective_rating

## Goal

Implement the two foundational per-player formulas the rest of the algorithm reads:

- **F1**: `effective_fitness(player, t) = max(0, fitness - (t/90) × (1 - stamina/100) × FITNESS_DECAY_MAX)` — degrades fitness across the 90-minute match based on stamina. Clamp to 0.
- **F2**: `effective_rating(player, t) = skill×0.35 + form×0.20 + morale×0.15 + effective_fitness(player,t)×0.30` — composite rating used by F5 (P_attack), F6 (P_shot), F7 (P_goal), F10 (player ratings).

Both functions are pure (no `ctx.rng()`, no I/O). Defensive clamping on F1 ensures F7 never receives a negative `gk_def`.

## Scope

In `packages/shared/src/sim/sports/football/football-formulas.ts` (new):

- `const FITNESS_DECAY_MAX = 15;` — defined here (single source of truth; control-manifest "named constants in graph file, never inlined").
- `export function effectiveFitness(player: PlayerStats, t: number): number` — F1. Clamp to 0 via `Math.max(0, ...)`.
- `export function effectiveRating(player: PlayerStats, t: number): number` — F2.

Add helper accessors for position-specific stats with sane defaults (since `noUncheckedIndexedAccess: true` means optional stats are `number | undefined`):

- `getPassing(player): number` → `player.passing ?? 50`
- `getVision(player): number` → `player.vision ?? 50`
- `getSpeed(player): number` → `player.speed ?? 50`
- `getFinishing(player): number` → `player.finishing ?? 50`
- `getStrength(player): number` → `player.strength ?? 50`
- `getTackling(player): number` → `player.tackling ?? 50`
- `getReflexes(player): number` — if `player.assignedAs === 'GOALKEEPER' && player.position === 'DEFENDER'`, return `player.skill × 0.4` (per AC-MATCH-17 edge case); else `player.reflexes ?? 50`.
- `getHandling(player): number` — same emergency-GK derivation: `player.skill × 0.3` if assignedAs is GK and position is DEF; else `player.handling ?? 50`.

These helpers MUST be used by every downstream formula — no direct `player.passing` access without the `?? 50` (lint rule or code review enforced).

## Out of Scope

- F3-F10 (separate stories).
- The emergency goalkeeper substitution flow itself (story 008 / 014); this story only implements the stat derivation.

## Acceptance Criteria

- [ ] **AC-MATCH-07 normal case**: `effectiveFitness({ fitness: 72, stamina: 65, ... }, 90)` = `66.75`. Tolerance: exact float match (no rounding — IEEE-754 deterministic).
- [ ] **AC-MATCH-07 stamina=100**: `effectiveFitness({ fitness: 80, stamina: 100 }, 90)` = `80` (no decay). Test with multiple `t` values: t=1, 45, 90.
- [ ] **AC-MATCH-07 clamp to 0**: `effectiveFitness({ fitness: 8, stamina: 40 }, 90)` = `0` (mathematical: 8 - 1.0×0.6×15 = -1.0 clamped to 0). Negative result forbidden.
- [ ] **AC-MATCH-08 composite**: `effectiveRating({ skill: 63, form: 70, morale: 60, fitness: 72, stamina: 65, ... }, 90)` = `65.08` (within float tolerance 0.01). Calculation: `63×0.35 + 70×0.20 + 60×0.15 + 66.75×0.30 = 22.05+14+9+20.025 = 65.075`.
- [ ] **Weight sensitivity**: increasing `skill` by 1 (other stats fixed) increases `effective_rating` by exactly `0.35`. Increasing `form` by 1 increases by `0.20`. Etc. Documents the formula's linearity for tuning.
- [ ] **Output range invariant**: with `skill ∈ [20,95]`, `form ∈ [30,90]`, `morale ∈ [0,100]`, `effective_fitness ∈ [0,100]`, `effectiveRating` ∈ [13, 96.25] (the GDD F2 documented bounds). Random-sample 10000 valid player objects and assert range holds.
- [ ] **Emergency GK derivation**: a player with `position: 'DEFENDER'`, `skill: 70`, `assignedAs: 'GOALKEEPER'` returns `getReflexes() = 28` and `getHandling() = 21` (AC-MATCH-17 quantification).
- [ ] **Pure functions**: no `ctx.rng()` calls, no `Math.random()`, no `Date.now()`. Grep test on the file.
- [ ] **Default helpers**: `getPassing({ passing: undefined })` returns `50` (no `NaN`). All accessors handle undefined cleanly.

## Implementation Notes

*From GDD F1 + F2:*

- The clamp in F1 is part of the formula, not just an Edge Case (R1 fix).
- F2 weights (0.35/0.20/0.15/0.30) sum to 1.0 — preserve this invariant in code comments.
- The position-stat helpers' fallback of `50` is the slice's convention. Document why: it represents "average player" for missing positional stats and prevents NaN propagation in F5/F6/F7 when a position stat is genuinely absent (e.g., a generated player without all 8 stats).

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/effective-stats.test.ts`:

- AC-MATCH-07 all three scenarios (normal, stamina=100, clamp to 0).
- AC-MATCH-08 exact composite computation.
- Linearity tests (per-stat sensitivity).
- Output range bound: 10,000 randomized players, all results in [13, 96.25].
- Emergency GK derivation (AC-MATCH-17 numeric check on reflexes=28, handling=21).
- Helper functions handle undefined gracefully.

## Dependencies

- **Upstream**: 001 (types), 002 (no direct dependency but conventionally follows the PRNG story).
- **Downstream blockers**: 004 (F3/F4 — independent but conventionally next), 005 (F5 uses effectiveRating via attacker FWD), 006 (F6 uses effectiveRating for both attacker and defender), 007 (F7 uses effectiveFitness for GK), 012 (F10 = effectiveRating at t=90).

## Estimate

**0.5 days.** Small, isolated, pure functions. Tests dominate the time.

## Notes / Gotchas

- **F1 clamp is canonical** — do NOT defer the clamp to F7. Multiple downstream formulas read effective_fitness; only one (F7) uses it as a divisor input. Other downstream uses (F2, F10) would silently mis-compute if effective_fitness were negative. The clamp lives in F1.
- **The `?? 50` convention** is debatable but slice-validated. An alternative is `player-management` generating all 8 stats for every player regardless of position. Production should pick one — for now match-sim follows the slice convention (`?? 50`) until ADR or quick-design says otherwise.
- **Stamina floor of 40** comes from player-management.md world-gen. Match-sim defends against stamina < 40 by clamping; do NOT assume the upstream invariant holds. Test `stamina: 0` explicitly even if it should never occur (defensive).
