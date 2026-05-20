# ADR-019: TV Rights Implementation Contract

## Status
Accepted

## Date
2026-05-20 (Proposed) · 2026-05-21 (Accepted — epic shipped 11/11 stories, 951 tests incl. 17 live-DB integration)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Backend (Drizzle 0.36+ + PostgreSQL 16 + Hono 4) |
| **Knowledge Risk** | LOW — all patterns (Drizzle tables, unique constraints, Hono transactions, BullMQ) verified by prior epics. No post-cutoff APIs introduced. |
| **References Consulted** | `docs/engine-reference/web/VERSION.md`, `docs/engine-reference/web/modules/backend.md`, `design/gdd/tv-rights.md` (Approved R7, 2026-05-20), ADR-005 (WorldState persistence), ADR-008 (World clock + event loop), ADR-014 (Financial flow), ADR-015 (Special Event Decision Schema) |
| **Post-Cutoff APIs Used** | None — Drizzle `pgTable`, `unique().on()`, Drizzle transactions, Hono routes: all stable patterns present in prior epics. |
| **Verification Required** | (1) Tick ordering: assert that TV delta applies before cascade injection in the same week (AC-TV-40 pattern); (2) Precision: assert `corruption_exposure` stored as string from DB equals `parseFloat(value).toFixed(2)` before every threshold comparison; (3) Atomicity: assert that a simulated crash between event resolution and contract insert (mocked tx rollback) leaves both unchanged. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-005 (WorldState persistence — `tv_contracts` uses same DB, week key scheme), ADR-008 (advance() tick loop — TV delta integrates as a sub-phase), ADR-014 (Financial flow — TV revenue enters cashflow at step 5 of the Tick Order), ADR-015 (Event Decision Schema — two new variants `tv_auction` + `tv_midseason_offer` extend the union) |
| **Enables** | `tv-rights` epic stories (TR-TVR-001 … TR-TVR-012 — all blocked until this ADR is Accepted); `/create-stories tv-rights` |
| **Blocks** | All tv-rights implementation stories |
| **Ordering Note** | Can be Accepted in parallel with or after ADR-018. Must be Accepted before any tv-rights story is implemented. ADR-015 must be Accepted (already is — 2026-05-19) before this ADR's event payload variants can be added to the union. |

## Context

### Problem Statement

`design/gdd/tv-rights.md` (Approved R7, 2026-05-20, 54 ACs) defines a
complete behavioral specification — schema, formulas, Tick Order, state
machine, acceptance criteria — but deliberately defers 8 implementation
decisions to this ADR (OQ-TV-04). Without these decisions, implementers
must independently resolve: where `tv_contract` state lives (table vs.
WorldState JSON), how floating-point precision is maintained within a single
tick cycle, how the 8-step Tick Order maps onto the existing `advance()` loop,
and how `POST /api/tv/sign` resolves the STOP event and creates the contract
atomically. Each of these choices affects multiple components; divergent
implementations across the codebase would produce subtle bugs.

### Constraints

- **ADR-008**: `advance()` is synchronous TypeScript — NO BullMQ for tick
  advance. The 8-step TV Tick Order runs synchronously inside `advance()`.
  `season_end` and TV rollover are both part of the synchronous advance()
  flow for week 38.
- **ADR-005**: Only one WorldState mutation path — cascade Step 3. TV
  revenue enters cashflow via Step 3 (not a side-channel write). However,
  the `tv_contracts` entity table is NOT part of WorldState JSON snapshots —
  it is a first-class Drizzle table, the same pattern as `sponsors`, `staff`,
  and `players`.
- **ADR-002**: No `Math.random()` or `Date.now()` in the tick pipeline. F-TV1
  rate calculation is deterministic given `(tier, division, durationSeasons)`.
- **ADR-015**: The `EventDecisionPayload` discriminated union must be extended
  to include `tv_auction` and `tv_midseason_offer`. This ADR defines those
  variant schemas. ADR-015 itself is not amended — the extension is additive.
