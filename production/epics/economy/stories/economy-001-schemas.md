---
Story: ECONOMY-001
Status: Complete
Type: Integration
GDD Requirement: TR-ECO-001 (sponsors table + ledger schemas per ADR-014)
Governing ADR: ADR-014 (Financial Flow + Bankruptcy)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/economy/db-schema.test.ts
---

# Story 001: Sponsors + Financial Ledger Schemas

> **Epic**: economy | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `sponsors` table: id, playthrough_id FK, club_id FK, tier (1-3), weekly_eur_k, started_week, ends_week, status ('active'|'cancelled'|'expired'), reason
- `financial_ledger` table: id, playthrough_id, week, club_id, kind ('revenue'|'cost'), category, amount_eur_k, created_at
- Balance + bankruptcy state stored on `clubs` table (extend existing): add `balance_eur_k int`, `bankruptcy_state text default 'healthy'`.

## ACs
- [ ] Schemas defined; migration generated and applied.
- [ ] FKs cascade on club delete.
- [ ] Index on `(playthroughId, week)` for ledger queries.

## Dependencies
- Upstream: playthroughs + clubs ✓
- Unlocks: all economy stories
