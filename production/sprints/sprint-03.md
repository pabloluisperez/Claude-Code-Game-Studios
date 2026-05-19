---
Sprint: 03
Name: "Cascade Engine Epic Completion"
Status: Planned
Window: 2026-06-03 → 2026-06-16 (10 working days, 2 weeks)
Capacity: ~10 productive days (solo dev — Pablo)
Velocity Baseline: Sprint 01 (5 stories/1 sesión) + Sprint 02 (7 stories/1 sesión) = ~6 stories/sesión active Pablo time. Solo-dev estimates remain 5-8× higher than actual throughput.
---

# Sprint 03 — Cascade Engine Epic Completion

## Sprint Goal

**Complete the cascade engine MVP**: wire the remaining 5 chain stories (009-013) covering all 22 chains, plus threshold detection (014). At sprint close, the cascade engine epic is fully implemented — every chain formula in CASCADA_FC_GRAPH produces real deltas through `runTick()`, and the threshold crossing detector surfaces BLOCKING/ADVISORY events to the event system.

This unlocks Sprint 04 to focus on match-simulation formulas + integration.

## Capacity

- Total days: 10
- Buffer (20%): 2 days reserved for unplanned work / code review iterations
- Available: 8 days
- Velocity-based plan: 6 Must Have stories (calibrated from Sprint 01/02 actuals)

## Tasks

### Must Have (Critical Path) — 9d estimated solo-dev / ~1-2 agent-pair sessions

| ID | Story | Est. | Dependencies | Key AC |
|---|---|---|---|---|
| 003-01 | **CASCADE-009**: C5a + C5b + C16a + C16b + C17 | 1.5d | CASCADE-005 ✓ | C16b guard skip when no match |
| 003-02 | **CASCADE-010**: C6 + C7 + C11 + C14 | 2d | CASCADE-005 ✓ | C6 asymmetric hysteresis ratio |
| 003-03 | **CASCADE-011**: C8 + C15 | 2d | CASCADE-005 ✓ | C8 dual-input (fan_momentum + ticket_price_index); AC-PLD-02 |
| 003-04 | **CASCADE-012**: C9a + C9b | 1.5d | CASCADE-005 ✓ | C9 compound timing (20-tick convergence) |
| 003-05 | **CASCADE-013**: C12 + C18 | 2d | CASCADE-005 ✓ | C18a corruption decay guard at SC=80 |

**Total Must Have**: 9d estimated solo-dev
**Sprint 02 actual**: 7 stories in 1 session ≈ 6 stories/session
**Sprint 03 forecast**: 5 Must Have in 1 session is realistic

### Should Have

| ID | Story | Est. | Dependencies |
|---|---|---|---|
| 003-06 | **CASCADE-014**: Threshold Detection | 2d | CASCADE-009..013 (uses full graph) |

### Nice to Have

| ID | Story | Est. | Dependencies |
|---|---|---|---|
| 003-07 | **MATCH-SIM-003**: F1 + F2 effective stats | 0.5d | MATCH-SIM-001 ✓ |
| 003-08 | **MATCH-SIM-004**: F3 + F4 momentum | 1d | MATCH-SIM-002 ✓ |

## Carryover from Sprint 02

None. 7/7 Sprint 02 Must Have completed. The Should Have stories (CASCADE-009, MATCH-SIM-003, MATCH-SIM-004) from Sprint 02 are now Must Have / Nice to Have in Sprint 03 — promoted based on epic completion goal.

## Retro Action Items Being Addressed

| Action | Priority | Status at sprint start |
|---|---|---|
| Commit + push Sprint 02 work | HIGH | ✅ Done (6 commits + push) |
| Pre-commit hook with `tsc --noEmit` | MEDIUM | Schedule as Sprint 03 chore 003-09 |
| ADR-007 sync chore (Record vs ReadonlyMap) | MEDIUM | Schedule as Sprint 03 chore 003-10 OR defer to Sprint 04 |
| `/create-stories` test path convention fix | LOW | Deferred |

## Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| CASCADE-011 (C8 dual-input) Rule 5 violation under partial-tick state | MEDIUM | HIGH | AC-PLD-02 explicitly tests this — implementation must read prevState only, never the accumulating deltaMap |
| CASCADE-013 (C18 corruption) 100-tick oscillation test fragility | LOW | MEDIUM | Existing patterns in story-006's 50-tick equilibrium test apply directly |
| Threshold detection (CASCADE-014) test matrix is voluminous | MEDIUM | LOW | 12 scenarios — break into focused describe blocks per priority level |
| Match-sim Nice to Haves pull focus from cascade completion | MEDIUM | MEDIUM | Sprint Goal is cascade epic completion; treat match-sim as overflow only |

## Dependencies on External Factors

None new. All ADRs (002, 003, 008) accepted. The cascade-engine.md GDD §C5–C18 sections are the formula source of truth.

## Definition of Done for Sprint 03

- [ ] All Must Have stories Status: Complete (5 stories)
- [ ] All cascade chain transferFns implemented (0 `notYetImplemented` placeholders remaining)
- [ ] `tsc --noEmit` clean (set by Sprint 02)
- [ ] Smoke check passes (`/smoke-check sprint`)
- [ ] QA sign-off APPROVED (`/team-qa sprint`)
- [ ] No S1 or S2 bugs open
- [ ] Cascade Engine epic flagged Complete in `production/epics/index.md`

## Sprint 04 Preview (NOT committed)

After Sprint 03 closes the cascade epic, Sprint 04 candidates:
1. **Match-simulation core formulas** (MATCH-SIM-003 through MATCH-SIM-007: F1-F7)
2. **Match-simulation engine integration** (MATCH-SIM-008 onwards)
3. **Cascade-engine integration tests** (CASCADE-015 persistence + 016 performance + 017 determinism)

Sprint 04 will likely focus on match-simulation given that cascade epic completes in Sprint 03.

## Velocity Calibration Note

Sprint 01 baseline: 5 stories (8d) in 1 session.
Sprint 02 baseline: 7 stories (8.25d) in 1 session.
**Sprint 03 forecast**: 5-6 stories in 1 session is the established pattern.

The estimated days remain for capacity planning sanity-checks but the operational reality is session-time, not dev-day. Pablo's active review time per session is ~30-60 minutes; agent-pair throughput is the dominant factor.

## Cross-References

- Epic: `production/epics/cascade-engine/EPIC.md`
- GDD: `design/gdd/cascade-engine.md` §C5-C18
- Architecture: `docs/architecture/architecture.md` v1.1
- Control Manifest: `docs/architecture/control-manifest.md` v2026-05-19
- Sprint 02 retrospective: `production/retrospectives/retro-sprint-02-2026-05-19.md`
- Sprint 02 QA sign-off: `production/qa/qa-signoff-sprint-02-2026-05-19.md`
