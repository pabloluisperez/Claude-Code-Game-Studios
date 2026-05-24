---
Story: MATCH-SIM-009
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-23 (field player injured, empty bench → playing_with_ten), AC-MATCH-28 (causal_node = 'injury_risk' on all injury events)
Governing ADR: ADR-007 (P_injury formula; rival injury_risk constant = 50), ADR-002 (rng() discipline)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/injuries.test.ts
---

# Story: Injury Detection — P_injury, Rival Constant=50, causal_node='injury_risk'

## Goal

Implement injury-event generation: per GDD §Match Algorithm step 6, *"Verificación en ticks de gol, tarjeta, y en ticks 45 y 90"*.

- `P_injury_player = (injury_risk_ctx / 100) × 0.08 × (1 - player.effective_fitness(t) / 100)` where:
  - `injury_risk_ctx` for the **player's own team** = `WorldState.injury_risk` (the player's club's risk, passed in via PreMatchSnapshot).
  - `injury_risk_ctx` for the **rival team** = `50` constant (rival doesn't access the player's WorldState; per GDD line 113 and R6 update).
- Emit an `injury` MatchEvent with **`causal_node: 'injury_risk'` always** (AC-MATCH-28).
- Severity (`'minor' | 'major'`) sampled on a second rng() call (50/50 split — keep simple; GDD doesn't specify a different split). NOTE: the GDD doesn't formally specify severity probability — flag for clarification, default 50/50.

## Scope

In `packages/shared/src/sim/sports/football/football-constants.ts` (append):

- `P_INJURY_BASE = 0.08`.
- `RIVAL_INJURY_RISK_CONST = 50`. — per GDD line 113 and slice constant.
- `INJURY_CHECK_TICKS_FIXED = [45, 90] as const`. Additional ticks: gol-ticks (detected via `goalThisTick: boolean`) and card-ticks (detected via `cardThisTick: boolean`).

In `packages/shared/src/sim/sports/football/football-injuries.ts` (new):

- `export interface InjuryCheckInput { ctx: SimContext; tick: number; player: PlayerStats; playerTeam: 'home' | 'away'; playerClubSide: 'home' | 'away'; preMatchSnapshot: PreMatchSnapshot; }`.
- `export interface InjuryCheckResult { event: MatchEvent | null; }`.
- `export function pInjury(player: PlayerStats, injuryRiskCtx: number, t: number): number` — pure formula.
- `export function resolveInjuryCheck(input: InjuryCheckInput): InjuryCheckResult` — performs the rng() roll. If positive, also rolls severity. Emits injury event with `causal_node: 'injury_risk'`.
- `export function getInjuryRiskCtx(playerTeam: 'home' | 'away', playerClubSide: 'home' | 'away', preMatchSnapshot: PreMatchSnapshot): number` — returns `preMatchSnapshot.injury_risk` if `playerTeam === playerClubSide` (the player's own team), else `RIVAL_INJURY_RISK_CONST`.
  - **Subtle**: `PreMatchSnapshot` currently has fields `team_fitness, team_skill, squad_available_pct, field_quality, fan_attendance, staff_morale, player_happiness` — NOT `injury_risk`. **This story adds `injury_risk: number` to PreMatchSnapshot in story 001's type extension.** (Update 001 retroactively OR add the field here — flagged as a story-001-amendment dependency.)
- `export function shouldRunInjuryCheck(tick: number, goalThisTick: boolean, cardThisTick: boolean): boolean` — returns `INJURY_CHECK_TICKS_FIXED.includes(tick) || goalThisTick || cardThisTick`.

## Out of Scope

- The decision to substitute the injured player (story 014 — pause-and-resume).
- Updating `currentLineupHome/Away` after the injury (story 014).
- F9 post-match `injury_risk_delta` aggregation (story 012).

## Acceptance Criteria

- [ ] **`pInjury` formula**: `pInjury({ fitness: 80, stamina: 80, ... }, injuryRiskCtx=50, t=45)` — effective_fitness(45) = `80 - 0.5 × 0.2 × 15 = 80 - 1.5 = 78.5`. P_injury = `(50/100) × 0.08 × (1 - 78.5/100) = 0.5 × 0.08 × 0.215 = 0.0086`.
- [ ] **Player-team uses WorldState injury_risk**: `playerClubSide='home', playerTeam='home', preMatchSnapshot.injury_risk=70`. `getInjuryRiskCtx` returns 70.
- [ ] **Rival team uses constant 50**: `playerClubSide='home', playerTeam='away', preMatchSnapshot.injury_risk=70`. `getInjuryRiskCtx` returns 50 (NOT 70 — rival doesn't access player's WorldState).
- [ ] **Symmetric for visitor playthrough**: `playerClubSide='away', playerTeam='away', preMatchSnapshot.injury_risk=70`. Returns 70 (player's own team is the away side). `playerTeam='home'` returns 50.
- [ ] **`shouldRunInjuryCheck`**: tick=45 → true; tick=90 → true; tick=30 + goal → true; tick=22 + card → true; tick=22 no goal no card → false.
- [ ] **AC-MATCH-28 causal_node**: with rng() forced to produce an injury, the resulting MatchEvent has `causal_node === 'injury_risk'` exactly. Not `null`, not `'injury_risk_high'`, not any other string.
- [ ] **Severity rng()**: when an injury fires, exactly 2 rng() calls happen (1 for P_injury, 1 for severity). Spy verifies.
- [ ] **No injury when P=0**: `pInjury({ fitness: 100, stamina: 100, ... }, injuryRiskCtx=0, t=1)` = `0`. Roll never produces an injury. (Defensive: catch the case where injury_risk=0.)
- [ ] **NaN guard**: with all stats 0 → `effective_fitness=0`; P_injury = `0.08 × 1.0 = 0.08`. Sanity check (not NaN).

## Implementation Notes

*From GDD lines 110-114 + R6:*

- "injury_risk_ctx para jugadores del club del jugador = WorldState.injury_risk".
- "injury_risk_ctx para jugadores del equipo rival = 50 (constante fija, equipo neutral)".
- "El injury_risk del rival NO accede al WorldState del jugador".

*From AC-MATCH-28:*

- "TODOS los eventos con `type:'injury'` tienen el campo `causal_node` con valor exactamente `'injury_risk'`".
- This is unconditional — even if `WorldState.injury_risk = 0`, an injury that fires (from baseline P_injury > 0) still carries the causal_node. The narrative payload is constant; the prominence is decided downstream by hud-ui.

*Severity split (GDD does NOT specify)*:
- The GDD lists `severity:'minor'|'major'` in MatchEvent type but doesn't formalize the probability. Use 50/50 for MVP and flag in story-018 (Q for /quick-design):
  > `OQ-MATCH-INJ-01: Injury severity split probability for minor vs major. MVP default: 50/50.`

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/injuries.test.ts`:

- pInjury formula reproduction.
- getInjuryRiskCtx truth table (home/away player × home/away playerClubSide).
- shouldRunInjuryCheck truth table.
- AC-MATCH-28 causal_node unconditional.
- rng() call count = 2 when injury fires; 1 when no injury.
- P=0 case.
- NaN safety.

## Dependencies

- **Upstream**: 001 (types — AMEND to add `injury_risk` field to `PreMatchSnapshot`), 002 (PRNG), 003 (effective_fitness).
- **Downstream blockers**: 010 (no — VAR doesn't review injuries), 013 (per-tick loop calls resolveInjuryCheck on appropriate ticks), 014 (FSM transitions to `paused_for_decision` after injury event).

## Estimate

**1 day.** Formula is small; the rival-injury_risk constant + the AC-MATCH-28 causal_node check + the PreMatchSnapshot amendment are the things to get right.

## Notes / Gotchas

- **`injury_risk` field on PreMatchSnapshot**: GDD §Contrato de Señal Causal lists `injury_risk` as one of the 7 WorldState nodes match-sim reads (see also FootballPlugin.worldStateReads in ADR-007 — but ADR-007 does NOT list `injury_risk` in the reads array as of 2026-05-16). Cross-check: the GDD §Interactions table (line 441) lists `injury_risk` under "lee" from cascade-engine. The GDD §Contrato de Señal Causal (line 460) does NOT list `injury_risk` in `PreMatchSnapshot`. **Likely a GDD R6 oversight**: `injury_risk` is read by match-sim (per F9 in §Post-Match — wait, F9 reads from events, not WorldState — but P_injury MUST read WorldState.injury_risk). Story 001 must extend `PreMatchSnapshot` with `injury_risk: number`; this should be flagged for a GDD R7 doc fix. Flagged in roster README.
- **Slice already implements `injury_risk_ctx` distinction** — production replicates the structure.
- **Rival injury risk is fixed at 50** — this means the rival's injury rate is bounded and predictable, *independent* of the player's club state. Intentional per GDD: "las consecuencias de la gestión de injury_risk son del manager, no del rival".
