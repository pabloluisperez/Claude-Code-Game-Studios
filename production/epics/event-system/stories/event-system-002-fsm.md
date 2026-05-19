---
Story: EVENT-SYSTEM-002
Status: Ready
Type: Logic
Governing ADR: ADR-008, ADR-015
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/event-system/fsm.test.ts
---

# Story 002: CalendarEvent FSM (STOP / ADVISORY)

> **Epic**: event-system | **Layer**: Core | **Type**: Logic | **Estimate**: 0.5d

## Scope
- STOP events block advance() loop until resolved
- ADVISORY events surface to HUD but don't block
- `pickNextEvent(events, currentWeek)`: returns the first STOP event for current week, or null
- `eventDefaultDecision(event)`: per-type default applied on timeout

## ACs
- [ ] STOP at week=N halts advance() processing of week=N until resolved
- [ ] ADVISORY events accumulate; advance() proceeds
- [ ] Default decision applied automatically if timeout reached
