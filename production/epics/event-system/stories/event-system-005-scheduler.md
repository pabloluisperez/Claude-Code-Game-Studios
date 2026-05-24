---
Story: EVENT-SYSTEM-005
Status: Complete
Type: Integration
Governing ADR: ADR-008, ADR-015
Control Manifest: 2026-05-19
Test Evidence: tests/integration/event-system/scheduler.test.ts
---

# Story 005: Event Scheduler + advance() Integration

> **Epic**: event-system | **Layer**: Core | **Type**: Integration | **Estimate**: 1d

## Scope
- `scheduleSeasonEvents(tx, playthroughId, seasonId)`: insert season_start, season_end, transfer_window_open (week 1, week 19), transfer_window_close (week 18, week 38), 38 match events
- advance() integration: at tick start, query pending events for currentWeek, halt on STOP
- BullMQ timeout scheduling for STOP events (paired with match-sim worker pattern)

## ACs
- [ ] Season events created at season start
- [ ] advance() halts on STOP, surfaces event to client
- [ ] Auto-default on timeout
