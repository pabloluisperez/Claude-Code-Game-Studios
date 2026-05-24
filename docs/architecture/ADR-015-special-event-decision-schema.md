# ADR-015: Special Event Decision Schema

## Status
Accepted

## Date
2026-05-19 (Proposed → Accepted same day — formalizes the schema implied by
event-system.md §4 + §5, which were already approved but lacked the explicit
typed payload contract).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Feature / Backend (TypeScript discriminated unions + Drizzle JSONB) |
| **Knowledge Risk** | LOW — discriminated unions are stable TypeScript pattern; no post-cutoff syntax. |
| **References Consulted** | `design/gdd/event-system.md` (Approved 2026-05-18 + cross-review R2 fixes), ADR-008 (world clock + event loop), ADR-014 (economy bankruptcy triggers), `design/gdd/staff-system.md` (calendar events tier-gated), `design/gdd/cascade-engine.md` (Step 3 PlayerDecision application contract). |
| **Post-Cutoff APIs Used** | None. |
| **Verification Required** | Type-narrowing exhaustiveness — every `EventDecisionPayload` discriminant must be handled in the resolver `switch`; TypeScript `never` exhaustiveness assertion is the compile-time test. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-008 (advance() loop applies decisions in Step 3), ADR-003 (cascade graph Step 3 contract), ADR-014 (bankruptcy ThresholdCrossings + Congelación payload), ADR-009 (staff-system reads calendar events tier-gated) |
| **Enables** | `event-system` epic stories; manager-rpg career-event payload alignment (ADR-010 already names the events; this ADR types them) |
| **Blocks** | `event-system` epic implementation until Accepted |
| **Ordering Note** | Must be Accepted after ADR-014 (which defines the bankruptcy triggers this ADR types). Independent of ADR-016/017/018. |

## Context

### Problem Statement

`event-system.md` (Approved 2026-05-18) defines the catalog of in-game events:
fixtures, festivals, derbis, transfers, sponsor offers, scandals, corruption,
board meetings, alcalde calls, "cena de reconciliación," etc. Each event
that requires a player response is a **PlayerDecision** that:

1. Pauses the `advance()` loop via a BLOCKING ThresholdCrossing (ADR-008)
2. Presents the player with options in the HUD
3. Resolves to a `Partial<WorldState>` delta applied in Step 3 of the
   next cascade tick (per ADR-003 + ADR-008)

The GDD specifies WHAT each event does narratively but uses prose, not a
type contract. Without an enforced schema, every implementer of an event
type invents their own payload shape, leading to:

- Inconsistent UI rendering (the HUD has to special-case each event)
- No exhaustiveness checking when adding new event types
- No serialisation guarantee (events live in `calendar_events.metadata` jsonb
  + are emitted via Socket.IO — must round-trip cleanly through JSON)
- No clear contract for what WorldState deltas a given event can produce

### Constraints

- All event payloads must be JSON-serialisable (no `Map`, no class instances,
  no functions). Per control-manifest cross-cutting rule.
- Adding a new event type must require ONE place to change: the discriminated
  union. The resolver, HUD, and tests must then fail-to-compile until each
  is updated.
- Defaults: every player-decision event must have a `defaultOption` for the
  timeout case (per ADR-013 timeout job pattern; reused here for non-match
  decisions).
- Determinism: no event resolution function calls `Math.random()` or
  `Date.now()`. Optional rolls go through `ctx.rng()` from the caller.

### Requirements

The event-system module must provide:

1. A discriminated union `EventDecisionPayload` covering all MVP event types.
2. A resolver function `resolveEvent(payload, choice, ctx) → Partial<WorldState>`
   that's exhaustive over the union.
3. Persistence shape for `calendar_events.metadata` — must store the
   discriminant + options so the HUD can render without code changes per
   event-type.
4. Default choice handler for timeout — every event has a deterministic
   default.
5. A typed event-emission helper for the HUD: `getRenderableEvent(event) →
   { kind, title, body, options }` consumed by the dramatic-event modal.

