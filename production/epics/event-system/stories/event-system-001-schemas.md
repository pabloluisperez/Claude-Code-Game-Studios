---
Story: EVENT-SYSTEM-001
Status: Complete
Type: Integration
Governing ADR: ADR-015 (Special Event Decision Schema), ADR-008 (Calendar event types)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/event-system/db-schema.test.ts
---

# Story 001: calendar_events Schema

> **Epic**: event-system | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `calendar_events` table: id, playthrough_id FK, week int, type text, priority text ('STOP'|'ADVISORY'), payload jsonb (typed per ADR-015 EventDecisionPayload), status text ('pending'|'resolved'|'expired'), resolved_at timestamp
- Index on (playthroughId, week, status) for the pending queue

## ACs
- [ ] Table created; migration applied
- [ ] CHECK constraint on priority IN ('STOP', 'ADVISORY')
- [ ] FK cascade on playthrough delete
