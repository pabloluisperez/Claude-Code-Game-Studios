# ADR-020: Day-by-Day Tick Model

## Status
Proposed

## Date
2026-05-21 (Proposed)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Backend (Hono + Drizzle + PostgreSQL) — extends ADR-008 advance loop |
| **Knowledge Risk** | LOW — pure refactor of the existing weekly tick into N daily sub-ticks. No new framework APIs. The change is internal to `apps/api/src/modules/advance/` and the `currentWeek` integer becomes a derived value of `(currentSeason, currentDayOfSeason)`. |
| **References Consulted** | `docs/engine-reference/web/VERSION.md`, ADR-008 (world clock + event loop), ADR-005 (WorldState persistence), ADR-015 (Event Decision Schema), `production/playtests/2026-05-21-economy-tuning-pablo.md` (finding E — mid-week pause requirement) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | (1) Determinism: weekly ticks and 7-day batched ticks produce identical end-of-week WorldState for the same `(playthroughId, decisions)` input. (2) Idempotency: re-running `advanceDays(playthroughId, 0)` is a no-op. (3) Mid-week pause: a STOP event scheduled on day 3 halts advance on day 3 with the cascade-engine in a consistent state, not at the end of week. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (SimContext purity), ADR-003 (evaluateTick signature), ADR-005 (WorldState persistence — schema additions `current_day_of_season`), ADR-008 (advance() loop — this ADR refines the granularity from week to day), ADR-013 (Match Session pattern — match-day already operates inside a single day) |
| **Enables** | Mid-week pause feature (playtest finding E from 2026-05-21), per-day staff message scheduling, day-of-week-sensitive event triggers (e.g., midweek cup matches), more granular cascade decay |
| **Blocks** | Sprint 11+ "mid-week pause" feature implementation; finer-grained recovery-lever simulation (e.g., "fire scout on Tuesday — wages stop Wednesday") |
| **Ordering Note** | This ADR must be Accepted before any code under `apps/api/src/modules/advance/` starts referencing days. The orchestrator extraction (Sprint 10 task 10-5) does NOT depend on this ADR — it can extract the existing weekly tick first; the day decomposition lands in a follow-up. |

## Context

### Problem Statement

Sprint 9 playtest #2 (`production/playtests/2026-05-21-economy-tuning-pablo.md`,
finding E) surfaced: *"'Cancelar y actuar' debería parar en el día actual. Las cosas
deben poder pasar entre semana también, no solo findes."* The current tick granularity
is one **week** — `advance()` takes a playthrough from week N to week N+1 atomically,
which means a STOP event mid-week cannot pause until the in-game week boundary, and
recovery actions taken mid-week have no representation in the simulation timeline.
The player perceives this as the game "skipping over their decision" — they want to
fire a staff member on Tuesday and have wages stop on Wednesday, not next Monday.

ADR-008 already established that the player triggers time advance ("calm is the tempo"
— pillar 4) and that the server is authoritative. This ADR does not change that —
it only refines the granularity of a single `advance()` call.

The Polish-phase gate report (`production/qa/gate-check-production-to-polish-2026-05-21.md`)
listed this as carry-forward condition #2.

### Constraints

- **ADR-008**: advance() is synchronous TypeScript. `season_end` and TV rollover are
  part of the synchronous flow at week 38. The day-by-day tick must preserve this.
- **ADR-005**: `playthroughs.currentWeek` is the persisted clock. Switching to days
  must be **additive** — keep `currentWeek` (now derived) for backwards compatibility
  with all existing UI, queries, and tests. Add `currentDayOfSeason` as the new
  ground truth.
- **ADR-013**: Match Session pattern already isolates match-day inside a single day.
  This ADR must not break that — a match-day is exactly one day's worth of cascade work.
- **ADR-002**: No `Math.random()` or `Date.now()` in the tick pipeline. Day-of-week
  is a deterministic function of `(seasonStartDate, currentDayOfSeason)`.
- **Determinism**: For any input decisions, advancing by 7 days must yield the same
  end-of-week WorldState as the current weekly advance. This is the migration safety
  net — tests assert equivalence.
- **Single developer**: minimize churn. No big-bang rewrite. Incremental migration.

### Requirements

1. New persisted column `current_day_of_season` on `playthroughs` (0..265 for a 38-week
   season + buffer). `currentWeek` becomes a derived getter: `Math.floor(currentDayOfSeason / 7)`.
2. New function `advanceDays(playthroughId, days, decisions)` runs the daily tick loop.
3. Existing `advance(playthroughId, decisions)` becomes a thin wrapper that calls
   `advanceDays(playthroughId, 7, decisions)`.
4. A STOP event mid-week halts the loop on the **day** it fires, not at week boundary.
5. End-of-week side effects (season tickets, wage payouts, snapshot rollover, league
   fixture resolution) trigger when `currentDayOfSeason % 7 === 6` is **completed**,
   not at the start of the next week.
