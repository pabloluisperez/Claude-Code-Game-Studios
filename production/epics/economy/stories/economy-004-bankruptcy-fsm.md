---
Story: ECONOMY-004
Status: Complete
Type: Logic
GDD Requirement: TR-ECO-004 (bankruptcy FSM: healthy → at_risk → crisis → bankrupt)
Governing ADR: ADR-014
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/economy/bankruptcy.test.ts
---

# Story 004: Bankruptcy FSM (3 ThresholdCrossings)

> **Epic**: economy | **Layer**: Core | **Type**: Logic | **Estimate**: 1d

## Scope
- States: `healthy | at_risk | crisis | bankrupt`
- Thresholds (€K):
  - balance < 0 → at_risk
  - cumulative cashflow_4w_avg < -5 €K → crisis
  - balance < -20 €K → bankrupt (terminal)
- Transitions only on weekly tick; emit `ThresholdCrossing` event per transition

## ACs
- [ ] AC-ECO-23: at_risk triggered when balance < 0
- [ ] AC-ECO-25: crisis triggered when 4-week negative cashflow trend
- [ ] AC-ECO-27: bankrupt is terminal (no recovery in MVP — flagged for v1.1+)
- [ ] Crossings emitted to event-system

## Dependencies
- Story 002 + 003 (revenue/cost data)
