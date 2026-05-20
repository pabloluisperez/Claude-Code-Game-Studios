# Story 008: Multi-Year Rollover + Season Lifecycle

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L (4-5h — season_end/season_start processing, multi-year rollover, 10 integration tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-006`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md) + [ADR-005: WorldState Persistence](../../../docs/architecture/ADR-005-worldstate-persistence.md)
**ADR Decision Summary**: Season rollover (season_in_contract += 1) and season reset (EXPIRED/CANCELLED → NONE) run synchronously within advance() for week 38 — no separate BullMQ job. Tarifa immutable: `division_at_signing` never recalculated on rollover. Corruption does NOT reset between multi-year seasons.

**Engine**: Web stack | **Risk**: LOW
**Engine Notes**: season_end processing happens synchronously after the full 8-step TV tick for week 38 within advance(). season_start (next advance call after season_end) generates tv_auction if needed.

**Control Manifest Rules (Feature layer)**:
- Required: Promotion/relegation and season transitions must be atomic (Drizzle transaction).
- Required: WorldState snapshots are append-only (ADR-005) — TV state changes persist via updated tv_contracts row.
- Forbidden: Season service running outside a transaction.

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-13a**: ACTIVE, week 38, season_in_contract=duration_seasons → EXPIRED; season_start S+1 → NONE + tv_auction
- [ ] **AC-TV-13b**: ACTIVE, week 38, season_in_contract<duration_seasons (rollover) → season_end: ACTIVE persists, season_in_contract+=1, weekly_rate unchanged; season_start S+1: NO tv_auction generated
- [ ] **AC-TV-36**: REGIONAL 2yr season S (season_in_contract=1) → season_end S: ACTIVE, season_in_contract=2, no tv_auction in S+1
- [ ] **AC-TV-37**: REGIONAL 2yr season S+1 (season_in_contract=2=duration_seasons) → season_end S+1: EXPIRED; season_start S+2: NONE + tv_auction
- [ ] **AC-TV-38**: NACIONAL 1yr D1 (rate=7.16), descenso a D2 en semana 20 mid-season → rate=7.16 unchanged until semana 38 (division_at_signing immutable)
- [ ] **AC-TV-41**: NACIONAL 3yr cancelled en semana 20 de temporada S → CANCELLED, años 2 y 3 anulados, midseason REGIONAL generated; season_start S+1 → NONE + tv_auction (duration_seasons ignorado)
- [ ] **AC-TV-44**: REGIONAL 2yr firmado en D2 (rate=1.84), ascenso D2→D1 al final de S (rollover season_in_contract=2) → rate=1.84 unchanged (división at signing era D2 — trampa de ascenso)
- [ ] **AC-TV-45**: REGIONAL 2yr, corruption=0 al inicio T1 → season_end S: corruption=19.0 (38×0.5), contract ACTIVE (rollover). Tick 1 de T2 arranca desde 19.0 (sin reset)
- [ ] **AC-TV-48**: NACIONAL 3yr D2 (rate=5.83), ascenso D2→D1 al final S (rollover season_in_contract=2) → rate=5.83 unchanged
- [ ] **AC-TV-53**: NACIONAL 3yr, corruption=0 al inicio → T1 termina en 57.0 (38×1.5); T2 arranca en 57.0, cancela en semana 2 (57+2×1.5=60.0≥60); T3 nunca alcanzada

---

## Implementation Notes

*Derived from GDD Core Rules 5/5b + ADR-019 §4 (week 38 ordering):*

`processTVSeasonEnd(tx, playthroughId, seasonId)` — called within advance() for week 38, after tick:

```typescript
async function processTVSeasonEnd(tx, playthroughId, seasonId) {
  const contract = await TVRightsRepo.findContractForSeason(tx, playthroughId, seasonId)
  if (!contract) return

  if (contract.status === 'ACTIVE') {
    if (contract.seasonInContract < contract.durationSeasons) {
      // Rollover: increment without expiring
      await TVRightsRepo.incrementSeasonInContract(tx, contract.id)
      // No tv_auction generation for next season
    } else {
      // Final season: expire
      await TVRightsRepo.updateContractStatus(tx, contract.id, 'EXPIRED')
    }
  }
  // CANCELLED → no-op (reset happens at season_start)
}

async function processTVSeasonStart(tx, playthroughId, newSeasonId, ...) {
  const contract = await TVRightsRepo.findActiveContract(tx, playthroughId)

  // Reset EXPIRED/CANCELLED → NONE
  if (contract?.status === 'EXPIRED' || contract?.status === 'CANCELLED') {
    await TVRightsRepo.updateContractStatus(tx, contract.id, 'NONE')
  }

  // Generate tv_auction if no ACTIVE contract
  const activeContract = await TVRightsRepo.findActiveContract(tx, playthroughId)
  if (!activeContract || activeContract.status !== 'ACTIVE') {
    await generateTVAuction(tx, playthroughId, newSeasonId, ...)
  }
}
```

Key invariant: `division_at_signing` is NEVER updated on rollover. The rate is computed once at signing and stored as `weekly_rate_eur_k` — it stays frozen for all seasons of the contract.

---

## Out of Scope

- [Story 006]: Tick Order (cancellation detection that triggers in week 38)
- [Story 003]: tv_auction generation (this story calls it but doesn't implement it)

---

## QA Test Cases

*Integration — requires advance() + season_end + season_start pipeline.*

- **AC-TV-13a/13b**: Annual vs rollover expiry
  - Given: REGIONAL 1yr, season_end week=38 → EXPIRED; season_start → NONE + tv_auction
  - Given: REGIONAL 2yr, season_in_contract=1, season_end → ACTIVE, season_in_contract=2; season_start → NO tv_auction

- **AC-TV-38/44/48**: division_at_signing immutable
  - Given: REGIONAL 2yr signed in D2 (rate=1.84); league records promotion at season_end
  - When: rollover executes
  - Then: weekly_rate_eur_k=1.84 unchanged; divisionAtSigning='D2' unchanged

- **AC-TV-45**: Cross-season corruption not reset
  - Given: REGIONAL 2yr, corruption=0 at T1 start
  - When: 38 ticks pass (corruption reaches 19.0); season_end rollover
  - Then: corruption_exposure=19.0 at T2 week 1 (not reset to 0)

- **AC-TV-53**: NACIONAL 3yr always cancels T2
  - Given: NACIONAL 3yr, corruption=0 at T1 start
  - When: T1 completes (38×1.5=57.0, rollover), T2 tick 1 (57+1.5=58.5), tick 2 (58.5+1.5=60.0≥60)
  - Then: CANCELLED in T2 week 2; no T3

- **AC-TV-41**: Cancellation annuls remaining multi-year seasons
  - Given: NACIONAL 3yr, cancelled week 20 (CANCELLED + midseason offer)
  - When: season_start S+1
  - Then: NONE + tv_auction generated (as if contract was annual, not 3yr)

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `packages/api/tests/tv-rights/rollover-lifecycle.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 006 (tick order must be DONE — week 38 tick fires before season_end)
- Unlocks: Story 009 (cashflow correct after rollover), Story 011 (UI shows "Year N of M")
