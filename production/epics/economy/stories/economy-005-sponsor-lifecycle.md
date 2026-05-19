---
Story: ECONOMY-005
Status: Ready
Type: Integration
GDD Requirement: TR-ECO-005 (sponsor signing + cancellation; scandal trigger)
Governing ADR: ADR-014
Control Manifest: 2026-05-19
Test Evidence: tests/integration/economy/sponsors.test.ts
---

# Story 005: Sponsor Lifecycle

> **Epic**: economy | **Layer**: Core | **Type**: Integration | **Estimate**: 1d

## Scope
- `signSponsor(tx, args)`: insert sponsor row with status='active'
- `cancelSponsor(tx, sponsorId, reason)`: status='cancelled'
- Scandal trigger (from cascade-engine corruption_exposure ≥ 80): auto-cancel all sponsors with reason='scandal'
- Expiry: weekly tick checks `endsWeek` and marks expired

## ACs
- [ ] AC-ECO-17: New sponsor inserted with weekly_eur_k > 0
- [ ] AC-ECO-22: Scandal threshold → all sponsors cancelled with reason='scandal'
- [ ] Expiry handled in advance() tick

## Dependencies
- Story 001 (sponsors table), event-system (ThresholdCrossing consumer)
