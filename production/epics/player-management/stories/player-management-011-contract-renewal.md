---
Story: PLAYER-MANAGEMENT-011
Status: Complete
Last Updated: 2026-05-19
Type: Integration
GDD Requirement: TR-PM-011 (Contract renewal pipeline — 8-week warning + ContractRenewalOffer event)
Governing ADR: ADR-016 (Player Lifecycle), ADR-015 (EventDecisionPayload union — ContractRenewalOfferPayload)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/player-management/contract-renewal.test.ts
---

# Story 011: Contract Renewal Pipeline

> **Epic**: player-management
> **Layer**: Core
> **Type**: Integration
> **Estimate**: 1 day
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-011` — When a player contract has ≤8 weeks remaining, emit `ContractRenewalOffer` STOP event. Resolve accept/decline/counter. Expiry: player leaves club free.

**ADR Governing Implementation**: ADR-016 + ADR-015 (ContractRenewalOfferPayload — new EventDecisionPayload variant)
**ADR Decision Summary**: Contract renewal is event-driven. At season_end, scan players with `contractEndWeek ≤ currentWeek + 8`; emit one `ContractRenewalOffer` event per player per renewal window. Resolution applies to `players.salaryEurK` + `players.contractEndWeek`, or flags `availability='leaving'`.

**Control Manifest Rules**:
- Required: EventDecisionPayload union extended with `ContractRenewalOfferPayload` variant (ADR-015)
- Required: One Drizzle transaction per renewal resolution (atomic)

## Acceptance Criteria

- [ ] `ADR-015`'s `EventDecisionPayload` union is extended with `ContractRenewalOfferPayload` (as specified in ADR-016 §Contract Renewal Pipeline).
- [ ] `scanContractRenewals(playthroughId, currentWeek)` returns all players where `contractEndWeek ≤ currentWeek + 8`.
- [ ] For each player found: `emitContractRenewalOffer(tx, player, proposedSalary, currentWeek)` inserts a `calendar_events` row with `type='contract_renewal_offer'` payload.
- [ ] Accept decision: `resolveContractRenewal(tx, playerId, 'accept', proposedSalary, contractWeeks=104)` → updates `salaryEurK`, `contractEndWeek`.
- [ ] Decline decision: `resolveContractRenewal(tx, playerId, 'decline')` → sets `availability='leaving'`. Player leaves free at `contractEndWeek`.
- [ ] Counter decision: `resolveContractRenewal(tx, playerId, 'counter', counterSalary, 104)` → updates salary to `counterSalary` if ≤ market_wage × 1.5; else sets `availability='leaving'`.
- [ ] Default decision (timeout): same as 'decline'.
- [ ] `tsc --noEmit` clean after adding `ContractRenewalOfferPayload` to ADR-015's union type.

## Implementation Notes

File: `apps/api/src/modules/players/contract-service.ts`

The `ContractRenewalOfferPayload` shape is defined in ADR-016 §Contract Renewal Pipeline (see the exact interface). Add it to the discriminated union in `packages/shared/src/sim/sports/football/football-types.ts` or wherever `EventDecisionPayload` is defined.

## Out of Scope

- Generating AI club offers for manager's players (different event flow)
- Youth promotion events (v1.1+)

## QA Test Cases

- **AC-1**: Player with `contractEndWeek = currentWeek + 6` appears in `scanContractRenewals`; player with `contractEndWeek = currentWeek + 9` does NOT.
- **AC-2**: `emitContractRenewalOffer` inserts a calendar_events row with correct `type` and player payload.
- **AC-3**: Accept resolution → `salaryEurK` and `contractEndWeek` updated in DB.
- **AC-4**: Decline resolution → `availability='leaving'` set in DB.
- **AC-5**: Default timeout resolution → same as decline.
- **AC-6**: Transaction rollback: simulate DB failure during resolution → no partial writes.

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/player-management/contract-renewal.test.ts` against real Postgres (port 5433)

## Dependencies

- Depends on: Story 002 (PlayersRepo), Story 007 (market wage used in counter-offer validation)
- Unlocks: economy epic (payroll calculation reads updated salary)
