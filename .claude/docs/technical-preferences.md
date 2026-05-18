# Technical Preferences

<!-- Populated by /setup-engine (game engines) or /setup-web-stack (browser games). -->
<!-- Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: Web (TypeScript full-stack monorepo)
- **Stack Profile**: SvelteKit 2 + Svelte 5 (runes) + Hono 4 + Drizzle ORM + Socket.IO 4 + BullMQ
- **Language**: TypeScript 5.4+ (strict mode, ESM throughout)
- **Rendering**: PixiJS 8 (2D isometric, `$state.raw` for PixiJS instances)
- **Physics**: N/A (simulation engine is pure TypeScript in `packages/shared/src/sim/`)
- **Engine Reference**: `docs/engine-reference/web/` (pinned 2026-05-15)

> Engine = Web means the "engine" is a framework + runtime stack.
> See `docs/engine-reference/web/stack-overview.md` for full details.
> **Pinned versions**: see `docs/engine-reference/web/VERSION.md`

## Package Scope

- **npm scope**: `@smt`
- **Packages**: `@smt/web` (SvelteKit) · `@smt/api` (Hono) · `@smt/shared` (types + sim) · `@smt/db` (Drizzle + auth)
- **pnpm workspace**: monorepo root

## Input & Platform

- **Target Platforms**: Web (browser) primary · Mobile PWA secondary
- **Input Methods**: Keyboard + Mouse primary · Touch (PWA sessions)
- **Primary Input**: Keyboard + Mouse (management UI focus)
- **Gamepad Support**: None (MVP)
- **Touch Support**: Partial (PWA-optimized layout, no gamepad-style touch)
- **Platform Notes**: Mobile sessions are expected to be shorter (5-15 min); design UI to be functional at 375px width. No native install required.

## Naming Conventions

- **Classes/Types**: PascalCase (`Club`, `MatchResult`, `ManagerSkills`)
- **Variables/Functions**: camelCase (`clubId`, `foundClub`, `getManagerClubs`)
- **Signals/Events (Socket.IO)**: `entity:action` kebab-case (`club:updated`, `match:started`)
- **Files**: kebab-case (`club-service.ts`, `match-sim.ts`, `+page.svelte`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_SQUAD_SIZE`, `SEASON_DURATION_DAYS`)
- **DB columns**: snake_case (Drizzle maps to camelCase in TypeScript)
- **Routes (Hono)**: kebab-case paths (`/clubs/:id`, `/auth/login`)

## Performance Budgets

- **Target Framerate**: 60fps for PixiJS canvas scenes
- **Frame Budget**: 16ms (PixiJS renders; management UI is DOM-driven, no frame budget)
- **Bundle size (web)**: < 500kb initial JS (code-split routes for PixiJS)
- **Memory Ceiling**: < 256MB server RAM (BullMQ + Hono + Socket.IO + Drizzle per process)
- **API Response Time**: < 200ms for management actions (no game-loop critical path)

## Testing

- **Framework**: Vitest 2 (unit + integration) · Playwright 1.48 (e2e)
- **Minimum Coverage**: 80% for logic in `packages/shared/src/sim/` and `src/auth/`
- **Required Tests**:
  - All simulation engines in `packages/shared/src/sim/` (determinism tests)
  - Auth session lifecycle (create, validate, slide, invalidate)
  - Club domain CRUD + cascade trigger (integration, real DB)
  - E2E: signup → login → club creation → game page loads

## Port Configuration

- **Postgres host port**: `5433` (internal container port still 5432)
- **Redis host port**: `6379`
- **Web dev server**: `5173`
- **API dev server**: `3001`

> **Why 5433 for Postgres?** Port 5432 on this dev machine was intercepted by another
> service (likely a system Postgres or a Docker Desktop legacy proxy) that responded
> to the PostgreSQL protocol but rejected our auth. Connections appeared to succeed
> at the TCP level but never reached the Docker container. Switching the host port to
> 5433 resolved the issue cleanly. The DATABASE_URL must use port 5433.

## Forbidden Patterns

- Client-side game state mutations — all state lives server-side (server-authoritative)
- `Math.random()` in simulation engines — use seeded PRNG passed as parameter
- Cross-module direct DB access — each domain module only reads/writes its own tables
- Stores-first Svelte reactivity — use `$state`/`$derived`/`$effect` runes (Svelte 5)
- `on:click` event syntax — use `onclick={fn}` (Svelte 5 HTML-style)
- Lucia auth library — deprecated; use hand-rolled sessions with `@oslojs/*`

## Allowed Libraries / Addons

- `@oslojs/crypto` + `@oslojs/encoding` — session token crypto
- `@node-rs/argon2` — password hashing
- `zod` — validation (both sides)
- `clsx` — conditional CSS class composition in Svelte
- `pixi.js@8` — 2D canvas rendering
- `socket.io` + `socket.io-client` — real-time (future MMO ready)
- `bullmq` — background jobs + schedulers
- `pino` — structured logging
- `hono/zod-validator` — Hono Zod middleware

## Architecture Decisions Log

- [ADR-001: Web stack adopted from template](../../docs/architecture/ADR-001-web-stack.md)
- [ADR-013: Match Session Pattern (stateful re-enqueue)](../../docs/architecture/ADR-013-match-session-stateful-pattern.md)

## Engine Specialists

- **Primary**: `web-specialist` (overall stack decisions, routing to sub-specialists)
- **Frontend Specialist**: `web-frontend-specialist` (SvelteKit/Svelte/PixiJS)
- **Backend Specialist**: `web-backend-specialist` (Hono/Drizzle/BullMQ/auth)
- **Realtime Specialist**: `realtime-multiplayer-specialist` (Socket.IO/rooms/sync/MMO)
- **Routing Notes**: Route by file location — `.svelte` → frontend, `server.ts`/`routes.ts`/`repo.ts`/`service.ts` → backend, `socket/` → realtime

### File Extension Routing

| File Extension / Type | Specialist to Spawn |
|-----------------------|---------------------|
| `*.svelte`, `+page.ts`, `+layout.ts`, `hooks.server.ts` | `web-frontend-specialist` |
| `*.ts` in `apps/api/`, `packages/db/` | `web-backend-specialist` |
| `*.ts` in `apps/api/src/socket/`, `packages/shared/src/types/socket.ts` | `realtime-multiplayer-specialist` |
| `*.ts` in `packages/shared/src/sim/` | `web-backend-specialist` (simulation core) |
| General architecture review | `web-specialist` (Primary) |