- **Precision**: `corruption_exposure` is `numeric(5,2)` in DB. Every
  arithmetic operation on this field within a tick must maintain 2-decimal
  precision without DB round-trips mid-tick.
- Single developer → implementation simplicity over engineering for scale.

### Requirements

1. `tv_contracts` Drizzle table with typed schema and lifecycle FSM.
2. `fan_loyalty` persistent column on `managers` table (non-cascade entity).
3. `calculateTVRate(tier, division, durationSeasons)` pure function (F-TV1).
4. `applyTVWeeklyDelta(ctx, week)` integrates into `advance()` as two sub-phases
   (pre-cascade and post-cascade).
5. `POST /api/tv/sign` resolves STOP event + creates contract atomically.
6. Unique DB constraint preventing duplicate `tv_auction` / `tv_midseason_offer`
   events per season.
7. Idempotent advance() — TV delta already applied for a given week is a no-op
   on retry.
8. `tv_auction` and `tv_midseason_offer` typed as `EventDecisionPayload` variants.

## Decision

**`tv_contracts` is a Drizzle table (not WorldState JSON). `fan_loyalty` is a
column on `managers`. Precision is maintained in-memory via `roundCorruption()`
helper — no intra-tick DB round-trips. TV tick integrates as two sub-phases
within `advance()` (pre-cascade and post-cascade). `POST /api/tv/sign` wraps
event resolution + contract creation in a single Drizzle transaction. Unique
partial index guards idempotent event generation.**

---

### 1. Schema — `tv_contracts` table

```typescript
// packages/db/src/schema/tv-contracts.ts
import { pgTable, serial, integer, text, numeric, timestamp, unique } from 'drizzle-orm/pg-core'
import { playthroughs } from './playthroughs'

export const tvContracts = pgTable('tv_contracts', {
  id:               serial('id').primaryKey(),
  playthroughId:    integer('playthrough_id').notNull().references(() => playthroughs.id, { onDelete: 'cascade' }),
  seasonId:         integer('season_id').notNull(),
  tier:             text('tier').notNull().$type<'LOCAL' | 'REGIONAL' | 'NACIONAL'>(),
  durationSeasons:  integer('duration_seasons').notNull(),          // ∈ {1, 2, 3}
  seasonInContract: integer('season_in_contract').notNull().default(1), // ∈ [1..durationSeasons]
  weeklyRateEurK:   numeric('weekly_rate_eur_k', { precision: 10, scale: 2 }).notNull(),
  divisionAtSigning: text('division_at_signing').notNull().$type<'D1' | 'D2'>(),
  status:           text('status').notNull().$type<'NONE' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED'>().default('NONE'),
  signedAt:         timestamp('signed_at'),
  cancelledAt:      timestamp('cancelled_at'),
  cancelledReason:  text('cancelled_reason').$type<'scrutiny_tv' | 'scrutiny_cascade' | null>(),
}, (t) => ({
  // Exactly one contract record per playthrough per season (enforced at insert)
  uniqPlaythroughSeason: unique().on(t.playthroughId, t.seasonId),
}))
```

**Migration note**: New table — `drizzle-kit generate` produces a CREATE TABLE
migration. No existing table modified.

---

### 2. Schema — `fan_loyalty` column on `managers`

```typescript
// packages/db/src/schema/managers.ts (additive change)
fanLoyalty: integer('fan_loyalty').notNull().default(0),
```

`fan_loyalty ∈ [0, 50]`. Cap enforced at application level (not DB constraint)
to avoid ALTER TABLE on every rejection. Rationale for `managers` table (not
WorldState): `fan_loyalty` is a permanent manager attribute that accumulates
across seasons and never decays — it is not a simulation variable; it is identity
data, the same as `manager_reputation`.

---

### 3. Precision — `roundCorruption()` helper

All arithmetic on `corruption_exposure` within a tick uses this helper:

