---
Sprint: 01
Name: "Cascade Engine Foundation"
Status: Planned
Window: 2026-05-19 → 2026-06-02 (10 working days, 2 weeks)
Capacity: ~10 productive days (solo dev — Pablo)
Velocity Baseline: 1.0 stories/day (slice produced ~28 days of design ref in 14 cal days)
Sprint Goal: ship a deterministic, tested cascade-engine core — `runTick()` works end-to-end with the graph data model + first 2 cadenas, ready to integrate with match-simulation in Sprint 2
---

# Sprint 01 — Cascade Engine Foundation

## Sprint Goal

Deliver the cascade-engine module skeleton (`packages/shared/src/sim/cascade-engine.ts` + `cascade-graph.ts`) with:
- All types (WorldState, NodeId, SimContext, DelayedEffect, TickResult)
- The complete `runTick()` algorithm (Steps 1-6 of cascade-engine.md §States and Transitions)
- The DelayedEffectsBuffer pop/enqueue mechanism
- The CASCADA_FC_GRAPH data structure with named constants (graph skeleton)
- Edge evaluation + PlayerDecisions integration (Steps 2-3)
- A determinism test verifying same seed + decisions → identical output across runs

**Exit criterion (sprint review)**: `npm test` passes with `tests/unit/cascade-engine/*.test.ts` covering at least:
- Types compile + serialise cleanly (Record, not Map — per control-manifest)
- DelayedEffectsBuffer mature/enqueue cycle
- runTick produces deterministic output for a fixed seed + decisions
- Step ordering matches GDD (Step 2 edges read prevState; Step 3 decisions apply to nextState)

The graph is BUILT but not yet POPULATED with all 18 chains — that's Sprint 2-3 work. The skeleton must accept new edges via the `CascadeEdgeDef[]` data without code changes (Rule 10).

## Stories Committed (Total: 8 days)

| # | Story | Type | Estimate | Day(s) | Notes |
|---|---|---|---|---|---|
| 1 | [cascade-engine-001](../epics/cascade-engine/stories/cascade-engine-001-worldstate-types.md) | Logic | 1.0d | Day 1 | Types only — no logic |
| 2 | [cascade-engine-002](../epics/cascade-engine/stories/cascade-engine-002-graph-topology.md) | Logic | 2.0d | Days 2-3 | CascadeEdgeDef + CASCADA_FC_GRAPH skeleton + named constants |
| 3 | [cascade-engine-003](../epics/cascade-engine/stories/cascade-engine-003-delayed-effects-buffer.md) | Logic | 1.0d | Day 4 | Buffer + Zod schemas + pop/enqueue helpers |
| 4 | [cascade-engine-004](../epics/cascade-engine/stories/cascade-engine-004-runtick-skeleton.md) | Logic | 2.0d | Days 5-6 | runTick Steps 1+4+6 + pure-function contract |
| 5 | [cascade-engine-005](../epics/cascade-engine/stories/cascade-engine-005-step2-step3-evaluation.md) | Logic | 2.0d | Days 7-8 | Step 2 edge eval + Step 3 PlayerDecisions |

**Total committed**: 8 days
**Buffer**: 2 days for unexpected blockers, code review iterations, test debugging
**Sprint capacity**: 10 working days (100% allocated, including buffer)

## Daily Schedule (Suggested)

| Day | Date | Story | Notes |
|---|---|---|---|
| Mon 1 | 2026-05-19 | cascade-engine-001 | Types only — should finish today; set up `packages/shared/src/sim/` if not present |
| Tue 2 | 2026-05-20 | cascade-engine-002 (day 1 of 2) | Graph topology + edge def types |
| Wed 3 | 2026-05-21 | cascade-engine-002 (day 2 of 2) | CASCADA_FC_GRAPH skeleton + 18 chain stubs as `CascadeEdgeDef[]` (transferFn returning 0 for now) |
| Thu 4 | 2026-05-22 | cascade-engine-003 | DelayedEffectsBuffer |
| Fri 5 | 2026-05-23 | cascade-engine-004 (day 1 of 2) | runTick Step 1 (mature delayed effects) + Step 4 (clamp) + Step 6 (return) |
| Mon 6 | 2026-05-26 | cascade-engine-004 (day 2 of 2) | Pure-function contract test + determinism harness |
| Tue 7 | 2026-05-27 | cascade-engine-005 (day 1 of 2) | Step 2 — edges read prevState only (Rule 3) + additive deltas (Rule 4) |
| Wed 8 | 2026-05-28 | cascade-engine-005 (day 2 of 2) | Step 3 — PlayerDecisions applied to nextState |
| Thu 9 | 2026-05-29 | buffer / polish / code review | Address any review feedback; pair with the GDD acceptance criteria |
| Fri 10 | 2026-05-30 | sprint review + retrospective | Determinism test passes; demo to self; write retro notes |

## Why these 5 stories

All five stories produce code in **a single file area** (`packages/shared/src/sim/cascade-engine.ts` + adjacent). This keeps cognitive load low and avoids context-switching across systems.

The output of Sprint 1 is the **substrate** for Sprint 2's chain implementations (006-013) and Sprint 3's threshold detection (014). Without 001-005, NO other cascade work can land.

Match-simulation stories are intentionally NOT in Sprint 1 — they're parallel work for a future sprint when there's bandwidth or when cascade-engine is stable enough to be a dependency.