## Decision

**All special events use a discriminated union `EventDecisionPayload`. Each
variant carries: `kind` (string literal), `optionId` choices (typed), and
deltas computed by a pure resolver. The HUD reads the discriminant to pick
the right modal variant. Calendar events store the payload in
`calendar_events.metadata.payload` jsonb column.**

### TypeScript Schema (lives in `packages/shared/src/types/events.ts`)

```typescript
// Each event variant: kind + options + defaultOption
// Resolved deltas are computed by the resolver, not stored on the payload itself.

export type EventDecisionPayload =
  | BoardMeetingCrisisPayload
  | BoardMeetingQuiebraPayload
  | NominaFrozenOfferPayload
  | SponsorOfferPayload
  | SponsorRenewalPayload
  | ScandalResponsePayload
  | CorruptionCaughtPayload
  | AlcaldeMeetingPayload
  | CenaReconciliacionPayload
  | TransferOfferPayload
  | ExternalManagerOfferPayload
  | YouthPromotionPayload
  | StadiumUpgradeOfferPayload;

// ── Variants ──────────────────────────────────────────────────────────────

export interface BoardMeetingCrisisPayload {
  kind: 'board_meeting_crisis';
  reason: 'financial_crisis';  // economy:crisis ThresholdCrossing
  options: {
    accept_freeze: { label: string; description: string; };  // → NominaFrozenOfferPayload
    sell_player:   { label: string; description: string; };  // event-system flags a player to be sold; full lifecycle in player-management
    request_loan:  { label: string; description: string; };  // accepts -50€K loan; -5€K/wk for 20 weeks
  };
  defaultOption: 'request_loan';  // safest fallback if player times out
}

export interface BoardMeetingQuiebraPayload {
  kind: 'board_meeting_quiebra';
  reason: 'financial_collapse';  // economy:quiebra ThresholdCrossing
  options: {
    fire_sale:      { label: string; description: string; };  // sell 3 top players to refill balance
    accept_takeover:{ label: string; description: string; };  // new sponsor + management board; -25 reputation
    resign:         { label: string; description: string; };  // game-over for this playthrough (allowed in MVP)
  };
  defaultOption: 'accept_takeover';
}

export interface NominaFrozenOfferPayload {
  kind: 'nomina_frozen_offer';
  options: {
    freeze:    { label: 'Congelar nómina (8 sem.)'; description: 'Reduce salarios 25%, jugadores se enfadan.' };
    refuse:    { label: 'No congelar'; description: 'Mantener nómina y arriesgar Quiebra.' };
  };
  defaultOption: 'refuse';
}

export interface SponsorOfferPayload {
  kind: 'sponsor_offer';
  brand: string;             // e.g. "Pueblo Bakery"
  weeklyAmountEur: number;   // €K
  contractWeeks: number;     // typically 52 (1 season)
  qualityDelta: number;      // increment to sponsor_quality
  options: {
    accept: { label: string; description: string; };
    reject: { label: string; description: string; };
  };
  defaultOption: 'reject';
}

export interface SponsorRenewalPayload {
  kind: 'sponsor_renewal';
  currentBrand: string;
  proposedWeeklyAmountEur: number;
  proposedContractWeeks: number;
  options: {
    renew:    { label: string; description: string; };
    decline:  { label: string; description: string; };  // sponsor leaves; sponsor_quality → 0
  };
  defaultOption: 'renew';
}

export interface ScandalResponsePayload {
  kind: 'scandal_response';
  // Triggered by event-system AC-EVT-22; ref to scandal type
  scandalType: 'tax_evasion' | 'corruption' | 'misconduct';
  severity: 'minor' | 'major';
  options: {
    cooperate:    { label: 'Cooperar (multa €30K)'; description: string; };  // per W-05 closure: flat 30K€ intentional
    deny:         { label: 'Negar (riesgo escándalo público)'; description: string; };
  };
  defaultOption: 'cooperate';
}

export interface CorruptionCaughtPayload {
  kind: 'corruption_caught';
  // Triggered by corruption_exposure ≥ 80 BLOCKING crossing (cascade-engine.md C18)
  exposureLevel: number;  // pre-event exposure value
  options: {
    accept_consequences: { label: string; description: string; };  // sponsor cancels (per ADR-014); fan_momentum -25
    bribe_officials:     { label: string; description: string; };  // tactical: corruption_exposure → 60 (still risky); -€80K
  };
  defaultOption: 'accept_consequences';
}

export interface AlcaldeMeetingPayload {
  kind: 'alcalde_meeting';
  city: string;            // visiting club's city
  fromClubId: string;      // the inviting club
  jobOffered: { tier: 1 | 2 | 3; description: string; };
  options: {
    accept_offer: { label: string; description: string; };  // manager-rpg career event — reputation milestone
    polite_decline: { label: string; description: string; };  // +small reputation gain
    rude_decline: { label: string; description: string; };  // -small reputation, but reusable as memory token
  };
  defaultOption: 'polite_decline';
}

export interface CenaReconciliacionPayload {
  kind: 'cena_reconciliacion';
  withClubId: string;      // rival club we previously soured
  options: {
    accept: { label: string; description: string; };  // -€10K, +rep with that club
    refuse: { label: string; description: string; };  // no effect, mild flavor
  };
  defaultOption: 'refuse';
}

export interface TransferOfferPayload {
  kind: 'transfer_offer';
  playerId: string;
  fromClubId: string;       // offering club
  offerEur: number;         // €K
  options: {
    accept: { label: string; description: string; };
    reject: { label: string; description: string; };
    counter: { label: string; description: string; counterEur?: number; };  // optional manual counter
  };
  defaultOption: 'reject';
}

export interface ExternalManagerOfferPayload {
  kind: 'external_manager_offer';
  fromClubId: string;
  divisionTier: 1 | 2;
  reasonHook: string;       // narrative hook: "te recuerda de Liga Cascada..."
  options: {
    accept:  { label: string; description: string; };  // game-end-of-arc for current playthrough; manager-rpg reputation milestone
    decline: { label: string; description: string; };
  };
  defaultOption: 'decline';
}

export interface YouthPromotionPayload {
  kind: 'youth_promotion';
  playerId: string;          // youth team player to promote
  potentialRating: number;   // [0,100]
  options: {
    promote: { label: string; description: string; };  // adds to first team
    keep_youth: { label: string; description: string; };  // stays in youth
  };
  defaultOption: 'keep_youth';
}

export interface StadiumUpgradeOfferPayload {
  kind: 'stadium_upgrade_offer';
  proposedCapacity: number;
  costEur: number;            // €K
  options: {
    accept: { label: string; description: string; };
    decline: { label: string; description: string; };
  };
  defaultOption: 'decline';
}
```

