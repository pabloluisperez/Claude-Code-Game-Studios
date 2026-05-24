# Cascada FC — Control Manifest

> **Manifest Version**: 2026-05-19
> **Generated from**: 12 Accepted ADRs + `.claude/docs/technical-preferences.md`
> + `docs/engine-reference/web/` (pinned 2026-05-15) + vertical slice findings
> **Stories must reference**: this manifest version in their `Control Manifest`
> field. When this version changes, story-done is responsible for flagging
> staleness.

This is the **programmer rules sheet**. Stories embed acceptance criteria that
say "must follow control-manifest 2026-05-19". This document is flat and
actionable; ADRs explain the *why*.

---

## Cross-Cutting Rules (apply everywhere)

### Required ✅
- TypeScript `strict: true`, ESM throughout, Node 22+
- Every public function exported from `packages/*` has a doc comment
- All commits use Conventional Commits format (`feat:`, `fix:`, `chore:`, etc.)
- Every story file embeds its GDD requirement TR-ID + governing ADR ID + this
  manifest version
- Unit tests required for all logic in `packages/shared/src/sim/` and `src/auth/`

### Forbidden ❌
- `Math.random()` in any simulation code — use seeded `ctx.rng()` per ADR-002
- `Date.now()` / `new Date()` inside pure simulation functions — pass time via
  `currentWeek` / explicit timestamps from the caller
- Client-side game state mutations — server-authoritative architecture (forbidden
  pattern per `technical-preferences.md`)
- Cross-module direct DB access — each domain module only reads/writes its own
  tables (per `technical-preferences.md`)
- `bind:value` on `<input>` elements wired to `$state` runes in Svelte 5 — known
  issue, use `value` + `oninput` event handlers instead (verified by slice)
- Local variable named `state` in Svelte components — collides with `$state` rune
  detection (verified by slice — rename to `pt`, `data`, anything else)
- `Map<>` in JSON-serialized payloads (incl. MatchOutcome) — use `Record<>`
  (verified by slice + ADR-007 F10 note)
- Lucia auth library — deprecated, use hand-rolled sessions with `@oslojs/*`
  (per `technical-preferences.md`)
- Stores-first Svelte reactivity — use `$state` / `$derived` / `$effect` runes
  (Svelte 5 — `technical-preferences.md`)
- `on:click` event syntax — use `onclick={fn}` (Svelte 5 HTML-style)

### Guardrails 🧭
- Default branch: trunk-based (`main`). Feature branches short-lived.
- Pre-commit hook runs `prettier --write` + `eslint --fix`
- CI runs `turbo run test` + `playwright test` on every PR + push to main
- 80% coverage minimum for `packages/shared/src/sim/` (lower coverage = manual
  override required in PR description)

---

## Foundation Layer

Code locations: `packages/shared/src/sim/`, `packages/db/src/schema/`,
`apps/api/src/modules/world-state/`, `apps/api/src/modules/match/`,
`apps/api/src/workers/`.

### Required ✅

- **PRNG discipline (ADR-002)**: every simulation function takes `ctx: SimContext`
  as first parameter. `ctx.rng()` is the only source of randomness. Tests must
  prove same seed → identical output.
- **Cascade edges read prevState only (ADR-003 Rule 3)**: an edge's transferFn
  receives `ctx.prevState` (readonly). Writes go to `nextState` via additive
  deltas (Rule 4). Cycles are safe by construction — do not add solver logic.
- **Cascade graph is data, not code (ADR-003 Rule 10)**: adding a chain = adding
  a `CascadeEdgeDef` object. Changing a weight = changing a named constant.
  Touching `cascade-engine.ts` for balance changes is forbidden.
- **WorldState snapshots are append-only (ADR-005)**: every cascade tick INSERTs
  a new row in `world_snapshots`. Never UPDATE a past snapshot.
- **MatchOutcome writes exactly 2 nodes (ADR-007)**: `match_performance_index`
  and `injury_risk`. Match-sim NEVER writes `fan_momentum` directly — C6
  propagates it.
- **MatchSession partial UNIQUE (ADR-013)**: the unique index excludes states
  `'completed'`, `'archived'`, `'failed'`. A failed session must NOT block a new
  match start.
