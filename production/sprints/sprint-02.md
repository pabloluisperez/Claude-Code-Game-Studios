---
Sprint: 02
Name: "Cascade Chains + Match-Sim Foundation"
Status: Planned
Window: 2026-05-20 → 2026-06-02 (10 working days, 2 weeks)
Capacity: ~10 productive days (solo dev — Pablo)
Velocity Baseline: Sprint 01 completed 5 stories (8d estimated) in ~1 agent-pair session.
  Real constraint: Pablo's review time (~15-30 min per story), not implementation time.
  Calibration point 2 of 2 before stable baseline.
---

# Sprint 02 — Cascade Chains + Match-Sim Foundation

## Sprint Goal

Implement the 8 cascade chain formulas (C0 through C18, starting with the linear/non-counterintuitive batch) and establish the match-simulation type foundation, completing the cascade engine core and unlocking the full match-simulation pipeline.

## Capacity

- Total days: 10
- Buffer (20%): 2 days reserved for unplanned work / code review iterations
- Available: 8 days
- Retro action items overhead: ~0.75d (ADR-003 update + tsc fix)

## Tasks

### Must Have (Critical Path)

| ID | Task | Story file | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-----------|-------------|-------------------|
| 002-01 | Update ADR-003 (retro A2) | `docs/architecture/ADR-003-cascade-graph-topology.md` | 0.5d | — | `fromNode/toNode` field names, `transferFn(prevState, ctx)` signature updated |
| 002-02 | Add `tsc --noEmit` to test script (retro A3) | `packages/shared/package.json` | 0.25d | — | `"test": "vitest run && tsc --noEmit"` in package.json |
| 002-03 | **CASCADE-006** — C0 + C1a + C1b | `production/epics/cascade-engine/stories/cascade-engine-006-chain-c0-c1a-c1b.md` | 2d | CASCADE-001..005 ✓ | C1b piecewise: `\|delta(Fq=40)\| > \|delta(Fq=10)\|`; decay toward 70 for C0 |
| 002-04 | **CASCADE-007** — C2 + C3 + C13 | `production/epics/cascade-engine/stories/cascade-engine-007-chain-c2-c3-c13.md` | 1.5d | CASCADE-001..005 ✓ | Noise-bound test: `\|noisy_delta - base\| ≤ NOISE_C2_AMP/2` |
| 002-05 | **CASCADE-008** — C4 (C10 as multiplier) | `production/epics/cascade-engine/stories/cascade-engine-008-chain-c4-c10.md` | 2d | CASCADE-001..005 ✓ | Parabola sweet spot delta(50)=K_C4; morale multiplier boundaries T_low/T_high |
| 002-06 | **MATCH-SIM-001** — Domain types + contracts | `production/epics/match-simulation/stories/match-sim-001-types-and-contracts.md` | 1d | — (parallel to cascades) | `worldStateDeltas` exactly 2 keys; `causal_node` field present; `MatchEventEmitter` interface |
| 002-07 | **MATCH-SIM-002** — PRNG context stateful | `production/epics/match-simulation/stories/match-sim-002-prng-context-stateful.md` | 1d | MATCH-SIM-001 | Round-trip continuation: pause@45 + resume = same outcome (AC-MATCH-02) |

**Total committed**: 8.25 days
**Buffer**: 1.75 days for unexpected blockers, code review iterations
**Sprint capacity**: 10 working days (82% allocated + buffer)

### Should Have

| ID | Task | Story file | Est. Days | Dependencies | Notes |
|----|------|-----------|-----------|-------------|-------|
| 002-08 | **CASCADE-009** — C5a + C5b + C16a + C16b + C17 | `production/epics/cascade-engine/stories/cascade-engine-009-chain-c5-c16-c17.md` | 1.5d | CASCADE-001..005 ✓ | 5 linear chains; C16b guard test verifies story-005 guard machinery |
| 002-09 | **MATCH-SIM-003** — F1-F2 effective stats | `production/epics/match-simulation/stories/match-sim-003-f1-f2-effective-stats.md` | 0.5d | MATCH-SIM-001 | Pure functions, small |
| 002-10 | **MATCH-SIM-004** — F3-F4 momentum | `production/epics/match-simulation/stories/match-sim-004-f3-f4-momentum.md` | 1d | MATCH-SIM-002 | Single rng() per tick invariant critical |

