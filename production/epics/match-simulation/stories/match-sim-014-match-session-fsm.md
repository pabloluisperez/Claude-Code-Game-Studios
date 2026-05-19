---
Story: MATCH-SIM-014
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-02 (scripted-decision determinism across pause boundaries), AC-MATCH-03a (state transitions on substitution_window), AC-MATCH-04 (5-sub shared pool), AC-MATCH-22 (state mutation after red card), AC-MATCH-23 (playing_with_ten when bench empty)
Governing ADR: ADR-013 (MatchSession FSM + MatchSessionSnapshot)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/match-session-fsm.test.ts
---

# Story: MatchSession FSM + Snapshot Capture/Restore + Decision Application

## Goal

Implement the stateful interactive layer on top of `simulateMatch`'s per-tick logic. The FSM:

```
pre_match → in_progress → paused_for_decision → in_progress → ... → completed
                                                                      
                                  ↘ failed (terminal)
```

This story does NOT touch BullMQ or DB or Socket.IO (those are stories 015, 016, 017, 018). It provides the **pure FSM logic**: take a snapshot + a decision, advance ticks until next pause or tick 90, return the new snapshot + emitted events.

The pivotal contract: **AC-MATCH-02 determinism across pause boundaries**. Pause at tick 45, capture `prngState`, restore, advance from tick 46 → must produce identical events to a one-shot 90-tick run with the SAME scripted decisions applied inline.

## Scope

In `apps/api/src/modules/match/match-session.ts` (new):