## Not Doing in Sprint 1

Explicitly deferred to later sprints (so I don't pull these in mid-sprint):

- **Cascade chains 006-013** — implementations of C0-C18 individual edges. The Sprint 1 graph is empty stubs. Sprint 2 starts wiring the 6 simplest chains (C0/C5a/C5b + C2/C3/C13 — the linear ones).
- **ThresholdCrossing detection (story 014)** — Sprint 3. Depends on graph being populated.
- **Persistence (story 015)** — Sprint 3+. Append-only snapshots are a Drizzle integration task.
- **Performance validation (story 016)** — Sprint 4+ once enough chains exist to be slow.
- **Determinism integration (story 017)** — the cornerstone E2E test. Sprint 5 when there's an end-to-end pipeline to test.
- **Match-simulation epic** — independent track; Sprint 2 starts pure-function formula work after Sprint 1 lands the cascade substrate.

## Definition of Done (each story)

Per `docs/architecture/control-manifest.md` v2026-05-19 §Story Authoring Rules + §Test Evidence Standards:

- [ ] Code compiles with `strict: true`, no `// @ts-ignore`
- [ ] Unit test file at `tests/unit/cascade-engine/<story-slug>.test.ts` with passing assertions for every AC in the story
- [ ] Test runs include a determinism check (same seed → same output)
- [ ] All public exports have doc comments
- [ ] Lint clean (`pnpm run lint`)
- [ ] Commit message references story ID (e.g., `feat(cascade-engine): types + NodeId catalog [CASCADE-ENGINE-001]`)
- [ ] Story file's frontmatter `Status: Pending` → `Status: Done` via `/story-done`

## Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| TypeScript strict mode reveals subtle type holes in the graph definition | MEDIUM | LOW | Slice already discovered the major ones; iterate quickly |
| Determinism test flakiness from seedrandom config | LOW | MEDIUM | Use `seedrandom('seed', { state: true })` always per ADR-013 lesson; slice has the pattern |
| Step 2 vs Step 3 ordering subtle bug (decay-then-decision vs decision-then-decay) | MEDIUM | HIGH | Story 005 explicit tests for this; GDD AC-C18-04 just fixed to clarify (commit 836ff37) |
| Story scope creep (adding "just one more chain" to Sprint 1) | HIGH | MEDIUM | This sprint plan explicitly defers chains; if tempted, write the chain as a Sprint 2 backlog note instead |
| Match-sim stories get "implementation envy" mid-sprint | MEDIUM | LOW | Sprint 1 is focused; match-sim is Sprint 2+ |

## Velocity Calibration

Use this sprint to **measure actual velocity**:

- Track time per story (start/end timestamps in story file or commit messages)
- After Sprint 1 close, compute `actual_days / estimated_days` ratio
- If ratio > 1.2 → reduce Sprint 2 commit by 20%
- If ratio < 0.8 → consider adding 1 match-sim story to Sprint 2
- Update `production/sprints/sprint-02.md` with calibrated estimates

This is the most honest velocity data the project will get before the production "real" cadence kicks in.

## Sprint 2 Preview (NOT committed yet)

If Sprint 1 closes on time, Sprint 2 candidates (priority order):

1. **cascade-engine 006-009** — chains C0/C1/C5/C2/C3/C13/C12 (the 7 simplest non-counterintuitive + 1 counterintuitive) — ~6 days
2. **match-sim 001-004** — types, PRNG, F1-F2, F3-F4 — ~4 days

Both fit in 10 days. Match-sim is the parallel track Pablo identified as the second Foundation epic.

Sprint 2 is BLOCKED on Sprint 1 (the cascade-engine substrate must exist before chains can be implemented). Match-sim has NO Sprint-1 dependency so it CAN start in parallel mid-Sprint-1 IF Sprint 1 is on track. **Default plan**: hold match-sim until Sprint 1 reviews clean.

## Sprint 3-6 Outlook (rough projection)

- **Sprint 3**: cascade 010-014 (the remaining chains + threshold detection) — 8 days
- **Sprint 4**: cascade 015-017 (persistence + perf + determinism cornerstone) + match-sim 005-007 — 9 days
- **Sprint 5**: match-sim 008-013 (cards, injuries, VAR, forfeit, rival AI, the pure simulation wired) — 9 days
- **Sprint 6**: match-sim 014-018 (FSM, DB, worker, routes, Socket.IO) — 10 days

After Sprint 6: economy + manager-rpg + staff-system + player-management epics start. Estimated Sprint 7-12 lands the MVP feature set; Sprint 13-14 polishes for first playable. Estimated production timeline: ~28 weeks (7 months) given solo dev capacity + the architecture's complexity. This matches scope-mvp.md's 4-6 month target ONLY if velocity holds at 1.0/day; reality will likely be 6-8 months.

## Cross-References

- Epic: `production/epics/cascade-engine/EPIC.md`
- Stories: `production/epics/cascade-engine/stories/`
- GDD: `design/gdd/cascade-engine.md` (R3 + gotcha fixes in commit 836ff37)
- Architecture: `docs/architecture/architecture.md` v1.1
- Control Manifest: `docs/architecture/control-manifest.md` v2026-05-19
- Slice as design reference: `prototypes/cascada-vertical-slice-mes1/src/sim/cascade-*.ts` (NEVER imported — design ref only per prototype-code.md)
