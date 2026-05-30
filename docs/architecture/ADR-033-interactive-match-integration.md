# ADR-033: Wiring the Interactive MatchSession into Live Gameplay

## Status

Proposed

## Date

2026-05-30

## Last Verified

2026-05-30

## Decision Makers

Pablo (solo dev). Phase 1 of the "decisions during the match" feature.

## Summary

The interactive MatchSession engine (ADR-013: tick-by-tick simulation, pause
windows at minutes 45/60/75 for substitutions, PRNG-resumable, BullMQ worker,
HTTP decision endpoints, Socket.IO) is **fully built but disconnected** from the
game. Today the user's match is decided one-shot during the weekly advance
(`runMatchDay`) and `/match` only replays it. This ADR defines how to route the
**user's** fixture through the MatchSession (so halftime/sub decisions affect the
result) while AI fixtures stay one-shot.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web (TypeScript full-stack monorepo: SvelteKit + Hono + BullMQ + Socket.IO + Drizzle) |
| **Domain** | Core / Simulation / Backend + Frontend |
| **Knowledge Risk** | LOW — all the hard parts (engine, worker, PRNG resume) exist and are tested |
| **References Consulted** | ADR-013 (Match Session Pattern), ADR-007 (pure simulateMatch), ADR-002 (determinism), the gap map (this session) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Per phase (see Plan): session created on /match open, pause at 45 visible, decision alters 2nd half, result lands in fixtures+standings+worldState identical-by-construction to one-shot for a no-op playthrough |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-013 (Accepted — the engine), ADR-005 (worldstate snapshots), ADR-002 (seeded determinism) |
| **Enables** | In-match decisions (subs, formation, instructions) — the headline management feature |
| **Blocks** | — |
| **Ordering Note** | Must be Accepted before Phase 2 (code wiring). Phases 2-5 implement it. |

## Context

### What exists (built, tested, unused)
- `packages/shared/.../match-session-fsm.ts`: `initMatchSession`, `advanceTick(snapshot, decisions, input)`, `validateDecision`, `applyDefaultDecisionsToSnapshot`, `buildMatchOutcome`. Pause windows `SUB_WINDOW_TICKS = {45,60,75}`, `MAX_SUBSTITUTIONS=5`, `TOTAL_TICKS=90`. Decisions: `substitution | formation_change | instruction_change | emergency_gk_assign | no_op`. PRNG state serialized per tick (Option B) → resumable.
- `apps/api/src/workers/match-worker.ts`: `processMatchJob` — load → `advanceTick` until pause/completion → persist snapshot → on pause create a delayed timeout job (24h) + emit `match:paused`; on completion call `applyOutcomeCallback` + emit `match:complete`. Queue `match-tick`.
- `apps/api/src/modules/match/routes.ts`: `POST /matches/start` (create session + enqueue first tick), `POST /matches/:id/decision` (validate + `advanceTick` + re-enqueue), `GET /matches/:id`.
- `apps/api/src/modules/match/match-sessions-repo.ts`: createSession / findActiveSession / findById / updateSnapshot / markCompleted / `acquireForUpdate` (SELECT … FOR UPDATE mutex).
- `packages/db/.../match-sessions.ts`: full snapshot columns + state FSM (`pre_match | in_progress | paused_for_decision | completed | failed`) + partial unique index `match_sessions_active_playthrough` (one non-terminal session per playthrough).
- Socket `/match` namespace, room `match:{id}`, events `match:paused|resumed|complete|event`; client `joinMatchRoom`.

### What's NOT wired (the gap)
1. **Nobody creates a session.** Advance one-shot-simulates the user's match; `/match` replays a fixture by id.
2. **`applyOutcomeCallback` is a placeholder** — the session result never reaches `fixtures` / `standings` / `worldState`.
3. **`runMatchDay` simulates ALL fixtures**, including the user's.
4. **`/match` replays**, it doesn't drive a session (no decision UI, no pause handling).
5. **Result shape mismatch**: one-shot `matchOutcomeData = {winner, homeStrength, awayStrength, events}` vs session `MatchOutcome = {homeScore, awayScore, winner, events, worldStateDeltas, playerRatings, finalLineup*}`.
6. **Post-match side effects** (suspensions/injuries/fitness/morale, fan_momentum hook in advance Phase 6c) currently run inside `runMatchDay` + the orchestrator — they must move/branch for the user's session-driven match.

## Decision

### D1. The user's fixture is interactive **on demand**; AI fixtures stay one-shot.
- During the weekly advance, `runMatchDay` **skips the user's club fixture** (leaves it `status='scheduled'`) and one-shot-simulates every other fixture exactly as today.
- The dashboard surfaces the user's **unplayed** fixture this week as a prominent **"▶ Jugar partido"** CTA (replacing today's "Partido jugado hoy" card for that case).
- Opening `/match` for a `scheduled` user fixture **creates a MatchSession** (`POST /matches/start`) and drives it. Opening it for a `played` fixture replays as today (back-compat for AI/past matches and the skip path).