### Resolver Function

```typescript
// packages/shared/src/sim/event-resolver.ts

interface EventResolveContext {
  rng: () => number;             // ctx.rng() — never Math.random()
  prevState: Readonly<WorldState>;
  currentWeek: number;
  playerClubId: string;
}

type EventChoiceId<P extends EventDecisionPayload> = keyof P['options'];

export function resolveEvent<P extends EventDecisionPayload>(
  payload: P,
  choice: EventChoiceId<P>,
  ctx: EventResolveContext,
): { deltas: Partial<WorldState>; sideEffects: SideEffect[] } {
  switch (payload.kind) {
    case 'board_meeting_crisis': return resolveBoardMeetingCrisis(payload, choice as string, ctx);
    case 'board_meeting_quiebra': return resolveBoardMeetingQuiebra(payload, choice as string, ctx);
    case 'nomina_frozen_offer': return resolveNominaFrozen(payload, choice as string, ctx);
    case 'sponsor_offer': return resolveSponsorOffer(payload, choice as string, ctx);
    case 'sponsor_renewal': return resolveSponsorRenewal(payload, choice as string, ctx);
    case 'scandal_response': return resolveScandalResponse(payload, choice as string, ctx);
    case 'corruption_caught': return resolveCorruptionCaught(payload, choice as string, ctx);
    case 'alcalde_meeting': return resolveAlcaldeMeeting(payload, choice as string, ctx);
    case 'cena_reconciliacion': return resolveCenaReconciliacion(payload, choice as string, ctx);
    case 'transfer_offer': return resolveTransferOffer(payload, choice as string, ctx);
    case 'external_manager_offer': return resolveExternalManagerOffer(payload, choice as string, ctx);
    case 'youth_promotion': return resolveYouthPromotion(payload, choice as string, ctx);
    case 'stadium_upgrade_offer': return resolveStadiumUpgrade(payload, choice as string, ctx);
    default: {
      // Exhaustiveness check — TypeScript will error if a variant is missed
      const _exhaustive: never = payload;
      throw new Error(`Unhandled event kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

