# Test Infrastructure

**Engine**: Web (TypeScript full-stack monorepo)
**Test Framework**: Vitest 2 (unit + integration) · Playwright 1.48 (e2e)
**CI**: `.github/workflows/tests.yml`
**Setup date**: 2026-05-16

## Directory Layout

This project uses a **per-workspace test layout** (the convention established by
`/setup-web-stack`) rather than a centralised `tests/unit` + `tests/integration`
tree. Tests live next to the code they cover:

```
apps/web/tests/         — SvelteKit component tests (Vitest + @testing-library/svelte)
apps/api/tests/         — Hono route + service integration tests (Vitest + real DB)
packages/shared/tests/  — Pure-function tests: sim, schemas, types (Vitest)
packages/db/tests/      — Drizzle schema + migration tests (when added)

tests/
  e2e/                  — End-to-end flows: signup → login → club → game (Playwright)
  smoke/                — Critical-path checklist for /smoke-check gate
  evidence/             — Screenshot and manual test sign-off records
  README.md             — This file
```

> **Important**: tests for a system go inside the **workspace that owns that system**.
> Do not create `tests/unit/[system]/` at the repo root — use the per-workspace dir.

## Running Tests

```bash
pnpm test            # Turbo orchestrates `vitest run` in every workspace
pnpm test:unit       # Alias: same as `pnpm test`
pnpm test:e2e        # Playwright e2e (requires `pnpm dev` infrastructure)
pnpm --filter @smt/api test  # Run only one workspace's tests
```

## Test Naming

- **Files**: `[system]-[feature].test.ts` (kebab-case, per the project naming standard)
- **Functions**: `it('[scenario] - expected [behavior]', () => { ... })`
- **Example**: `cascade-engine-evaluate-tick.test.ts` → `it('applies thresholdCrossings when node crosses BLOCKING threshold', ...)`

## Story Type → Test Evidence

Per `.claude/docs/coding-standards.md` Test Evidence table:

| Story Type | Required Evidence | Location | Gate Level |
|---|---|---|---|
| Logic | Automated unit test — must pass | Owning workspace's `tests/` | BLOCKING |
| Integration | Integration test OR documented playtest | `apps/api/tests/`, `tests/e2e/` | BLOCKING |
| Visual/Feel | Screenshot + lead sign-off | `tests/evidence/` | ADVISORY |
| UI | Manual walkthrough doc OR interaction test | `tests/evidence/` or `apps/web/tests/` | ADVISORY |
| Config/Data | Smoke check pass | `production/qa/smoke-[date].md` | ADVISORY |

## Determinism Rules (forbidden patterns)

These are enforced by code review and CI:

- ❌ `Math.random()` inside `packages/shared/src/sim/` — use seeded RNG passed via SimContext
- ❌ `Date.now()` inside `packages/shared/src/sim/` — use `ctx.worldClock`
- ❌ Mocked DB in integration tests under `apps/api/tests/` — use the real CI Postgres service
- ❌ Cross-workspace direct imports of internal modules — only use `@smt/shared` public surface

## Sim Test Pattern

Tests for `packages/shared/src/sim/` MUST:

1. Pass a fixed seed via `SimContext { rng: seedrandom('test-seed-001') }`
2. Assert exact values, not "approximately" — determinism = bit-exact reproduction
3. Compare against a golden output snapshot stored in `packages/shared/tests/__golden__/`
4. Run twice in the same test to verify determinism (`expect(result1).toEqual(result2)`)

See ADR-002 (Simulation Determinism) for the full contract.

## CI

Tests run automatically on every push to `main` and every PR.
A failed test suite blocks merging. Postgres 16 and Redis 7 are provided as
service containers; no external secrets needed for the default profile.
