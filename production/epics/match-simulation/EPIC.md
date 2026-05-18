# Epic: Match Simulation

> **Layer**: Foundation
> **GDD**: `design/gdd/match-simulation.md`
> **Architecture Module**: `packages/shared/src/sim/sports/football/football-plugin.ts` + `apps/api/src/modules/match/`
> **Status**: Ready
> **Stories**: Not yet created — run `/create-stories match-simulation`
> **Control Manifest**: 2026-05-19

## Overview

The match simulation produces deterministic football match outcomes from a
seed + lineup + WorldState input. It serves two contracts: (a) pure
`simulateMatch()` for offline / batch / cascade-tick use (ADR-007), and (b)
stateful interactive `MatchSession` for the player-attended live match with
pause-and-decide windows at minutes 45, 60, 75 (ADR-013). The slice validated
both, plus the full F1–F10 formula set, plus determinism across re-enqueue
boundaries (Option B PRNG persistence). MVP scope: football only; the
sport-agnostic plugin shape (ADR-007) is in place but only the football plugin
ships.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-002: Simulation determinism | `ctx.rng()`; seed-stable | LOW |
| ADR-007: Sport-agnostic match | `SportPlugin` interface; football plugin implements F1–F10 | LOW |
| ADR-013: Match session re-enqueue | BullMQ re-enqueue with persisted PRNG state (Option B); UNIQUE INDEX excludes `'failed'` | MEDIUM (BullMQ + Drizzle partial UNIQUE) |

## GDD Requirements

`design/gdd/match-simulation.md` AC-MATCH-01 through AC-MATCH-32 (R6 PASS
2026-05-18). Coverage:

| AC range | Topic | Coverage |
|---|---|---|
| AC-01 – AC-07 | F1 effective_fitness, F2 effective_rating clamping | ADR-007 ✅ |
| AC-08 – AC-14 | F4 momentum, F5 P_attack with formations + instructions | ADR-007 ✅ |
| AC-15 – AC-20 | F6 P_shot NaN guards, F7 P_goal NaN guards | ADR-007 ✅ |
| AC-21 – AC-24 | Substitution windows at 45/60/75; max 5 changes shared pool | ADR-013 ✅ |
| AC-25 – AC-27 | F8 MPI delta perspective-aware (home draw -3 / away draw +1) | ADR-007 ✅ |
| AC-28 – AC-29 | F9 injury_risk delta clamped [0, +15]; events filtered post-match | ADR-007 ✅ |
| AC-30 – AC-32 | BullMQ orphan-job guard; recovery worker | ADR-013 ✅ |

**Untraced requirements**: None at the ADR level. Per-formula tuning lives in
the GDD (`Formulas` section); no separate ADR needed.

## Engine Risk

**MEDIUM** due to:
- **BullMQ delayed-job + re-enqueue pattern**: the slice's tests validated the
  shape but production needs the timeout-job lifecycle + crash recovery worker
  (`*/15` SKIP LOCKED per match-simulation.md AC-31).
- **Drizzle partial UNIQUE INDEX**: `match_sessions_active_playthrough` with
  `WHERE state NOT IN ('completed','archived','failed')` — slice verified
  drizzle-kit syntax works with `sql` template literal (NOT raw strings).
- **seedrandom `.state()`**: must construct with `{ state: true }` option,
  otherwise `.state()` returns undefined and ADR-013 Option B fails. Slice
  hit this and documented the workaround.

## Definition of Done

- `simulateMatch(input) → MatchOutcome` pure function in
  `packages/shared/src/sim/sports/football/football-plugin.ts`
- 4-4-2 default formation; 4-3-3, 3-5-2, 5-3-2 alternates (per F5 formation_attack_mod)
- Manager instructions: HOLD_SHAPE, PRESS_HIGH, COUNTER (per F5)
- VAR resolution inline (no manager decision needed) for goals (25%), penalties
  (40%, v1.1+), reds (30%); P_overturn = 0.35
- MatchSession FSM in `apps/api/src/modules/match/match-session.ts` with state
  machine: pre_match → in_progress → paused_for_decision → in_progress → completed
  (+ `failed` terminal)
- Re-enqueue worker `apps/api/src/workers/match-worker.ts` that resumes from
  `MatchSessionSnapshot.rngState`
- `POST /matches/:id/start` + `POST /matches/:id/decision` Hono routes
- Socket.IO `/match` namespace emits MatchEvent stream per tick (replaces the
  slice's client-side animation)
- Recovery worker (BullMQ scheduler `*/15`) for orphan timeout jobs
- F10 per-player `match_rating` returned as `Record<string, number>` (NOT Map)
  for players with ≥30 minutes played
- 34/34 slice tests as a starting baseline (production must replicate the
  determinism + interactive + range-bounds tests)

## Dependencies

- **Upstream blockers**: cascade-engine (writes MPI to its WorldState),
  league-system (provides fixtures)
- **Downstream consumers**: economy (post-match revenue), player-management
  (form rolling avg from match_rating), staff-system (post-match observations),
  hud-ui (live match feed)

## Next Step

Run `/create-stories match-simulation` to break this epic into implementable
stories.