interface SideEffect {
  kind: 'spawn_event' | 'set_counter' | 'flag_player_for_sale';
  // ... narrow per kind
}
```

### Persistence Shape

In `calendar_events.metadata` (jsonb column per ADR-008):

```typescript
interface CalendarEventMetadata {
  // For special events with player decisions:
  decisionPayload?: EventDecisionPayload;
  // For ordinary scheduled events (fixtures, festivals):
  fixtureId?: string;
  festivalKind?: 'barrio' | 'derbi' | 'final';
  // Common:
  resolvedAtWeek?: number;          // null if pending
  resolvedChoice?: string;          // the optionId picked
  resolvedDeltas?: Partial<WorldState>;  // for audit/replay
}
```

When the player resolves the event, the row is UPDATED in place (this is the
ONE exception to the append-only rule of ADR-005 — calendar_events are
mutable specifically for resolution tracking). Audit comes from the
combination of `resolvedChoice` + `resolvedDeltas` rather than from snapshot
diffing.

### HUD Rendering Contract

The HUD imports the `EventDecisionPayload` type and uses the `kind` field
to pick the right modal variant. Each modal:

- Renders `payload.options` as button group (per ADR-017 input control taxonomy)
- Highlights `payload.defaultOption` with a "(por defecto)" suffix
- POSTs `{ optionId }` to `/api/events/:eventId/decide` → server invokes
  `resolveEvent` and applies deltas in Step 3 of the next tick

For the slice's match-modal pattern (10s countdown + skip), special events
use the same UX rules per OQ-HUD-12 (ADR-018).

## Alternatives Considered

### Alternative A: Free-form `metadata: Record<string, unknown>` payload

- **Description**: Don't type the events; let each event-handler stringify its
  own custom JSON.
- **Pros**: Maximum flexibility; events can be added without schema changes.
- **Cons**: No compile-time exhaustiveness; the HUD has to defensive-cast every
  payload; serialisation is lossy.
- **Rejection**: This is the status quo from the slice (which used hardcoded
  modals). It does not scale to ~13 MVP event types + future v1.1/v1.2 events.

### Alternative B: Class hierarchy with virtual `resolve()`

- **Description**: Each event variant is a class with an instance method
  `resolve(choice, ctx) → deltas`.
- **Pros**: Encapsulates resolution next to data.
- **Cons**: Classes don't JSON-serialise round-trip cleanly (instance methods
  are lost). Forces ad-hoc serialise/deserialise. Conflicts with the JSON-only
  payload constraint.
- **Rejection**: Discriminated unions + external resolver is the idiomatic
  TypeScript pattern when JSON round-trip is required.

### Alternative C: Event-sourced ledger (each event becomes a row of immutable history)

- **Description**: Like Alternative A from ADR-014: every event resolution is
  a row in an `event_ledger` table.
- **Pros**: Full replay; multi-version analytics.
- **Cons**: Doubles the storage cost. The `calendar_events` table already
  serves as the audit trail with `resolved*` fields.
- **Rejection**: Same reasoning as ADR-014 Alternative A — MVP-scope cost
  doesn't pay back.

## Consequences

### Positive

- Compile-time exhaustiveness for all event types (TS `never` check)
- Adding a new event type forces 3 places to update: union variant, resolver
  switch, HUD modal — the missed-update fails to compile
- HUD modal logic stays generic via the discriminant pattern (one component
  per `kind`, no central if/else)
- JSON round-trip works cleanly (no class instances)
- Determinism preserved — resolvers are pure functions of `(payload, choice,
  ctx)` and `ctx.rng` is the only randomness source

### Negative

- One central file (`packages/shared/src/types/events.ts`) lists all 13 variants
  — large file but manageable; clear ownership
- Adding a v1.1+ event type requires editing this file even though the rest
  of v1.1 might be modular — acceptable for the safety the type brings

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Variant drift between `EventDecisionPayload` and `calendar_events.metadata` storage | LOW | MEDIUM | Drizzle column is typed `jsonb $type<CalendarEventMetadata>()`; Zod schema validates on read (control-manifest cross-cutting rule). |
| Resolver bug producing inconsistent deltas (e.g., `corruption_caught.bribe_officials` clamping wrong) | MEDIUM | MEDIUM | Each variant gets a unit test exercising all option branches; default fallback always tested separately. |
| Event timing race when BLOCKING crossing fires + advance() is mid-flight | LOW | HIGH | Inherited from ADR-008's design — advance() halts at Step 5 (threshold detection); event response is the next call. No mid-tick events. |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| event-system.md catalog | All 13 MVP event variants typed | `EventDecisionPayload` discriminated union |
| event-system.md §4 | Special PlayerDecisions write WorldState via Step 3 | Resolver returns `Partial<WorldState>` that `advance()` injects into Step 3 |
| event-system.md §5 BLOCKING events | Forced events from ThresholdCrossings | `board_meeting_crisis`, `board_meeting_quiebra`, `corruption_caught` ← cascade-engine crossings |
| event-system.md W-05 closure (scandal cooperate flat 30K€) | `scandal_response.options.cooperate` carries the flat amount in description; resolver applies -30K€ to balance |
| economy.md §7.1 | Congelación de nómina catch-up | `NominaFrozenOfferPayload` + resolver applies wage freeze + happiness penalty |
| manager-rpg.md AC-RPG-15 (external offers) | Manager-RPG career event for cross-club offers | `ExternalManagerOfferPayload` + resolver applies reputation deltas |
| cascade-engine.md C18 (corruption scandal BLOCKING) | Player must respond to corruption_exposure ≥ 80 | `CorruptionCaughtPayload` triggered by the crossing |
| staff-system.md AC-STAFF-24 (calendar messages tier ≥ 2) | Staff messages reference upcoming events | Staff handler reads `calendar_events` table; tier ≥ 2 staff get the `decisionPayload.kind` for context |

## Performance Implications

- **CPU**: `resolveEvent` is a switch + simple arithmetic per variant. O(1). <0.1ms.
- **Memory**: Discriminated union types are erased at runtime — only the
  variant's specific fields exist in memory.
- **DB**: `calendar_events.metadata` jsonb is already in ADR-008's schema; no
  new column. Estimated row size: ~200-500 bytes per event with payload.
- **Network**: Event resolution payload to Socket.IO: ~300 bytes typical;
  trivial.

## Related Decisions

- [ADR-003](ADR-003-cascade-graph-topology.md) — Step 3 PlayerDecision contract
- [ADR-008](ADR-008-world-clock-event-loop.md) — `advance()` loop; calendar_events table; ThresholdCrossings
- [ADR-009](ADR-009-staff-message-routing.md) — Staff calendar messages tier-gated (consume this schema)
- [ADR-010](ADR-010-manager-rpg-progression.md) — Career events use ExternalManagerOffer / AlcaldeMeeting variants
- [ADR-014](ADR-014-economy-financial-flow.md) — Bankruptcy crossings trigger board-meeting events; sponsor lifecycle uses SponsorOffer / SponsorRenewal
- `design/gdd/event-system.md` — Source of event catalog
