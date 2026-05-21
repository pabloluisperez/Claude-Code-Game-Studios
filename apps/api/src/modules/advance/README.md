# advance module

Sprint 8 task 8-4 created this module as the **seam** for the full advance-loop
extraction planned for Sprint 9+. As of 2026-05-21 the module contains:

| File | Purpose | Status |
|---|---|---|
| `load-context.ts` | `loadAdvanceContext(handle, userId)` — single helper consolidating the 4 context SELECTs the dashboard form action runs serially | ✅ Implemented Sprint 8 task 8-4 |
| `orchestrator.ts` | `runAdvanceTick(playthroughId, decisions)` — full orchestrator (TV pre-phase + cascade + economy + match + staff + persist) | 🚧 **Deferred to Sprint 9** — full extraction is too risky for an autonomous overnight refactor; needs human verification of each step's behavior preservation |

## Why was the orchestrator extraction deferred?

The `advance` action in `apps/web/src/routes/dashboard/+page.server.ts` is
~400 LOC and integrates 6 subsystems (TV pre-phase, cascade, economy, match,
staff messages, season rollover) inside a single `db.transaction(...)` block.
Each subsystem has its own subtle ordering requirements documented in
`docs/architecture/advance-loop.md`. Extracting the full orchestrator
risks behavior drift in any of the 6 integrations.

The Sprint 8 task 8-4 plan was 2.5 days of focused work; in the autonomous
overnight session, only `loadAdvanceContext` was implemented as a safe
proof-of-concept. The remaining ~350 LOC will move in a Sprint 9 task with:

1. A pre-refactor regression baseline run of the full `happy-path.spec.ts` +
   `cross-epic/integration-smoke.test.ts`.
2. Per-subsystem extraction in separate commits (one for `tvPrePhase`, one
   for `cascadeStep`, etc.) with the same regression suite run between each.
3. The final cutover that flips `actions.advance` from inline orchestration
   to `await runAdvanceTick(playthrough.id, decisions)`.

## Migration to `loadAdvanceContext`

The dashboard form action can adopt this helper TODAY without any orchestrator
changes. The current code:

```typescript
const [active] = await db.select().from(playthroughs).where(eq(playthroughs.userId, locals.user.id)).orderBy(desc(playthroughs.updatedAt)).limit(1);
if (!active) return fail(400, { error: 'No hay carrera activa.' });

const [latest] = await db.select().from(worldSnapshots).where(eq(worldSnapshots.playthroughId, active.id)).orderBy(desc(worldSnapshots.week)).limit(1);
const basePrevState = (latest?.worldState as WorldState) ?? defaultWorldState();
const prevBuffer = (latest?.delayedEffectsBuffer ?? []) as DelayedEffectsBuffer;
const nextWeek = (latest?.week ?? -1) + 1;

const [tvClubRow] = await db.select(...).from(clubs).where(eq(clubs.id, active.clubId)).limit(1);
const currentDivision = tvClubRow?.division === 'first' ? 'D1' : 'D2';

// ... 14 LOC of season lookup ...
```

becomes (in a follow-up commit, which this README defers but does not implement):

```typescript
const ctx = await loadAdvanceContext(db, locals.user.id);
if (!ctx) return fail(400, { error: 'No hay carrera activa.' });

const basePrevState = ctx.prevState;
const prevBuffer = ctx.prevBuffer;
const nextWeek = ctx.latestWeek + 1;
const currentDivision = ctx.currentDivision;
const tvCurrentSeason = ctx.currentSeason;
```

That's ~30 LOC down to 6, with no behavioral change. The follow-up commit
will land as Sprint 9 task once the regression strategy is in place.

## References

- `docs/architecture/advance-loop.md` — full tick-order doc + refactor target
- `apps/web/src/routes/dashboard/+page.server.ts` — current de-facto orchestrator
- `docs/architecture/ADR-008-world-clock-event-loop.md` — canonical world-clock spec
