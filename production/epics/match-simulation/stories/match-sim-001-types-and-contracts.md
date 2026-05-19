---
Story: MATCH-SIM-001
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-05 (worldStateDeltas contract: exactly 2 keys), AC-MATCH-30 (substitution_window excluded from MatchOutcome.events), AC-MATCH-28 (causal_node field present)
Governing ADR: ADR-007 (SportPlugin + MatchOutcome shape), ADR-013 (MatchSessionSnapshot type)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/types.test.ts
---

# Story: Match Domain Types + Contracts

## Goal

Define the canonical TypeScript types every other story in this epic imports: player model (universal + position-specific stats), `MatchEvent` discriminated union (including `causal_node: string | null`), `FormationPreset`, `TeamInstruction`, `PreMatchSnapshot`, `MatchInput`, `MatchOutcome`, `MatchSessionSnapshot`, and the `MatchEventEmitter` interface that ADR-013 requires for testability.

This is the contract foundation. Stories 003-017 compile against the types declared here. Per control-manifest, `MatchOutcome.worldStateDeltas` and `MatchOutcome.playerRatings` use **`Record<string, number>`**, not `Map<>` (ADR-007 in the GDD R6 era was updated — slice already converted; production must follow Record. NOTE: the ADR-007 source code still shows `ReadonlyMap<string, number>` for `worldStateDeltas` — this story resolves the conflict in favour of `Record` per control-manifest and GDD R6).

## Scope

In `packages/shared/src/sim/sports/football/football-types.ts` (new):

- `Position`: `'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD'`.
- `PlayerStats` — universal stats: `id: string`, `position: Position`, `skill [0,100]`, `fitness [0,100]`, `morale [0,100]`, `form [30,90]`, `stamina [40,100]` (player-management.md floor); position-specific stats (optional, present only when the position matches):
  - GK: `reflexes`, `handling`
  - DEF: `strength`, `tackling`
  - MID: `passing`, `vision`
  - FWD: `speed`, `finishing`
  - `assignedAs?: Position` — for emergency goalkeeping (Edge: DEF playing as GK; see AC-MATCH-17). Triggers `reflexes = skill × 0.4`, `handling = skill × 0.3` derived at conversion time.
