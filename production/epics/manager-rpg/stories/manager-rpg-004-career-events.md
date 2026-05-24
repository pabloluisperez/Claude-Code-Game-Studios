---
Story: MANAGER-RPG-004
Status: Complete
Type: Integration
Governing ADR: ADR-010, ADR-015 (event-system payloads)
Control Manifest: 2026-05-19
Test Evidence: tests/integration/manager-rpg/career-events.test.ts
---

# Story 004: Career Events (XP grants from gameplay)

> **Epic**: manager-rpg | **Layer**: Core | **Type**: Integration | **Estimate**: 1d

## Scope
Event triggers + XP grants:
- `transfer_completed` → +50 XP
- `contract_renewal_signed` → +25 XP
- `season_promoted` → +500 XP
- `season_relegated` → -100 XP (or 0 floor)
- `bankruptcy_avoided` → +200 XP
- `first_5_match_streak` → +100 XP
- `match_won_as_underdog` → +30 XP

Listen to events emitted by other systems; insert career_events row + apply XP.

## ACs
- [ ] Each event type triggers correct XP delta
- [ ] career_events table records the event with timestamp
- [ ] Level-up cascades through Story 002's applyXp
