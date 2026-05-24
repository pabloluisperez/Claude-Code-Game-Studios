# Cascade Engine — Story Roster

> Epic: `production/epics/cascade-engine/EPIC.md`
> GDD: `design/gdd/cascade-engine.md` (Approved 2026-05-18, R3+R4 fixes)
> Control Manifest: 2026-05-19
> Stories generated: 2026-05-19 by `/create-stories cascade-engine`
> Review mode at generation: lean (no gate spawned; producer pre-approved scope at scope summit 2026-05-17)

## Summary

- **Total stories**: 17
- **Total estimated days**: ~28.5 days (≈5–6 weeks for a solo dev, allowing for context-switching and the 20% sprint buffer)
- **Critical path** (must finish in order): 001 → 002 → 003 → 004 → 005 → [006–013 parallel-ish] → 014 → 017
- **DB-touching stories**: only 015 (Integration test type)
- **Counterintuitive chain stories** (cascade-engine.md Core Rule 7 anchors): 006, 008, 010, 011, 013

## Roster

| # | Slug | Type | Status | Est. Days | Depends On |
|---|------|------|--------|-----------|-----------|
| 001 | `cascade-engine-001-worldstate-types` | Logic | Pending | 1 | — |
| 002 | `cascade-engine-002-graph-topology` | Logic | Pending | 2 | 001 |
| 003 | `cascade-engine-003-delayed-effects-buffer` | Logic | Pending | 1 | 001 |
| 004 | `cascade-engine-004-runtick-skeleton` | Logic | Pending | 2 | 001, 002, 003 |
| 005 | `cascade-engine-005-step2-step3-evaluation` | Logic | Pending | 2 | 004 |
| 006 | `cascade-engine-006-chain-c0-c1a-c1b` | Logic | Pending | 2 | 002, 004, 005 |
| 007 | `cascade-engine-007-chain-c2-c3-c13` | Logic | Pending | 1.5 | 002, 004, 005 |
| 008 | `cascade-engine-008-chain-c4-c10` | Logic | Pending | 2 | 002, 004, 005 |
| 009 | `cascade-engine-009-chain-c5-c16-c17` | Logic | Pending | 1.5 | 002, 004, 005 |
| 010 | `cascade-engine-010-chain-c6-c7-c11-c14` | Logic | Pending | 2 | 002, 004, 005 |
| 011 | `cascade-engine-011-chain-c8-c15` | Logic | Pending | 2 | 002, 004, 005 |
| 012 | `cascade-engine-012-chain-c9a-c9b` | Logic | Pending | 1.5 | 002, 004, 005 |
| 013 | `cascade-engine-013-chain-c12-c18` | Logic | Pending | 2 | 002, 004, 005 |
| 014 | `cascade-engine-014-threshold-detection` | Logic | Pending | 2 | 001, 002, 004, 005, 013 |
| 015 | `cascade-engine-015-persistence-recovery` | Integration | Pending | 2 | 001, 003, 004, 005, 014 |
| 016 | `cascade-engine-016-performance-validation` | Logic | Pending | 1 | 001–014 |
| 017 | `cascade-engine-017-determinism-integration` | Integration | Pending | 3 | 001–014 |
| | **Total** | | | **28.5** | |

## Chain Coverage Matrix (18 MVP chains across stories)

| Chain | Counterintuitive? | Owning Story |
|-------|-------------------|--------------|
| C0 — team_fitness decay | No | 006 |
| C1a — groundskeeper → field_quality | No | 006 |
| C1b — field_quality → injury_risk | **YES** | 006 |
| C2 — injury_risk → squad_available | No | 007 |
| C3 — field_quality → team_fitness | No | 007 |
| C4 — training_intensity parabola | **YES** | 008 |
| C5a — catering → team_fitness | No | 009 |
| C5b — catering → staff_morale | No | 009 |
| C6 — MPI → fan_momentum hysteresis | **YES** | 010 |
| C7 — consecutive_wins streak bonus | No | 010 |
| C8 — fan_momentum × price → attendance | **YES** | 011 |
| C9a — scouting_budget → scouting_points | No | 012 |
| C9b — scouting_points → squad_available | No | 012 |
| C10 — staff_morale multiplier (integrated in C4) | No | 008 (not a standalone edge) |
| C11 — staff_morale → MPI (guarded) | No | 010 |
| C12 — sobreentrenamiento desesperado | **YES** | 013 |
| C13 — squad_available → team_fitness | No | 007 |
| C14 — field → MPI (home advantage, guarded) | No | 010 |
| C15 — ticket_price erosion (delayed) | **YES** | 011 |
| C16a — happiness → team_fitness | No | 009 |
| C16b — happiness → MPI (guarded) | No | 009 |
| C17 — sponsor → happiness | No | 009 |
| C18a — corruption_exposure decay (guarded) | **YES** | 013 |
| C18b — scandal threshold response | N/A (event-system, NOT a cascade edge) | — |

All 7 counterintuitive anchor chains (C1b, C4, C6, C8, C12, C15, C18a) are owned by a story and have mandatory cross-verification ACs.

## Suggested Sprint Slicing (solo dev, 1-2 week sprints)

