---
Story: STAFF-SYSTEM-005
Status: Ready
Type: Integration
Governing ADR: ADR-009
Control Manifest: 2026-05-19
Test Evidence: tests/integration/staff-system/routes.test.ts
---

# Story 005: Hono Routes for Staff

> **Epic**: staff-system | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `GET /staff/:playthroughId` — current hired staff
- `POST /staff/:playthroughId/hire` — body: { role, tier }
- `GET /staff/:playthroughId/messages?since=week` — message feed
- `POST /staff/:playthroughId/messages/:id/mark-read`

## ACs
- [ ] Zod-validated routes
- [ ] Hud-ui consumes /messages for the staff feed widget
