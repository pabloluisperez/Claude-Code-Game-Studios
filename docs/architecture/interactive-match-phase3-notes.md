# Interactive Match — Phase 3+ implementation notes (ADR-033)

Captured 2026-05-30 after the Phase 1 gap analysis + Phase 2 (on-demand match
flow) shipped. This is the precise starting point so Phase 3 can begin cleanly.

## Where we are
- **Phase 1 ✅** ADR-033 (+ D6 league simultaneity).
- **Phase 2 ✅** (commits 2A/2B/2C): the user's fixture is left `scheduled` by
  `runMatchDay`; `/match` plays it **one-shot on open** + runs result hooks
  (`emitUserMatchResultEffects`); advancing resolves any unplayed user fixture;
  dashboard shows "▶ Ir al partido". Verified live on a fresh career (Probe FC).
  **The one-shot path is the safe fallback** — Phase 3 must keep it.

## Decision: web-driven engine (not BullMQ/socket)
Drive the pure engine from the SvelteKit server via form actions (request/
response), persisting the snapshot in `match_sessions`. Reuses the built+tested
pure functions; avoids the api worker/socket (harder to verify). The api worker
+ socket remain available if we later want live streaming.

## Engine API (all exported from `@smt/shared`)
- `initMatchSession(input: MatchInput): MatchSessionSnapshot`
- `advanceTick(snapshot, decisions: MatchDecision[], input): { nextSnapshot, newlyEmittedEvents, pauseType, matchOutcome }`
  - runs ticks until a pause (`'substitution_window'` at ticks 45/60/75, or `'injury_pause'`) or completion (`matchOutcome` non-null at tick 90).
- `validateDecision(snapshot, decision, playerClubSide): {ok:true}|{ok:false,reason}`
- `applyDefaultDecisionsToSnapshot(snapshot, pauseType)` — rival AI subs on timeout.
- Types: `MatchInput { seed, homeLineup, awayLineup, homeFormation, awayFormation, homeInstruction, awayInstruction, preMatchSnapshot, playerClubSide, playerClubId }`,
  `Lineup = PlayerSlot[]` (`{player: PlayerStats, slotIndex}`, 11 starters + ≤7 bench),
  `MatchDecision` (no_op | substitution | formation_change | instruction_change | emergency_gk_assign),
  `MatchOutcome { homeScore, awayScore, winner, events, worldStateDeltas, playerRatings, finalLineup* }`.
- Snapshot carries `prngState` (resumable). `match_sessions` columns map 1:1 to the snapshot (see `rowToSnapshot`/`rowToMatchInput` in apps/api/src/modules/match/routes.ts as the reference mapping).
- Drive loop reference: `packages/shared/tests/match-sim/match-session-fsm.test.ts` (`driveToCompletion`).

## The crux / remaining work (Phase 3-5)
1. **Lineup mapper (NEW, the hard part).** Build `Lineup`/`PlayerStats` for both
   clubs from the `players` rows. Mismatches to resolve:
   - position: DB `'GK'|'DEF'|'MID'|'FWD'` → engine `'GOALKEEPER'|'DEFENDER'|'MIDFIELDER'|'FORWARD'`.
   - attrs: DB `skill, form, fitness, morale, stamina, velocidad, resistencia, agresividad, calidad` → engine `PlayerStats { skill, fitness, morale, form, stamina, + position-specific reflexes/handling/strength/tackling/passing/vision/speed/finishing }`. Decide the mapping (e.g. speed←velocidad, finishing/vision←calidad, tackling/strength←agresividad, …).
   - XI selection: use `clubs.startingLineupPlayerIds` if set, else auto top-11 by position (1 GK, ~4 DEF, ~4 MID, ~2 FWD), + bench (rest, ≤7). Drop suspended/leaving; mark injured.
   - `PreMatchSnapshot` from the latest worldState (team_fitness, field_quality, fan_attendance, staff_morale, player_happiness, injury_risk) + squad_available_pct + team_skill (avg XI skill).
   - AI opponent: auto XI + deterministic instruction (mirror `resolveInstruction` in match-day-runner).
2. **Session driver (web)**: createInteractiveSession (initMatchSession → insert match_sessions), advance (load row → advanceTick(no_op or decisions) → persist), on completion → applyOutcome.
3. **/match UI**: load creates+advances to the first pause (45) → render half events (animate) → pause panel "Continuar" + decision panel (subs/formation/instruction) → action `?/decide` advances → repeat → on complete show result. Keep "Resto de la jornada" reveal synced to `snapshot.currentTick` (D6).
4. **applyOutcome**: map `MatchOutcome` → a `QuickMatchResult`-ish shape and reuse `persistFixtureResult` (fixtures + standings + suspensions/fitness/injuries) + `emitUserMatchResultEffects`. Note: MatchOutcome.events use engine event types (incl `goal_disallowed`, `substitution_window`) — filter/adapt for the replay UI + suspensions parser.
5. **Fallback/safety**: if session init/advance throws, fall back to `playSingleFixture` (one-shot). Keep "⏭ Saltar al resultado" = one-shot. Abandoned session → advance's resolve-pending one-shots it (already works).

## Verification plan (Phase 3)
- Unit: drive a built MatchInput to completion (tick 90 + outcome) — determinism (same seed+decisions → same result).
- Live (Probe FC): open /match → pauses at 45 → pick a sub → 2nd half differs from a no-op run → result persists to fixtures + standings; "Saltar" + advance-skip still work.