```typescript
// packages/shared/src/sim/tv-rights/precision.ts
export const CORRUPTION_DECIMALS = 2

export function roundCorruption(value: number): number {
  return Math.round(value * 100) / 100
}

export function parseCorruption(dbValue: string): number {
  // Drizzle returns numeric columns as strings — always parse before arithmetic
  return parseFloat(dbValue)
}
```

**Invariant**: Every `corruption_exposure` value is passed through
`roundCorruption()` immediately after any arithmetic operation — at paso 2
(F-TV3 delta) and at paso 6 (cascade injection). The predicate in paso 3 and
paso 7 operates on the rounded value. No intermediate DB write occurs between
paso 2 and paso 8 — the full 8-step sequence runs in memory, then the final
value is persisted.

```typescript
// Tick Order paso 2 (F-TV3 delta):
const rawNew = prevCorruption + CORRUPTION_DELTA_PER_WEEK[tier]
const newCorruption = roundCorruption(Math.min(CORRUPTION_MAX, Math.max(0, rawNew)))

// Tick Order paso 6 (cascade injection):
const rawCascade = newCorruption + externalDelta
// externalDelta must also be rounded before use:
const safeExternalDelta = roundCorruption(externalDelta)
const postCascade = roundCorruption(Math.min(CORRUPTION_MAX, Math.max(0, newCorruption + safeExternalDelta)))
```

**Why no intra-tick DB round-trip**: A DB write at paso 6 would require a
transaction savepoint within the already-open tick transaction, adding latency
and complexity with no correctness gain — the `roundCorruption()` helper
provides the same precision guarantee in memory.

---

### 4. TV Tick Integration with `advance()`

The 8-step TV Tick Order integrates as **two sub-phases** within the existing
synchronous `advance()` loop (ADR-008 §Execution Order Within advance()):

```
advance(playthroughId, targetWeek):
  for week W from currentWeek+1 to targetWeek:
    [a] Match outcome application (match-simulation)
    [b] ─── TV PRE-PHASE ─── (NEW — this ADR)
         applyTVPrePhase(ctx, tvContract, week) → TVPrePhaseResult
           paso 1: prevCorruptionTV = ctx.corruptionExposure
           paso 2: F-TV3 delta → newCorruption (roundCorruption)
           paso 3: threshold_crossed_upward_tv
           paso 4: if crossed → CANCELLED; generate tv_midseason_offer if week≤35
           paso 5: tvRevenue = contract.weeklyRateEurK if ACTIVE else 0
    [c] Cascade tick (cascade-engine evaluateTick)
         — cascade applies external corruption delta (externalDelta)
         — externalDelta comes from cascade graph Step 2 outputs
    [d] ─── TV POST-PHASE ─── (NEW — this ADR)
         applyTVPostPhase(ctx, tvContract, externalDelta, week) → TVPostPhaseResult
           paso 6: postCascade = roundCorruption(newCorruption + roundCorruption(externalDelta))
           paso 7: threshold_crossed_upward_cascade (only if still ACTIVE)
           paso 8: if crossed → CANCELLED; generate tv_midseason_offer if week≤35
    [e] Economy cashflow (ADR-014): apply tvRevenue from paso 5 to weekly_cashflow
    [f] Persist WorldState snapshot (ADR-005)
    [g] If STOP event generated (tv_midseason_offer or tv_auction): halt advance
```

**week 38 ordering**: For week 38, the full 8-step TV tick (sub-phases b+d)
runs BEFORE `season_end` processing. `season_end` is called synchronously after
step [f] for week 38. TV rollover (`season_in_contract += 1` or `ACTIVE→EXPIRED`)
is part of `season_end`. This matches the GDD Tick Order "Prioridad semana 38"
section exactly and requires no BullMQ job — it is synchronous within `advance()`.

