---
Story: EVENT-SYSTEM-006
Status: Ready
Type: Integration
Governing ADR: ADR-015
Control Manifest: 2026-05-19
Test Evidence: tests/integration/event-system/routes.test.ts
---

# Story 006: Hono Routes for Events

> **Epic**: event-system | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `GET /events/:playthroughId/pending` — list STOP events awaiting decision
- `GET /events/:playthroughId/feed?weeks=4` — ADVISORY events feed
- `POST /events/:playthroughId/:eventId/decide` — submit decision (validated per type)

## ACs
- [ ] Routes Zod-validated per ADR-015 payload variants
- [ ] Decision submission delegates to Story 004's resolveEvent
