# QA Test Plan — Sprint 01: Cascade Engine Foundation

**Sprint**: 01 — Cascade Engine Foundation
**Date**: 2026-05-19
**Stories in scope**: 5
**QA Lead**: qa-lead agent
**Test runner**: Vitest 2 (`node_modules/.bin/vitest run`)

---

## Scope

All 5 Sprint 01 stories implement the foundation of the cascade engine in `packages/shared/src/sim/`. All are Type: **Logic** — automated unit tests are required and cover 100% of acceptance criteria. No manual QA required.

---

## Story Classification

| Story | Type | Automated Test Required | Manual QA | Blocker? |
|---|---|---|---|---|
| CASCADE-001: WorldState + NodeId types | Logic | Yes — BLOCKING | None | None |
| CASCADE-002: CascadeEdgeDef + CASCADA_FC_GRAPH | Logic | Yes — BLOCKING | None | None |
| CASCADE-003: DelayedEffectsBuffer + Zod schema | Logic | Yes — BLOCKING | None | None |
| CASCADE-004: runTick() Steps 1, 4, 6 skeleton | Logic | Yes — BLOCKING | None | None |
| CASCADE-005: runTick() Steps 2+3 evaluation | Logic | Yes — BLOCKING | None | None |

---

## Automated Test Requirements

| Story | Expected Test Path | Actual Path | Tests | Status |
|---|---|---|---|---|
| CASCADE-001 | `tests/cascade-types.test.ts` | `packages/shared/tests/cascade-types.test.ts` | 15 | PASS |
| CASCADE-002 | `tests/cascade-engine/graph-topology.test.ts` | `packages/shared/tests/cascade-engine/graph-topology.test.ts` | 67 | PASS |
| CASCADE-003 | `tests/cascade-engine/delayed-effects-buffer.test.ts` | `packages/shared/tests/cascade-engine/delayed-effects-buffer.test.ts` | 22 | PASS |
| CASCADE-004 | `tests/cascade-engine/runtick-skeleton.test.ts` | `packages/shared/tests/cascade-engine/runtick-skeleton.test.ts` | 20 | PASS |
| CASCADE-005 | `tests/cascade-engine/runtick-edges-decisions.test.ts` | `packages/shared/tests/cascade-engine/runtick-edges-decisions.test.ts` | 13 | PASS |

**Total**: 143 tests, 143 passing, 0 failing.

---

## Manual QA Scope

**None** — All 5 stories are Type: Logic. The automated test suite covers all acceptance criteria for every story. Manual QA would not add signal beyond the automated suite for this sprint.

---

## Out of Scope

- Individual chain formula bodies (transferFn implementations) — deferred to Sprint 02 stories 006-013
- Threshold crossing detection — story 014, Sprint 03
- Persistence / world_snapshots — story 015, Sprint 03+
- End-to-end determinism integration test — story 017, Sprint 05
- Any story outside `packages/shared/src/sim/` foundation layer

---

## Entry Criteria

- [x] Smoke check PASS report at `production/qa/smoke-2026-05-19.md`
- [x] Build stable: `tsc --noEmit` clean; `vitest run` 143/143
- [x] All 5 Must Have stories Status: Complete or Done

All entry criteria met.

---

## Exit Criteria

- All 5 stories return PASS in test suite
- No S1/S2 bugs open
- QA sign-off report written and verdict APPROVED

---

## Smoke Check Reference

**Report**: `production/qa/smoke-2026-05-19.md`
**Verdict**: PASS
**Notes**: 2 TypeScript compilation errors (`exactOptionalPropertyTypes` + `console` in ES2022 lib) discovered and fixed during the smoke check run. Both were silent under Vitest's esbuild but would have broken strict `tsc` builds.
