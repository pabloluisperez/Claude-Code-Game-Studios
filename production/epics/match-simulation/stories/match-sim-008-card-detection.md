---
Story: MATCH-SIM-008
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-22 (second yellow → automatic red)
Governing ADR: ADR-007 (card formulas; tackle-check on tick % 15 = 0 + ataque rival), ADR-002 (rng() discipline)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/cards.test.ts
---

# Story: Card Detection — Yellow, Red Direct, Second-Yellow → Red

## Goal

Implement card-event generation at tick-check windows (15, 30, 45, 60, 75, 90), per GDD §Match Algorithm step 5: *"Verificación en ticks múltiplo de 15 cuando P_attack_away fue positivo en ese tick"* (i.e., the trigger is a tackle on an away attack at one of those minutes).

- `P_yellow = (1 - tackling/100) × 0.12 × (effective_fitness(t) < 40 ? 1.5 : 1.0)` — defender being tackled.
- `P_red_direct = 0.003` per tackle check.
- Second yellow to the same player = automatic red (AC-MATCH-22).

The card module also exposes `yellowCardsByPlayerId: Record<string, number>` state, the same shape that `MatchSessionSnapshot` persists (story 014).

## Scope

In `packages/shared/src/sim/sports/football/football-constants.ts` (append):

- `CARD_CHECK_TICKS = [15, 30, 45, 60, 75, 90] as const`.
- `P_YELLOW_BASE = 0.12`.
- `P_YELLOW_FITNESS_MULTIPLIER = 1.5` (when `effective_fitness < 40`).
- `P_YELLOW_FITNESS_THRESHOLD = 40`.
- `P_RED_DIRECT = 0.003`.

In `packages/shared/src/sim/sports/football/football-cards.ts` (new):

- `export interface CardCheckInput { ctx: SimContext; tick: number; defender: PlayerStats; defenderTeam: 'home' | 'away'; yellowCardsByPlayerId: Record<string, number>; }`.
- `export interface CardCheckResult { events: MatchEvent[]; updatedYellowCounts: Record<string, number>; playerSentOff: boolean; }`.
- `export function resolveCardCheck(input: CardCheckInput): CardCheckResult` — single function call per tackle check. Order of rng() invocations: (1) P_yellow roll, (2) if no yellow, P_red_direct roll. **Fixed order is critical for determinism**.
  - If yellow roll succeeds:
    - increment `yellowCardsByPlayerId[defender.id]`.
    - If new count = 2: emit yellow_card + red_card (reason: 'second_yellow') and `playerSentOff = true`.
    - Else: emit just yellow_card.
  - Else if red roll succeeds:
    - emit red_card (reason: 'direct'); `playerSentOff = true`.
  - Else: empty events array; no state change.

In `packages/shared/src/sim/sports/football/football-formulas.ts` (append):

- `export function pYellow(defender: PlayerStats, t: number): number` — pure formula. Returns the probability. `resolveCardCheck` uses this.
- `export function shouldRunCardCheck(tick: number, awayAttackedThisTick: boolean): boolean` — returns `CARD_CHECK_TICKS.includes(tick) && awayAttackedThisTick`. Per GDD: "ticks múltiplo de 15 cuando P_attack_away fue positivo en ese tick".

## Out of Scope

- Tracking which defender is selected for the check — the per-tick loop (story 013) picks the defender from the lineup. Story 008 just resolves the formula.
- Removing the sent-off player from the active lineup — that lives in the per-tick loop / FSM transition (story 014).
- VAR review of red cards (story 010).
- Injury detection on the same tick as a red card (story 009; both fire on red-card ticks).

## Acceptance Criteria

