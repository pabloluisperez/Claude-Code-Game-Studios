# Match-Simulation Stories — Roster

> **Epic**: [match-simulation](../EPIC.md)
> **GDD**: `design/gdd/match-simulation.md` (Approved R6 2026-05-18)
> **Control Manifest**: 2026-05-19
> **Generated**: 2026-05-19 (16 stories by producer subagent + 2 follow-ups by parent)

## Story Roster

| # | Slug | Type | Est. (days) | Depends on | Notes |
|---|---|---|---|---|---|
| 001 | [types-and-contracts](match-sim-001-types-and-contracts.md) | Logic | 1.0 | — | PlayerStats, MatchEvent, MatchInput, MatchOutcome, PlayerSlot, FormationPreset, TeamInstruction types |
| 002 | [prng-context-stateful](match-sim-002-prng-context-stateful.md) | Logic | 1.0 | 001 | seedrandom `{state:true}` factory + serialise helpers (ADR-013 Option B foundation) |
| 003 | [f1-f2-effective-stats](match-sim-003-f1-f2-effective-stats.md) | Logic | 1.0 | 001 | F1 effective_fitness + F2 effective_rating + range/clamp |
| 004 | [f3-f4-momentum](match-sim-004-f3-f4-momentum.md) | Logic | 1.0 | 001, 003 | F3 home_momentum_initial + F4 per-tick delta + formation_momentum_mod |
| 005 | [f5-p-attack](match-sim-005-f5-p-attack.md) | Logic | 1.5 | 002, 004 | F5 P_attack with formation_attack_mod + instruction_mod + COUNTER + single-roll invariant |
| 006 | [f6-p-shot](match-sim-006-f6-p-shot.md) | Logic | 1.5 | 003, 005 | F6 P_shot NaN guards + formation_mod + hold_shape_mod on defender |
| 007 | [f7-p-goal](match-sim-007-f7-p-goal.md) | Logic | 1.5 | 003, 006 | F7 P_goal NaN guards + range clamp + fallback 0.25 |
| 008 | [card-detection](match-sim-008-card-detection.md) | Logic | 1.0 | 003, 005 | Yellow + 2nd yellow + tracking per tick 15/30/45/60/75/90 |
| 009 | [injury-detection](match-sim-009-injury-detection.md) | Logic | 1.0 | 003 | P_injury per tick 45/90 + goal-ticks + card-ticks; rival constant 50 |
| 010 | [var-resolution](match-sim-010-var-resolution.md) | Logic | 1.5 | 002, 008 | VAR inline 25% goal / 30% red / P_overturn 35% |
| 011 | [forfeit-and-post-match-deltas](match-sim-011-forfeit-and-post-match-deltas.md) | Logic | 1.0 | 001 | Forfeit synthesis (squad ≤63% → 0-3) + F8 mpi_delta + F9 injury_risk_delta + F10 playerRatings as Record |
| 012 | [rival-ai-formation-and-subs](match-sim-012-rival-ai-formation-and-subs.md) | Logic | 1.5 | 005, 006 | Rival picks formation by strength_ratio (not 4-4-2 hardcoded); auto-subs at 45/60/75 |
| 013 | [simulate-match-per-tick-loop](match-sim-013-simulate-match-per-tick-loop.md) | Logic | 2.5 | 002-012 | Pure `simulateMatch(input) → MatchOutcome`; wires all formulas; 209 lines (largest pure-function story) |
| 014 | [match-session-fsm](match-sim-014-match-session-fsm.md) | Logic | 2.0 | 002, 011, 013 | MatchSession FSM (states pre_match → in_progress → paused_for_decision → completed/failed); MatchSessionSnapshot type |
| 015 | [db-schema-and-session-lock](match-sim-015-db-schema-and-session-lock.md) | Integration | 1.5 | 014 | Drizzle `match_sessions` table + partial UNIQUE INDEX via `sql` template (excludes completed/archived/failed) |
| 016 | [match-worker-reenqueue](match-sim-016-match-worker-reenqueue.md) | Integration | 2.5 | 014, 015 | BullMQ match-worker; re-enqueue pattern; PRNG state persistence (Option B); crash recovery test |
| 017 | [hono-routes](match-sim-017-hono-routes.md) | Integration | 2.0 | 014, 015, 016 | POST /matches/start + /matches/decision; idempotency; SELECT FOR UPDATE mutex; COUNTER home rejection; Zod validation |
| 018 | [socketio-recovery-determinism](match-sim-018-socketio-recovery-determinism.md) | Integration | 3.0 | 015-017 | Socket.IO `/match` namespace; recovery worker (cron `*/15` SKIP LOCKED); cornerstone E2E determinism test |

**Total**: **27 days** for solo dev (≈5-6 weeks with 20% buffer).

## Type Distribution

