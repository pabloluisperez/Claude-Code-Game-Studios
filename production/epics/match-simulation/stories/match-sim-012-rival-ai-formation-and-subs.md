---
Story: MATCH-SIM-012
Status: Pending
Type: Logic
GDD Requirement: AC-MATCH-27 (rival AI: zero substitutions when effective_fitness ≥ 40), AC-MATCH-32 (rival AI: formation selection by strength_ratio)
Governing ADR: ADR-007 (rival AI deterministic rules), ADR-002 (no rng in rival decisions — fully deterministic from inputs)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/rival-ai.test.ts
---

# Story: Rival AI — Pre-Match Formation by Strength Ratio + In-Match Substitution Rules

## Goal

Implement the rival club's deterministic decision logic (no manager input, no rng-based decisions):

- **Pre-match formation selection** (AC-MATCH-32):
  - `strength_ratio = mean(awayLineup.effective_rating(t=0)) / mean(homeLineup.effective_rating(t=0))`.
  - `strength_ratio > 1.10` → `'4-3-3'`.
  - `strength_ratio < 0.90` → `'5-3-2'`.
  - Otherwise → `'4-4-2'`.
  - Boundary: `strength_ratio = 1.10` exactly → `'4-4-2'` (strict `>`).
- **In-match substitutions** (AC-MATCH-27):
  - At each `substitution_window` tick (45, 60, 75): for each rival starter with `effective_fitness(t) < 40`, IF the bench has a player in the same position, substitute (highest effective_rating from bench in that position). Stop when `awaySubstitutionsUsed === 5`.
  - On rival injury: substitute first available bench player in same position; fall back to any-position if no match. Stop at 5.
  - Rival has its **own pool of 5** (independent from player's 5).
  - Rival never uses instructions (PRESS_HIGH/HOLD_SHAPE/COUNTER).
  - Rival never changes formation during match (MVP).
- **Rival lineup auto-generation** at match-create: top 11 by `effective_rating(t=0)` from rival squad, respecting minima 1 GK / 2 DEF / 2 FWD.

## Scope

In `packages/shared/src/sim/sports/football/football-rival-ai.ts` (new):

- `export function selectRivalFormation(homeLineup: Lineup, awayLineup: Lineup): FormationPreset` — implements AC-MATCH-32.
- `export interface RivalSubDecision { from: PlayerSlot; to: PlayerSlot; }`.
- `export function rivalSubstitutionPlan(args: { tick: number; currentLineupAway: Lineup; bench: PlayerSlot[]; awaySubstitutionsUsed: number; }): RivalSubDecision[]` — returns the ordered list of subs to make at this `substitution_window`. Up to `5 - awaySubstitutionsUsed` decisions. Order: starters with lowest effective_fitness first; bench player with highest effective_rating in matching position.
- `export function rivalInjurySub(args: { tick: number; injuredPlayer: PlayerStats; currentLineupAway: Lineup; bench: PlayerSlot[]; awaySubstitutionsUsed: number; }): RivalSubDecision | null` — returns null if no sub possible (bench empty in matching position AND `awaySubstitutionsUsed === 5`); otherwise return the substitution.
- `export function generateRivalLineup(squad: PlayerStats[]): Lineup` — picks 11 starters + up to 7 bench. Starters: top 11 by effective_rating(t=0) with minima (1 GK, 2 DEF, 2 FWD). The rest of the squad becomes bench (top 7 by effective_rating).

## Out of Scope

- Loading the rival squad from `player-management` (story 017 — Hono route `POST /matches/:id/start`).
- The actual lineup-mutation when substitutions fire (story 014 — FSM state transitions).
- Player's substitution decisions (story 014).

## Acceptance Criteria

- [ ] **AC-MATCH-32 strong rival**: `mean(awayLineup.effective_rating(t=0)) = 75`, `mean(home) = 65` → ratio = 1.154 > 1.10 → `'4-3-3'`.
- [ ] **AC-MATCH-32 weak rival**: ratio = 0.846 → `'5-3-2'`.
- [ ] **AC-MATCH-32 even**: ratio = 1.0 → `'4-4-2'`.
- [ ] **AC-MATCH-32 boundary**: ratio exactly 1.10 → `'4-4-2'` (strict `> 1.10`); ratio exactly 0.90 → `'4-4-2'` (strict `< 0.90`).
- [ ] **AC-MATCH-27 zero subs when fit**: all rival starters at `effective_fitness(45) >= 40`, bench has players, `awaySubstitutionsUsed=0` → `rivalSubstitutionPlan` returns `[]`. Repeated for tick=60 and tick=75 (all fit).
- [ ] **Sub when unfit + bench available**: starter A with effective_fitness(60)=30 (below 40), bench has player B in same position with effective_rating=70 → plan returns `[{from: A, to: B}]`.
- [ ] **Skip when bench has no matching position**: starter A unfit (DEF), bench has only MIDs → `rivalSubstitutionPlan` does NOT substitute A (in scheduled window). On INJURY pause (`rivalInjurySub`), the algorithm falls back to any-position: substitutes with the first available bench player even if position mismatches.
- [ ] **Pool cap**: with `awaySubstitutionsUsed=4`, multiple unfit starters → plan returns AT MOST 1 sub (4+1=5). With `awaySubstitutionsUsed=5`, returns `[]`.
- [ ] **Highest effective_rating selection**: bench has two FWDs, ratings 60 and 75 — pick the 75.
- [ ] **No instructions**: the type signature of rival-AI functions does NOT include an instruction parameter. Rival instruction is always `null` (per GDD).
- [ ] **No formation mutation mid-match**: there is no `rivalFormationDuringMatch` function. The formation chosen pre-match is permanent. (Negative test: confirm no such function exists.)
- [ ] **Lineup generation minima**: with a squad of 25 players (10 DEF, 5 MID, 5 FWD, 5 GK), `generateRivalLineup` returns 11 starters with at least 1 GK, 2 DEF, 2 FWD.
- [ ] **Determinism**: `selectRivalFormation` and `rivalSubstitutionPlan` return the same output for the same input across multiple invocations. No rng() used.

## Implementation Notes

*From GDD §Rival AI Manager (R3/R4):*

- "El rival nunca cambia su formación durante el partido (MVP)".
- "El AI rival no usa instrucciones".
- "Pool propio de 5 cambios, independiente del player".
- Lineup minima from "AI rival elige los 11 con mayor effective_rating(t=0) respetando mínimo de 1 GK, 2 DEF, 2 FWD".

*Determinism*:
- ALL rival decisions are deterministic functions of (lineup, bench, fitness). No rng() needed. This means the rival AI does NOT consume rng cursor — important for the determinism contract (story 013).

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/rival-ai.test.ts`:

- AC-MATCH-32 all four cases (strong, weak, even, boundary).
- AC-MATCH-27 zero subs case across all three windows.
- Sub-when-unfit case.
- Bench-no-match position skip.
- Pool cap (at 4 used; at 5 used).
- Highest effective_rating selection.
- Determinism (same input → same output).
- Lineup generation minima.

## Dependencies

- **Upstream**: 001 (types), 003 (effective_fitness, effective_rating).
- **Downstream blockers**: 014 (FSM applies the rival's sub decisions inside substitution_window pauses), 017 (Hono `/start` generates rival lineup via `generateRivalLineup`).

## Estimate

**1 day.** Mostly straightforward; the lineup-generation algorithm and the position-matching during subs are the meatiest pieces.

## Notes / Gotchas

- **Rival AI is DETERMINISTIC** — no rng() at all. This is by design: the rival is a known quantity; only the rolls of the dice (rng-driven events) differ between matches. The player can fully predict the rival's decisions from the inputs.
- **`rivalInjurySub` position fallback**: per GDD line 304 "(o cualquier posición si no hay match de posición)". For *scheduled* windows, the algorithm sticks to same-position (GDD line 297). For *injury* pauses, the algorithm relaxes to any-position. Document this asymmetry.
- **AC-MATCH-32 boundary at 1.10**: strict `>`. The slice's match-determinism.test.ts may or may not test this; production must.
- **`generateRivalLineup` minima** (1 GK, 2 DEF, 2 FWD = 5 — leaving 6 flexible slots). The remaining 6 are filled by top effective_rating regardless of position. If the squad doesn't have a GK at all (edge case), the function should select the highest-rated player and mark `assignedAs: 'GOALKEEPER'` (per AC-MATCH-17 emergency-GK pattern). Add this defensive case to tests.