**Sprint 1 (Foundation skeleton, ~6 days)** — 001, 002, 003, 004. Output: typed empty engine running through Step 1/4/6 with passing skeleton tests.

**Sprint 2 (Algorithm + first chains, ~6 days)** — 005, 006, 007. Output: 5 chains live; AC-PLD invariants validated; team_fitness multi-writer fan-in starts to take shape.

**Sprint 3 (Counterintuitive cluster, ~5.5 days)** — 008, 009, 010. Output: 9 more chains live; C4, C6 (the two most distinctive counterintuitive chains) validated.

**Sprint 4 (Price/scouting/corruption cluster, ~5.5 days)** — 011, 012, 013. Output: 18 chains complete; all 7 counterintuitive anchors validated; system feature-complete.

**Sprint 5 (Wrap, ~5.5 days)** — 014 (thresholds), 015 (persistence + integration test), 016 (perf), 017 (end-to-end determinism + cycle safety + counterintuitive proof suite). Output: epic Done.

**Buffer**: 20% per sprint (~1-1.5 days) for the inevitable surprise — slice findings suggest C8's dual prevState read and C18a's guard semantics may take longer than estimated. Bake the buffer; don't compress it.

## Gotchas Surfaced During Story Authoring

These deserve user attention before implementation starts:

1. **AC-SER-02 contradicts control-manifest**: The GDD AC-SER-02 says `deserializeWorldState()` returns `instanceof Map`. The control-manifest forbids `Map<>` in JSON-serialized payloads. Story 015 documents this as an intentional manifest-driven deviation (returns `Record<NodeId, number>`). If the user prefers strict GDD compliance, the manifest must be amended OR the engine internally uses Map and converts only at the serialization boundary. **Recommendation**: stick with Record-based engine (simpler, manifest-compliant); fix the GDD AC text in the next R5 revision.

2. **AC-DEL-05 phrasing vs implementation reality**: The GDD AC-DEL-05 says with `scouting_budget=30` for 4 weeks, "squad_available_pct doesn't show C9b increment until at least W=4". With K values K_scouting=15, K_scouting_roster=5 and budget=30, scouting_points grows at ~4.5/week — crosses the 50 threshold only around week 14. Story 012 implements the test as: "in W=4, scouting_points < 50, C9b delta = 0" — which is consistent with "at least W=4" (technically a lower bound) but the GDD's narrative implies faster. Either tune budget up in the test scenario or accept that C9 is a longer chain than the AC narrative suggests. **Recommendation**: leave the test conservative; flag the AC text in a /quick-design for the next GDD revision.

3. **AC-C18-04 ambiguity (decay then PD vs PD only)**: AC-C18-04 says `corruption_exposure=60` + PD=-10 → nextState=50. Our Step 2-then-Step 3 algorithm produces 47 (decay 60→57, then PD -10 → 47). Story 013 documents this as canonical and surfaces the discrepancy. **Recommendation**: implement "decay then PD = 47" (matches the algorithm spec); record the AC text as informally rounded; flag in next revision.

4. **Line 337 of cascade-engine.md has an arithmetic error** (formula vs example): the example for C6 at MPI=30 shows `-8.0 × (1 + 0.04) = -8.32`. But `P_loss = (50-30)/50 = 0.4`, and `P_loss² = 0.16`, not 0.04. The R4-corrected AC-CTI-C6 (line 808) shows the correct value: `-8.0 × (1 + 0.16) = -9.28`. Story 010 implements `-9.28` (the correct math). **Recommendation**: fix the inline example in the next GDD R5 revision; do NOT change the formula or AC value.

5. **No ADR for performance budgets yet**: cascade-engine.md Categoría 10 lacks a dedicated ADR; EPIC.md notes this as untraced. Story 016 implements the budget anyway (5ms avg, 1000 ticks < 2s) since the values are unambiguous from the GDD. **Recommendation**: post-epic, write a brief perf ADR if the budgets change.

6. **OQ-CASCADE-01 still open** (cascade-engine.md line 940): "Does the `ctx.prevState` pattern for C8/C10 need its own ADR?" The slice already implemented it; the control-manifest implicitly accepts it (Foundation Required clause "edges read prevState only" applies to the FROM node, and the additional nodes via ctx.prevState are read-only per the same rule). **Recommendation**: close OQ-CASCADE-01 with a 1-paragraph note in the control-manifest (no full ADR needed) before story 005 starts. Or accept that the precedent is set and let the OQ go stale.

## Next Steps

1. User reviews the roster + gotchas above.
2. Optionally: run `/quick-design` to revise the GDD R5 with fixes for items 1, 2, 3, 4 above (none are blocking — implementation can proceed with the documented resolutions).
3. Run `/sprint-plan new` to schedule Sprint 1 (Foundation skeleton — stories 001, 002, 003, 004).
4. Run `/qa-plan sprint` after sprint planning to define QA-specific test scenarios per story (test evidence is already specified per-story, but the QA plan adds cross-cutting smoke checks).
5. Then `/dev-story production/epics/cascade-engine/stories/cascade-engine-001-worldstate-types.md` to begin.