| Type | Count | Total days |
|---|---|---|
| Logic | 13 | 17.0 |
| Integration | 5 | 10.0 |
| **Total** | **18** | **27.0** |

## Story Granularity Notes

- 13 pure-function logic stories cover the entire `simulateMatch(input) → MatchOutcome` contract (ADR-007)
- 5 integration stories cover the production stack (Drizzle persistence, BullMQ workers, Hono routes, Socket.IO realtime)
- Story 013 is the largest pure-function (`simulateMatch`) at 2.5 days — wires all 12 prior formula stories together. Could be split if needed but the wiring is naturally one piece.
- Story 018 is the largest integration story at 3.0 days because it carries the cornerstone determinism integration test (the moral equivalent of slice's `match-determinism.test.ts` at production scale).

## Gotchas Surfaced During Story Authoring

(Producer subagent's findings + parent's additions)

### 1. **F4 example arithmetic in match-simulation.md is correct in R6** (no fix needed — this was the cascade-engine arithmetic issue mentioned in cascade-engine stories README, not match-sim).

### 2. **AC-MATCH-31 recovery worker frequency** is `*/15` per the GDD R6 — interpreted as "every 15 minutes" cron. Stories 016 + 018 implement this with a 20-min `updated_at` threshold (so a session that just paused isn't recovered prematurely).

### 3. **Idempotency on /decision** is a real concern — story 017 covers this explicitly with a SELECT FOR UPDATE + state check. A network retry from the client must NOT double-enqueue the resume worker.

### 4. **COUNTER instruction for home team is invalid** per R4 fix 2026-05-18. Story 017 enforces this at the route boundary (Zod refinement), fail-fast.

### 5. **MatchOutcome.playerRatings must be `Record<string, number>`, NOT `Map`** — per F10 R2 note + control-manifest cross-cutting rule (Map in JSON breaks round-trip). Story 011 enforces.

### 6. **Slice's substitution_window event payload is the raw shape**, not yet the ADR-015 EventDecisionPayload variant. Production stories should migrate but the slice's pattern is acceptable for MVP if migration is too aspirational — flag for review at sprint planning. AC-MS17-07 documents the deviation explicitly.

### 7. **MatchOutcome.events filter post-match** — story 011 implements the AC-MATCH-29 rule (substitution_window events are removed from the final MatchOutcome.events that league-system + player-management consume; they remain in the Socket.IO live stream for HUD purposes).

### 8. **Determinism cornerstone test (story 018)** is the highest-value test in the epic. It validates the entire pipeline end-to-end at production scale and replicates ADR-013 Option B verification at the integration level (vs slice's unit-test level).

### 9. **VAR overturned goals MUST decrement the scoreboard** in production (slice had a "visual-only" simplification — UX spec match-live.md flagged this as a production fix). Story 010 + story 018's integration test must verify this behavior matches the simulator's authoritative state.

### 10. **Per-tick performance budget (5ms median, 15ms p95, 50ms hard cap)** is hardcoded in story 018 AC-MS18-11. No dedicated perf ADR exists (same as cascade-engine epic). If perf concerns surface during implementation, propose an ADR-019.

## Recommended Sprint Sequencing

| Sprint | Stories | Days | Rationale |
|---|---|---|---|
| **A** (foundation) | 001-004 | 4.0 | Types + PRNG + formulas F1-F4 |
| **B** (probability formulas) | 005-007 + 008 | 5.5 | Attack/shot/goal + cards |
| **C** (events + outcome) | 009-012 | 5.0 | Injuries, VAR, forfeit, rival AI |
| **D** (pure simulation) | 013 | 2.5 | The big wiring story |
| **E** (persistence) | 014-016 | 6.0 | FSM + DB + Worker |
| **F** (API + realtime) | 017-018 | 5.0 | Routes + Socket.IO + determinism cornerstone |

Sprints A-D produce a deterministic pure `simulateMatch()` consumable by
cascade-engine's advance() flow (matches the slice's Day 3 milestone).
Sprints E-F add the interactive match (matches slice's Day 6 milestone).

## Cross-References

- Epic: [../EPIC.md](../EPIC.md)
- GDD: `design/gdd/match-simulation.md` (R6 PASS 2026-05-18)
- Architecture: `docs/architecture/architecture.md` v1.1 § module ownership
- Control Manifest: `docs/architecture/control-manifest.md` v2026-05-19 § Foundation Layer rules
- Slice reference: `prototypes/cascada-vertical-slice-mes1/src/sim/match-simulation.ts` (production rewrites from scratch using slice as design ref)
- UX spec (downstream consumer of Socket.IO events): `design/ux/match-live.md`
- Sibling epic: `production/epics/cascade-engine/stories/` (Foundation peer — match outputs feed cascade tick via worldStateDeltas)
