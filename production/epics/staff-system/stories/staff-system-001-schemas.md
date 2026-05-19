---
Story: STAFF-SYSTEM-001
Status: Ready
Type: Integration
Governing ADR: ADR-009 (Staff messaging tiers)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/staff-system/db-schema.test.ts
---

# Story 001: Staff + Staff Messages Schemas

> **Epic**: staff-system | **Layer**: Core | **Type**: Integration | **Estimate**: 0.5d

## Scope
- `staff` table: id, playthrough_id FK, club_id FK, role text ('coach'|'scout'|'doctor'|'physio'), tier int (1-3), weekly_eur_k, hired_week
- `staff_messages` table: id, playthrough_id FK, week int, role text, tier int, node_id text, direction text, template_key text, body text, read boolean default false

## ACs
- [ ] 2 tables defined; migration applied
- [ ] Index on (playthroughId, week) for message feed queries
