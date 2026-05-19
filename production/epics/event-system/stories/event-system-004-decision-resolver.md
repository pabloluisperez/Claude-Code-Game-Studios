---
Story: EVENT-SYSTEM-004
Status: Complete
Type: Integration
Governing ADR: ADR-015
Control Manifest: 2026-05-19
Test Evidence: tests/integration/event-system/decision-resolver.test.ts
---

# Story 004: Decision Payload Resolver

> **Epic**: event-system | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `resolveEvent(tx, eventId, decision)`: dispatches to Story 003 handler based on event.type
- Validates the decision shape via Zod (per-variant schemas)
- Updates `calendar_events.status = 'resolved'`, `resolved_at = now()`
- Idempotent: re-resolution returns the previously-applied side-effect

## ACs
- [ ] Invalid decision shape rejected with `400 invalid_decision`
- [ ] Resolved event cannot be re-resolved (idempotent skip)
- [ ] Transactional rollback if handler fails