### Nice to Have

| ID | Task | Story file | Est. Days | Dependencies | Notes |
|----|------|-----------|-----------|-------------|-------|
| 002-11 | **CASCADE-010** — C6 + C7 + C11 + C14 | `production/epics/cascade-engine/stories/cascade-engine-010-chain-c6-c7-c11-c14.md` | 2d | CASCADE-001..005 ✓ | C6 asymmetry ratio test is canonical |

## Carryover from Sprint 01

None. 5/5 Sprint 01 stories completed.

## Retro Action Items Being Addressed

| Action | Priority | Status at sprint start |
|--------|----------|----------------------|
| Commit all Sprint 01 work | HIGH | ✅ Done (3 commits + push) |
| Update ADR-003 field names | HIGH | Scheduled as Must Have 002-01 |
| Add `tsc --noEmit` to test script | MEDIUM | Scheduled as Must Have 002-02 |
| Recalibrate velocity baseline | MEDIUM | Sprint 02 provides the 2nd data point |
| Fix test path convention in /create-stories | LOW | Deferred — patch when creating Sprint 02 stories |

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| C4 parabola boundary semantics | MEDIUM | MEDIUM | Read GDD §C4 line-by-line before implementing; T_low=25 and T_high=75 must give delta=0 strictly |
| seedrandom typing quirks (match-sim-002) | LOW | HIGH | Slice has the pattern; copy directly from prototypes/cascada-vertical-slice-mes1 |
| 22 chain formulas expose edge cases in runTick | LOW | LOW | 143 Sprint 01 tests already prove the engine; chains only add transferFn bodies |
| Velocity estimate still uncalibrated | HIGH | LOW | Sprint 02 produces the 2nd data point for stable baseline |

## Dependencies on External Factors

- `prototypes/cascada-vertical-slice-mes1/src/sim/cascade-*.ts` — design reference for chain formulas (NEVER imported, never refactored into production — see prototype-code.md)
- `design/gdd/cascade-engine.md` — GDD §Formulas is the law for all transferFn bodies

## Definition of Done for Sprint 02

- [ ] All Must Have tasks completed and Status: Complete
- [ ] ADR-003 updated (field names + transferFn signature)
- [ ] `tsc --noEmit` passing alongside vitest in CI-friendly test script
- [ ] All Logic stories have passing unit tests (no missing BLOCKING test evidence)
- [ ] Smoke check passed (`/smoke-check sprint`)
- [ ] QA sign-off APPROVED or APPROVED WITH CONDITIONS (`/team-qa sprint`)
- [ ] No S1 or S2 bugs open
- [ ] Code reviewed and committed

## Sprint 03 Preview (NOT committed)

After Sprint 02, candidates for Sprint 03:
1. **CASCADE-010 through CASCADE-013** (remaining chains: C6/C7/C11/C14, C8/C15, C9a/C9b, C12/C18) — ~7.5d
2. **CASCADE-014** (threshold detection) — ~2d
3. **MATCH-SIM-005 through MATCH-SIM-007** — ~3-4d

Sprint 03 is gated on Sprint 02 Must Have stories being Complete.

## Velocity Calibration Note

Sprint 01 baseline: 5 stories (8d estimated) delivered in ~1 agent-pair session.
Pablo's active time per session: ~30-60 min (review + approval).

This sprint: 7 Must Have stories (8.25d estimated). If velocity holds, expect delivery in 1-2 sessions.
Calibrate after Sprint 02: compute `actual_days_pablo_active / estimated_days`. If ratio < 0.2 consistently, consider planning more aggressively in Sprint 03.

## Cross-References

- Epic: `production/epics/cascade-engine/EPIC.md`
- Epic: `production/epics/match-simulation/EPIC.md`
- Stories: `production/epics/cascade-engine/stories/`
- Stories: `production/epics/match-simulation/stories/`
- GDD: `design/gdd/cascade-engine.md` (chain formulas)
- Architecture: `docs/architecture/architecture.md` v1.1
- Control Manifest: `docs/architecture/control-manifest.md` v2026-05-19
- Retrospective: `production/retrospectives/retro-sprint-01-2026-05-19.md`
- Sprint 01 QA sign-off: `production/qa/qa-signoff-sprint-01-2026-05-19.md`