- `export type MatchDecision =`
  - `{ kind: 'substitution'; from_player_id: string; to_player_id: string; team: 'home'; }` (only player's team decides; rival is automatic)
  - `{ kind: 'formation_change'; formation: FormationPreset; }`
  - `{ kind: 'instruction_change'; instruction: TeamInstruction | null; }`
  - `{ kind: 'no_op'; }` (default — manager does nothing)
  - `{ kind: 'emergency_gk_assign'; defender_id: string; }` (for AC-MATCH-17 — when GK is injured and no bench GK).
  - Multiple decisions may be bundled at a `substitution_window` (e.g. sub + formation change + instruction change). The HTTP layer (story 017) parses this; the FSM applies them in order.

- `export function initMatchSession(input: MatchInput): MatchSessionSnapshot` — builds the initial snapshot from input. State = `'pre_match'`. Forfeit short-circuit: if `squad_available_pct <= 63`, FSM goes directly to `'completed'` with the synthetic outcome (per story 011).

- `export function advanceTick(snapshot: MatchSessionSnapshot, decisions: MatchDecision[]): { nextSnapshot: MatchSessionSnapshot; newlyEmittedEvents: MatchEvent[]; pauseType: 'injury_pause' | 'substitution_window' | null; matchOutcome: MatchOutcome | null; }` —
  - Rehydrate `ctx.rng` from `snapshot.prngState` (story 002).
  - Apply the `decisions[]` to the lineup BEFORE the tick starts (substitutions, formation changes, instruction changes). This is "the decision was made at the pause that ended on the previous tick; now we continue from there."
  - Run ticks from `snapshot.currentTick + 1` upward.
  - Each tick: same per-tick logic as story 013's `simulateMatch` (F4, F5, F6, F7, VAR, card check, injury check, substitution_window emit).
  - Stop when:
    - An `injury` event fires AND the player's team starter is injured → set `pauseType = 'injury_pause'`, `state = 'paused_for_decision'`, persist new snapshot, return. (Rival injuries do NOT pause — they auto-resolve via `rivalInjurySub` story 012.)
    - Tick is in `[45, 60, 75]` → emit substitution_window event, set `pauseType = 'substitution_window'`, `state = 'paused_for_decision'`, persist new snapshot. Wait for decision before applying rival subs and player default.
    - Tick 90 is reached → `state = 'completed'`. Apply post-match F8/F9/F10 (story 011). Build the full `MatchOutcome`. `matchOutcome` is non-null in the return.
  - **After each tick**, `snapshot.prngState = serializeRngState(ctx.rng)` so a future resume can rehydrate the cursor.

- `export function validateDecision(snapshot: MatchSessionSnapshot, decision: MatchDecision, playerClubSide: 'home' | 'away'): { ok: true } | { ok: false; reason: string }` — guards:
  - Sub limit: `substitutionsUsed + new_subs <= 5` (shared pool — AC-MATCH-04).
  - From-player on the field; to-player on the bench.
  - Instruction is `PRESS_HIGH | HOLD_SHAPE | null` only for home (per playerClubSide). COUNTER is rejected for player's team if `playerClubSide === 'home'` (AC-MATCH-26 + AC-MATCH-29 at HTTP layer; this is the inner validation).
  - Formation is one of `'4-4-2' | '4-3-3' | '3-5-2' | '5-3-2'`.
  - AC-MATCH-29 enforcement: instruction can only be single-valued (the HTTP layer rejects arrays).

- `export function applyDefaultDecisions(snapshot: MatchSessionSnapshot): MatchSessionSnapshot` — applies the "no manager input" defaults at a pause:
  - On `injury_pause`: try to sub with bench in same position if available AND `substitutionsUsed < 5`. Else emit `playing_with_ten` and remove the injured player (AC-MATCH-23).
  - On `substitution_window`: emit no events from the player side (just the substitution_window event was already emitted before the pause).
  - In both cases: apply rival AI's auto-decisions (story 012 `rivalSubstitutionPlan` / `rivalInjurySub`).

## Out of Scope

- BullMQ worker / re-enqueue (story 016).
- DB schema for match_sessions (story 015).
- Hono routes (story 017).
- Socket.IO emission (story 018).

## Acceptance Criteria

- [ ] **AC-MATCH-02 split-resume determinism**: build a scripted sequence: `[{ at: 45, decision: { kind:'substitution', from:'X', to:'Y', team:'home' } }, { at: 60, decision: { kind:'no_op' } }, { at: 75, decision: { kind:'no_op' } }]`. (1) Run `simulateMatch` (story 013) with these decisions applied inline — capture the resulting MatchOutcome. (2) Run the FSM: `initMatchSession` → `advanceTick` returns pause at 45 → apply scripted decision → `advanceTick` again → pause at 60 → no-op → tick 75 → no-op → tick 90 → completed → capture MatchOutcome. **Then**: outcomes are deep-equal. This is THE Option B verification test.
- [ ] **AC-MATCH-03a pause at substitution_window**: `initMatchSession(...)` → `advanceTick` → returns at tick 45 with `state='paused_for_decision'`, `pauseType='substitution_window'`. Subsequent calls to `advanceTick` without decisions return the SAME snapshot (idempotent — does NOT advance further until a decision is applied).
- [ ] **AC-MATCH-04 shared pool**: with `substitutionsUsed=4`, attempt to apply 2 substitutions → second one rejected by `validateDecision` (`{ ok: false, reason: 'sub_pool_exhausted' }`).
- [ ] **AC-MATCH-22 sent-off mutation**: a red card at tick 30 mutates the lineup snapshot (player removed from `currentLineupHome`). Subsequent tick uses the smaller lineup.
- [ ] **AC-MATCH-23 playing_with_ten**: empty bench + MID injury at tick 50 → `applyDefaultDecisions` emits `playing_with_ten` event (NOT substitution). `currentLineupHome.length` decreases by 1. Match continues from tick 51.
- [ ] **Forfeit short-circuit at init**: `initMatchSession` with `squad_available_pct=60` → returns snapshot with `state='completed'` immediately. Calling `advanceTick` on a completed snapshot is a no-op (returns the same snapshot, `matchOutcome` non-null).
- [ ] **Rival sub auto-applied at window**: at tick 45 with rival unfit starters → `applyDefaultDecisions` triggers `rivalSubstitutionPlan` (story 012). `awaySubstitutionsUsed` increments. Substitution events emitted.
- [ ] **rngState round-trip**: capture `snapshot.prngState` at tick 45. Serialize+deserialize. Build new snapshot from JSON. Resume → identical events. (Independent test of story 002's serialization, run within FSM context.)
- [ ] **State validation**: `advanceTick` rejects a snapshot with `state='completed'` by returning the unchanged snapshot (no-op). It rejects `state='failed'` similarly.
- [ ] **Decision validation matrix**:
  - Player home instructs COUNTER → rejected with `reason: 'counter_unavailable_for_home'`.
  - Player home instructs `['PRESS_HIGH', 'HOLD_SHAPE']` (array) → rejected with `reason: 'instructions_mutually_exclusive'`.
  - Player away instructs COUNTER → accepted.
  - Player tries to sub bench-to-bench (to_player_id not on field) → rejected with `reason: 'invalid_decision'`.

## Implementation Notes

*From ADR-013:*

- The re-enqueue pattern (BullMQ) lives in story 016; THIS story is the FSM logic that the worker drives.
- The FSM's `advanceTick` is the same per-tick loop as `simulateMatch` (story 013), but with pause-detection and state mutation. Refactor: extract the per-tick body into a shared helper (`runMatchTick`) that both `simulateMatch` and `advanceTick` call. The slice already does this — production follows suit.
- `prngState` is captured AFTER every tick — so a pause at tick 45 means the snapshot's prngState reflects "state after tick 45's rng calls". Resume rehydrates and continues from tick 46.

*Decision ordering when multiple decisions bundled*:
- Sub first (so the lineup is correct before applying instruction/formation changes).
- Then formation change.
- Then instruction change.
- Emergency_gk_assign happens at injury_pause specifically — applied as part of the sub-handling.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/match-session-fsm.test.ts`:

- **The cornerstone test**: AC-MATCH-02 split-resume vs. one-shot determinism. Same scripted decisions, identical MatchOutcome. This is the Option B verification.
- AC-MATCH-03a pause idempotency.
- AC-MATCH-04 shared-pool rejection.
- AC-MATCH-22 lineup mutation after red.
- AC-MATCH-23 playing_with_ten flow.
- Forfeit short-circuit at init.
- Rival sub auto-applied at window.
- prngState round-trip.
- Decision validation matrix.

## Dependencies

- **Upstream**: 001, 002, 003-012 (all formulas + rival AI), 013 (per-tick body — refactor shared helper).
- **Downstream blockers**: 015 (DB schema for snapshot persistence), 016 (BullMQ worker), 017 (Hono routes).

## Estimate

**2 days.** The FSM logic is moderate; AC-MATCH-02 (split-resume vs one-shot determinism) is the make-or-break test — budget extra time for chasing any prngState drift.

## Notes / Gotchas

- **`runMatchTick` shared helper**: extract from story 013 + 014 so both `simulateMatch` (one-shot, with inline decision script) and `advanceTick` (per-pause-batch) share the per-tick body. Slice already validated this refactor.
- **AC-MATCH-02 is the test that breaks if Option B doesn't work**. The slice has this exact test passing. Production must replicate. If it fails, suspect: prngState capture point (must be AFTER all tick's rng calls), the rehydrate path (must use `seedrandom('', { state })`), the seedrandom version pin (must be exact 3.0.5).
- **`pauseType` on rival injuries**: per GDD, rival injuries auto-resolve. The FSM does NOT set `state='paused_for_decision'` for a rival injury. Only player-team injuries pause.
- **`emergency_gk_assign`**: when the player's GK is injured AND no GK is on the bench, the FSM's default decision could apply, but the manager often wants to choose WHICH defender becomes the emergency keeper. The decision payload carries that choice. The default (`kind:'no_op'`) picks the highest-skill DEF.
- **`applyDefaultDecisions` is called on TIMEOUT** (story 017). For an explicit manager `no_op` decision, the same defaults apply — semantically equivalent.
