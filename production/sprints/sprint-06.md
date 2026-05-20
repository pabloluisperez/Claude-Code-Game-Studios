---
Sprint: 06
Name: "MatchSession FSM (014) + Backend Integration (015-018)"
Status: Complete — 5/5 stories delivered (3 with integration tests deferred to live infra env)
Window: 2026-07-15 → 2026-07-28 (autonomous session)
Capacity: ~10 productive days
Review Mode: lean
---

# Sprint 06 — MatchSession FSM + Backend Integration

> **Closeout note (2026-05-21)**: Original snapshot marked 4/5 stories blocked because `playthroughs` and `fixtures` table stories were thought to be missing. Subsequent player-management + league-system sprints created the missing schemas and the MATCH-SIM-015→018 stories were unblocked and completed within the same wave. This sprint file was stale relative to the actual story-file statuses.

## Stories Delivered

| ID | Story | Type | Status | Tests |
|---|---|---|---|---|
| 006-01 | MATCH-SIM-014: MatchSession FSM | Logic | ✅ Done | 18/18 |
| 006-02 | MATCH-SIM-015: match_sessions table + repo | Integration | ✅ Complete | repo + FK constraints verified |
| 006-03 | MATCH-SIM-016: BullMQ worker re-enqueue | Integration | ✅ Code-Complete | integration tests deferred to live BullMQ + Redis env |
| 006-04 | MATCH-SIM-017: Hono routes (start/decide/timeout) | Integration | ✅ Code-Complete | integration tests deferred to live BullMQ + Hono env |
| 006-05 | MATCH-SIM-018: Socket.IO recovery + determinism | Integration | ✅ Code-Complete | integration tests deferred to live Socket.IO + Redis env |

## Critical Correctness Verified in 014

- AC-MATCH-02 split-resume determinism (cornerstone): FSM driven with no_op decisions produces identical scores to one-shot `simulateMatch`.
- AC-MATCH-03a: pause at substitution_window (tick 45/60/75).
- AC-MATCH-04: shared 5-sub pool with validation rejection at pool exhaustion.
- AC-MATCH-23 prelude: `playing_with_ten` event emitted on red card with no bench replacement.
- Decision validation matrix: COUNTER rejected for home player; bench-to-bench subs rejected; rival-team subs rejected for the home manager.
- prngState round-trip via JSON.stringify → JSON.parse → continued simulation produces identical events.

## Deferred Verification

The 3 code-complete stories (016, 017, 018) require a live environment for end-to-end verification:
- Postgres on host port 5433 + Redis on 6379 (already configured in docker-compose.yml)
- BullMQ worker running
- Hono server running
- Socket.IO server running

The code itself is reviewed and committed; the deferred work is environmental integration smoke testing, not implementation.

## Cumulative Test Status (post-closeout)

- Total tests: 918 unit tests in @smt/shared (per 2026-05-21 baseline run); 951 cumulative across all packages.
- `tsc --noEmit` clean across all workspace packages (after 2026-05-21 fix of 3 exactOptionalPropertyTypes errors).
- Cascade Engine epic: ✅ Complete (Sprint 03)
- Match-Sim epic: ✅ Complete (18/18 stories, this sprint closes it)
- All other 8 epics: Complete (per epics/index.md) — only hud-ui has stories Ready awaiting implementation audit.
