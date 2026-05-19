---
Story: ECONOMY-007
Status: Complete
Type: Integration
GDD Requirement: TR-ECO-007 (advance() integrates economy)
Governing ADR: ADR-014
Control Manifest: 2026-05-19
Test Evidence: tests/integration/economy/advance-integration.test.ts
---

# Story 007: Economy Service Integration in advance()

> **Epic**: economy | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
File `apps/api/src/modules/economy/service.ts`:
- `processEconomyTick(tx, playthroughId, currentWeek)`:
  1. Compute weekly revenue + costs
  2. Update balance_eur_k on clubs
  3. Run bankruptcy FSM evaluation
  4. Emit ThresholdCrossings to event-system
  5. Insert ledger rows
- Called by advance-worker after match outcomes applied

## ACs
- [ ] All operations in a single Drizzle transaction
- [ ] Balance update + ledger insert atomic
- [ ] Bankruptcy FSM transitions emit events

## Dependencies
- Stories 002, 003, 004, 005
