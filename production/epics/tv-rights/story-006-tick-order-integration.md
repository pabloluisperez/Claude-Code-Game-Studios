# Story 006: Tick Order Integration (applyTVPrePhase + applyTVPostPhase)

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L (4-5h — advance() integration, two-sub-phase wiring, 6 integration tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-004` + `TR-TVR-010`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md) + [ADR-008: World Clock + Event Loop](../../../docs/architecture/ADR-008-world-clock-event-loop.md)
**ADR Decision Summary**: TV tick integrates as two pure sub-phases within `advance()`: `applyTVPrePhase()` (pasos 1-5, before cascade) and `applyTVPostPhase()` (pasos 6-8, after cascade). Revenue is computed in paso 5; F-TV3 cancellation (paso 4) gives revenue=0, cascade cancellation (paso 8) preserves revenue. Both functions are pure — the caller (advance()) persists state.

**Engine**: Web stack | **Risk**: LOW
**Engine Notes**: advance() is synchronous TypeScript per ADR-008. Both sub-phases run within the same DB transaction as the cascade tick. externalDelta from cascade-engine must be passed through `roundCorruption()` before paso 6 arithmetic (ADR-019 invariant).

**Control Manifest Rules (Feature layer + Foundation)**:
- Required: Transactional advance() pipeline — TV phase changes must be within the same db.transaction() as snapshot + currentWeek bump.
- Required: Event-system writes WorldState only via cascade decisions parameter (ADR-008) — TV revenue enters cashflow via TVPrePhaseResult, not side-channel.
- Forbidden: Side effects in pure phase functions (applyTVPrePhase/PostPhase must be pure).

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-22b**: Tick with NACIONAL ACTIVE, corruption=59.0 → step 2: 59.0+1.5=60.5≥60 → CANCELLED, revenue=0. With corruption=58.0 → 58.0+1.5=59.5<60 → ACTIVE, revenue=7.16. (Ordering: cancel in paso 4 before revenue paso 5)
- [ ] **AC-TV-29**: REGIONAL ACTIVE, corruption=59.5 → delta +0.5 → new=60.0≥60 → CANCELLED, revenue TV tick=0
- [ ] **AC-TV-39**: NACIONAL week 38, corruption=59.5 → threshold crossed → CANCELLED (not EXPIRED), no midseason offer (week 38>35), revenue=0. season_end: CANCELLED no-op. season_start S+1: NONE + tv_auction
- [ ] **AC-TV-40**: NACIONAL ACTIVE, corruption=57.0 → paso 2: 57.0+1.5=58.5 (no TV threshold); paso 5: revenue=7.16; cascade injects externalDelta=+4 → 58.5+4=62.5≥60 → threshold_cascade; paso 8: CANCELLED. Revenue of this tick=7.16 (preserved from paso 5). Next tick: revenue=0. Asymmetry verified.
- [ ] **AC-TV-47**: LOCAL ACTIVE, corruption=58.0, week=20; paso 2: 58.0-0.5=57.5 (no TV threshold); cascade +4.0 → 57.5+4=61.5≥60 → threshold_cascade; CANCELLED; midseason offer generated with tier=LOCAL (TIER_BELOW[LOCAL]=LOCAL)
- [ ] **AC-TV-52**: NACIONAL, corruption=3.0 at start of season → cancels in week 38 (3.0+38×1.5=60.0≥60); corruption=2.9 → survives (2.9+38×1.5=59.9<60, ACTIVE→EXPIRED normally)

---

## Implementation Notes

*Derived from ADR-019 §4 (TV Tick Integration):*

Location: `apps/api/src/modules/tv-rights/tv-tick.ts`

```typescript
export function applyTVPrePhase(
  contract: TVContract | null,
  prevCorruption: number,
  currentWeek: number,
  currentDivision: 'D1' | 'D2',
): TVPrePhaseResult {
  if (!contract || contract.status !== 'ACTIVE') {
    return { revenue: 0, newStatus: contract?.status ?? 'NONE', corruptionAfterTV: prevCorruption }
  }
  // paso 2: F-TV3 delta
  const newCorruption = applyTVCorruptionDelta(contract.tier, prevCorruption, 'ACTIVE')
  // paso 3: threshold check
  const crossedTV = evaluateThresholdCrossings(prevCorruption, newCorruption, TV_SCANDAL_THRESHOLD)
  // paso 4: cancellation
  if (crossedTV) {
    const midseasonOffer = currentWeek <= MIDSEASON_OFFER_MIN_WEEKS_REMAINING_CUTOFF  // 35
      ? buildMidseasonOffer(contract, currentWeek, currentDivision) : undefined
    return { revenue: 0, newStatus: 'CANCELLED', corruptionAfterTV: newCorruption, midseasonOffer }
  }
  // paso 5: revenue
  const revenue = parseFloat(contract.weeklyRateEurK)
  return { revenue, newStatus: 'ACTIVE', corruptionAfterTV: newCorruption }
}

export function applyTVPostPhase(
  contract: TVContract | null,
  corruptionAfterTV: number,
  externalDelta: number,
  currentWeek: number,
  currentDivision: 'D1' | 'D2',
): TVPostPhaseResult {
  if (!contract || contract.status !== 'ACTIVE') {
    const safeExternal = roundCorruption(externalDelta)
    const postCascade = roundCorruption(Math.min(CORRUPTION_MAX, Math.max(0, corruptionAfterTV + safeExternal)))
    return { corruptionFinal: postCascade, cancelledByCascade: false }
  }
  // paso 6: cascade injection — externalDelta MUST be rounded before use
  const safeExternal = roundCorruption(externalDelta)
  const postCascade = roundCorruption(Math.min(CORRUPTION_MAX, Math.max(0, corruptionAfterTV + safeExternal)))
  // paso 7: threshold check post-cascade
  const crossedCascade = evaluateThresholdCrossings(corruptionAfterTV, postCascade, TV_SCANDAL_THRESHOLD)
  if (crossedCascade) {
    const midseasonOffer = currentWeek <= 35
      ? buildMidseasonOffer(contract, currentWeek, currentDivision) : undefined
    return { corruptionFinal: postCascade, cancelledByCascade: true, midseasonOffer }
  }
  return { corruptionFinal: postCascade, cancelledByCascade: false }
}
```

Integration in `advance()` for week W (after match outcome, before economy cashflow):
1. Load tvContract
2. Call `applyTVPrePhase(contract, prevCorruption, week, division)` → `preResult`
3. Run cascade tick → get `externalDelta` (corruption injection from cascade graph)
4. Call `applyTVPostPhase(updatedContract, preResult.corruptionAfterTV, externalDelta, week, division)` → `postResult`
5. Apply `preResult.revenue` to cashflow (economy phase)
6. Persist: update `tv_contracts.status`, `tv_contracts.cancelledAt/cancelledReason`, update `corruption_exposure` in WorldState
7. Insert midseason offer event if generated (UNIQUE index prevents duplicates on retry)

---

## Out of Scope

- [Story 005]: The pure delta/threshold functions (must be DONE first)
- [Story 007]: Full midseason offer flow (this story generates the event; Story 007 handles resolution)
- [Story 009]: Cashflow integration (revenue from preResult enters cashflow — Story 009 wires that)

---

## QA Test Cases

*Integration — requires advance() pipeline, real DB transaction.*

- **AC-TV-22b**: Revenue ordering (F-TV3 cancel = revenue 0)
  - Given: NACIONAL ACTIVE D1, corruption=59.0, week=10
  - When: applyTVPrePhase runs (corruption 59.0 + 1.5 = 60.5 ≥ 60)
  - Then: revenue=0, newStatus='CANCELLED' (cancel in paso 4, before paso 5)
  - Contrast: corruption=58.0 → revenue=7.16, status='ACTIVE'

- **AC-TV-40**: Revenue asymmetry (cascade cancel = revenue preserved)
  - Given: NACIONAL ACTIVE D1, corruption=57.0, week=10
  - When: full tick — prePhase (57.0+1.5=58.5, no threshold), cascade externalDelta=+4, postPhase (58.5+4=62.5 ≥ 60)
  - Then: prePhase revenue=7.16 (preserved); postPhase CANCELLED; next tick revenue=0

- **AC-TV-47**: LOCAL cancelled by cascade (not by F-TV3)
  - Given: LOCAL ACTIVE, corruption=58.0, week=20
  - When: prePhase (58.0-0.5=57.5, no TV crossing); cascade externalDelta=+4; postPhase (57.5+4=61.5 ≥ 60)
  - Then: CANCELLED; midseason offer generated with tier='LOCAL' (TIER_BELOW[LOCAL]=LOCAL); week=20≤35

- **AC-TV-39**: Week-38 race condition
  - Given: NACIONAL, corruption=59.5, week=38
  - When: full tick (59.5+1.5=61.0 ≥ 60 → CANCELLED in prePhase)
  - Then: status=CANCELLED (not EXPIRED); no midseason offer (week 38 > 35); season_end no-op; season_start S+1 → NONE + tv_auction

- **AC-TV-52**: NACIONAL cliff boundary tests
  - Given: corruption=3.0 at week 1 → runs 38 ticks → final corruption=60.0 → cancels in week 38 (revenue=0)
  - Given: corruption=2.9 at week 1 → runs 38 ticks → final=59.9 → ACTIVE→EXPIRED (no cancellation)

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `packages/api/tests/tv-rights/tick-order.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 005 (applyTVCorruptionDelta + evaluateThresholdCrossings must be DONE)
- Unlocks: Story 007 (midseason offer), Story 008 (season lifecycle), Story 009 (cashflow integration uses preResult.revenue)
