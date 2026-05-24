# Advance Loop Architecture

> Sprint 8 task 8-2 — documents the de-facto advance-loop as it exists at 2026-05-21.
> Source ADR: `docs/architecture/ADR-008-world-clock-event-loop.md`.
> Refactor target: Sprint 8 task 8-4 (extract to `apps/api/src/modules/advance/`).

## What the advance-loop does

Each call to advance() processes ONE in-game week for the manager's playthrough and composes:

1. Load latest `world_snapshots` row (the previous tick's state + delayed-effects buffer).
2. **TV pre-phase** (ADR-019 / tv-rights GDD §F-TV3) — applies the corruption delta from the active TV contract BEFORE the cascade tick reads `corruption_exposure`.
3. **Cascade tick** (runTick) — produces nextState + delayedEffects + log + thresholdCrossings.
4. **Economy tick** — sponsor revenue + staff wages + player wages + matchday revenue (if home match this week) → updates `financial_balance` in nextState.
5. **Match-day simulation** — for every fixture scheduled this week:
   - Simulates the match deterministically (per-tick or one-shot).
   - Persists the result to `fixtures` + updates `standings` + writes match-related cascade WorldState writes (`match_performance_index`, `injury_risk`, `consecutive_wins`/`losses`).
6. **Staff message generation** — diffs the worldState pre/post-tick and emits perception-gated messages (per ADR-009 + staff-system.md).
7. **End-of-season rollover** — if `nextWeek > season.endWeek`, run `processSeasonEnd` (promotion/relegation, manager XP, etc.).
8. **Manager-RPG XP grants** (per ADR-010) — inline during the same transaction.
9. **Persist tick** — INSERT new `world_snapshots` row (week = nextWeek) with worldState + delayedEffectsBuffer + (Sprint 8 task 8-1) cascadeLog + thresholdCrossings + seedState if match-week.
10. Redirect back to `/dashboard?advanced=1`.

All of the above runs inside a single SvelteKit form action handler (`apps/web/src/routes/dashboard/+page.server.ts` → `actions.advance`), and the database calls are wrapped in `db.transaction(async (tx) => { ... })` so a failure mid-pipeline rolls back the entire week's writes.

## Entry points

| Entry point | What triggers it | Notes |
|---|---|---|
| `/dashboard?/advance` (SvelteKit form action) | User clicks "Avanzar semana" on /dashboard | The dominant path — interactive game loop |
| `/match/[id]?/resume` (match resume form action) | User clicks "Continuar" in a paused match | Subset of advance — only the match-sim portion runs |
| BullMQ `match-worker` job | Scheduled match continuation (delayed substitution decisions) | per ADR-013 MatchSession FSM |
| BullMQ `recovery-worker` job | Scheduled cleanup (timeout-decision auto-apply) | per ADR-008 timeout protocol |

## Tick order (canonical, per ADR-008)

```
                ┌─────────────────────────────────────────┐
                │  load latest world_snapshots (week N)    │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  TV PRE-PHASE (ADR-019)                  │
                │    F-TV3 delta on corruption_exposure    │
                │    F-TV3 threshold cancel check          │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  CASCADE TICK (runTick) for week N+1    │
                │    Step 1: consume delayed effects       │
                │    Step 2: evaluate edges (instant +     │
                │            queue delayed)                │
                │    Step 3: apply PlayerDecisions         │
                │    Step 4: clamp + build nextState       │
                │    Step 5: detect threshold crossings    │
                │    Step 6: return TickResult             │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  ECONOMY TICK                             │
                │    sponsor revenue + staff/player wages   │
                │    matchday revenue (if home this week)   │
                │    update financial_balance in nextState  │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  MATCH-DAY SIMULATION (if fixtures this  │
                │  week)                                    │
                │    runMatch / simulateMatch deterministic │
                │    write match_performance_index, etc.    │
                │    persist fixture + standings rows       │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  STAFF MESSAGE GENERATION                 │
                │    diff pre/post worldState               │
                │    apply tier-specific perception filter  │
                │    INSERT staff_messages rows             │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  END-OF-SEASON ROLLOVER (if applicable)  │
                │    promotion/relegation                   │
                │    season manager XP                      │
                │    reset season counters                  │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  MANAGER-RPG XP GRANTS                    │
                │    inline applyXpGrants(ctx, ..., grants) │
                │    skill level-ups → NOTIFY events        │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  PERSIST TICK                             │
                │    INSERT world_snapshots (week N+1)     │
                │    Sprint 8 task 8-1: include cascade_log,│
                │      threshold_crossings, seed_state if   │
                │      match-week                           │
                └────────────────────┬────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────┐
                │  REDIRECT 303 /dashboard?advanced=1      │
                └─────────────────────────────────────────┘
```

## Transaction boundary

All DB writes between "load latest world_snapshots" and "INSERT world_snapshots (week N+1)" are wrapped in **one** `db.transaction(async (tx) => { ... })` block. A failure anywhere in steps 2-9 rolls back the entire week — there is never a partial advance.

The transaction is *interactive* (uses `tx` for every query), not autocommit. The function signature pattern for repo helpers (e.g. `saveTickResult(tx, args)`) keeps this property compositional.

## Recovery paths

| Scenario | Recovery |
|---|---|
| HTTP timeout during advance | Transaction rolls back; user re-clicks; idempotent (no partial week persisted) |
| Server crash mid-tick | Postgres transaction abort; no orphan rows; user re-clicks on next session |
| Match paused for substitution decision | Match-session row in `paused_for_decision` state; `recovery-worker` auto-applies default decision at the 24h timeout if user doesn't act |
| World snapshot row corrupted / missing nodes | `loadCurrentWorldState` Zod-validates on read → ZodError instead of silent corruption; manual DB fix required |

## STOP-event gating

The advance() action checks `calendar_events` for `priority='STOP', status='pending'` BEFORE executing the tick. If any STOP exists for the current week:

```
return fail(409, { error: 'pending_stop_event', event_type: <type> });
```

The UI's dashboard advance button is disabled while `pendingStops > 0` (HUD-UI-002). Decision endpoints (`POST /api/events/:id/decide`) resolve the STOP, after which advance() may proceed.

## Persistence schema (post Sprint 8 task 8-1)

```
world_snapshots
├── id              uuid PK
├── playthrough_id  uuid FK → playthroughs (CASCADE)
├── week            integer (UNIQUE with playthrough_id)
├── world_state     jsonb (NOT NULL)
├── delayed_effects_buffer jsonb (NOT NULL, default '[]')
├── cascade_log     jsonb NULL   ← Sprint 8 task 8-1
├── threshold_crossings jsonb NULL  ← Sprint 8 task 8-1
├── seed_state      text NULL   ← Sprint 8 task 8-1
└── created_at      timestamp DEFAULT NOW()
```

`(playthrough_id, week)` has a UNIQUE INDEX — duplicate inserts fail loudly.

## Known limitations (and where the refactor target Sprint 8 task 8-4 will help)

1. **Single-file orchestrator**: ~400 LOC of `actions.advance` in `apps/web/src/routes/dashboard/+page.server.ts` mixes SvelteKit form-action ergonomics with the core orchestrator. Hard to test independently of the HTTP layer.
2. **Cross-cutting reads scattered**: each step calls its own `db.select()` for context (active club, current division, current season, latest snapshot). Refactor will introduce a single `loadAdvanceContext` helper.
3. **No worker yet**: the advance() runs synchronously inside the HTTP request. For long-running matches this is acceptable (each match ~50-100ms). For 38-week season skip-ahead it would block — but per ADR-008 STOP events always halt at match days, so a skip never spans > 1-2 weeks.
4. **Match-sim integration is week-scoped only**: the live-match pause flow (`/match/[id]`) bypasses advance() and goes through its own form actions. The two paths share `runMatchTick` but not the surrounding orchestration. Sprint 8 task 8-4 will not unify these — the live-match flow is intentional per ADR-013.

## Sprint 8 refactor target (task 8-4)

The refactor extracts the orchestrator into:

```
apps/api/src/modules/advance/
├── orchestrator.ts        ← exports runAdvanceTick(playthroughId, decisions)
├── load-context.ts        ← loadAdvanceContext(tx, playthroughId)
├── tv-pre-phase.ts        ← thin wrapper around tv-rights/service.runTVPrePhase
├── cascade-step.ts        ← thin wrapper around shared runTick
├── economy-step.ts        ← thin wrapper around economy/service.applyEconomyTick
├── match-step.ts          ← thin wrapper around match/service.runScheduledMatches
├── staff-messages-step.ts ← thin wrapper around staff/service.emitMessagesForTick
├── season-rollover-step.ts← thin wrapper around season/season-end-service
├── persist-step.ts        ← saveTickResult + season/club updates
└── README.md              ← architecture doc + invariants
```

The SvelteKit `/dashboard?/advance` action becomes a thin wrapper:

```typescript
advance: async ({ locals, request }) => {
  if (!locals.user) throw redirect(303, '/login');
  const form = await request.formData();
  const playthrough = await loadPlaythroughForUser(locals.user.id);
  await runAdvanceTick(playthrough.id, parseDecisionsFromForm(form));
  throw redirect(303, '/dashboard?advanced=1');
};
```

**Migration safety**: the refactor must preserve the single-transaction property and the redirect-after-success behavior. The existing happy-path E2E (`apps/web/tests/e2e/happy-path.spec.ts`) + cross-epic integration smoke (`apps/api/tests/cross-epic/integration-smoke.test.ts`) are the regression gate.

## References

- ADR-008: World Clock + Event Loop
- ADR-013: Match Session Stateful Pattern
- ADR-019: TV Rights Implementation Contract
- `apps/web/src/routes/dashboard/+page.server.ts` (current implementation)
- `apps/api/src/modules/world-state/world-state-repo.ts` (persistence repo)
- `apps/api/src/workers/match-worker.ts` + `recovery-worker.ts` (BullMQ workers)
