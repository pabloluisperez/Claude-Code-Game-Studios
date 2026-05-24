---
Sprint: 04
Name: "Match Simulation — Core Formulas (F1–F7)"
Status: In Progress (autonomous mode)
Window: 2026-06-17 → 2026-06-30 (10 working days, 2 weeks)
Capacity: ~10 productive days (autonomous session)
Velocity Baseline: Sprint 01 (5) + Sprint 02 (7) + Sprint 03 (6) = ~6 stories/session
Review Mode: lean
---

# Sprint 04 — Match Simulation Core Formulas

## Sprint Goal

Implement the F1–F7 per-player formulas that the per-minute simulator reads. After this sprint, the football plugin can compute `effective_fitness`, `effective_rating`, possession/momentum tracking, attack probability, shot probability, and goal probability for any player at any minute.

This sets the stage for Sprint 05 (the per-tick simulator loop + card/injury detection).

## Capacity

- Total days: 10
- Buffer (20%): 2 days reserved
- Available: 8 days
- Velocity-based plan: 5–6 Must Have stories (calibrated from Sprint 01/02/03 actuals)

## Tasks

### Must Have (Critical Path)

| ID | Story | Est. | Dependencies | Key AC |
|---|---|---|---|---|
| 004-01 | **MATCH-SIM-003**: F1 effective_fitness + F2 effective_rating | 0.5d | MATCH-SIM-001 ✓ | F1 clamp to 0; F2 composite weights sum to 1.0 |
| 004-02 | **MATCH-SIM-004**: F3 + F4 momentum (possession & match momentum) | 1d | MATCH-SIM-002 ✓ | F4 sigmoid response curve |
| 004-03 | **MATCH-SIM-005**: F5 P_attack | 1d | 004-01 | P_attack formula combines F2 + formation factor |
| 004-04 | **MATCH-SIM-006**: F6 P_shot | 1d | 004-03 | P_shot uses F2 attacker vs defender |
| 004-05 | **MATCH-SIM-007**: F7 P_goal | 1d | 004-01 (F1 for GK), 004-04 | F7 uses gk_def from effective_fitness |

**Total Must Have**: ~4.5d estimated solo-dev → ~5 stories in 1 autonomous session.

### Should Have

| ID | Story | Est. | Dependencies |
|---|---|---|---|
| 004-06 | **MATCH-SIM-008**: Card detection | 1d | 004-05 |
| 004-07 | **MATCH-SIM-009**: Injury detection | 1d | 004-05 |

### Nice to Have

| ID | Story | Est. | Dependencies |
|---|---|---|---|
| 004-08 | **MATCH-SIM-010**: VAR resolution | 1d | 004-04 (F6) |

## Carryover from Sprint 03

| Story | Reason | New Priority |
|---|---|---|
| MATCH-SIM-003 (F1+F2) | Nice to Have in Sprint 03, completed never. Bumped to Must Have here. | Must Have |
| MATCH-SIM-004 (F3+F4) | Nice to Have in Sprint 03. | Must Have |

## Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Emergency GK derivation (AC-MATCH-17) edge case | Medium | Low | Story 003 covers the derivation; test asserts the exact 28/21 values |
| F4 sigmoid response curve tuning required | Low | Low | Tests assert formula shape; tuning is post-MVP |
| Random-sample range invariant test fragility | Low | Low | Deterministic seeded sampling; assertion is on range bounds not distribution shape |

## Dependencies on External Factors

None new. MATCH-SIM-001 (types) and MATCH-SIM-002 (PRNG) already complete in Sprint 02.

## Definition of Done for Sprint 04

- [ ] All Must Have stories Status: Complete (5 stories)
- [ ] F1-F7 implemented in `packages/shared/src/sim/sports/football/football-formulas.ts`
- [ ] `tsc --noEmit` clean
- [ ] Smoke check passes
- [ ] QA sign-off: APPROVED
- [ ] No S1 or S2 bugs open

## Sprint 05 Preview (NOT committed)

Match-simulation card/injury/VAR detection (008-010) + per-tick simulator loop (013) + match-session FSM (014). Likely first sprint to integrate with Hono routes (017) and Socket.IO recovery (018).
