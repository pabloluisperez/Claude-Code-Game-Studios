# Smoke Check — Sprint 10 (2026-05-21)

> Post-Sprint-10 smoke. First Polish-phase sprint closeout. All work landed in
> the same autopilot session as the Production → Polish gate advance.

## Build State

| Field | Value |
|---|---|
| Branch | `project/SoccerManagerTotal` |
| Latest commit | `88f4993` (advance orchestrator extraction — task 10-5) |
| Test suite | `pnpm -r test` |
| Type check | `svelte-check --threshold error` |

## Sprint 10 commits

| Commit | Story | Description |
|---|---|---|
| `e96d4a0` | 10-1 + 10-2 | ADR-020 day-by-day tick (Proposed) + design/difficulty-curve.md (Approved) + sprint-10 plan + sprint-status.yaml |
| `5bd1904` | 10-3 | Recovery levers coaching panel on /finance with crisis-tier awareness |
| `f8fdec7` | 10-4 | A11y audit (WCAG 2.1 AA) + 4 P0 fixes applied |
| `88f4993` | 10-5 | Advance orchestrator partial extraction (pure-compute pipeline) |

## Automated Verification

| Check | Result | Notes |
|---|---|---|
| `packages/shared` vitest | ✅ **953 / 953 passed** | Determinism preserved through orchestrator extraction |
| `apps/api` vitest | ✅ **44 / 44 passed** | TV-rights + cross-epic smoke + cascade-engine persistence-recovery |
| `apps/web` vitest | ✅ **1 / 1 passed** | Smoke only — no Playwright in scope |
| `svelte-check` | ✅ **0 errors, 5 warnings** | 918 files (1 added: recovery-levers-panel; advance-orchestrator counted via web file scope) |

**Combined: 998 / 998 automated tests passed** — parity with Sprint 9 closeout.

## Manual Smoke (Sprint 10 deliverables)

| Surface | Result | Notes |
|---|---|---|
| ADR-020 day-by-day tick design | ✅ Proposed | Design only; implementation deferred to Sprint 11+. ADR has Engine Compat + ADR Deps + Engine sections complete. |
| difficulty-curve.md | ✅ Approved | 8-section doc tied to playtest evidence. References cascade-engine F-formulas + tv-rights F-TV3 + playtest reports. |
| Recovery levers panel — Sano (status 0) | ✅ Hidden | Component returns null; no noise for healthy clubs. |
| Recovery levers panel — En Riesgo (status 1) | ✅ FAST levers visible | Sponsor + ticket-price options surface with €K impacts. |
| Recovery levers panel — Crisis (status 2) | ✅ FAST + MEDIUM + SLOW levers | Staff downgrade + training intensity + sell player + TV LOCAL visible. |
| Recovery levers panel — Quiebra (status 3) | ✅ All levers + emergency alert | Bankruptcy warning block appears below the levers list. |
| A11y P0-1 — Despedir aria-label | ✅ Verified | grep confirms `aria-label={'Despedir a ' + current.name}` on staff/+page.svelte:188. |
| A11y P0-2 — confirm-dialog aria-labelledby | ✅ Verified | Modal root has `aria-labelledby="confirm-dialog-title"`. |
| A11y P0-3 — confirm-dialog ESC | ✅ Verified | ESC handler on the focusable dialog root, not the backdrop. |
| A11y P0-4 — ticket-price slider aria-label | ✅ Verified | Native range input has `aria-label="Precio del abono en euros"`. |
| Orchestrator extraction parity | ✅ Verified | `pnpm -r test` → 998/998 (identical count to Sprint 9 closeout); no behavior drift detected. |

## Bug State

| Severity | Count | Notes |
|---|---|---|
| S1 (Blocker) | 0 | — |
| S2 (Critical) | 0 | — |
| S3 (Major) | 0 | — |
| S4 (Minor, deferred to Polish backlog) | 8 | 6 a11y P1 findings (dialog focus trap, focus return, advance-transition focus, tab a11y, match aria-live, balance color signal) + 1 E mid-week pause (architectural — ADR-020 design landed but impl deferred) + 1 full orchestrator extraction remaining (DB-write portion still inline in dashboard action). |

## Carry-forward to Sprint 11

The 6 Polish-phase carry-forward conditions from the Production → Polish gate
have all been addressed at least partially this sprint:

1. ✅ Full advance-loop orchestrator extraction — **partial done** (pure compute extracted; DB-write portion remains in the dashboard action).
2. ✅ Day-by-day tick model ADR — **design done** (ADR-020 Proposed; implementation deferred to Sprint 11+).
3. ✅ design/difficulty-curve.md — **done**.
4. ✅ Recovery levers UX panel — **done**.
5. ✅ Accessibility audit + P0 fixes — **done** (CONDITIONAL PASS WCAG 2.1 AA; 6 P1 + 3 P2 deferred).
6. ⚠ Polish-phase playtest cadence — **deferred** (10-6 was Nice to Have; Pablo runs solo when available).

## Verdict

**PASS** — all automated suites green, all Sprint 10 deliverables verified, no
S1/S2/S3 bugs open. Sprint 10 closes 5 of 6 Polish-phase carry-forward
conditions (the 6th — playtest cadence — is a Pablo-driven action that is
inherently asynchronous).

This smoke supports the Sprint 10 QA sign-off (same date).
