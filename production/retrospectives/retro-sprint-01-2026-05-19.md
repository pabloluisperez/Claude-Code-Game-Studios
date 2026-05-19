# Retrospective: Sprint 01 — Cascade Engine Foundation

**Period**: 2026-05-19 (single intensive session)
**Generated**: 2026-05-19
**Sprint Goal**: Ship a deterministic, tested cascade-engine core — `runTick()` works end-to-end with the graph data model + first 2 cadenas, ready to integrate with match-simulation in Sprint 2.

---

## Metrics

| Metric | Planned | Actual | Delta |
|--------|---------|--------|-------|
| Stories | 5 | 5 | 0 |
| Completion Rate | — | 100% | — |
| Estimated Days | 8d | ~1d (one session) | −7d |
| Bugs Found | — | 2 (TypeScript silent errors) | — |
| Bugs Fixed | — | 2 | — |
| Unplanned Tasks Added | — | 1 (CascadeLog redesign pre-story-005) | — |
| Automated Tests | — | 143/143 passing | — |
| TODO/FIXME/HACK | — | 0 | — |

---

## Velocity Trend

| Sprint | Planned | Completed | Rate |
|--------|---------|-----------|------|
| Sprint 01 (current) | 5 stories / 8d | 5 stories / ~1d | 100% |

**Trend**: First sprint — no prior baseline.

**Key note**: Velocity gap (1d vs 8d estimated) reflects agent-assisted development, not solo-dev. Sprint plan estimated 1.0 story/day for Pablo working alone. Agent-pair throughput is ~5-8x faster for implementation. The real constraint is Pablo's review time and design decisions, not implementation time. Sprint 02 estimates should stay in person-days for capacity planning but acknowledge the higher throughput.

---

## What Went Well

1. **Story spec → direct implementation**: All stories had concrete ACs with exact numerical inputs/outputs. The `/dev-story` → `/code-review` → `/story-done` loop was smooth. Zero stories BLOCKED by spec ambiguity.

2. **`/story-readiness` caught the critical CascadeLog gap**: Before implementing story-005, readiness check detected that the story's scope was inconsistent with the already-implemented `CascadeLog` type. Forcing resolution BEFORE implementation avoided mid-sprint rework. The readiness system worked exactly as designed.

3. **Test coverage rigor**: 143 tests, 0 gaps. The discriminating AC#7 ordering independence test and guarded+delayed test were strengthened during code review before passing — the review process caught weak tests before gate.

4. **Smoke check surfaced silent TypeScript errors**: `exactOptionalPropertyTypes` violation and `console` missing from ES2022 lib are errors that Vitest (esbuild) silences. The `tsc --noEmit` step in the smoke check surfaced them before they could reach a production build.

---

## What Went Poorly

1. **Test path convention wrong in all story files** (impact: manual correction in every `/story-done`): Stories had `Test Evidence: tests/unit/cascade-engine/` but the actual runner path is `packages/shared/tests/cascade-engine/`. Required correction in 5 stories during `/story-done`. Root cause: `/create-stories` skill template doesn't know the project's actual path convention.

2. **story-005 CascadeLog mismatch** (impact: ~15 min readiness fix before implementing): story-005 was authored with a `CascadeLog` shape that didn't match the type implemented in story-001. story-001 implemented a minimal CascadeLog; story-005 assumed a richer version. The inconsistency wasn't detected at `/create-stories` time.

3. **3 test gaps in CASCADE-002 caught at code review**: `toBeGreaterThanOrEqual(5)` instead of `toBe(7)` for team_fitness fan-in, AC#5 only spot-checking C16a, and constants missing exact-value assertions. Caught correctly at `/code-review`, but ideally would have been avoided at test-writing time.

4. **4 stories uncommitted at sprint close**: cascade-002, -005, smoke check fixes, and QA artifacts are uncommitted. Risk of losing work.

---

## Blockers Encountered