- **MatchSession PRNG persistence (ADR-013 Option B)**: `MatchSessionSnapshot.rngState`
  is `JSON.stringify(seedrandom().state())` — seedrandom must be constructed with
  `{ state: true }` option (else `.state()` returns undefined — verified by slice).
- **Drizzle partial UNIQUE syntax**: use `sql` template literal in `.where()` clauses,
  not raw strings (verified by slice — `drizzle-kit generate` fails otherwise).
- **Drizzle migrations checked in**: every `npm run db:generate` output must be
  committed. Migrations are not regenerated locally.
- **BullMQ Redis connection**: must use `maxRetriesPerRequest: null` (BullMQ
  requirement — verified by slice).
- **Transactional advance() pipeline**: a single tick that fails partway must
  roll back the snapshot insert. Wrap the `db.transaction(...)` around: match
  outcome persistence + standings update + cascade tick + snapshot save +
  manager state save + staff messages insert + currentWeek bump.

### Forbidden ❌

- ❌ Mutating `prevState` inside an edge's transferFn (it's `Readonly<WorldState>`)
- ❌ Writing to `match_performance_index` from cascade edges OTHER than the C6
  rewrite path — C11 and C14 ARE allowed (they're the documented exceptions)
- ❌ Calling `Math.random()` anywhere in `packages/shared/src/sim/`
- ❌ Side effects in `simulateMatch()` (ADR-007 pure-function contract)
- ❌ Writing the full WorldState (use deltas; the cascade engine clamps + persists)
- ❌ Reading client-supplied state without validating with Zod first

### Guardrails 🧭

- When in doubt about determinism: write a test that runs the same seed twice
  and `expect(result2).toEqual(result1)`. Slice has 11 such tests as templates.
- Foundation modules are imported by Core/Feature/Presentation, never the reverse.
- Drizzle relations must export `xxxRelations` objects alongside table defs —
  Drizzle's relational query API requires them.

---

## Core Layer

Code locations: `apps/api/src/modules/manager/`, `apps/api/src/modules/staff/`,
`apps/api/src/modules/players/`.

### Required ✅

- **Manager XP curve constants (ADR-010)**: defined in one place
  (`packages/shared/src/sim/manager-rpg-constants.ts`); never inlined in
  multiple modules.
- **Skill point allocation is atomic (ADR-010)**: pending → spent in a single
  transaction; never half-allocated.
- **Staff message tier comes from manager state at the time of message (ADR-009)**:
  hiring a tier-3 staff applies to NEW messages, not retroactively to existing.
- **Staff message templates use NodeIds from cascade-engine.md catalog**: the
  template key format is `{role}:{nodeId}:{direction}:{tier}`. Stale node names
  break the template lookup.
- **Player effective stats (F1, F2)**: live in `packages/shared/src/sim/sports/football/`,
  not duplicated in modules.
- **Form rolling average (F4 of player-management.md)**: only `match_rating` of
  players with `minutes_played >= 30` updates form.

### Forbidden ❌

- ❌ The staff module writing directly to `clubs` or `playthroughs` (only
  `staff_messages`)
- ❌ The manager module re-implementing XP curve math — call the shared helpers
- ❌ Modifying a player's `form` from anywhere except the post-match update path

---

## Feature Layer

Code locations: `apps/api/src/modules/event-system/`, `apps/api/src/modules/season/`.

### Required ✅

- **Event-system writes WorldState only via the cascade-engine `decisions`
  parameter (ADR-008)**: special PlayerDecisions go through the same Step-3
  application path as normal decisions. They do NOT mutate WorldState
  side-channel.
- **Fixture generation determinism (ADR-011)**: `generateRoundRobin(clubIds,
  startWeek)` must produce the same output for the same `clubIds` order. The
  shuffle inside is deterministic via `ctx.rng()`.
- **20 clubs × 38 matchdays = 380 fixtures per division per season (ADR-011)**.
  Math change requires ADR amendment.
- **Standings updates run in the same transaction as the match outcome write**
  (ADR-011 R4).
- **Promotion/relegation atomic (ADR-011)**: bottom 2 of div-1 ↔ top 2 of div-2
  in one transaction at season_end.

### Forbidden ❌

- ❌ Event-system reading match-simulation internals (only reads MatchOutcome
  from the public contract)
- ❌ Season service running outside a transaction
- ❌ Hardcoded fixture data — must come from `generateRoundRobin` (deterministic
  is the testable invariant)

---

## Presentation Layer

Code locations: `apps/web/src/routes/`, `apps/web/src/lib/`.

### Required ✅

- **DOM-only for MVP (ADR-012)**: no PixiJS canvas in MVP. The canvas frontier
  exists in ADR-012 but the canvas side is deferred to v1.1+.
- **Svelte 5 runes only (`technical-preferences.md`)**: `$state`, `$derived`,
  `$effect`. No stores-first reactivity.
- **HTML-style events (`technical-preferences.md`)**: `onclick={fn}`, not
  `on:click`.
- **All API calls go through `apps/web/src/lib/api.ts`**: typed wrappers, no
  inline `fetch()` in components.
- **Domain-language formatting at the UI boundary (post-slice OQ-HUD-10)**:
  raw 0-100 indices NEVER appear in player-facing text. Use the formatters
  in `apps/web/src/lib/format.ts` (slice has these as a reference; production
  re-implements per OQ-HUD-10 + ADR-017 to-be-written).
- **Input control taxonomy (post-slice OQ-HUD-09 → ADR-017)**:
  - **Categorical decisions → button group** (training intensity, formations,
    instructions)
  - **Quantitative with natural unit → discrete slider in unit** (price in €,
    budget in €K) — use `svelte-range-slider-pips` per ADR-017 when written
  - **Item selection → select / dropdown** (formations, players)
- **Accessibility minimum (`design/ux/accessibility-requirements.md`)**: WCAG 2.1
  AA. axe-core in CI. Lighthouse ≥ 90.

### Forbidden ❌

- ❌ Game state mutations on the client — POST to the API
- ❌ Importing from `apps/api/` or `packages/db/` in `apps/web/` — server-only
  packages
- ❌ Importing from `prototypes/` in any production path (prototype-code.md rule)
- ❌ Inline 0-100 numeric displays for player-facing nodes (use `format.ts`)
- ❌ `backdrop-filter: blur()` on overlays that should show confetti / celebrations
  crisp (verified by slice — backdrop blur dims/blurs the layer below)

### Guardrails 🧭

- SSR-safe: any browser-only API (`document`, `localStorage`) goes inside
  `onMount` or behind a `browser` check from `$app/environment`.
- Code-split routes — `+page.ts` lazy-loads heavy deps (the slice's PixiJS-free
  MVP doesn't need this; revisit when canvas arrives in v1.1+).
- Components named PascalCase; files kebab-case (`technical-preferences.md`).

---

## Platform Layer (infra / DevOps)

### Required ✅

- **Postgres on host port 5433** (not 5432 — per `technical-preferences.md`,
  there's a system service intercepting 5432 on the dev machine).
- **Redis on host port 6379** for main stack; **6380** for slice (already done
  in slice's `docker-compose.yml`).
- **Web dev server**: port 5173 (Vite default).
- **API dev server**: port 3001 (per `technical-preferences.md`).
- **Performance budgets**:
  - 60fps for PixiJS scenes (v1.1+; not MVP)
  - <500kb initial JS bundle
  - <256MB server RAM per process
  - <200ms API response for management actions
- **CI matrix**: Node 22 LTS only for MVP (no need to test multiple versions).

### Forbidden ❌

- ❌ `npm install` without `--frozen-lockfile` in CI
- ❌ Committing `.env`, `.env.local`, `*.pem`, `*.key`, `credentials.json`,
  `secrets.json` (in `.gitignore`; double-check before adding new tooling)
- ❌ Shipping with non-strict TypeScript or `// @ts-ignore` without an attached
  ADR or open issue
- ❌ Bypassing pre-commit hooks (`--no-verify`) without explicit reason in commit
  message

---

## Naming Conventions (`technical-preferences.md` — verbatim)

| Construct | Convention | Example |
|---|---|---|
| Classes / Types | PascalCase | `Club`, `MatchResult`, `ManagerSkills` |
| Variables / functions | camelCase | `clubId`, `foundClub`, `getManagerClubs` |
| Signals / Events (Socket.IO) | `entity:action` kebab-case | `club:updated`, `match:started` |
| Files | kebab-case | `club-service.ts`, `match-sim.ts`, `+page.svelte` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_SQUAD_SIZE`, `SEASON_DURATION_DAYS` |
| DB columns | snake_case | `playthrough_id`, `current_week` |
| Hono routes | kebab-case paths | `/clubs/:id`, `/auth/login` |

---

## Allowed Libraries (from `technical-preferences.md`)

`@oslojs/crypto` · `@oslojs/encoding` · `@node-rs/argon2` · `zod` · `clsx` ·
`pixi.js@8` (v1.1+ only) · `socket.io` + `socket.io-client` · `bullmq` ·
`pino` · `hono/zod-validator`.

**Adding a new library** = ADR + control-manifest amendment. PRs adding new
dependencies without an ADR will be flagged.

### Slice-added (must be reviewed before production)

- `svelte-range-slider-pips@4.1.1` — used in slice for the price slider with
  color zones. Pending ADR-017 (Input Control Taxonomy) for production
  inclusion.
- `seedrandom@3.0.5` — used in slice; already covered by ADR-002 (was implicit).
  Add explicit allow.

---

## Story Authoring Rules

Stories in `production/epics/[epic-slug]/[story-id].md` MUST embed:

```
---
Story: [EPIC-NNN-SXX]
Status: [Pending | In Progress | Done]
Type: [Logic | Integration | Visual | UI | Config]
GDD Requirement: [TR-id]
Governing ADR: [ADR-NNN or list]
Control Manifest: 2026-05-19
Test Evidence: tests/[unit|integration]/[system]/[file]
---
```

Stories that touch HIGH-RISK engine domains (Svelte 5 runes, Drizzle 0.36+
relational, Hono 4) MUST add `Engine Reference: docs/engine-reference/web/...`
pointing to the relevant snapshot.

---

## Test Evidence Standards

| Story Type | Required Evidence | Gate Level |
|---|---|---|
| Logic | Automated unit test (`tests/unit/[system]/*.test.ts`) | **BLOCKING** |
| Integration | Integration test (`tests/integration/*.test.ts`) — real DB | **BLOCKING** |
| Visual / Feel | Screenshot + lead sign-off (`production/qa/evidence/`) | Advisory |
| UI | Manual walkthrough doc OR interaction test (Playwright) | Advisory |
| Config / Data | Smoke check pass (`production/qa/smoke-[date].md`) | Advisory |

Determinism tests are MANDATORY for: any new cascade edge, any new match-sim
formula, any new world-clock event type. The slice has 11 such tests as
templates.

---

## CI Pipeline

Engine-specific commands (Web):
```bash
# Per .github/workflows/tests.yml
- pnpm install --frozen-lockfile
- pnpm run lint
- pnpm run build       # turbo: builds packages + apps
- pnpm run test        # turbo: vitest unit + integration
- pnpm run test:e2e    # playwright (post-build)
```

CI runs on every push to `main` and every PR. Merges to `main` are blocked
on CI green.

---

## Carry-forward Items (post-slice 2026-05-18)

Open OQs from the slice playtest that affect production:

| OQ | Manifest impact when resolved | Resolver |
|---|---|---|
| OQ-HUD-09 (input taxonomy) | Adds Presentation layer rules for control selection | ADR-017 |
| OQ-HUD-10 (domain labels) | Adds Presentation rule: formatters mandatory | ADR-017 |
| OQ-HUD-11 (pixel-art-in-DOM) | Adds asset-pipeline rule for sprite delivery | ADR-018 |
| OQ-HUD-12 (modal pacing) | Adds Presentation rule: 10s + countdown + skip; no backdrop blur on confetti | ADR-018 |
| OQ-HUD-13 (playback speed) | Adds Presentation rule: 1s = 1 in-game min default + speed toggle | ADR-018 |
| OQ-ECO-06 (MAX_TICKET_EUR formula) | Adds Foundation rule: economy module owns club-context constants | ADR-014 |

When these ADRs land, this manifest gets a version bump and stories must
re-reference. Run `/story-readiness` against in-flight stories after manifest
version changes.
