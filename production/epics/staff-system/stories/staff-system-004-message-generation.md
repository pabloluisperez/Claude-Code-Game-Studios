---
Story: STAFF-SYSTEM-004
Status: Complete
Type: Integration
Governing ADR: ADR-009 (staff message tier from manager state at time of message — control-manifest Required)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/staff-system/message-generation.test.ts
---

# Story 004: Weekly Message Generation

> **Epic**: staff-system | **Layer**: Core | **Type**: Integration | **Estimate**: 1d

## Scope
In advance() tick:
1. Read cascade engine output (changed nodes + ThresholdCrossings)
2. For each significant change: look up staff member of relevant role
3. Resolve template via Story 002's `resolveMessageTemplate`
4. Insert staff_messages row

NodeId routing:
- team_fitness/team_skill/squad → coach
- injury_risk → doctor (or physio if no doctor hired)
- scouting_points → scout

## ACs
- [ ] Tier of message matches CURRENT staff tier (not retroactive)
- [ ] Direction inferred from delta sign + threshold crossing
- [ ] Per-week message volume bounded (max 10/week to avoid spam)
