---
Story: ECONOMY-008
Status: Ready
Type: Integration
GDD Requirement: TR-ECO-008 (Hono routes for finance panel reads)
Governing ADR: ADR-014, ADR-001 (Hono 4)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/economy/routes.test.ts
---

# Story 008: Hono Routes for Economy

> **Epic**: economy | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `GET /economy/:playthroughId/state` — returns balance, bankruptcy_state, weekly summary
- `GET /economy/:playthroughId/ledger?weeks=4` — recent ledger entries
- `POST /economy/:playthroughId/sponsors/sign` — sign a sponsor (test/admin)
- `POST /economy/:playthroughId/payroll-freeze` — accept/decline catch-up

## ACs
- [ ] All routes Zod-validated
- [ ] Session-authenticated (only playthrough owner)
- [ ] Hud-ui consumes these instead of client-side proxy

## Dependencies
- Story 007 (service)