**Interface**:
```typescript
// packages/api/src/modules/tv-rights/tv-tick.ts

export interface TVPrePhaseResult {
  revenue: number          // paso 5 — 0 if cancelled this tick
  newStatus: TVStatus
  corruptionAfterTV: number // paso 2 result, before cascade
  midseasonOffer?: TVMidseasonOfferData // if generated at paso 4
}

export interface TVPostPhaseResult {
  corruptionFinal: number  // paso 6 result
  cancelledByCascade: boolean
  midseasonOffer?: TVMidseasonOfferData // if generated at paso 8
}

export function applyTVPrePhase(
  contract: TVContract | null,
  prevCorruption: number,
  currentWeek: number,
  currentDivision: 'D1' | 'D2',
): TVPrePhaseResult

export function applyTVPostPhase(
  contract: TVContract | null,
  corruptionAfterTV: number,
  externalDelta: number,
  currentWeek: number,
  currentDivision: 'D1' | 'D2',
): TVPostPhaseResult

// Pure sub-function — paso 2 of Tick Order — exported for unit tests (AC-TV-22a)
export function applyTVCorruptionDelta(
  tier: 'LOCAL' | 'REGIONAL' | 'NACIONAL',
  prevCorruption: number,
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'NONE',
): number {
  // Returns new corruption_exposure (rounded to 2 decimals, clamped [0, CORRUPTION_MAX]).
  // Returns prevCorruption unchanged if status !== 'ACTIVE'.
  if (status !== 'ACTIVE') return prevCorruption
  return roundCorruption(Math.min(CORRUPTION_MAX, Math.max(0, prevCorruption + CORRUPTION_DELTA_PER_WEEK[tier])))
}
```

Both functions are **pure** (no DB I/O). The caller (`advance()`) persists
the resulting state changes via the open Drizzle transaction.

---

### 5. `POST /api/tv/sign` — Atomic Contract Creation

```typescript
// apps/api/src/routes/tv-rights.ts

app.post('/api/tv/sign', sessionMiddleware, async (c) => {
  const { offerId, tier, durationSeasons } = TVSignSchema.parse(await c.req.json())
  const { playthroughId, managerId } = c.var.session

  // F-TV1 validation (pure, throws TVRangeError → mapped to HTTP 400)
  const rate = calculateTVRate(tier, currentDivision, durationSeasons)

  await db.transaction(async (tx) => {
    // Guard: no double-sign
    const active = await tx.query.tvContracts.findFirst({
      where: and(
        eq(tvContracts.playthroughId, playthroughId),
        eq(tvContracts.status, 'ACTIVE'),
      ),
    })
    if (active) throw new TVContractConflictError()

    // Resolve STOP event atomically
    const offer = await tx.query.calendarEvents.findFirst({
      where: eq(calendarEvents.id, offerId),
    })
    if (!offer || offer.consumed) throw new TVOfferExpiredError()

    await tx.update(calendarEvents)
      .set({ consumed: true, resolvedAt: new Date(), choice: tier })
      .where(eq(calendarEvents.id, offerId))

    // Create contract
    await tx.insert(tvContracts).values({
      playthroughId,
      seasonId: currentSeasonId,
      tier,
      durationSeasons,
      seasonInContract: 1,
      weeklyRateEurK: rate.toFixed(2),
      divisionAtSigning: currentDivision,
      status: 'ACTIVE',
      signedAt: new Date(),
    })

    // XP grants (ADR-010 pattern)
    if (tier === 'REGIONAL') await grantSkillXP(tx, managerId, 'financial_acumen', 10)
    if (tier === 'NACIONAL') await grantSkillXP(tx, managerId, 'financial_acumen', 25)
  })

  return c.json({ ok: true })
})
```

**Error mapping** (all handled in Hono error middleware):
- `TVRangeError` (illegal tier+duration combo) → HTTP 400 `illegal_tier_duration`
- `TVContractConflictError` (already ACTIVE) → HTTP 409 `tv_contract_already_active`
- `TVOfferExpiredError` (offerId consumed or not found) → HTTP 409 `tv_offer_expired`

---

### 6. Unique Constraint — Idempotent Event Generation

A partial unique index on `calendar_events` prevents duplicate tv_* events:

```sql
-- Migration (drizzle-kit sql or raw SQL in migration file):
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_tv_unique_per_season
ON calendar_events (playthrough_id, season_id, type)
WHERE type IN ('tv_auction', 'tv_midseason_offer');
```

