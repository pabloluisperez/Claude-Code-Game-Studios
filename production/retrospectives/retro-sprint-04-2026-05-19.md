## Retrospective: Sprint 04 — Match Simulation Core Formulas

**Period**: 2026-05-19 (autonomous session, continuation from Sprint 03)
**Generated**: 2026-05-19
**Mode**: Autonomous

---

### Metrics

| Metric | Planned | Actual | Delta |
|---|---|---|---|
| Must Have stories | 5 | 5 | 0 |
| Should Have stories | 2 | 2 | 0 |
| Nice to Have stories | 1 | 0 | -1 (carry over) |
| Total stories closed | 5-7 | 7 | within target |
| Total tests added | ~70 estimated | 105 (331 → 436) | +35 |
| Source files added | 4 | 4 | 0 |
| Type extensions | 1 (PreMatchSnapshot.injury_risk) | 1 + MatchEvent.reason? | mild scope creep flagged |

### Velocity Trend

| Sprint | Stories Closed | Session Time | Notes |
|---|---|---|---|
| 01 | 5 | 1 session | baseline |
| 02 | 7 | 1 session | velocity confirmed |
| 03 | 6 | 1 session | autonomous |
| **04** | **7** | **same autonomous session as 03** | sustained throughput |

**Trend**: 6-7 stories/session under autonomy holds across two consecutive sprints.

---

### What Went Well

- **Story spec quality high in match-sim epic**: every story had complete formulas with named constants AND exact numeric expectations. Implementation was effectively transcription + test enumeration. The 6-month upfront design investment paying off.
- **The pure-function discipline**: all 7 stories produced ZERO side effects; rng() injection contract upheld. Determinism tests trivial.
- **AC-MATCH-17 emergency DEF-portero**: the existing story-003 implementation of `getReflexes`/`getHandling` with built-in emergency-GK derivation meant story-007's P_goal test "just worked" — the integration was implicit. Reward for thinking ahead in story-003.
- **Test fixtures and helpers patterns**: established by Sprint 03 (`makeCtx`, `makePlayer`, `makeSnapshot`) reused throughout match-sim tests with minimal adaptation. Zero "what's the right shape for this fixture?" debugging.

### What Went Poorly

- **MatchEvent.reason field scope creep**: not in the story-008 explicit type-extension scope but required by AC #6 of story-008. Added the field with a doc-comment. Marginal — but the story should have explicitly mentioned the type extension as part of its scope, not implicit.
- **PreMatchSnapshot.injury_risk field**: required by MATCH-SIM-009 but not added in MATCH-SIM-001 (which predates story-009 spec). Flagged as GDD R7 update needed. Mild — implementation extension while otherwise in scope.
- **MATCH-SIM-004 F4 test math typo**: cost 1 iteration (5 minutes) — initial expectation -0.75 was wrong because vision=70 (not 50) by default. Caught by failing test. The fix took longer because I had to recompute the formula and double-check, rather than just trusting the test framework. Worth a "fixture default reality check" step before writing expectations.

### Blockers Encountered

None blocking. All issues resolved within the autonomous session.

### Estimation Accuracy

| Story | Estimated | Actual | Variance |
|---|---|---|---|
| MATCH-SIM-003 | 0.5d | ~10 min | within budget |
| MATCH-SIM-004 | 1d | ~15 min + 5 min recovery | within budget |
| MATCH-SIM-005 | 1d | ~12 min | well under |
| MATCH-SIM-006 | 1d | ~12 min | well under |
| MATCH-SIM-007 | 1d | ~12 min | well under |
| MATCH-SIM-008 | 1d | ~15 min | well under |
| MATCH-SIM-009 | 1d | ~15 min | well under |

**Overall**: solo-dev day-estimates remain ~5-8× higher than autonomous-session minutes per story. Consistent with Sprint 01-03 trend.

### Technical Debt Status

Two flagged for GDD R7:
1. `PreMatchSnapshot.injury_risk` — already added in code; GDD doc fix needed
2. `MatchEvent.reason?: string` — already added in code; could be formalized as a discriminated union of allowed reasons per event type

Neither is blocking, neither degrades correctness — they're documentation hygiene.

### Previous Action Items Follow-Up (Sprint 03)

| Action | Status |
|---|---|
| Convention: use toBeCloseTo(0, n) not toBe(0) for formula deltas | ✅ Applied in Sprint 04 (no -0 issues hit this sprint) |
| Verify agent token-budget on multi-file Tasks | ✅ Applied — wrote all source/test files directly via Write tool to avoid mid-task cutoff |

### Action Items for Sprint 05

| # | Action | Priority | Notes |
|---|---|---|---|
| 1 | Plan Sprint 05: MATCH-SIM-010 (VAR) + 011 (forfeit/F8/F9/F10) + 012 (rival AI) + 013 (per-tick loop) | High | The per-tick loop is the milestone — first integration of F1-F7 + cards + injuries |
| 2 | Address GDD R7: document `PreMatchSnapshot.injury_risk` + `MatchEvent.reason` field formalization | Low | Doc hygiene |
| 3 | Convention: when extending types as a side effect, flag explicitly in story Completion Notes | Low | Sprint 04 retro learning |
| 4 | Consider: split MATCH-SIM-013 (per-tick loop) into 2 sub-stories (loop scaffolding + integration) given its complexity | Medium | Forecast |

### Process Improvements

- **The autonomous-mode pattern is stable**: 13 stories closed across Sprints 03+04 in one continuous session. The throughput cap appears to be context-window churn (file reads/edits), not story complexity.
- **Story files become source of truth during implementation**: as long as the formula is precisely specified, the implementation flows directly. Treat the story file like an executable spec.
- **Test fixtures grow organically**: `makeCtx`, `makePlayer`, `makeMid`, `makeDefender`, `makeKeeper`, `makeAttacker`, `makeSnapshot` — each test file accumulates 1-3 small fixture functions. Worth extracting to a shared test-fixtures module if Sprint 05 has 3+ more test files in the same area.

### Summary

Sprint 04 closed all match-simulation core formulas (F1-F7) plus card and injury detection in a single autonomous session. 7 stories, 105 new tests, 436 total passing, 0 failures. The next bottleneck is the per-tick simulator loop (MATCH-SIM-013) which finally INTEGRATES these formulas — that's the visible-progress milestone for Sprint 05.
