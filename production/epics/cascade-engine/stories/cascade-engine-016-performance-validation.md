---
Story: CASCADE-ENGINE-016
Status: Pending
Type: Logic
GDD Requirement: AC-PERF-01, AC-PERF-02 + cascade-engine.md §Categoría 10
Governing ADR: ADR-002 (no Date.now in sim; performance budget is non-sim concern), ADR-003 (synchronous tick)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/performance.test.ts
---

# Story: Performance Budget Validation (runTick avg < 5ms, 1000-tick run < 2s)

## Goal

Establish the performance baseline for `runTick()` and assert it stays within the GDD-defined budgets. This is the only story in this epic that uses `performance.now()` — which is allowed in test code (not in sim code per ADR-002).

Without this story, performance regressions slip silently into the codebase. Story 016's tests run in CI on every PR and fail loudly if any new chain bloats the tick.

## Scope

In `tests/unit/cascade-engine/performance.test.ts`:

- **AC-PERF-01**: With the full `CASCADA_FC_GRAPH` (22 edges, 20 nodes, full threshold detection, delayed-effects buffer with ~10 effects pre-populated), measure 100 consecutive `runTick()` calls with realistic state changes (mix of match weeks and non-match weeks). Assert: `average < 5ms` on Node.js dev environment.
- **AC-PERF-02**: 1000 consecutive `runTick()` calls in a tight loop (no I/O, no DB), measure total wall time. Assert: `total < 2 seconds`.

Both tests run in Vitest with `it.concurrent` disabled (otherwise scheduling noise corrupts timing). The test file is tagged `@perf` so it can be excluded from fast feedback loops via `vitest --exclude @perf` if needed; CI must include it.

## Out of Scope

- Micro-optimization of edge transferFns (premature — wait for budget to be exceeded).
- Profile-driven optimization tooling (separate concern; if perf fails, a new story for profiling).

## Acceptance Criteria

1. **AC-PERF-01**: 100 `runTick` calls average < 5ms each in Node.js dev (`node --version` ≥ 22). Run after `pnpm install --frozen-lockfile` + `pnpm run build`.
2. **AC-PERF-02**: 1000 `runTick` calls total < 2 seconds wall clock.
3. **Pre-populated buffer**: the test starts each tick with a buffer containing 8-10 delayed effects (representative of mid-playthrough state where C1a, C4, C5a, C5b, C15, C17 have all queued effects).
4. **No setup time included**: timing only the `runTick` call itself, not the WorldState construction or graph imports. Use a hot loop with cached inputs.
5. **CI compatibility**: passes on GitHub Actions standard runner (`ubuntu-latest`, Node 22). Document expected CI timing in test comment — typically 2-3× slower than local dev; budget is 5ms even on CI.
6. **Regression sensitivity**: if any edge's transferFn does I/O, calls `new Date()`, or otherwise drifts to slow code, the tests fail. Capture a baseline number in the test output (e.g. "tick avg: 0.42ms"); developers running the test see the current value and notice drift.
7. **Variance reporting**: the test logs min/max/avg/p99 over the 100/1000 runs. P99 should be < 10ms for AC-PERF-01 (i.e. the slowest tick is at most 2× the average). Outliers beyond p99 suggest GC pressure — log a warning but don't fail.
8. **Determinism preserved under perf load**: a deterministic seed used for the perf run produces a deterministic final WorldState — perf optimizations must not introduce non-determinism (no `setImmediate`, no `process.nextTick` mid-tick).

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/performance.test.ts`:

- AC-PERF-01: 100 ticks, assert avg < 5ms, log min/max/avg/p99 (AC #1, #7).
- AC-PERF-02: 1000 ticks, assert total < 2s (AC #2).
- Buffer-state test: verify the pre-populated buffer is non-empty mid-loop (AC #3).
- Determinism cross-check: run twice, assert same final WorldState (AC #8).

## Dependencies

- **Upstream blockers**: 001–014 (full engine must work). Story 015 is NOT a blocker — perf tests don't hit the DB.
- **Downstream**: none. Final epic story (alongside 017).

## Estimate

**1 day.** Test code is small; the variance analysis and CI tuning is the main work.

## Notes / Gotchas

- `performance.now()` IS allowed in test files. It's forbidden in sim code (ADR-002). The cascade engine itself must not call `performance.now()` or `Date.now()` — perf measurements happen externally in the test wrapper.
- The 5ms budget is for "Node.js dev" — running `node --version` (≥22), built TypeScript, no debugger. The CI environment is typically 2-3× slower; the budget still applies (5ms not relaxed). If CI fails, investigate; do not silently relax.
- If AC-PERF-01 fails after a new chain lands, the offender is usually clear from the CascadeLog (number of edges, number of buffer entries). Profile with `node --prof` or Vitest's built-in `--reporter=verbose` to identify the slow edge.
- Performance is NOT a blocking criterion for MVP feature acceptance — but it IS a CI gate. A failing perf test blocks the merge until the regression is investigated. Resist the temptation to bump the budget; investigate first.
- Vitest's default timeout (5s per test) means a 1000-tick run that takes 2s is comfortable; if AC-PERF-02 starts approaching the timeout, that's a serious regression. Use `it('...', { timeout: 10_000 })` to set a generous test-level timeout while keeping the assertion strict.
- Per cascade-engine.md Categoría 10: "Production sprint deliverable" — i.e. perf is NOT a story blocker for the chain stories landing first. This story runs as the second-to-last (alongside 017) to validate the assembled system before declaring the epic Done.
