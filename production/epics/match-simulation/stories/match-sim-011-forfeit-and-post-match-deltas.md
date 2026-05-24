---
Story: MATCH-SIM-011
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-14 (F8 mpi_delta perspective-aware), AC-MATCH-15 (F9 injury_risk_delta with clamp), AC-MATCH-16 (forfeit when squad_available_pct ≤ 63)
Governing ADR: ADR-007 (F8/F9 formulas, exactly 2 worldStateDeltas), ADR-002 (no rng — these are deterministic post-match aggregations)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/post-match-deltas.test.ts
---

# Story: F8 mpi_delta + F9 injury_risk_delta + F10 player ratings + Forfeit Synthesis

## Goal

Implement the three post-match aggregation formulas + the forfeit short-circuit:

- **F8** `mpi_delta`: perspective-aware from `playerClubSide`. Home win in casa = +X (positive); away win = also +X (positive). Empate en casa = -3; empate fuera = +1 (the R2 fix). Clamp `[-30, +30]`.
- **F9** `injury_risk_delta`: `injury_count × 5 + (yellowCards > 3 ? 3 : 0)`. Clamp `[0, +15]`. Events filter happens AFTER substitution_window removal (so the post-MatchOutcome events array, which excludes substitution_window per AC-MATCH-30, is the input).
- **F10** `playerRatings`: `Record<string, number>` where keys are player IDs of the **player's own team only** (not rival), values are `effective_rating(player, t=90)`, **only for players with `minutes_played >= 30`**.
- **Forfeit synthesis (AC-MATCH-16)**: if `preMatchSnapshot.squad_available_pct <= 63`, the match never starts: return a synthetic `MatchOutcome` with `homeScore=0, awayScore=3` (player's club loses), `worldStateDeltas = { match_performance_index: -30, injury_risk: 0 }`, `events = [{ type:'crisis_signal' /* … */ }]` (a marker event for event-system), and `playerRatings = {}`.

## Scope

In `packages/shared/src/sim/sports/football/football-formulas.ts` (append):

- `export function computeMpiDelta(args: { homeScore: number; awayScore: number; playerClubSide: 'home' | 'away'; }): number` — F8 with R1 fix (perspective-aware) and R2 fix (home draw -3 / away draw +1). Clamp [-30, +30].
- `export function computeInjuryRiskDelta(events: MatchEvent[]): number` — F9. Counts events where `type==='injury'` and yellow cards `type==='yellow_card'`. Clamp [0, +15].
- `export function computePlayerRatings(args: { playerLineup: Lineup; minutesPlayed: Record<string, number>; t: 90; }): Record<string, number>` — F10. Only includes players with `minutesPlayed[id] >= 30`. Value is `effectiveRating(player, 90)`.

In `packages/shared/src/sim/sports/football/match-simulation.ts` (new — pure simulateMatch entry; story 013 fills the body, but the forfeit short-circuit lives at the entry point):

- `export function simulateMatch(input: MatchInput): MatchOutcome` — top-level entry. **First check**: forfeit. If `input.preMatchSnapshot.squad_available_pct <= 63`, return:
  ```ts
  {
    homeScore: input.playerClubSide === 'home' ? 0 : 3,
    awayScore: input.playerClubSide === 'home' ? 3 : 0,
    winner: input.playerClubSide === 'home' ? 'away' : 'home',
    events: [{ type: 'forfeit', minute: 0, team: input.playerClubSide, causal_node: 'squad_available_pct' }],
    worldStateDeltas: { match_performance_index: -30, injury_risk: 0 },
    playerRatings: {},
    finalLineupHome: input.homeLineup,
    finalLineupAway: input.awayLineup,
  }
  ```
  (Note: the forfeit event's `causal_node: 'squad_available_pct'` is an MVP extension — AC-MATCH-28 allows non-injury events to have `null`, but for forfeit specifically, the causal node provides the player with the explicit reason. Document this as a deliberate extension of AC-MATCH-28's flexibility.)

`MatchEventType` (story 001) must include `'forfeit'` as a valid type variant — this story amends story 001 retroactively if not yet present.

## Out of Scope

- The per-tick algorithm body (story 013).
- `minutesPlayed` tracking (story 013 — tracks subs as `playerOut.minutes = subTick; playerIn.minutes = 90 - subTick`).
- F10's role in player-management's form rolling average (player-management.md owns that).

## Acceptance Criteria

- [ ] **AC-MATCH-14 home win**: `playerClubSide='home', homeScore=2, awayScore=0` → mpi_delta = `+20` (goal_diff=2, +10+10).
- [ ] **AC-MATCH-14 home loss**: `playerClubSide='home', homeScore=0, awayScore=2` → mpi_delta = `-20`.
- [ ] **AC-MATCH-14 away win (CRITICAL — R1 fix)**: `playerClubSide='away', homeScore=1, awayScore=2` → mpi_delta = `+15` (goal_diff=1, +10+5). The OLD (pre-R1) formula would have produced negative because `winner==='away'` and the old logic was home-perspective. The new perspective-aware formula MUST be positive.
- [ ] **AC-MATCH-14 away loss**: `playerClubSide='away', homeScore=3, awayScore=1` → mpi_delta = `-20`.
- [ ] **AC-MATCH-14 home draw**: `playerClubSide='home', 1-1` → mpi_delta = `-3` (R2 fix).
- [ ] **AC-MATCH-14 away draw**: `playerClubSide='away', 1-1` → mpi_delta = `+1` (R2 fix).
- [ ] **AC-MATCH-14 clamp**: `playerClubSide='home', 5-0` → mpi_delta = `+30` (clamped from +35).
- [ ] **AC-MATCH-15 F9 normal**: 2 injuries + 4 yellow cards → 2×5 + 1×3 = `13`.
- [ ] **AC-MATCH-15 F9 clamp**: 3 injuries + 4 yellow cards → 3×5 + 1×3 = 18 → clamped to `15`.
- [ ] **AC-MATCH-15 F9 boundary**: 0 injuries + 3 yellow cards → high_intensity = 0 (strict `> 3`) → `0`.
- [ ] **F10 minutes-played gate**: a player with `minutesPlayed=29` is NOT in playerRatings. `minutesPlayed=30` IS in playerRatings.
- [ ] **F10 only player's-own-team**: with `playerClubSide='home'`, only `homeLineup` players appear in playerRatings (away players excluded — player-management only consumes ratings for clubs the player owns).
- [ ] **F10 value computation**: a player with `skill=65, form=70, morale=75, fitness=55, stamina=60`, evaluated at t=90 → `effective_fitness=49`; `effective_rating = 65×0.35 + 70×0.20 + 75×0.15 + 49×0.30 = 22.75+14+11.25+14.7 = 62.7` (GDD example).
- [ ] **AC-MATCH-16 forfeit**: `preMatchSnapshot.squad_available_pct = 60` → `simulateMatch` returns immediately. `homeScore=0, awayScore=3` (player is home), `winner='away'`, `worldStateDeltas = { match_performance_index: -30, injury_risk: 0 }`, `playerRatings = {}`, `events.length = 1` with `type==='forfeit'`. NO 90-tick simulation runs.
- [ ] **AC-MATCH-16 forfeit boundary (strict `<= 63`)**: `squad_available_pct = 64` → match plays normally; `squad_available_pct = 63` → forfeit.
- [ ] **AC-MATCH-16 forfeit visitor**: `playerClubSide='away', squad_available_pct=50` → returns `homeScore=3, awayScore=0`, `winner='home'` (player loses, score from rival's perspective).
- [ ] **AC-MATCH-05 exactly 2 keys**: `Object.keys(outcome.worldStateDeltas).sort()` === `['injury_risk', 'match_performance_index']`. No `fan_momentum`, no extras.

## Implementation Notes

*From GDD §Post-Match Effects + AC-MATCH-14/15/16:*

- F8 formula (perspective-aware): document the four branches (player_club_won / is_draw + home / is_draw + away / player_club_lost) with explicit branch comments. The R1 fix is **the** most subtle correctness gate in this story.
- F9 input: the events array is the *external* MatchOutcome.events (post-substitution_window filter per AC-MATCH-30). The internal `MatchSessionSnapshot.eventsAccumulated` (which includes substitution_window) is NOT the input. Wire it correctly.
- F10: `t=90` is the canonical evaluation point. Players who were subbed off have minutes < 90 but >= 30 → they still get rated using their `effective_rating` at t=90 (which means they'd be evaluated as if still on the field — but they aren't). **The slice's convention**: F10 takes the player's `effective_rating` at the minute they finished (subbed off at t=70 → evaluate at t=70; played full 90 → evaluate at t=90). **The GDD is ambiguous** — F10 says "effective_rating(player, t=90)" verbatim but the rationale assumes the player played 90 minutes. Decision: **MVP uses t=90 verbatim**, matching the GDD. Players subbed off at t=60 (still >= 30 minutes) get rated at their t=90 effective_rating (slightly unfair but simple). Flag in story-018 (Q for /quick-design): `OQ-MATCH-F10-01: should F10 use t=minutesPlayed instead of t=90? MVP: t=90 verbatim per GDD.`

*Forfeit synthesis*:
- The slice does NOT implement forfeit. Production adds it as a new path. The `'forfeit'` MatchEvent type must be added to MatchEventType (amend story 001).

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/post-match-deltas.test.ts`:

- AC-MATCH-14 all six perspective cases.
- AC-MATCH-15 normal, clamp, boundary.
- F10 minutes gate, team filter, value computation.
- AC-MATCH-16 forfeit normal, boundary, visitor.
- AC-MATCH-05 exactly 2 keys.

## Dependencies

- **Upstream**: 001 (types — `MatchEventType` must include `'forfeit'`; amendment), 003 (effectiveRating for F10).
- **Downstream blockers**: 013 (per-tick loop calls these three after tick 90 and dispatches forfeit at entry).

## Estimate

**1.5 days.** Lots of cases (6 perspective branches for F8 + forfeit synthesis + F10 minutes gate). The R1/R2 fixes in F8 are the correctness-critical part.

## Notes / Gotchas

- **AC-MATCH-14 away-win positive** is the single most important regression test in this story. Pre-R1, an away win produced a negative mpi_delta — directly contradicted the player fantasy. Test it explicitly with multiple goal_diff values.
- **F10 t=90 vs minutesPlayed**: GDD ambiguity. MVP picks t=90. Flag for /quick-design.
- **`MatchEvent` discriminated union must include `'forfeit'`** — go back to story 001 and add it. Cross-reference.
- **The `causal_node` on forfeit**: AC-MATCH-28 says only `injury` events REQUIRE `causal_node = 'injury_risk'`. Other events allow `null`. Forfeit, by adding `causal_node: 'squad_available_pct'`, extends the convention to non-injury events. This is fine in MVP because the field is `string | null` (not strictly typed to `'injury_risk' | null`). Future v1.1+ may type narrow this; for now, the broader use is OK.