This is the **DB-level guard** supplementing the application-level
`COUNT(events WHERE type='tv_midseason_offer' AND season_id=S) = 1` guard
from AC-TV-10. If `applyTVPrePhase` or `applyTVPostPhase` generates a
midseason offer and the DB already has one (race condition on retry), the
INSERT will throw `unique_violation` → caught by the advance() caller →
treated as a no-op (event already generated).

The index also covers `tv_auction` — season_start cannot accidentally create
two auctions for the same season (AC-TV-15 / HTTP 409).

---

### 7. Advance Worker Idempotency

`advance()` is synchronous and not a BullMQ job (ADR-008). Idempotency at the
tick level is provided by:

1. **`currentWeek` check**: advance() reads `playthroughs.currentWeek` from DB.
   If `currentWeek >= requestedWeek`, returns the current state immediately
   (no tick applied). This is the primary idempotency guard.

2. **TV-specific guard**: `applyTVPrePhase()` checks
   `contract.status === 'ACTIVE'` before applying any delta. If a previous
   partial run cancelled the contract, the status in DB reflects that — a retry
   reads `CANCELLED` and skips the delta.

3. **Unique index**: Prevents duplicate tv_* events even if `applyTVPrePhase`
   or `applyTVPostPhase` is reached twice (idempotent INSERT via ON CONFLICT DO NOTHING,
   or catch unique_violation).

---

### 8. `EventDecisionPayload` Extension (ADR-015 addendum)

Two new variants added to the `EventDecisionPayload` discriminated union:

```typescript
// packages/shared/src/types/events.ts — additive extension of ADR-015 union

export type TVAuctionPayload = {
  type: 'tv_auction'
  seasonId: number
  offers: Array<{
    tier: 'LOCAL' | 'REGIONAL' | 'NACIONAL'
    durationOptions: Array<{
      durationSeasons: 1 | 2 | 3
      weeklyRateEurK: number
      corruptionDeltaPerWeek: number     // for display in UI (delta per tick)
      corruptionAccumSeason: number      // for display (delta × 38)
      riskFlag?: 'REGIONAL_2YR' | 'NACIONAL_3YR'  // ⚠️ trigger when thresholds met
    }>
  }>
  defaultOption: { tier: 'LOCAL'; durationSeasons: 1 }  // always LOCAL 1yr on timeout
}

export type TVMidseasonOfferPayload = {
  type: 'tv_midseason_offer'
  seasonId: number
  cancelledTier: 'LOCAL' | 'REGIONAL' | 'NACIONAL'
  offer: {
    tier: 'LOCAL' | 'REGIONAL'
    weeklyRateEurK: number
    weeksRemaining: number
    currentDivision: 'D1' | 'D2'
  }
  defaultOption: 'reject'  // default = reject (fan_loyalty +10 on timeout)
}
```

**`riskFlag` logic** (computed at auction generation, before persisting):
- `REGIONAL_2YR`: set if `durationSeasons === 2` AND `corruption_exposure >= 22`
- `NACIONAL_3YR`: set if `durationSeasons === 3` AND `corruption_exposure > 0`

The HUD renders the ⚠️ indicator when `riskFlag` is present (UI requirement
from GDD Rule 5b, deferred to `/ux-design tv-rights`).

**Resolver addition** (exhaustiveness — the switch in the event resolver must
be extended):
```typescript
case 'tv_auction':    return resolveTVAuction(payload, choice, ctx)
case 'tv_midseason_offer': return resolveTVMidseasonOffer(payload, choice, ctx)
```

---

### Architecture Diagram