- `PlayerSlot`: `{ player: PlayerStats; slotIndex: number; }` (preserved across re-enqueue).
- `Lineup` = `PlayerSlot[]` (11 starters + up to 7 bench, total ≤ 18).
- `FormationPreset`: `'4-4-2' | '4-3-3' | '3-5-2' | '5-3-2'`.
- `TeamInstruction`: `'PRESS_HIGH' | 'HOLD_SHAPE' | 'COUNTER'` — mutually exclusive (only one active per team per match; see AC-MATCH-29).
- `MatchEventType`: discriminated union for `'goal' | 'goal_disallowed' | 'yellow_card' | 'red_card' | 'red_downgraded' | 'injury' | 'substitution' | 'substitution_window' | 'playing_with_ten' | 'var_review'`.
- `MatchEvent` — base shape: `{ type: MatchEventType; minute: number; team?: 'home' | 'away'; player_id?: string; causal_node: string | null; /* type-specific fields */ }`. `causal_node` is REQUIRED on `injury` events with value `'injury_risk'` (AC-MATCH-28); on all other event types in MVP, `null` is allowed.
- `PreMatchSnapshot`: `{ team_fitness, team_skill, squad_available_pct, field_quality, fan_attendance, staff_morale, player_happiness }` — all `number`. Loaded once at match-create.
- `MatchInput`: `{ seed: string; homeLineup: Lineup; awayLineup: Lineup; homeFormation: FormationPreset; awayFormation: FormationPreset; homeInstruction: TeamInstruction | null; awayInstruction: TeamInstruction | null; preMatchSnapshot: PreMatchSnapshot; playerClubSide: 'home' | 'away'; playerClubId: string; decisionTimeoutMs?: number; }`.
- `MatchOutcome` (replaces / clarifies ADR-007's `MatchOutcome`):
  ```ts
  {
    homeScore: number;
    awayScore: number;
    readonly winner: 'home' | 'away' | 'draw';     // derived from score; never set independently
    events: MatchEvent[];                           // EXCLUDES type='substitution_window' (AC-MATCH-30)
    worldStateDeltas: Record<string, number>;       // EXACTLY { match_performance_index, injury_risk } (AC-MATCH-05)
    playerRatings: Record<string, number>;          // F10 — only players with ≥30 min played
    finalLineupHome: Lineup;
    finalLineupAway: Lineup;
  }
  ```
- `MatchSessionState`: `'pre_match' | 'in_progress' | 'paused_for_decision' | 'completed' | 'failed' | 'archived'` (ADR-013).
- `MatchSessionSnapshot` (ADR-013 — persisted between re-enqueue boundaries):
  ```ts
  {
    currentTick: number;
    eventsAccumulated: MatchEvent[];        // INCLUDES substitution_window events (filtered out at MatchOutcome stage)
    currentLineupHome: Lineup;
    currentLineupAway: Lineup;
    homeMomentum: number;
    substitutionsUsed: number;              // shared pool (voluntary + forced) — player team
    awaySubstitutionsUsed: number;          // independent rival AI pool
    yellowCardsByPlayerId: Record<string, number>;  // Record per control-manifest, NOT Map
    currentFormationHome: FormationPreset;
    currentFormationAway: FormationPreset;
    activeInstructionHome: TeamInstruction | null;
    activeInstructionAway: TeamInstruction | null;
    prngState: string;                      // JSON.stringify(seedrandom().state()) — see story 002
    state: MatchSessionState;
    timeoutJobId: string | null;
  }
  ```
- `MatchPauseEvent`, `MatchResumedEvent`, `MatchCompleteEvent` — Socket.IO event types (per GDD §"Tipos de Socket.IO (R6)").
- `MatchEventEmitter` interface (ADR-013 §File Locations):
  ```ts
  interface MatchEventEmitter {
    emit(event: MatchPauseEvent | MatchResumedEvent | MatchCompleteEvent | MatchEvent): void;
  }
  ```

## Out of Scope

- Formula implementations (stories 003-012).
- DB schema (story 015).
- Socket.IO emitter implementation (story 018).

## Acceptance Criteria

- [ ] All types compile under TypeScript 5.4+ strict mode (`strict: true`, `noUncheckedIndexedAccess: true`). No `any`. No `@ts-ignore`.
- [ ] `MatchOutcome.winner` is `readonly` and derived structurally — TypeScript prevents `outcome.winner = 'home'` at compile time.
- [ ] `MatchOutcome.worldStateDeltas` and `MatchOutcome.playerRatings` typed as `Record<string, number>` (NOT `Map`, NOT `ReadonlyMap` — control-manifest "Map<> in JSON-serialized payloads" forbidden pattern).
- [ ] `MatchEvent.causal_node` is `string | null` (not optional). Construction of an `injury` event without `causal_node: 'injury_risk'` is rejected by a type narrowing helper or explicit factory function `createInjuryEvent(...)` that requires the field.
- [ ] `JSON.stringify(matchOutcomeFixture)` round-trips through `JSON.parse` and deep-equals the original (no Map slip-through).
- [ ] `MatchSessionSnapshot.yellowCardsByPlayerId` is `Record<string, number>` (NOT `Map`).
- [ ] `MatchEventEmitter` interface allows passing a spy/mock in tests without a real Socket.IO server.

## Implementation Notes

*From ADR-007 + ADR-013 + control-manifest:*

- ADR-007 originally typed `worldStateDeltas` as `ReadonlyMap<string, number>`. This was superseded by GDD R6 + control-manifest. Add a code comment in `football-types.ts`: `// NOTE: ADR-007 line 109 shows ReadonlyMap; superseded by GDD R6 + control-manifest 2026-05-19 — use Record. ADR-007 will be amended in a sync chore after this story lands.`
- `MatchEvent` should use TypeScript discriminated unions (one type per `type` literal) so that downstream code can narrow safely.
- All position-specific stats are `number | undefined` (per `noUncheckedIndexedAccess` discipline + the fact that a GK does not have `passing`). Helper accessors (e.g. `getPassing(player): number` returning `player.passing ?? 50`) live in story 003.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/types.test.ts` (Vitest):

- Type-only test: instantiate a sample `MatchOutcome` fixture; `JSON.stringify(outcome)` round-trips → deep equal.
- Compile-time check (via `expect-type` or a static assert helper): `MatchOutcome.worldStateDeltas` is `Record<string, number>` exactly (not `Map<>`).
- Construction of `injury` MatchEvent via factory requires `causal_node: 'injury_risk'`.
- `MatchEventEmitter` can be instantiated as a Vitest spy (`vi.fn()`).

## Dependencies

- **Upstream**: None — Foundation first-mover for this epic.
- **Downstream blockers**: Every other story in this epic.

## Estimate

**1 day.** Pure typing; reference the slice's `types.ts` as a starting point but rewrite (per prototype-code.md: production must rewrite from scratch).

## QA Test Cases

**Test file**: `packages/shared/tests/match-sim/types.test.ts`
_(Use `packages/shared/tests/match-sim/` not `tests/unit/match-sim/`)_

**Estimated test count**: ~10 unit tests

### MatchOutcome contracts
- `test_match_outcome_world_state_deltas_has_exactly_2_keys`: keys are `match_performance_index` and `injury_risk` only (AC-MATCH-05)
- `test_match_event_injury_has_causal_node_injury_risk`: `causal_node = 'injury_risk'` on injury events (AC-MATCH-28)
- `test_match_outcome_events_excludes_substitution_window`: events array has no type='substitution_window' (AC-MATCH-30)
- `test_match_session_snapshot_events_includes_substitution_window`: eventsAccumulated in snapshot INCLUDES substitution_window (filtered at MatchOutcome stage only)

### Type structural tests (compile-time contracts verified via runtime assertions)
- `test_world_state_deltas_is_record_not_map`: worldStateDeltas is `Record<string, number>` — control-manifest forbids Map in JSON payloads
- `test_match_session_state_includes_failed_state`: MatchSessionState union includes 'failed' (ADR-013 required state)
- `test_lineup_max_18_players`: Lineup accepts up to 18 players (11 + 7 bench)
- `test_emergency_gk_assigned_as_field`: PlayerStats with assignedAs='GOALKEEPER' and position='DEFENDER' uses derived reflexes = skill×0.4
- `test_team_instruction_mutually_exclusive_per_gdd_comment`: at most one TeamInstruction per team (AC-MATCH-29 — document as a type contract, not a runtime check here)

## Notes / Gotchas

- **ADR-007 vs control-manifest conflict (re-surface)**: ADR-007 source code shows `ReadonlyMap`. GDD R6 + control-manifest say `Record`. The slice already uses `Record`. We follow control-manifest. A sync chore must amend ADR-007 after this story lands. Flagged.
- **GDD says `Map<player_id, number>` was the original output for F10**. GDD R6 corrected this to `Record`. Slice verified. Stay with Record.
- The `assignedAs` field on `PlayerStats` is a runtime marker for emergency goalkeeping. The position remains `'DEFENDER'`; only `assignedAs` flips to `'GOALKEEPER'`. F7 (story 007) consults `assignedAs` to compute the derived `reflexes` and `handling`.

## Completion Notes
**Completed**: 2026-05-19
**Criteria**: 9/9 passing
**Deviations**:
  - ADVISORY: MatchSessionSnapshot has richer shape than story scope minimum (awaySubstitutionsUsed, yellowCardsByPlayerId, formation/instruction fields, timeoutJobId) — all documented ADR-013 fields, correct.
  - ADVISORY: Field name is `prngState` (not `rngState`) — follows story spec, MATCH-SIM-002 expects `prngState`.
  - ADVISORY: AC-MATCH-30 test is fixture-proof only (TODO comment added for strengthening when construction function exists).
  - ADVISORY: ADR-007 conflict resolved to Record<string, number> — ADR-007 needs sync chore amendment.
**Test Evidence**: Logic — `packages/shared/tests/match-sim/types.test.ts` — 12/12 passing (218/218 suite)
**Code Review**: Complete — APPROVED WITH SUGGESTIONS (2026-05-19, all 5 suggestions applied)
