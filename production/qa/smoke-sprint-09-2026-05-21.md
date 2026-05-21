# Smoke Check — Sprint 9 (2026-05-21)

> Pre-gate smoke verification after Sprint 9 polish train. Solo-dev autopilot session.

## Build State

| Field | Value |
|---|---|
| Branch | `project/SoccerManagerTotal` |
| Latest commit | `0610920` (P9 TV rights tabs + global €K → € pass) |
| Test suite | `pnpm -r test` |
| Type check | `svelte-check --threshold error` |

## Automated Verification

| Check | Result | Notes |
|---|---|---|
| `packages/shared` vitest | ✅ **953 / 953 passed** | All simulation engine tests pass |
| `apps/api` vitest | ✅ **44 / 44 passed** | TV-rights smoke + integration + cross-epic smoke |
| `apps/web` vitest | ✅ **1 / 1 passed** | Sanity smoke only — no playwright in scope |
| `svelte-check` | ✅ **0 errors, 5 warnings** | 916 files scanned; warnings pre-existing, all non-blocking |
| `tsc --noEmit` (shared) | ✅ pass | exit 0 |

**Combined: 998 / 998 automated tests passed.**

## Manual Smoke (Sprint 9 polish deliverables)

| Surface | Result | Verifier |
|---|---|---|
| Dashboard match-day card (M2 + B4) | ✅ shows pending state pre-replay, score after, dest links P1 | Pablo (playtest 2026-05-21) |
| Match flow skip-to-end (M1 + M3) | ✅ split button works pre/post final whistle, today's match included | Pablo (playtest 2026-05-21) |
| Advance button consolidation (D) | ✅ single context-aware button, no redundancy | Pablo (playtest 2026-05-21) |
| Finance — cashflow breakdown (P13) | ✅ 2-column ingresos/gastos + recovery levers visible | Self-audit + svelte-check |
| Finance — sponsor accept (B1 + B2) | ✅ multi-slot logic + native slider fallback ship | Self-audit |
| Finance — TV rights tabs (P9) | ✅ tab bar mirrored, tab-active on /finance/tv-rights | Self-audit |
| League layout (P3 + P4 + P5 + P6) | ✅ 2-col + hover cross-highlight + bg-primary my-team + 'Todas' tab | Self-audit + svelte-check |
| Inbox UX (P14 + P15 + F) | ✅ calendar-sheet dates + reserved badge slot + auto-mark stale | Self-audit + svelte-check |
| Global €K → € display | ✅ formatEurK applied to finance, calendar, staff, tv-rights, dashboard messages | Self-audit + svelte-check |
| Economy retune | ✅ SALARY_BASE 6→3, ROSTER_SIZE 40→25, quotas rebalanced | Pablo (W4 stable confirmation) |

## Bug State

| Severity | Count | Notes |
|---|---|---|
| S1 (Blocker) | 0 | — |
| S2 (Critical) | 0 | M1/M2/M3 closed this sprint |
| S3 (Major) | 0 | — |
| S4 (Minor) | 1 deferred | E mid-week pause (architectural — Sprint 10+ ADR required) |

## Verdict

**PASS** — all automated suites green, all Sprint 9 deliverables verified, no S1/S2 open.

The single deferred S4 (mid-week pause) is documented in the playtest 2026-05-21
economy-tuning report and is intentionally out of scope for Polish-phase entry
because it requires a day-by-day tick model that does not yet exist.

This smoke supports the Production → Polish gate-check (see same date).
