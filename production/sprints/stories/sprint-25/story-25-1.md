# 25-1 — Drizzle snapshot drift reset

**Sprint:** 25 | **Owner:** web-backend | **Est:** 0.5d | **Dependencies:** — | **Status:** Pending

## Problem

`pnpm db:generate` fails with:

```
Error: Cannot find module './users.js'
Require stack: packages/db/src/schema/index.ts
```

The schema uses ESM `.js` extensions (`export * from './users.js'`) but
`drizzle-kit@0.28` runs in Node CJS mode via `require()` which doesn't
auto-resolve `.ts` → `.js`.

Additionally, the `_journal.json` has 41 entries (idx 0–40) but snapshot
files only go up to `0023_snapshot.json`. Migrations 0024–0041 were
hand-authored SQL + manual journal entries without snapshot generation.

## Acceptance Criteria

- [ ] `pnpm db:generate` completes without errors
- [ ] Generated SQL files match existing hand-authored migrations (no new/renamed/dropped columns)
- [ ] `_journal.json` has snapshot files for ALL 41 entries
- [ ] No spurious renames in generated snapshots
- [ ] Round-trip works: generate → migrate → generate again = no diff

## Implementation Notes

### Root Cause
Schema uses `.js` extensions (TS ESM convention) but `drizzle-kit` resolves
via `require()` which can't resolve `.ts` → `.js`.

### Approach
Option A: Change schema imports from `.js` to `.ts` — simplest, works with
existing drizzle-kit.

Option B: Add `--config` flag or tsconfig alias to drizzle-kit — more complex.

### Steps
1. Backup `drizzle/meta/_journal.json` + existing snapshots
2. Change all `./users.js` → `./users.ts` in schema/index.ts and re-export files
3. Run `pnpm db:generate`
4. Verify generated SQL matches existing hand-authored SQL for each migration
5. If drift exists: compare column-by-column, fix schema, regenerate
6. Generate remaining snapshots by running generate with breakpoints for idx 24–40
7. Verify clean round-trip
