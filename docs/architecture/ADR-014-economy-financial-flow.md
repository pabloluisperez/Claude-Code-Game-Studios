# ADR-014: Financial Flow + Bankruptcy Protocol

## Status
Accepted

## Date
2026-05-19 (Proposed → Accepted same day — synthesizes economy.md §3 + §5.3 + §7.1
which were already approved 2026-05-18; this ADR formalizes the cross-system
flow that those GDD sections imply but do not explicitly contract.)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Backend (Drizzle 0.36+ + WorldState integration) |
| **Knowledge Risk** | LOW — all patterns verified by vertical slice; no post-cutoff APIs introduced beyond what ADR-005 already uses |
| **References Consulted** | `design/gdd/economy.md` (R3 Approved 2026-05-18), ADR-005 (WorldState persistence), ADR-003 (cascade graph), ADR-008 (world clock), `docs/engine-reference/web/modules/backend.md`, vertical slice `apps/web/src/routes/finance/+page.svelte` |
| **Post-Cutoff APIs Used** | None new — Drizzle 0.36+ `unique().on()`, partial UNIQUE INDEX with `sql` template literal (already verified by ADR-011 + slice) |
| **Verification Required** | Determinism: same seed + same decisions → identical balance trajectory across 4-week run (mirror slice's cascade-determinism test pattern). Forfeit edge case: bankruptcy never triggers within a single tick from a single negative shock unless cashflow buffer < 0 AND |balance| > CRITICAL_BALANCE_THRESHOLD. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (`ctx.rng()` discipline), ADR-003 (cascade graph + Step 3 PlayerDecision application), ADR-005 (WorldState append-only persistence), ADR-008 (advance() loop + ThresholdCrossings), ADR-011 (league schema — TV rights tier scales with division) |
| **Enables** | `economy` epic stories; player-management contract renewal pipeline; event-system "Congelación de nómina" catch-up event (ADR-015 will reference this) |
| **Blocks** | `economy` epic implementation until Accepted |
| **Ordering Note** | This ADR is independent of ADR-015/016/017/018. Can be written and Accepted before them. |

## Context

### Problem Statement

`economy.md` GDD (Approved 2026-05-18) defines the cascade-driven economy at
the formula level: F1 ticket revenue, F2 sponsor income, F3 payroll, F4 net
result, F5/F6 fan-momentum sensitivity to price. It also defines (§5.3) the
bankruptcy state machine — En Riesgo → Crisis → Quiebra — and the catch-up
mechanic (§7.1) "Congelación de nómina de emergencia."

What the GDD does NOT define is the **architecture-level contract**:

1. Where does financial state physically live? In WorldState (consistent with
   cascade-engine ownership) or in a separate financial ledger? The GDD
   discusses both implicitly without committing.
2. What is the precise execution order within `advance()` between
   match-outcome application, ticket revenue calculation, cost deduction,
   bankruptcy threshold check, and ThresholdCrossing emission?
3. How does the **bankruptcy FSM** interact with the BLOCKING threshold
   mechanism from ADR-008? The GDD names the states but doesn't specify which
   crossings (if any) trigger them.
4. The post-slice playtest registered OQ-ECO-06: `MAX_TICKET_EUR` per club
   must be derived from `(stadium_capacity, division_tier, fan_culture_index)`.
   The slice hardcoded `MARKET_TICKET_EUR=10€` / `MAX=25€` for Real Pueblo
   Segunda. This ADR is where the formula lives.

Without this ADR, the `economy` epic cannot write stories — multiple
implementations are consistent with the GDD.

### Constraints

- Financial state must serialise into `worldSnapshots.state` JSON column
  (ADR-005). No separate "financial_ledger" table for MVP — adds query
  surface without benefit at single-player scale.
- Bankruptcy FSM must integrate with the BLOCKING ThresholdCrossing model
  from ADR-008 — the FSM transition IS a BLOCKING event that halts
  `advance()` until the player responds via the event-system.
- Determinism (ADR-002): every euro that moves must be reproducible from
  seed + decisions.
- The cascade engine writes WorldState. The economy module must NOT
  side-channel writes — all WorldState mutations go through Step 3 (player
  decisions) or via cascade edges in Step 2.

### Requirements

The economy module must provide:

1. Weekly revenue calculation from current WorldState (ticket revenue per
   home match + sponsor income + TV rights).
2. Weekly cost calculation (player wages + staff wages + catering + scouting
   + groundskeeper + maintenance baseline).
3. Net result applied to WorldState as a delta inside `advance()` after
   match outcomes are persisted.
4. Bankruptcy FSM with deterministic transitions tied to balance + cashflow
   thresholds.
5. A per-club `MAX_TICKET_EUR` formula resolving OQ-ECO-06.
6. Sponsor lifecycle (signing, scandal-triggered cancellation, expiry).
7. Catch-up mechanic ("Congelación de nómina de emergencia").

## Decision

**Financial state lives in WorldState (per ADR-005). Weekly revenue/cost flow
runs inside `advance()` as a dedicated phase between match-outcome application
and the cascade tick. Bankruptcy is modelled as three new ThresholdCrossings
(per ADR-008) that escalate via the event-system to forced player decisions.
`MAX_TICKET_EUR` is computed by a pure function from three WorldState inputs.**

### New WorldState NodeIds

Added to `cascade-engine.md` catalog as **Economy-owned**:

| NodeId | Range | Default | Type | Owned by | Description |
|--------|-------|---------|------|----------|-------------|
| `financial_balance` | [-1000, 10000] | 250 (€K) | Estado interno | economy | Saldo de caja del club |
| `weekly_cashflow` | [-200, 200] | 0 (€K) | Estado interno | economy | Resultado neto de la semana pasada (revenue − costs) |
| `financial_status` | [0, 3] | 0 | Estado interno | economy | 0=Sano / 1=En Riesgo / 2=Crisis / 3=Quiebra |
| `sponsor_quality` | [0, 100] | 0 | Estado interno | economy + event-system | Existed already; this ADR confirms event-system writes via Step 3 |
| `stadium_capacity` | [500, 80000] | 3000 (Real Pueblo) | Estático | (world-gen) | Per-club, set at world-gen |
| `fan_culture_index` | [0, 100] | 35 (Real Pueblo) | Estático | (world-gen) | Per-club fan culture rating; affects MAX_TICKET_EUR |

These nodes are added to `entities.yaml` as part of ADR-014 acceptance.

### Execution Order Within advance() (extends ADR-008)

The weekly loop becomes:

```
advance(playthroughId, decisions):
  1. Load prev WorldStateSnapshot (ADR-005)
  2. For each fixture in this week (ADR-011):
       simulateMatch(input) → MatchOutcome
       markFixturePlayed + applyMatchToStandings
       If player's fixture: apply outcome.worldStateDeltas to MPI + injury_risk
  3. resolveEventsForWeek(week, seed) → SliceEvent[]  (existing per ADR-008)
  4. ╔══ NEW: economy.applyWeeklyFlow(prevState, decisions, weekEvents) ══╗
     ║   ledger = computeLedger(prevState, weekEvents)                   ║
     ║     revenue = ticketRevenue + sponsorRevenue + tvRights           ║
     ║     costs   = playerWages + staffWages + catering + scouting +    ║
     ║              groundskeeper + maintenanceBaseline                  ║
     ║   nextBalance   = prevState.financial_balance + (revenue - costs) ║
     ║   nextCashflow  = revenue - costs                                 ║
     ║   stateDelta = { financial_balance: nextBalance,                  ║
     ║                  weekly_cashflow:   nextCashflow }                ║
     ║   (Applied as a "system decision" injected into Step 3)           ║
     ╚════════════════════════════════════════════════════════════════════╝
  5. runTick(prevState + economyDelta, decisions, rng) → TickResult
       (Step 5 inside runTick detects financial_status crossings — see §FSM below)
  6. saveSnapshot
  7. advancePlaythroughWeek
```

Economy's `applyWeeklyFlow` runs **before** the cascade tick so its outputs
(updated balance + cashflow) are visible to the threshold detector in Step 5
of the tick. The economy module does NOT call cascade-engine directly; it
returns a `Partial<WorldState>` that the `advance()` orchestrator injects.

### Bankruptcy FSM (3 new ThresholdCrossings via ADR-008)

Per ADR-008, a `ThresholdConfig` is `{ nodeId, value, direction, priority,
reason }`. The economy adds these to the THRESHOLDS table:

| nodeId | value | direction | priority | reason |
|--------|-------|-----------|----------|--------|
| `financial_status` | 0.5 | above (i.e., transitions from Sano → En Riesgo) | ADVISORY | `economy:en_riesgo` |
| `financial_status` | 1.5 | above (En Riesgo → Crisis) | BLOCKING | `economy:crisis` |
| `financial_status` | 2.5 | above (Crisis → Quiebra) | BLOCKING | `economy:quiebra` |

Bankruptcy state transitions are deterministic from the (balance, cashflow)
pair — NOT from a random roll. The mapping function lives in the economy
module:

```typescript
function computeFinancialStatus(balance: number, cashflow: number): 0|1|2|3 {
  // Quiebra: deeply negative balance with no recovery (cashflow ≤ −20 €K/wk)
  if (balance < -200 && cashflow < -20) return 3;
  // Crisis: balance very low, cashflow ≤ −10 €K/wk
  if (balance < CRISIS_BALANCE_THRESHOLD && cashflow < -10) return 2;
  // En Riesgo: balance dropping or cashflow consistently negative
  if (balance < EN_RIESGO_BALANCE_THRESHOLD || cashflow < -15) return 1;
  return 0;
}
```

Tuning knobs (in shared constants):
- `EN_RIESGO_BALANCE_THRESHOLD = 50 €K`
- `CRISIS_BALANCE_THRESHOLD = -50 €K`
- `QUIEBRA_BALANCE_THRESHOLD = -200 €K` (implicit from the FSM)

When `financial_status` crosses 1.5 (Crisis) or 2.5 (Quiebra), `advance()`
halts and emits the BLOCKING crossing to the event-system, which generates
a forced "Reunión de board" event. The player must respond before another
`advance()` call succeeds.

### MAX_TICKET_EUR Formula (resolves OQ-ECO-06)

```typescript
// Pure function — lives in packages/shared/src/sim/economy-pricing.ts
function maxTicketEur(args: {
  stadium_capacity: number;
  division_tier: 1 | 2;
  fan_culture_index: number;
}): number {
  const { stadium_capacity, division_tier, fan_culture_index } = args;
  // Base curve: small stadiums + lower divisions cap lower
  const capacityFactor = Math.min(1.0, stadium_capacity / 30000); // saturates at 30k seats
  const divisionFactor = division_tier === 1 ? 1.0 : 0.55;        // Segunda caps ~55% of Primera
  const cultureFactor = 0.6 + (fan_culture_index / 100) * 0.4;    // [0.6, 1.0]
  const PRIMERA_REFERENCE_MAX = 60; // €
  const computed = PRIMERA_REFERENCE_MAX * capacityFactor * divisionFactor * cultureFactor;
  // Snap to nearest 5€ for the UI's discrete slider step (per OQ-HUD-09)
  return Math.max(5, Math.round(computed / 5) * 5);
}

function marketTicketEur(maxEur: number): number {
  // Market = ~40% of max, snapped to 5€
  return Math.max(5, Math.round((maxEur * 0.4) / 5) * 5);
}
```

For Real Pueblo CF (stadium_capacity=3000, division_tier=2, fan_culture_index=35):
- capacityFactor = 0.1
- divisionFactor = 0.55
- cultureFactor = 0.74
- computed = 60 × 0.1 × 0.55 × 0.74 = 2.44 → snap to 5€ MAX

That's too low for the slice's UX (it had MAX=25€). The slice intentionally
de-snapped the formula for narrative impact. **For the slice's specific
Real Pueblo, we hardcode an override**: small Segunda clubs use `MAX=25€`
because the math gives 5€ which is too narrow for player choice. The formula
is correct for larger clubs; the override is documented in
`packages/shared/src/sim/economy-pricing.ts` and surfaced as a tuning knob.

### Sponsor Lifecycle (extends economy.md §3)

Sponsor state:
- `sponsor_quality ∈ [0, 100]` — slice already has this node
- `sponsor_active_since_week ∈ [0, +∞)` — when current contract began
- `sponsor_contract_weeks_remaining ∈ [0, 52]` — weeks until renewal needed

Lifecycle transitions:
1. **Signing**: at season_start, a sponsor offer event fires (via event-system,
   ADR-015 will define payload). Player accepts → sponsor_quality + weekly
   income set; contract counter starts.
2. **Cancellation via scandal**: when corruption_exposure crosses 80 (existing
   BLOCKING per cascade-engine.md), event-system fires a scandal event;
   sponsor cancels → sponsor_quality → 0; future income → 0.
3. **Expiry**: when `sponsor_contract_weeks_remaining = 0`, event-system fires
   a renewal event at season_end.

### Catch-up Mechanic: "Congelación de nómina de emergencia"

Per economy.md §7.1, when bankruptcy escalation reaches Crisis (ThresholdCrossing
`economy:crisis`), the event-system offers a "Congelación de nómina" option:

- One-time use per playthrough (tracked in `playthrough.metadata.nominaFrozen`)
- Effect: player wages reduced by 25% for next 8 weeks (counter `nomina_frozen_weeks_remaining`)
- Side effect: `player_happiness` decreases by 15 immediately (one-time delta)

The full event payload schema is defined in ADR-015. This ADR confirms the
economy module is what triggers it (via the BLOCKING crossing) and what
applies its deltas (via Step 3 PlayerDecision injection).

## Alternatives Considered

### Alternative A: Separate `financial_ledger` table with per-transaction rows

- **Description**: Each revenue/cost item becomes a row in `financial_ledger`
  with type/amount/week. Balance = SUM(rows) per query.
- **Pros**: Audit trail; per-category analytics for free.
- **Cons**: Doubles query surface for the most-frequent read (current balance).
  Adds a new table dependency. Doesn't match the rest of the WorldState
  pattern (other systems persist state, not history).
- **Rejection**: For MVP single-player, the cost is real and benefit is
  speculative. Revisit at MMO scale (v2.0+). Per-tick logs are already in
  `world_snapshots.delayedBuffer` if forensic analysis is needed.

### Alternative B: Bankruptcy as a separate FSM table

- **Description**: `financial_status` lives in a dedicated table with its own
  FSM transitions, not as a WorldState node.
- **Pros**: Decouples bankruptcy logic from cascade-engine.
- **Cons**: Creates a parallel state machine that ADR-008's ThresholdCrossings
  mechanism already handles cleanly. Adds a second source of truth for the
  player's club health.
- **Rejection**: The WorldState + ThresholdCrossing pattern is already the
  established interface for "this is a major event that pauses the loop." We
  reuse it instead of inventing a parallel mechanism.

### Alternative C: Continuous (Markov-style) FSM evaluated probabilistically

- **Description**: `financial_status` transitions on a probabilistic roll
  weighted by balance + cashflow trajectory.
- **Pros**: More "organic" feeling.
- **Cons**: Breaks determinism guarantees (ADR-002) without a clear
  player-perceptible benefit. Player can't reason about "how close am I to
  Crisis?" if it's a roll.
- **Rejection**: Deterministic thresholds are auditable and the slice
  validated that staff messages can communicate the proximity.

## Consequences

### Positive

- Single source of truth for financial state (WorldState, per ADR-005)
- ADR-008's ThresholdCrossing mechanism handles bankruptcy without parallel logic
- `MAX_TICKET_EUR` formula resolves OQ-ECO-06 — economy module owns club-context constants
- Deterministic FSM (no probabilistic rolls in financial state transitions)
- Catch-up event (`Congelación de nómina`) creates a "recovery story" beat consistent with Pilar 4 (Calm Is The Tempo) — the player has agency in escaping Crisis

### Negative

- WorldState now carries 6 economy-owned nodes — slight increase in snapshot payload (≈48 bytes per node × 6 = 288 bytes; negligible compared to existing snapshot size)
- The `applyWeeklyFlow` orchestration step adds a dependency between `advance-worker` and `apps/api/src/modules/economy/` — must be wired in the worker initialisation order

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Bankruptcy oscillation (En Riesgo ↔ Sano in successive weeks creating ThresholdCrossing spam) | MEDIUM | LOW | Add hysteresis: transition Sano→En Riesgo requires balance < threshold AND cashflow < 0; reverse only requires balance > threshold + 20€K (asymmetric). |
| MAX_TICKET_EUR formula produces unplayable max for small clubs (Real Pueblo case: math gives 5€) | LOW | LOW | Document the slice's override pattern as a Tuning Knob: floor `MAX_TICKET_EUR ≥ 25` for division_tier=2 clubs in MVP. Revisit when more division contexts exist. |
| Catch-up event used as exploit (player intentionally triggers Crisis to use the freeze) | MEDIUM | LOW | One-time-per-playthrough constraint + 15-point player_happiness penalty makes it a real cost, not a free win. |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| economy.md F1-F6 | Revenue / cost / fan attendance formulas | Wired into `applyWeeklyFlow` orchestration step |
| economy.md §3 | Sponsor lifecycle (signing, cancellation, expiry) | 3-state lifecycle with event-system integration; sponsor_quality node already exists |
| economy.md §5.3 | Bankruptcy FSM En Riesgo / Crisis / Quiebra | `financial_status ∈ [0,3]` node + 3 ThresholdCrossings (1 ADVISORY + 2 BLOCKING) |
| economy.md §7.1 | "Congelación de nómina de emergencia" catch-up | Triggered on Crisis BLOCKING crossing; payload defined in ADR-015; effects applied via Step 3 PlayerDecision |
| economy.md AC-ECO-22 | Sponsor cancellation on corruption_exposure ≥ 80 | Sponsor lifecycle handler subscribes to that ThresholdCrossing reason |
| hud-ui.md (slice ref) | Finance panel | Reads from `/api/economy/state/:playthroughId`; server-authoritative replaces slice's client-side proxy |
| OQ-ECO-06 (post-slice) | MAX_TICKET_EUR + MARKET_TICKET_EUR formula by club | `maxTicketEur(stadium_capacity, division_tier, fan_culture_index)` pure function defined here |

## Performance Implications

- **CPU**: `applyWeeklyFlow` per week: ~7 multiplications + 3 sums + 1 FSM evaluation = O(1). <0.1ms.
- **Memory**: 6 new WorldState nodes = ~288 bytes per snapshot. Over 38 weeks × 5 seasons = ~55KB total for a full playthrough's history. Negligible.
- **DB**: No new tables. Snapshot payload grows by <1% — well within budget.
- **Network**: `/api/economy/state/:playthroughId` returns standard WorldState shape; no new payloads.

## Related Decisions

- [ADR-002](ADR-002-simulation-determinism.md) — `ctx.rng()` discipline (this ADR has no RNG calls — deterministic by construction)
- [ADR-003](ADR-003-cascade-graph-topology.md) — cascade graph topology (this ADR adds Economy-owned nodes to the catalog)
- [ADR-005](ADR-005-worldstate-persistence.md) — Financial state lives in WorldState; persisted by ADR-005's append-only mechanism
- [ADR-008](ADR-008-world-clock-event-loop.md) — `applyWeeklyFlow` is wired into the `advance()` loop; bankruptcy uses ADR-008's ThresholdCrossing mechanism
- [ADR-011](ADR-011-league-competition-schema.md) — TV rights tier scales with `divisions.tier` (Primera 1.0× / Segunda 0.55×)
- [ADR-015](ADR-015-special-event-decision-schema.md) — Defines the typed payload for Crisis / Quiebra board meetings and Congelación de nómina decision
- `design/gdd/economy.md` — Source of formulas; this ADR is the architecture-level contract