```
POST /api/tv/sign ──► TVRightsRouter
                          │
                          ▼
                    [Drizzle tx]
                    ├── calendarEvents.update(consumed=true)
                    ├── tvContracts.insert(ACTIVE)
                    └── managers.update(financial_acumen_xp)

advance(week W):
  [pre-cascade]
    applyTVPrePhase(contract, prevCorr, week) ──► TVPrePhaseResult
         │ paso 2: roundCorruption(prevCorr + delta)
         │ paso 3-4: threshold_crossed_upward_tv → CANCELLED?
         └ paso 5: revenue = ACTIVE ? rate : 0

  [cascade tick] ──────────────────────────────────────► TickResult
                                                            │ externalDelta

  [post-cascade]
    applyTVPostPhase(contract, corrAfterTV, externalDelta, week)
         │ paso 6: roundCorruption(corrAfterTV + roundCorruption(externalDelta))
         └ paso 7-8: threshold_crossed_upward_cascade → CANCELLED?

  [economy phase]
    cashflow += revenue (from TVPrePhaseResult)

  [persist]
    [Drizzle tx]
    ├── tvContracts.update(status, corruption)
    ├── worldSnapshots.insert (includes updated corruption)
    └── calendarEvents.insert(tv_midseason_offer) if generated
         └── UNIQUE INDEX catches duplicates on retry

GET /finance: tvContracts.findFirst(ACTIVE) → contract panel
```

## Alternatives Considered

### Alternative 1: `tv_contract` embedded in WorldState JSON (ADR-005 pattern)

- **Description**: Store the TV contract as a JSON blob inside `worldSnapshots.state`,
  same as `financial_balance` and `weekly_cashflow`.
- **Pros**: No new DB table; fits the ADR-005 append-only snapshot pattern.
- **Cons**: No column-level type safety; unique constraint for single-active-contract
  cannot be enforced at DB level; queries for "current contract" require deserialising
  WorldState JSON; harder to debug (no direct SQL inspection of contract state).
- **Rejection Reason**: TV contracts have a rich lifecycle (6 fields, 4 states,
  multi-year rollover) that justifies a typed table. The sponsors system — same
  complexity — uses a dedicated table. Consistency favors a dedicated table.

### Alternative 2: DB round-trip for precision at paso 6

- **Description**: Write `corruption_exposure` to DB after paso 2 (F-TV3 delta),
  then read it back at paso 6 (pre-cascade injection), ensuring DB precision at
  each step.
- **Pros**: Exactly mirrors "round-trip to DB" semantics; eliminates any in-memory
  float drift.
- **Cons**: Adds 2 extra DB operations per tick; requires a transaction savepoint
  within the already-open tick transaction; `advance()` performance degrades for
  multi-week skips.
- **Rejection Reason**: `roundCorruption()` applied immediately after arithmetic
  provides identical precision guarantees with zero I/O overhead. The DB stores
  `numeric(5,2)` — reading back a just-computed value from DB adds no information
  if we already applied the same rounding locally.

### Alternative 3: `fan_loyalty` as WorldState cascade node

- **Description**: Model `fan_loyalty` as a cascade node (similar to `fan_momentum`)
  with a dedicated ThresholdCrossing.
- **Pros**: Participates in the cascade graph natively; cross-system queries
  easier.
- **Cons**: `fan_loyalty` never decays, is not influenced by the cascade graph
  (only by TV rejection choices), and does not trigger ThresholdCrossings of its
  own. Adding it to the cascade graph adds noise to the graph topology with no
  payoff.
- **Rejection Reason**: `fan_loyalty` is a manager attribute (like `manager_reputation`),
  not a simulation variable. It belongs on the `managers` table.

## Consequences

### Positive
- `tv_contracts` table enables clean SQL queries, DB-level uniqueness, and typed
  Drizzle access with no WorldState deserialization.
- `roundCorruption()` helper is a single tested unit — precision bug surface is
  minimal.
- Atomic `POST /api/tv/sign` transaction prevents any partial-state bugs where
  the STOP event is consumed but no contract is created (or vice versa).
- Unique partial index makes `tv_midseason_offer` generation idempotent at the
  DB level without application-level checks.
- Two-sub-phase TV tick is pure (no I/O) — fully unit-testable without DB.

