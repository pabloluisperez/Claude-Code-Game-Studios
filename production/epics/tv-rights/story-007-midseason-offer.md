# Story 007: F-TV2 Midseason Offer + Cancellation Events

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Logic
> **Estimate**: M (3h — F-TV2 rate + idempotence + boundary tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-005`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md) + [ADR-015: Special Event Decision Schema](../../../docs/architecture/ADR-015-special-event-decision-schema.md)
**ADR Decision Summary**: F-TV2 midseason offer uses TIER_BELOW[cancelled_tier] and a 70% penalty factor on `current_division` (not division_at_signing). STOP event generated only if current_week≤35. Idempotent via UNIQUE partial index (Story 001). `TVMidseasonOfferPayload` extends ADR-015 union.

**Engine**: Web stack | **Risk**: LOW

**Control Manifest Rules (Feature layer)**:
- Required: Event-system writes WorldState only via cascade decisions — tv_midseason_offer is a STOP event, not a direct state mutation.
- Forbidden: Re-evaluating unlock conditions for midseason offers (tier is always TIER_BELOW, no reputation/division re-check).

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-10**: NACIONAL ACTIVE cancelled week≤35 → CANCELLED + midseason offer tier=REGIONAL + one event generated. Assert idempotent: 3 additional ticks with corruption≥60 → COUNT(tv_midseason_offer, season_id)=1 (unique index prevents duplicates)
- [ ] **AC-TV-11**: ACTIVE cancelled week>35 → CANCELLED, no midseason offer, club finishes with rate=0
- [ ] **AC-TV-14**: Cancellation at week 20 → midseason contract covers 38-20=18 weeks from week 21
- [ ] **AC-TV-20**: current_week=35 (exactly) → midseason offer generated (3 weeks remaining, same branch as AC-TV-10). current_week=36 → no midseason offer (same branch as AC-TV-11)
- [ ] **AC-TV-23**: REGIONAL cancelled week 25 → midseason LOCAL, tarifa D2: `Math.round(53×100×70/10000)/100 = 37/100 = 0.37 €K/sem`; D1: 0.50 €K/sem; duration=38-25=13 semanas; duration_seasons=1
- [ ] **AC-TV-24**: CANCELLED with tv_midseason_offer active → player rejects → tv_contract_status remains CANCELLED (no change), fan_loyalty=min(50,X+10), event consumed=true, advance unblocked
- [ ] **AC-TV-25**: tv_contract_status=CANCELLED at season_start S+1 → NONE + new tv_auction generated

---

## Implementation Notes

*Derived from GDD F-TV2 + ADR-019 §5 + ADR-015 payload extension:*

Location: `apps/api/src/modules/tv-rights/midseason-offer.ts`

```typescript
const TIER_BELOW: Record<TVTier, TVTier> = {
  NACIONAL: 'REGIONAL',
  REGIONAL: 'LOCAL',
  LOCAL: 'LOCAL',  // materialised only by cascade injection (AC-TV-47)
}
const MID_SEASON_PENALTY_FACTOR_CENTS = 70

export function calculateMidseasonRate(
  midseasonTier: TVTier,
  currentDivision: 'D1' | 'D2',
): number {
  return Math.round(
    TV_BASE_CENTS[midseasonTier] * DIVISION_MULTIPLIER_CENTS[currentDivision] * MID_SEASON_PENALTY_FACTOR_CENTS / 10000
  ) / 100
}

export function buildMidseasonOffer(
  cancelledTier: TVTier,
  currentWeek: number,
  currentDivision: 'D1' | 'D2',
): TVMidseasonOfferPayload | null {
  if (currentWeek > MIDSEASON_OFFER_MIN_WEEKS_REMAINING_CUTOFF) return null
  const midTier = TIER_BELOW[cancelledTier]
  const rate = calculateMidseasonRate(midTier, currentDivision)
  const weeksRemaining = 38 - currentWeek
  return {
    type: 'tv_midseason_offer',
    seasonId: ...,
    cancelledTier,
    offer: { tier: midTier, weeklyRateEurK: rate, weeksRemaining, currentDivision },
    defaultOption: 'reject',
  }
}
```

The STOP event is inserted by `advance()` (Story 006) when `buildMidseasonOffer` returns non-null. Rejection of tv_midseason_offer goes through `POST /api/tv/reject` (Story 004) — fan_loyalty +10, status remains CANCELLED.

---

## Out of Scope

- [Story 006]: Cancellation detection (this story provides the payload builder; Story 006 calls it)
- [Story 004]: Rejection endpoint (fan_loyalty increment when rejecting midseason offer)

---

## QA Test Cases

*Logic (rate formula) + Integration (event generation + unique constraint).*

- **AC-TV-23**: F-TV2 rates
  - Given: cancelled REGIONAL, D2, week=25
  - When: calculateMidseasonRate('LOCAL', 'D2')
  - Then: 0.37 (Math.round(53×100×70/10000)/100 = Math.round(37.1)/100 = 37/100)
  - Edge cases: NACIONAL cancelled D1 → REGIONAL mid → Math.round(175×135×70/10000)/100 = 165/100 = 1.65

- **AC-TV-20**: Week boundary
  - Given: week=35 → buildMidseasonOffer returns payload (weeksRemaining=3)
  - Given: week=36 → buildMidseasonOffer returns null

- **AC-TV-10**: Idempotent generation
  - Given: NACIONAL cancelled week=10, calendar_events already has tv_midseason_offer for this season
  - When: attempt second INSERT (retry scenario)
  - Then: unique_violation from partial index; ON CONFLICT DO NOTHING → count remains 1

- **AC-TV-24**: Rejection of tv_midseason_offer
  - Given: tv_contract_status=CANCELLED, tv_midseason_offer pending
  - When: POST /api/tv/reject { offerId: midseason_event_id }
  - Then: status=CANCELLED (unchanged), fan_loyalty+=10, consumed=true, advance unblocked

- **AC-TV-25**: CANCELLED reset at season_start
  - Given: tv_contract_status=CANCELLED after season end
  - When: season_start S+1
  - Then: tv_contract_status=NONE; new tv_auction generated for season S+1

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/api/tests/tv-rights/midseason-offer.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 006 (tick order integration — this story's builder is called by prePhase/postPhase)
- Unlocks: Story 008 (season lifecycle handles CANCELLED reset), Story 009 (cashflow after midseason offer)
