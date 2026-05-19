---
Story: MATCH-SIM-010
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: AC-MATCH-06 (VAR does not pause the manager), AC-MATCH-25 (VAR-overturned goal affects mpi_delta post-VAR)
Governing ADR: ADR-007 (VAR inline; goals 25%, penalties 40% [v1.1+], reds 30%; P_overturn 35%), ADR-002 (rng() discipline)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/var.test.ts
---

# Story: VAR Resolution Inline — Goals (25%), Reds (30%), P_overturn (35%)

## Goal

Implement VAR review as an **inline, non-pausing** sub-step after a goal or a direct red card. VAR rolls twice:

1. `P_VAR_review` (0.25 for goals, 0.30 for reds — penalty VAR is v1.1+ and skipped in MVP).
2. If review is triggered, `P_overturn = 0.35`.

The outcome:
- Goal reviewed + overturned → emit `goal_disallowed` event; the goal does NOT count toward the score. Reason: `'offside' | 'foul'` (50/50 split; reason field is decorative for narrative).
- Goal reviewed + confirmed → emit `var_review { event_type:'goal', outcome:'confirmed' }`. The original goal stands.
- Red card reviewed + overturned → emit `red_downgraded`. The red is downgraded to yellow (which then could trigger the second-yellow → red flow from story 008, but slice convention is that a downgrade does NOT then re-trigger second-yellow; document this).
- Red reviewed + confirmed → emit `var_review { event_type:'red_card', outcome:'confirmed' }`.

The manager NEVER sees a pause for VAR (AC-MATCH-06).

## Scope

In `packages/shared/src/sim/sports/football/football-constants.ts` (append):

- `P_VAR_REVIEW_GOAL = 0.25`.
- `P_VAR_REVIEW_RED = 0.30`.
- `P_VAR_REVIEW_PENALTY = 0.40`. (Defined for v1.1+, but not used in MVP — leave the constant; the function below ignores it for MVP.)
- `P_OVERTURN = 0.35`.

In `packages/shared/src/sim/sports/football/football-var.ts` (new):

- `export interface VarReviewInput { ctx: SimContext; tick: number; trigger: 'goal' | 'red_card'; triggerEvent: MatchEvent; }`.
- `export interface VarReviewResult { /** Replace the original event with this one (or leave original if no review) */ resultingEvents: MatchEvent[]; goalCounts: boolean; }` (`goalCounts === false` if a goal was overturned).
- `export function resolveVarReview(input: VarReviewInput): VarReviewResult` — fixed rng() order: (1) `P_VAR_review` roll, (2) if reviewed: `P_overturn` roll, (3) if reviewed + goal-overturn: `reason` rng() for offside/foul (50/50). Up to 3 rng() calls.

When the original event is a goal:
- If not reviewed → `resultingEvents = [triggerEvent]; goalCounts = true`. (No VAR event emitted — keeps narrative quiet for un-reviewed goals.)
- If reviewed + confirmed → `resultingEvents = [triggerEvent, { type:'var_review', event_type:'goal', outcome:'confirmed', minute: tick, causal_node: null }]; goalCounts = true`.
- If reviewed + overturned → `resultingEvents = [triggerEvent, { type:'goal_disallowed', original_minute: tick, reason: ('offside'|'foul'), minute: tick, causal_node: null }]; goalCounts = false`.
- **NOTE**: the triggerEvent (the goal) is still in the output array — the GDD says "El MatchEvent de VAR siempre se añade al feed (el jugador siempre ve el resultado)" AND "evento original se reemplaza por evento 'overturned'". Slight tension. Slice convention: keep the original goal event AND append the disallowed event; the score-tally code uses `goalCounts` to decide whether to increment. Document this.

When the original event is a red card:
- If not reviewed → `resultingEvents = [triggerEvent]`.
- If reviewed + confirmed → `[triggerEvent, var_review { event_type:'red_card', outcome:'confirmed' }]`.
- If reviewed + overturned → `[red_downgraded { type:'red_downgraded', team, player_id, minute, causal_node: null }]` (the original red is REPLACED — no more red emitted). The downgraded card becomes a yellow IN COUNT but the GDD does NOT specify whether it increments `yellowCardsByPlayerId`. **Decision**: it does NOT increment, to avoid triggering a second-yellow → red cascade from a VAR downgrade. Document explicitly.

## Out of Scope

