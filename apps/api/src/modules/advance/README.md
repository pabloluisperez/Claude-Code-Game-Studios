# advance module

Sprint 8 task 8-4 created this module as the **seam** for the full advance-loop
extraction. Subsequent sprints landed the extraction incrementally:

| Sprint | Task | What landed |
|---|---|---|
| 9 | 9-1 (partial) | `loadAdvanceContext` moved to `packages/db/src/repos/advance-context.ts` so both `apps/web` and `apps/api` can import it from `@smt/db`. |
| 10 | 10-5 (partial) | `runAdvanceTickCore` extracted the pure-compute pipeline (TV pre/post + cascade + ticket drip + delayed-effects buffer). Lives in `apps/web/src/lib/server/advance-orchestrator.ts`. |
| 11 | 11-2 | `runAdvanceTickFull` extracted the FULL pipeline (pure-compute + DB-write: snapshot persist, currentWeek bump, TV side-effects, match-day, staff messages, manager XP, milestones, season rollover). Dashboard form action collapsed from ~340 LOC of inline orchestration to ~30 LOC delegation + redirect. |

## Current de-facto location

```
apps/web/src/lib/server/advance-orchestrator.ts
  ├── runAdvanceTickCore(opts)   — pure-compute portion (Sprint 10 task 10-5)
  └── runAdvanceTickFull(opts)   — full pipeline + DB writes (Sprint 11 task 11-2)
```

The orchestrator lives in `apps/web` because:

1. **Cross-app dependency constraint**: `apps/web` (SvelteKit) cannot import
   from `apps/api` (Hono) — they're sibling workspace packages with no edge.
2. **Helper dependencies live in apps/web**: `match-day-runner`, `economy-tick`,
   `season-rollover`, `milestones`, `manager-xp`, `ambient-staff`, and
   `tv-rights-tick` all live in `apps/web/src/lib/server/`. Moving the
   orchestrator to `apps/api` would require moving 7 helpers first.
3. **Atomic transaction**: the DB-write portion runs inside a single
   `db.transaction(...)` block. A cross-process HTTP refactor would either
   lose atomicity or require a 2PC pattern.

## Deferred to Sprint 12+

The Sprint 11 plan called for the orchestrator to live in
`apps/api/src/modules/advance/orchestrator.ts` with a `POST /api/advance`
Hono route and the dashboard form action making a cross-process HTTP fetch.
That migration was deferred because:

1. Session-cookie forwarding from SvelteKit SSR to Hono is non-trivial.
2. Transactional guarantees would need a re-design (or stay as-is and
   accept the cross-process call as an awkward boundary).
3. Realtime-multiplayer-specialist hasn't designed the MMO migration yet —
   the cross-app boundary is the right place to make those decisions
   together.

When the MMO migration starts in Sprint 12+:

1. Move the 7 helpers to `packages/shared` or a new `packages/advance` so
   `apps/api` can import them without cross-app coupling.
2. Move `runAdvanceTickCore` + `runAdvanceTickFull` to this directory.
3. Add Hono route `POST /advance` calling the orchestrator.
4. Add session-cookie forwarding from SvelteKit form action → Hono route.
5. Delete the apps/web copy of the orchestrator.

The Sprint 11 extraction sets up steps 1-3 by making the orchestrator a
single function with a clean interface
(`runAdvanceTickFull({ ctx, redirectMode })`) — the future move is a
file-relocation plus dependency-port, not a behavioral refactor.

## References

- `docs/architecture/advance-loop.md` — full tick-order doc
- `apps/web/src/lib/server/advance-orchestrator.ts` — current orchestrator
- `apps/web/src/routes/dashboard/+page.server.ts` — thin form action delegating to it
- `apps/web/tests/advance-orchestrator-extraction.test.ts` — structural regression guard
- `docs/architecture/ADR-008-world-clock-event-loop.md` — canonical world-clock spec
- `docs/architecture/ADR-020-day-by-day-tick.md` — day-by-day tick (Sprint 11 task 11-4 lands inside this orchestrator)
