---
Story: ECONOMY-006
Status: Complete
Type: Integration
GDD Requirement: TR-ECO-006 (Congelación de nómina catch-up event)
Governing ADR: ADR-014, ADR-015 (event-system)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/economy/payroll-freeze.test.ts
---

# Story 006: "Congelación de Nómina" Catch-Up Event

> **Epic**: economy | **Layer**: Core | **Type**: Integration | **Estimate**: 1d

## Scope
- When balance < 0 AND `bankruptcy_state = at_risk`: emit STOP event `payroll_freeze_offer`
- Manager decisions: `accept_freeze` (4 weeks of salary x 0.5) | `decline` (pay full + push toward crisis)
- Apply via PlayerDecision on players' salary multiplier

## ACs
- [ ] AC-ECO-29: Event fires exactly once per at_risk entry
- [ ] AC-ECO-31: Accept reduces payroll for 4 weeks
- [ ] AC-ECO-33: Decline incurs +5 €K extra payroll cost (penalty for "salaries paid late")

## Dependencies
- Story 004 (bankruptcy FSM), event-system (ADR-015 payload variant)