6. Match-day computation runs on its scheduled day, not always at end-of-week.
7. All existing tests pass unchanged (determinism guarantee).

## Decision

**Add `current_day_of_season` to `playthroughs`. Decompose the weekly tick into a
day-loop inside `advanceDays(playthroughId, days, decisions)`. End-of-week side
effects fire as part of the day-6 (Sunday) substep. Match-day is computed on the
fixture's actual scheduled day, not always end-of-week. STOP events halt the day
loop on the day they fire. The public `advance()` (weekly) is preserved as a
backwards-compatible wrapper.**

---

### 1. Schema additions

```typescript
// packages/db/src/schema/playthroughs.ts (additive — no breaking change)
export const playthroughs = pgTable('playthroughs', {
  // ... existing fields ...
  currentWeek: integer('current_week').notNull().default(0),         // KEEP — now derived but persisted for query convenience
  currentDayOfSeason: integer('current_day_of_season')
    .notNull()
    .default(0),                                                      // NEW — 0..265
  // ... existing fields ...
});
```

**Migration**: `current_day_of_season = current_week * 7` for all existing rows.
This is a single `UPDATE playthroughs SET current_day_of_season = current_week * 7`.
No data loss; no breaking changes.

**Invariant**: `currentWeek === Math.floor(currentDayOfSeason / 7)` always holds.
A DB CHECK constraint can enforce this; for simplicity we enforce it in the orchestrator
(write `current_day_of_season` first, then derive `current_week`).

### 2. Day numbering

| Day in week | Index | Role |
|---|---|---|
| Monday | 0 | Training day, low-event |
| Tuesday | 1 | Cascade tick continues, staff message check |
| Wednesday | 2 | Optional mid-week match (cup competitions, future) |
| Thursday | 3 | Cascade tick continues |
| Friday | 4 | Cascade tick continues |
| Saturday | 5 | Match day (league) — primary fixture day |
| Sunday | 6 | End-of-week rollover — sponsors, wages, season tickets, snapshot |

This mapping is **convention only** — events reference `currentDayOfSeason` directly,
not the day-of-week label. The convention exists for UX (calendar UI shows day names).

### 3. `advanceDays` function

```typescript
// apps/api/src/modules/advance/orchestrator.ts (Sprint 10 task 10-5 lands here)
export interface AdvanceResult {
  daysAdvanced: number;
  stopped: { reason: 'stop_event'; eventId: string; day: number } | { reason: 'complete' };
  finalDayOfSeason: number;
  finalWeek: number;
}

export async function advanceDays(
  playthroughId: string,
  maxDays: number,
  decisions: EventDecisionPayload[],
): Promise<AdvanceResult> {
  // 1. Load state (playthrough + worldSnapshot + pending events)
  // 2. Loop day 1..maxDays:
  //    a. Run cascade tick for this day (sub-week portion of evaluateTick)
  //    b. If day is Saturday and there's a fixture → run match-sim
  //    c. If day is Sunday → end-of-week rollover (sponsors, wages, tickets, snapshot)
  //    d. Check pending events: if any STOP event has scheduledDay === currentDay,
  //       halt and return { reason: 'stop_event', ... }
  //    e. Increment currentDayOfSeason; if % 7 === 0, increment currentWeek
  // 3. Persist final state in a single transaction
  // 4. Return AdvanceResult
}

// Backwards-compatible weekly wrapper
export async function advance(
  playthroughId: string,
  decisions: EventDecisionPayload[],
): Promise<AdvanceResult> {
  return advanceDays(playthroughId, 7, decisions);
}
```

### 4. Cascade decay sub-week granularity

The cascade engine's per-week decay rates (defined in `design/gdd/cascade-engine.md`
F1-F5) currently apply once per week. Under day-by-day:

- Option A: divide the weekly decay by 7 and apply daily (smoother curve).
- Option B: apply the full weekly decay only on day 6 (Sunday) — preserves all
  existing test fixtures unchanged.

**Decision**: **Option B for Sprint 10; revisit in Sprint 11+ playtest.** This guarantees
zero test regression. The "smoothness" gain from Option A is invisible to the player
who only sees end-of-week summaries anyway. If a future playtest reveals that
mid-week visualizations need smoother values, we revisit.

### 5. End-of-week rollover

These side effects fire **at the end of day 6 (Sunday)** rather than at the start
of "next week":

| Effect | Old timing | New timing |
|---|---|---|
| Sponsor weekly payment | Step 5 of weekly advance() | Day 6 of advanceDays() |
| Player wages | Step 6 of weekly advance() | Day 6 of advanceDays() |
| Staff wages | Step 6 of weekly advance() | Day 6 of advanceDays() |
| Season-ticket weekly drip | Step 7 of weekly advance() | Day 6 of advanceDays() |
| WorldState snapshot | Step 8 of weekly advance() | Day 6 of advanceDays() (one snapshot per week) |
| TV weekly revenue | Step 4 of weekly advance() | Day 6 of advanceDays() |