Rationale: advancing must never block on a session that can wait up to 24h for a decision. Session creation is lazy (when the user chooses to play), which also respects the "one active session per playthrough" unique index naturally.

### D2. A **"Simular / Saltar"** path always exists.
On the dashboard CTA and inside `/match`, "Saltar al resultado" one-shot-simulates the user's fixture (reusing `simulateFixture` from the runner) and runs the SAME post-match persistence (D4). The user is never forced to play 90 minutes. (This is also the timeout/abandon fallback.)

### D3. `/match` drives the session via Socket.IO + decision HTTP.
- On open of a scheduled fixture: create session → join room `match:{sessionId}` → the worker streams `match:event` (ticks) → on `match:paused` show the **decision panel** (halftime at 45 / sub windows at 60/75): substitutions, formation, instruction → `POST /matches/:id/decision` → worker resumes → on `match:complete` show the result + "Volver al dashboard".
- The existing nav-lock (matchLock) + loading overlay already cover "don't wander off mid-match".

### D4. Single shared **applyOutcome** persists the result (session OR skip).
A new server function (apps/web/src/lib/server or apps/api) takes `(fixtureId, outcome)` and, in ONE transaction:
1. `fixtures`: status='played', homeScore, awayScore, `matchOutcomeData` (see D5), playedAt.
2. `standings`: `applyToStandings(...)` (the same helper runMatchDay uses).
3. Post-match side effects for THIS fixture only: suspensions, injuries, fitness/morale — reuse `applySuspensions` / `applyMatchEffects` / `applyInjuries` from the runner (extracted/shared).
4. worldState patch on the latest snapshot: `match_performance_index` + `injury_risk` from `outcome.worldStateDeltas`, and the **fan_momentum delta** (move the Phase 6c hook here so it fires when the user's result is actually known).

Because the user's fixture is disjoint from the AI fixtures (runMatchDay skipped it), there is **no double-apply** risk.

### D5. `matchOutcomeData` shape is the **superset** (back-compatible).
`{ winner, events, homeStrength?, awayStrength?, playerRatings?, worldStateDeltas? }`. The replay UI only needs `winner` + `events` (unchanged). One-shot keeps writing the subset; the session writes the superset. No migration (jsonb).

### D6. The rest of the matchday must still feel **simultaneous and live** (Pablo 2026-05-30).
The whole division plays "at the same time": the AI fixtures are decided one-shot
at advance (results final in the DB), but `/match` must keep **revealing their
results minute-by-minute, synced to the user's live match clock** — the existing
"Resto de la jornada" + "Clasificación EN VIVO" panels (`otherFixturesLive`,
advanced off `liveMinute` today). This behaviour is **preserved and re-pointed**
at the interactive session:
- The other fixtures' per-minute reveal is driven by the **session's current
  tick/minute** (streamed via `match:event` / socket), instead of the replay
  clock. So as your match ticks 1'→90', the other scorelines pop in at their
  real minutes and the live table re-sorts.
- When the match **pauses** (halftime 45 / sub windows 60/75), the rest of the
  jornada **pauses with you** (frozen at that minute) — the world waits while you
  decide. On resume, everyone continues. At `match:complete`, all show final.
- "Saltar al resultado" jumps every fixture (yours + the division) straight to
  final, exactly as today.

This keeps the headline "vivo toda la jornada a la vez" feel intact while only
the user's match becomes interactive.

### Architecture

```
 Weekly advance (Phase 5)                 /match (user opens scheduled fixture)
 ┌─────────────────────────┐              ┌──────────────────────────────────────┐
 │ runMatchDay:            │              │ POST /matches/start ─► match_sessions  │
 │  • AI fixtures one-shot │              │ join socket room match:{id}            │
 │  • SKIP user fixture ───┼──scheduled──►│ worker advanceTick→ match:event (live) │
 │    (leave scheduled)    │              │   ⏸ tick 45/60/75 → match:paused        │
 └─────────────────────────┘              │       └► decision panel (subs/táctica) │
 dashboard: "▶ Jugar partido"             │            POST /matches/:id/decision  │
        │ "⏭ Saltar al resultado"         │       ▶ resume … → match:complete       │
        └─────────── one-shot ───────────►│ applyOutcome(fixtureId, outcome) ◄──────┘
                                          │   fixtures + standings + side effects   │
                                          │   + worldState (MPI, injury, fan_mom)   │
                                          └──────────────────────────────────────┘
```

## Alternatives Considered

### A1. Create the session at advance time (eager)
- Advance creates the session before/instead of one-shot simulating the user's match.
- **Rejected**: advance would race the 24h-decision window + the unique index; auto-advance/cron would stall. Lazy-on-open (D1) is simpler and matches how the user already enters via "Ir al partido".

### A2. Make the cascade re-include matches (run match inside the weekly tick)
- Revert to matches-in-the-tick so C6/C7 (MPI→fan) work natively.
- **Rejected**: huge regression surface; ADR-013 deliberately separated them. D4 applies the deltas explicitly instead.

### A3. Replace the one-shot path entirely (all matches interactive)
- **Rejected**: AI matches must stay cheap one-shot; only the user's match needs interactivity.

## Consequences

### Positive
- Real in-match decisions (halftime + sub windows) that change the result — the headline management feature, on top of an already-built+tested engine.
- AI matches stay cheap; determinism preserved (PRNG resume).
- Post-match persistence unified in one `applyOutcome` (session + skip share it).

### Negative
- The fan_momentum / press / mayor hooks that key off the user's result must move from advance Phase 6c to `applyOutcome` (the result is no longer known at advance time). Re-test those surfaces.
- `/match` gains real complexity (socket-driven state machine + decision UI) vs today's replay.
- Two persistence entry points for fixtures results (runMatchDay for AI, applyOutcome for user) — must share the side-effect helpers to avoid drift.

### Neutral
- `[matchSessionId]` route param finally becomes a real session id for the interactive path (still accepts a fixture id for replay/back-compat, or we introduce `/match/[fixtureId]` semantics — resolved in Phase 2).

## Risks

| Risk | Prob | Impact | Mitigation |
|------|------|--------|-----------|
| Side-effect drift (runMatchDay vs applyOutcome apply suspensions/fitness differently) | Med | Med | Extract the helpers and call the SAME functions from both paths |
| fan_momentum/press hooks double-fire or never-fire after moving to applyOutcome | Med | Med | Move them, add a test: a played user fixture produces exactly one press + one fan delta |
| User abandons mid-match → fixture stuck `scheduled`, blocks next advance | Med | Med | 24h timeout job auto-applies default decisions → completes; advance treats a still-scheduled user fixture as "skip one-shot" |
| Socket reconnection / refresh mid-match loses UI state | Med | Low | Worker persists snapshot every pause; `/match` re-hydrates from `GET /matches/:id` on load |
| Result shape change breaks the replay UI | Low | Med | Superset shape (D5); replay only reads winner+events |

## Migration Plan (phased — verify each before the next)

1. **Phase 1 (this ADR)** — gap map + decisions. ✅
2. **Phase 2** — `runMatchDay` skips the user's club fixture; dashboard shows "▶ Jugar partido / ⏭ Saltar"; `/match` creates a session on a scheduled fixture (or one-shot on "Saltar"). Verify: advancing leaves the user fixture scheduled; AI results + standings unchanged; "Saltar" reproduces today's behaviour via `applyOutcome`.
3. **Phase 3** — `/match` drives the session via socket: live ticks + **pause at 45** with a "Continuar" button (no decisions yet). Re-point the "Resto de la jornada" + "Clasificación EN VIVO" reveal off the session minute so the whole division still updates live in sync (D6); pause them with the user's match. Verify live: your match + the other scorelines advance together, pause at halftime, resume.
4. **Phase 4** — decision panel at pauses (subs + formation + instruction) → `/decision` → affects the 2nd half. Verify: a sub/instruction changes events/result deterministically.
5. **Phase 5** — move the user-result hooks (fan_momentum, press crónica, mayor) into `applyOutcome`; full persistence parity + regression pass (shared/api/web/e2e). Verify: no double/È missing messages; standings + worldState correct.

**Rollback**: each phase is independently revertible. Until Phase 2 ships, the one-shot path is untouched. If interactive proves unstable, the dashboard CTA can default to "Saltar" (one-shot) and hide "Jugar".

## Validation Criteria
- [ ] Advancing a week leaves the user's fixture `scheduled`; all AI fixtures played + standings correct.
- [ ] "Saltar al resultado" yields the same result distribution + side effects as today's one-shot.
- [ ] Opening a scheduled fixture creates exactly one session (unique index respected); refresh re-hydrates.
- [ ] The match pauses at 45/60/75; a substitution/instruction changes the rest of the match deterministically (same seed+decisions → same result).
- [ ] On completion: fixtures + standings + worldState (MPI, injury_risk, fan_momentum) updated; exactly one press crónica + one fan delta for the user's match.
- [ ] `pnpm typecheck` clean; shared/api/web + e2e green.

## GDD Requirements Addressed

| GDD Document | System | Requirement | How This ADR Satisfies It |
|-------------|--------|-------------|--------------------------|
| `design/gdd/match-simulation.md` | Match simulation | "interactive match session where the player makes decisions at pause windows (subs, formation at 45/60/75)" (per ADR-013 context) | Wires the built MatchSession into the live flow (D1-D4) |

## Related
- **Depends on / extends**: ADR-013 (Match Session Pattern — the engine this ADR connects).
- **Code**: `match-session-fsm.ts`, `match-worker.ts`, `modules/match/*`, `match-day-runner.ts`, `match/[matchSessionId]/+page.*`, `advance-orchestrator.ts` Phase 5/6c.
