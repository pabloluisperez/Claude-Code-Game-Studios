---
Sprint: 06
Name: "MatchSession FSM (014) + Infrastructure stories blocked (015-018)"
Status: Partial — 1 of 5 stories complete; 4 blocked on infrastructure
Window: 2026-07-15 → 2026-07-28 (autonomous session)
Capacity: ~10 productive days
Review Mode: lean
---

# Sprint 06 — MatchSession FSM + Backend Integration

## Stories Delivered

| ID | Story | Type | Status | Tests |
|---|---|---|---|---|
| 006-01 | MATCH-SIM-014: MatchSession FSM | Logic | ✅ Done | 18/18 |
| 006-02 | MATCH-SIM-015: match_sessions table + repo | Integration | 🚫 Blocked | — |
| 006-03 | MATCH-SIM-016: BullMQ worker re-enqueue | Integration | 🚫 Blocked | — |
| 006-04 | MATCH-SIM-017: Hono routes (start/decide/timeout) | Integration | 🚫 Blocked | — |
| 006-05 | MATCH-SIM-018: Socket.IO recovery + determinism | Integration | 🚫 Blocked | — |

## Blockers

### MATCH-SIM-015 (DB schema)
- **Reason**: `match_sessions` table requires FKs to `playthroughs` (player-management epic) and `fixtures` (league-system epic).
- **Resolution path**: Create stories for player-management epic (specifically the `playthroughs` table) AND league-system epic (specifically the `fixtures` table). Both epics are currently ✅ Ready (per epics/index.md) but have no stories yet — run `/create-stories player-management` and `/create-stories league-system` first.

### MATCH-SIM-016, 017, 018
- **Reason**: Cascade-blocked on 015.
- Also require running Postgres (port 5433), Redis (port 6379), BullMQ, Socket.IO server for integration test verification.

## Critical Correctness Verified in 014

- AC-MATCH-02 split-resume determinism (cornerstone): FSM driven with no_op decisions produces identical scores to one-shot `simulateMatch`.
- AC-MATCH-03a: pause at substitution_window (tick 45/60/75).
- AC-MATCH-04: shared 5-sub pool with validation rejection at pool exhaustion.
- AC-MATCH-23 prelude: `playing_with_ten` event emitted on red card with no bench replacement.
- Decision validation matrix: COUNTER rejected for home player; bench-to-bench subs rejected; rival-team subs rejected for the home manager.
- prngState round-trip via JSON.stringify → JSON.parse → continued simulation produces identical events.

## Recommended Next Actions

1. **Create stories for player-management and league-system epics**: `/create-stories player-management` then `/create-stories league-system`. Specifically prioritize the `playthroughs` and `fixtures` table stories.
2. **Once those exist**: unblock MATCH-SIM-015 → 016 → 017 → 018 in order.
3. **In parallel**: stories for the other 5 epics (economy, manager-rpg, staff-system, event-system, hud-ui) can proceed if they don't share dependencies.

## Cumulative Test Status

- Total tests: 523/523 passing
- `tsc --noEmit` clean
- Cascade Engine epic: ✅ Complete (Sprint 03)
- Match-Sim epic: 14/18 stories complete (4 blocked on infrastructure)
- Other 7 epics: stories not yet created