| Blocker | Duration | Resolution | Prevention |
|---------|----------|------------|------------|
| CascadeLog type mismatch (story-005 spec vs story-001 impl) | ~15 min | `/story-readiness` detected it; gaps edited in story before implementation | In `/create-stories`, validate that shared types (`CascadeLog`, `TickResult`) referenced in story scope match what's in cascade-types.ts |
| Silent TypeScript errors (esbuild Vitest bypass) | Discovered at smoke check | Fixed: `exactOptionalPropertyTypes` + `console` in ES2022 | Add `tsc --noEmit` to package.json test script so it runs alongside vitest in CI and local |

---

## Estimation Accuracy

| Story | Estimated | Actual (approx) | Variance | Likely Cause |
|-------|-----------|-----------------|----------|--------------|
| CASCADE-001 | 1.0d | ~0.5h | −80% | Pure types, no logic; estimate calibrated for solo manual dev |
| CASCADE-002 | 2.0d | ~2h | −75% | Agent-assisted; constants voluminous but mechanical |
| CASCADE-003 | 1.0d | ~1.5h | −80% | Small pure module |
| CASCADE-004 | 2.0d | ~2h | −75% | Clean skeleton; determinism tests were the bulk |
| CASCADE-005 | 2.0d | ~2.5h | −70% | CascadeLog redesign added ~30min of readiness fix |

**Overall estimation accuracy**: 0% of tasks within ±20% of estimate. Gap is systemic: estimates were calibrated for solo-dev; actual was agent-pair.

**Recommendation for Sprint 02**: Keep person-day estimates for Pablo's capacity planning, but acknowledge that throughput per session will be 5-8x greater than estimated. Real constraint = Pablo's review time and design decisions.

---

## Carryover Analysis

None. 5/5 stories completed within the sprint.

---

## Technical Debt Status

- TODO count: **0**
- FIXME count: **0**
- HACK count: **0**
- Trend: Clean at sprint close (first sprint baseline)
- Note: `transferFn` placeholders that throw (`notYetImplemented('CASCADE-ENGINE-006')`) are intentional known debt — resolved in stories 006-013 in Sprint 02.

---

## Previous Action Items

None (first sprint).

---

## Action Items for Sprint 02

| # | Action | Owner | Priority | Deadline |
|---|--------|-------|----------|----------|
| 1 | **Commit all Sprint 01 work** before starting Sprint 02 | Pablo | HIGH | Before `/sprint-plan new` |
| 2 | **Update ADR-003** with corrected field names (`fromNode/toNode`) and updated `transferFn(prevState, ctx)` signature | Pablo + agent | HIGH | Sprint 02 Day 1 |
| 3 | **Add `tsc --noEmit`** to `@smt/shared` package.json test script (alongside vitest) | Pablo + agent | MEDIUM | Sprint 02 Day 1 |
| 4 | **Recalibrate velocity baseline**: update sprint-01.md with actual velocity; consider "session hours" vs "dev-days" for Sprint 02 planning | Pablo | MEDIUM | During `/sprint-plan new` |
| 5 | **Fix test path convention** in `/create-stories`: stories should embed `packages/shared/tests/cascade-engine/` not `tests/unit/cascade-engine/` | Pablo | LOW | Sprint 02 start |

---

## Process Improvements

1. **Smoke check must include `tsc --noEmit`**: Vitest with esbuild silences real type errors. Any step that only runs vitest gives a false sense of correctness. Make explicit in the sprint close-out flow that smoke check MUST include `tsc --noEmit`.

2. **Story readiness for shared types**: The CascadeLog gap (story-001 vs story-005) could have been caught earlier if `/story-readiness` validated that types referenced in the story scope exist with expected fields in cascade-types.ts. Add this to the `/story-readiness` checklist.

---

## Summary

Sprint 01 was a delivery success: 5/5 stories completed, 143 tests, zero open bugs, TypeScript clean. The key learning is the gap between estimated velocity (solo-dev) and actual velocity (agent-pair) — throughput is ~5-8x higher, meaning the real constraint for Sprint 02 is design decisions and Pablo's review time, not implementation time. The only systemic friction was the test path convention and the CascadeLog gap in story-005's spec — both fixable in Sprint 02 prep. Sprint 02 is unblocked to start chain implementations (stories 006-013) and match-simulation foundations.