### Negative
- Two new DB tables/columns (`tv_contracts`, `fan_loyalty` migration).
- `advance()` function gains two new phases — more complex call graph. Risk:
  ordering bugs between TV phases and cascade tick.
- ADR-015's event resolver switch must be extended — TypeScript exhaustiveness
  check catches forgetting this, but it does require a code change in a central file.

### Risks
- **Ordering risk**: If `applyTVPrePhase` is called AFTER the cascade tick
  (wrong order), revenue for the cancellation week would be preserved instead
  of being 0 (the opposite of the GDD spec). Mitigation: AC-TV-22b and AC-TV-40
  explicitly test the ordering.
- **Retry storm**: If `advance()` is retried by a higher-level BullMQ job (e.g.,
  a match job retries the season), the TV pre/post phase could be called twice.
  Mitigation: Unique index + `currentWeek >= requestedWeek` guard.
- **Drizzle `numeric` string type**: Drizzle returns `numeric` columns as
  strings. Forgetting `parseFloat()` before arithmetic silently produces `NaN`.
  Mitigation: `parseCorruption()` helper + lint rule forbidding `+` on raw
  `tvContracts.weeklyRateEurK` without conversion.

## GDD Requirements Addressed

| TR-ID | Requirement | How This ADR Addresses It |
|-------|-------------|--------------------------|
| TR-TVR-001 | `tv_contracts` schema; `fan_loyalty` column; FSM NONE→ACTIVE→CANCELLED/EXPIRED→NONE | §1 (tv_contracts table) + §2 (fan_loyalty column) |
| TR-TVR-002 | F-TV1 rate formula + guards → HTTP 400 for illegal combinations | `calculateTVRate()` pure function + TVRangeError → HTTP 400 mapping (§5) |
| TR-TVR-003 | `tv_auction` STOP event + unlock rules | ADR-015 payload type `TVAuctionPayload` (§8) + generation in `season_start` hook |
| TR-TVR-004 | F-TV3 8-step Tick Order + precision discipline | §3 (`roundCorruption()`), §4 (two-sub-phase integration), paso 6 invariant |
| TR-TVR-005 | F-TV2 `tv_midseason_offer` + idempotent generation | §6 (unique partial index) + `TVMidseasonOfferPayload` (§8) |
| TR-TVR-006 | Multi-año rollover; tarifa inmutable (`division_at_signing`) | `tv_contracts.divisionAtSigning` immutable column; `season_end` rollover increments `season_in_contract` |
| TR-TVR-007 | F-TV4 `fan_loyalty` → `fan_attendance_effective = min(1.0, ...)` | §2 (`fan_loyalty` on managers) + pure function in `packages/shared/src/sim/tv-rights/fan-loyalty.ts` |
| TR-TVR-008 | XP grants: +10 REGIONAL, +25 NACIONAL | Atomic XP grant inside `POST /api/tv/sign` transaction (§5) |
| TR-TVR-009 | TV revenue replaces economy.md §F2 flat constant | Cashflow phase [e] in `advance()` reads `TVPrePhaseResult.revenue` (§4) |
| TR-TVR-010 | TV_SCANDAL_THRESHOLD=60 cancellation + asimetría revenue F-TV3 vs cascade | `applyTVPrePhase` (paso 4, revenue=0) vs `applyTVPostPhase` (paso 8, revenue preserved) — §4 |
| TR-TVR-011 | UI in /finance with ⚠️ REGIONAL 2yr (corruption≥22) + NACIONAL 3yr (corruption>0) | `TVAuctionPayload.durationOptions[].riskFlag` field (§8); HUD renders ⚠️ when present |
| TR-TVR-012 | `POST /api/tv/sign` atomicity: event resolution + contract in one Drizzle tx | §5 (full transaction pattern) |

## Performance Implications

- **CPU**: `applyTVPrePhase()` and `applyTVPostPhase()` are pure arithmetic functions.
  Each executes in < 0.1ms. No performance concern at single-player scale.
- **Memory**: `tv_contracts` table: 1 row per season per playthrough.
  At 10 seasons × 1 row = 10 rows per playthrough. Negligible.
