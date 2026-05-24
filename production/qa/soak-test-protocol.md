# Soak Test Protocol — Cascada FC

**Version**: 1.0 (scaffolding only; runner deferred to Sprint 13)
**Author**: qa-lead (Sprint 12 task 12-5)
**Date**: 2026-05-21
**Status**: Scaffold approved; runner pending

---

## Purpose

A soak test runs the simulation continuously for an extended period to surface
slow leaks, drift, and edge cases that only appear after sustained use.
Single-tick unit tests cannot catch these — they verify ONE tick produces the
right output. The soak test verifies that **N consecutive ticks remain
internally consistent** and that resource consumption is bounded.

For Cascada FC, soak testing targets the advance-loop pipeline (cascade →
economy → match → staff messages → snapshot) since that's the path the player
exercises most heavily during a long career.

---

## When to run

- Before any Polish→Release gate sign-off (mandatory)
- After any change to the advance orchestrator that touches the per-week
  pipeline ordering
- After any cascade-engine F-formula re-tuning
- After any schema change that adds columns to `world_snapshots` or
  `playthroughs`

Not needed for: pure UI changes, copy/i18n fixes, documentation, isolated
unit-tested helpers.

---

## Target sessions

**Primary**: 1 full season simulation (38 weeks × 5 in-game years = 190 ticks)
running continuously without manual decision input. Use default training
intensity, no manual sponsor/staff/ticket-price decisions — let the
auto-pilot drift the playthrough through 5 simulated seasons.

**Secondary**: 10 consecutive `advanceDays(7)` calls from a clean playthrough,
each with a synthetic STOP event in the middle. Validates that the STOP/resume
cycle doesn't accumulate state between iterations.

---

## Metrics to capture

For each tick, log to `production/qa/soak-runs/[run-id]/metrics.jsonl`:

| Metric | Trigger condition (abort) | Notes |
|--------|---------------------------|-------|
| **Memory RSS** | > 512 MB | Process resident set size. Sample before/after each tick. |
| **Heap used** | Growing > 10 MB/tick on average over a sliding 10-tick window | Indicates leak. |
| **Tick latency P99** | > 500 ms for cascade-only ticks; > 2000 ms for match-day ticks | Detects regression. |
| **Balance drift** | `\|finalBalance_week_N \- expectedBalance\| > 0` against deterministic baseline | The 7-day batch must equal the weekly baseline; any drift means a regression. |
| **NaN / Infinity in WorldState** | Any field reads as `NaN` or `±Infinity` | Catches divide-by-zero or unguarded formula. |
| **Unhandled exception** | Any `throw` reaching the test runner | Hard abort. |
| **Cascade log size** | > 100 entries in a single tick | Indicates runaway cascade. |
| **Staff message volume** | > 20 messages in a single tick | Spam threshold (UX/data). |
| **Pending STOP events that never fire** | scheduledDayOfSeason in past, status still 'pending' | Detects event lifecycle leaks. |

---

## Determinism baseline

Before each soak run, generate the baseline by running the deterministic
in-process simulator (no DB writes) for the same seed/inputs. The soak run's
state at each week boundary must match the baseline byte-for-byte for the
fields above. Drift = regression.

---

## Abort conditions

The runner aborts and writes a failure report if ANY of the above metrics
crosses its threshold. The report includes:

- Tick number where the abort fired
- The triggering metric and its value
- WorldState snapshot at abort
- Last 10 ticks of cascade log
- Memory profile (heap snapshot if available)

---

## Reporting

After a successful run, the runner produces:

```
production/qa/soak-runs/[YYYY-MM-DD]-[run-id]/
  ├── summary.md              # Verdict + headline metrics
  ├── metrics.jsonl           # Per-tick metrics
  ├── tick-latency.svg        # P50/P95/P99 latency over time
  ├── memory-profile.svg      # RSS + heap-used over time
  └── balance-drift.json      # Per-week balance vs baseline diff
```

The `summary.md` is the single-page verdict that goes into Polish→Release
gate evidence.

---

## Sprint 13 implementation TODO

The runner itself is deferred to Sprint 13. Scope:

1. CLI: `pnpm soak-test --season-count=5 --run-id=<id>` from monorepo root.
2. Reuses the existing `runAdvanceTickFull` orchestrator with a synthetic
   playthrough (seed clubs + league fixtures + staff via `tests/fixtures/`).
3. Implements the abort conditions above as a streaming check after each tick.
4. Outputs the reporting bundle.
5. Wires into CI as a nightly job (not per-PR — soak runs are slow).

Estimated effort: 1.5 days for the runner + reporter + CI wire-up.

---

## References

- ADR-002 (Simulation determinism) — the determinism guarantee soak tests verify
- ADR-008 (World clock + event loop) — the advance-loop being soaked
- ADR-020 (Day-by-day tick) — STOP event semantics tested in the secondary
  protocol
- `production/qa/qa-plan-sprint-12-2026-05-21.md` — defines this protocol as
  Sprint 12 task 12-5 (Nice to Have, scaffold only)