This guarantees: **for any decisions, advancing 7 days from a clean week boundary
yields identical end-state to the current weekly advance.** That is the migration
correctness test.

### 6. STOP event handling

A STOP event has a `scheduledDayOfSeason` (newly added). When `advanceDays` reaches
that day **before running that day's substep**, it persists state and returns with
`stopped.reason = 'stop_event'`. The client sees the event, the player decides,
the client calls `advanceDays(playthroughId, remainingDays, [decision])` to continue.

Existing events generated by the current weekly tick set `scheduledDayOfSeason =
currentWeek * 7` (any day in the week — they fire at the first day of the week
they're for). Newly generated events from systems that care about day granularity
set their own `scheduledDayOfSeason`.

### 7. Match-day timing

Match-sim runs on the fixture's scheduled day. League fixtures are scheduled on
Saturday (day 5 of week). Cup fixtures (future) can be Wednesday. The orchestrator
checks `fixtures` table for `scheduledDayOfSeason === currentDayOfSeason` at each
day substep.

### 8. UI implications (NOT this ADR's scope)

- Topbar continues to show `currentWeek` (unchanged UX).
- Calendar grid can optionally show day-of-week (already does).
- Advance button text changes from "Avanzar a fin de semana" / "Avanzar a día de
  partido" to "Avanzar hasta próximo evento" — the orchestrator returns the next
  STOP day, the button advances to that day. UX adjustment lands in Sprint 11+.
- Match flow already operates on a single day — no change.

## Consequences

### Positive

- Mid-week pause becomes a one-line change: STOP events with `scheduledDayOfSeason`
  not equal to a week boundary now actually halt mid-week.
- Match-day satisfaction improves: today's match runs today, not at end-of-week.
- Day-of-week-sensitive events become possible (cup matches, mid-week press
  conferences, training-day quality decisions).
- Backward-compatible: `advance()` keeps its signature; existing tests pass.
- No data migration risk — the new column is additive with a deterministic backfill.

### Negative

- One extra integer column on `playthroughs`. Minor.
- The Sunday-batched side effects mean any UI that wants to display "balance change
  by day-of-week" gets all the action on day 6. Acceptable — the cashflow chart is
  weekly anyway.
- 7× more loop iterations per advance call. Each iteration is fast (sub-millisecond
  cascade tick); 7× negligible. No production budget impact.

### Neutral

- The cascade decay timing decision (Option B above) preserves test fixtures but
  may need revisit. Tracked in Sprint 11+ playtest debrief criteria.

## GDD Requirements Addressed

- `design/gdd/cascade-engine.md` — F1-F5 decay formulas remain applicable; the tick
  granularity refinement does not change the formulas, only their application interval.
- `design/gdd/event-system.md` — STOP event semantics now support mid-week timing
  per playtest finding E.
- `design/gdd/league-system.md` — Saturday match-day timing preserved; cup-system
  future-proofing for Wednesday matches unlocked.
- `production/playtests/2026-05-21-economy-tuning-pablo.md` — finding E "Las cosas
  deben poder pasar entre semana también" is addressed by this ADR's design;
  implementation lands in Sprint 11+.

## Implementation Plan (deliberately deferred)

This ADR defines the **design only**. Implementation is scoped to a later Polish
sprint because:

1. The Sprint 10 capacity already has 4 Must-Have stories.
2. The change is invasive enough that it warrants its own end-to-end test pass
   before landing.
3. Sprint 10 task 10-5 (orchestrator extraction) lays the structural groundwork —
   once `advance()` is extracted into `apps/api/src/modules/advance/`, the day-loop
   refactor becomes a localized change inside that module.

Implementation sequence (future sprint):

1. Add `current_day_of_season` column + migration.
2. Extract `runDailySubstep(playthroughId, day, decisions)` from the current weekly tick.
3. Implement `advanceDays` calling `runDailySubstep` in a loop.
4. Change `advance()` to delegate to `advanceDays(playthroughId, 7, ...)`.
5. Add migration determinism test (7-day vs weekly).
6. Add STOP-on-day-3 mid-week pause test.
7. Update event-generators that care about day timing.

## References

- ADR-008 (World Clock + Event Loop) — superseded? **No** — extended. Weekly tick
  remains the public API contract; this ADR refines internals.
- ADR-013 (Match Session Pattern) — unchanged.
- `production/playtests/2026-05-21-economy-tuning-pablo.md` — finding E source.
- `docs/architecture/advance-loop.md` — runtime description, to be updated when
  implementation lands.

## Decision Log

- 2026-05-21: Proposed by technical-director (autopilot session). Awaiting Pablo's
  acceptance before any implementation work begins.