- **DB queries per advance() week**: +2 (read tv_contract at start, write at end
  of tick). Existing `advance()` already has ~5 DB operations per week. Minor increase.
- **Load Time**: No impact. `tv_contracts` is queried only on demand.
- **Network**: No Socket.IO changes. TV state is REST-only.

## Migration Plan

1. **DB migration** (drizzle-kit generate):
   - CREATE TABLE `tv_contracts`
   - ALTER TABLE `managers` ADD COLUMN `fan_loyalty INTEGER NOT NULL DEFAULT 0`
   - CREATE UNIQUE INDEX `calendar_events_tv_unique_per_season`
   - No data migration — `tv_contracts` starts empty; existing playthroughs
     continue with `fan_loyalty = 0` (correct default for pre-tv-rights state).

2. **Economy module** (BREAKING CHANGE per OQ-TV-02):
   - Delete `getTVRightsWeekly()` from `league-system` module
   - Delete constants `TV_RIGHTS_SEGUNDA`, `TV_RIGHTS_PRIMERA` from `constants.ts`
   - Replace economy.md §F2 flat constant with `TVPrePhaseResult.revenue` read
   - Tests for `getTVRightsWeekly()` (AC-LGS-18/19) must be deprecated

3. **ADR-015 resolver** (additive):
   - Add `case 'tv_auction'` and `case 'tv_midseason_offer'` to the resolver switch
   - Add `TVAuctionPayload` and `TVMidseasonOfferPayload` to the discriminated union

4. **F-TV4 integration** (BREAKING CHANGE per OQ-TV-03):
   - `fan_attendance_effective` computation added to matchday revenue calculation
   - Location: `economy.md §F3` consumer or cascade-engine C8 (cross-review
     deferred to sprint planning for tv-rights stories — OQ-TV-03 resolution)

## Validation Criteria

1. **Schema**: `drizzle-kit migrate` succeeds on clean DB; `SHOW CREATE TABLE tv_contracts`
   matches §1 schema; `fan_loyalty` column present on `managers`.

2. **Precision**: Unit test `roundCorruption(59.9999999) === 60.0` and
   `roundCorruption(59.9) === 59.9`. Integration: with `corruption=2.9` and
   NACIONAL ACTIVE, `corruption_exposure` after 38 ticks `=== 59.90` (not
   cancellation — AC-TV-52 boundary).

3. **Atomicity**: Simulate tx rollback mid-`POST /api/tv/sign` (mock DB failure
   after event update, before contract insert) → assert both tables unchanged.

4. **Ordering**: AC-TV-22b and AC-TV-40 pass — verifying that F-TV3 cancellation
   gives revenue=0 and cascade cancellation preserves revenue.

5. **Idempotency**: Call `advance()` for week 10 twice (network retry sim) →
   `corruption_exposure` incremented once; `tv_midseason_offer` events COUNT=1.

6. **Unique index**: Attempt to insert a second `tv_auction` for the same
   `(playthrough_id, season_id)` → PG error `23505 unique_violation`.

## Related Decisions

- [ADR-005: WorldState Persistence](ADR-005-worldstate-persistence.md) — `tv_contracts` uses same DB; WorldState JSON does NOT include tv contract fields
- [ADR-008: World Clock + Event Loop](ADR-008-world-clock-event-loop.md) — `advance()` host for TV sub-phases; synchronous execution order
- [ADR-014: Financial Flow](ADR-014-economy-financial-flow.md) — TV revenue slot in cashflow; BREAKING CHANGE to §F2 constant
- [ADR-015: Special Event Decision Schema](ADR-015-special-event-decision-schema.md) — `TVAuctionPayload` + `TVMidseasonOfferPayload` extend the union
- [design/gdd/tv-rights.md](../../design/gdd/tv-rights.md) — Full behavioral specification (54 ACs; Approved R7 2026-05-20)
- [production/epics/tv-rights/EPIC.md](../../production/epics/tv-rights/EPIC.md) — Epic blocked pending this ADR