- Penalty VAR (v1.1+).
- Manager pause for VAR (AC-MATCH-06: explicitly NO pause).
- The post-VAR `mpi_delta` application (story 012's F8 just consumes the final score; story 013 increments score conditionally on `goalCounts`).

## Acceptance Criteria

- [ ] **AC-MATCH-06**: VAR resolution never sets `MatchSession.state = 'paused_for_decision'`. This is a contract-level test — `resolveVarReview` returns only events, no FSM transition signal. Story 013 / 014 verify the FSM never transitions during VAR.
- [ ] **No-review path**: rng()=0.99 → no review. Original goal in events; no var_review event; goalCounts=true. 1 rng() call.
- [ ] **Confirmed goal review**: rng=[0.10, 0.99] (review fires, overturn fails) → events = `[goal, var_review { outcome:'confirmed' }]`; goalCounts=true. 2 rng() calls.
- [ ] **Overturned goal**: rng=[0.10, 0.10, 0.30] (review + overturn + reason='offside') → events = `[goal, goal_disallowed { reason:'offside' }]`; goalCounts=false. 3 rng() calls.
- [ ] **Overturned goal reason mapping**: rng[2] < 0.5 → 'offside'; ≥ 0.5 → 'foul'.
- [ ] **Confirmed red**: red review fires + overturn fails → events = `[red_card, var_review { outcome:'confirmed' }]`.
- [ ] **Downgraded red**: review fires + overturn fires → events = `[red_downgraded]`. The original red event is REPLACED (per GDD "evento original se reemplaza por evento 'overturned'" semantics for reds).
- [ ] **AC-MATCH-25 cross-check (verified in story 013 integration)**: a goal scored in minute 89 + overturned in VAR → final score is computed without that goal. F8 mpi_delta uses the post-VAR score. (This story's AC: `goalCounts === false` correctly signals to the score-tally code that the goal does NOT count.)
- [ ] **rng() call count tracking**: every branch path has a deterministic rng() call count (1, 2, or 3). Documented per branch.

## Implementation Notes

*From GDD §Match Events §VAR inline:*

- "Si VAR activo y overturn: evento original se reemplaza por evento 'overturned'" — for reds, this means `red_card` is REPLACED by `red_downgraded`. For goals, the slice convention is to KEEP the goal event AND append goal_disallowed, with `goalCounts` flagging the tally. Document the asymmetry in code comment.
- "El MatchEvent de VAR siempre se añade al feed" — when a review fires, an event is always added (either var_review confirmed, goal_disallowed, or red_downgraded). When no review fires, no var_review event is emitted (quiet path).
- VAR does NOT pause the manager. The FSM stays in `'in_progress'`. This is AC-MATCH-06.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/var.test.ts`:

- No-review path.
- Confirmed goal path.
- Overturned goal path with reason mapping.
- Confirmed red path.
- Downgraded red path (original red event REPLACED).
- rng() call counts per branch.
- AC-MATCH-06: function does NOT return any state-transition signal.

## Dependencies

- **Upstream**: 001 (types — MatchEvent variants for `var_review`, `goal_disallowed`, `red_downgraded` must exist), 002 (PRNG), 007 (P_goal must have produced a goal first), 008 (red_card must have been emitted first).
- **Downstream blockers**: 013 (per-tick loop calls resolveVarReview after each goal and each direct red).

## Estimate

**1 day.** Lots of branches; the test matrix is the bulk of the work.

## Notes / Gotchas

- **Goal-vs-red event-replacement asymmetry** is a GDD interpretation call. For goals, both events are emitted (goal + goal_disallowed). For reds, the red is replaced by red_downgraded. Slice convention. Document inline so future maintainers don't "fix" it.
- **Penalty VAR is v1.1+**: do NOT branch on `trigger === 'penalty'`. The constant exists but is unused in MVP. Lint-warn if anyone calls `resolveVarReview` with `trigger:'penalty'`.
- **`red_downgraded` does NOT increment `yellowCardsByPlayerId`** — design decision documented above. Slice precedent. Rationale: a VAR downgrade is the referee admitting a mistake; it shouldn't compound into a future second-yellow.
- **AC-MATCH-25 is the most subtle**: a 1-0 win that VAR turns into a 0-0 draw in casa → mpi_delta = -3 (empate en casa), not +15 (victoria). F8 receives the post-VAR score; story 013 ensures `goalCounts === false` skips the score increment.