- [ ] **P_yellow normal**: `pYellow({ tackling: 70, fitness: 80, stamina: 80, ... }, 30)` — effective_fitness at t=30 ≈ `80 - (30/90)(0.2)(15) = 80 - 1 = 79`. fitness > 40, multiplier = 1. P_yellow = `(1 - 0.70) × 0.12 = 0.036`.
- [ ] **P_yellow low fitness multiplier**: `pYellow({ tackling: 70, fitness: 20, stamina: 60, ... }, 90)` — effective_fitness = `20 - 1 × 0.4 × 15 = 20 - 6 = 14`, < 40 → multiplier 1.5. P_yellow = `0.3 × 0.12 × 1.5 = 0.054`.
- [ ] **Tackling=100 floor**: `pYellow({ tackling: 100, ... }, 1)` = `0`. Perfect tackler never gets a yellow.
- [ ] **Tackling=0 ceiling**: `pYellow({ tackling: 0, fitness: 100, stamina: 100, ... }, 1)` = `0.12`. Max baseline yellow rate (no fatigue multiplier).
- [ ] **`shouldRunCardCheck`**: returns true for tick=15 with awayAttacked=true; false for tick=16; false for tick=15 with awayAttacked=false.
- [ ] **AC-MATCH-22 second-yellow → red**: `yellowCardsByPlayerId = { 'X': 1 }`. Force the yellow roll to succeed (rng mocked to return 0). `resolveCardCheck` for player X at tick 30. Result: events array contains `[{type:'yellow_card', player_id:'X', minute:30}, {type:'red_card', player_id:'X', minute:30, reason:'second_yellow'}]` in that order. `updatedYellowCounts['X'] === 2`. `playerSentOff === true`.
- [ ] **Direct red**: yellow roll fails (rng=0.99), red roll succeeds (rng=0.001 < 0.003). Result: events = `[{type:'red_card', player_id:'X', minute:30, reason:'direct'}]`. `playerSentOff === true`. `updatedYellowCounts['X'] === 0` (unchanged).
- [ ] **No card**: both rolls fail. Result: empty events; no state change.
- [ ] **Two rng() calls maximum**: spy on `ctx.rng`. If yellow roll succeeds, only 1 rng() call. If yellow fails, 2 rng() calls. Document this in code comments — varying rng() count per branch is acceptable HERE because the next tick's `prngState` is captured AFTER all tick-15 work completes (Option B saves the state at tick boundaries, not at each sub-step).
- [ ] **causal_node = null** on all card events (per AC-MATCH-28: only injury has `causal_node = 'injury_risk'`; everything else is `null`).

## Implementation Notes

*From GDD §Match Algorithm step 5:*

- "Verificación en ticks múltiplo de 15 (15, 30, 45, 60, 75, 90) cuando P_attack_away fue positivo en ese tick".
  - **Interpretation**: at ticks 15/30/45/60/75/90, *if* away attacked that tick, run a tackle check on a home defender. Symmetric for home attacking away.
- The fitness multiplier kicks in at `effective_fitness < 40` (strict less-than). Test the boundary: fitness=40 exactly → multiplier=1.0.
- The slice implements this with `tackle trigger opción-b` (per GDD R6 notes — "tackle trigger opción-b"). Production follows the same pattern.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/cards.test.ts`:

- pYellow normal, low fitness multiplier, tackling extremes.
- shouldRunCardCheck truth table.
- AC-MATCH-22 second-yellow flow with mocked rng.
- Direct red flow.
- No-card flow.
- rng() call count per branch.
- All card events have `causal_node: null`.

## Dependencies

- **Upstream**: 001 (types), 002 (PRNG for mocked rng tests), 003 (effective_fitness via getter).
- **Downstream blockers**: 009 (injury detection runs on card ticks among others), 010 (VAR reviews red cards), 013 (per-tick loop calls resolveCardCheck at tick % 15 = 0 when away attacked), 014 (FSM removes sent-off players from active lineup).

## Estimate

**1 day.** Two formulas + a small state mutator. Branch-coverage on the rng spy + AC-MATCH-22 are the gotchas.

## Notes / Gotchas

- **`yellowCardsByPlayerId` is `Record`, NOT `Map`** — control-manifest. The slice verified `JSON.stringify(new Map([['X', 1]])) === '{}'` (silent failure). Stay with Record.
- **Variable rng() count per branch**: tolerable because `MatchSessionSnapshot.prngState` captures the state at the END of the tick (story 014), not at each sub-step. As long as the algorithm is deterministic *within* the tick, the prngState carries the correct cursor forward.
- **GDD says "P_red_direct = 0.003 por tackle check"** — applies per CHECK, not per match. With 6 check windows × 2 teams = up to 12 checks per match, expected reds per match ≈ 0.036. Roughly aligns with 1 red every 28 matches — close to real-world rates.
- **GDD says check ticks include 90** — that's a card check on the FINAL tick. The implementation should match exactly. The per-tick loop must allow tick=90 to fire card checks.
