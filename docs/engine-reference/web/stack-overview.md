# Web Stack — Overview

End-to-end TypeScript stack for browser-based games. Designed for solo or
small-team development with AI assistance: one language, shared types,
modular monolith backend, minimal magic.

> **Last verified:** 2026-05-15

## Profile Summary

- **Frontend**: SvelteKit 2 + Svelte 5 (runes) + Tailwind + DaisyUI
- **Backend**: Hono 4 + Socket.IO 4 + Drizzle (PostgreSQL) + BullMQ (Redis)
- **Auth**: Hand-rolled sessions (Lucia v3 pattern) using `@oslojs/*` primitives
- **Shared**: Zod schemas, simulation engines, domain types
- **Tooling**: pnpm workspaces + Turbo + Vitest + Playwright

## Monorepo Layout

```
<project-root>/
├── apps/
│   ├── web/          # SvelteKit 2 — client UI
│   │   ├── src/routes/        # File-based routing
│   │   ├── src/lib/           # Components, stores, client helpers
│   │   └── src/lib/sockets/   # Socket.IO client wiring
│   └── api/          # Hono 4 — HTTP + WebSocket server
│       ├── src/modules/       # Domain modules (one folder per bounded context)
│       ├── src/socket/        # Socket.IO server, namespaces, rooms
│       ├── src/jobs/          # BullMQ workers + queue definitions
│       ├── src/auth/          # Session creation/validation
│       └── src/server.ts      # Composition root
├── packages/
│   ├── shared/       # Engine-agnostic logic shared between web and api
│   │   ├── src/types/         # Domain types (Player, Match, Club, ...)
│   │   ├── src/schemas/       # Zod schemas (validate on both sides)
│   │   └── src/sim/           # Deterministic simulation engines
│   └── db/           # Drizzle schema + migrations
│       ├── src/schema/        # Table definitions
│       ├── drizzle/           # Generated migrations
│       └── src/client.ts      # Connection pool
├── docker-compose.yml         # Local Postgres + Redis
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json         # Shared strict TS config
```

This maps onto the template's existing directories:
- `apps/` and `packages/` live under `src/` of the project template OR replace it
  for web projects (configurable in `technical-preferences.md`).
- `tests/` of the template = `vitest` configs inside each app/package + a
  top-level `tests/e2e/` for Playwright.
- `docs/`, `design/`, `production/` of the template are unchanged.

## Library Choices (and rejected alternatives)

| Concern | Chosen | Rejected | Why |
|---------|--------|----------|-----|
| Frontend framework | **SvelteKit 2 + Svelte 5** | React/Next, Vue/Nuxt, Solid | Smallest output, least boilerplate for many-screen apps, runes are AI-friendly |
| Styling | **Tailwind + DaisyUI** | CSS Modules, styled-components | Speed of iteration; no naming bikeshedding |
| Tables/grids | **TanStack Table** | AG Grid, Handsontable | Headless, lightweight, framework-agnostic |
| 2D canvas | **PixiJS 8** | Phaser, Three.js, raw canvas | High-perf 2D, scenegraph fits gameplay scenes |
| HTTP server | **Hono 4** | Express, Fastify, Koa | Modern, tiny, types end-to-end with RPC, Web-Standard Request/Response |
| Real-time | **Socket.IO 4** | Native `ws`, tRPC subs, Phoenix | Rooms/namespaces map cleanly to game contexts; reconnect built-in |
| ORM / SQL | **Drizzle** | Prisma, Kysely, raw `pg` | SQL visible, types from schema, no codegen daemon, no proxy magic |
| DB | **PostgreSQL 16** | SQLite, MySQL, MongoDB | JSONB + relational + full-text + reliability; standard for SaaS |
| Cache + jobs broker | **Redis 7 + BullMQ** | RabbitMQ, NATS, in-memory | Mature, low ops, BullMQ has typed jobs and schedulers |
| Auth | **Hand-rolled sessions + @oslojs** | Lucia (deprecated), Auth.js, Better Auth | Lucia author recommends pattern post-deprecation; minimum surface area |
| Validation | **Zod 3** | Yup, Valibot, ArkType | Universal, runs on both sides, integrates with Drizzle and Hono |
| Monorepo | **pnpm workspaces + Turbo** | Nx, Lerna, Yarn | Lightest, AI-friendly config files (`pnpm-workspace.yaml`, `turbo.json`) |
| Tests (unit) | **Vitest** | Jest, Node test runner | Fastest dev loop in Vite-based stack |
| Tests (e2e) | **Playwright** | Cypress | Cross-browser, parallel, trace viewer |
| Logging | **Pino** | Winston, console | Structured JSON logs, low overhead |
| Process manager (dev) | **`tsx watch`** + `pnpm` scripts | nodemon, ts-node-dev | Simpler, fast restart, native TS |

## Architecture Principles

1. **Server-authoritative.** All state mutations validated on `apps/api`.
   Clients send intents; servers compute outcomes. No client-side game logic
   is trusted.
2. **Deterministic simulation in `packages/shared`.** The simulation engine
   (match sim, economy tick, etc.) is pure functions seeded by RNG. Runs
   identically on server (authoritative) and optionally on client (preview).
3. **Modular monolith on the backend.** One `apps/api` deploy. Inside it,
   `src/modules/<domain>/` is the only place that domain's code lives:
   routes, services, schemas, tests. Cross-module calls go through public
   service exports — never direct DB access into another module's tables.
4. **Types are the contract.** `packages/shared/types/` defines the
   vocabulary. `packages/shared/schemas/` validates at boundaries. Drift is
   impossible — both sides import the same files.
5. **Eventual real-time, not chatty.** WebSockets carry notifications and
   state diffs; HTTP carries commands and queries. Don't replace HTTP with
   WS for everything.
6. **One save game = one server-side snapshot.** Local storage only caches
   UI preferences. Game progression lives in the database.

## When This Stack Is the Right Choice

- Browser-first delivery (no native binaries)
- Single-player or social multiplayer (<thousands concurrent per shard)
- Heavy UI: management sims, card games, idle, narrative, turn-based, light real-time
- Solo or small-team developer who values shipping over performance ceilings

## When To Reconsider

- Action games requiring deterministic <50ms input loops → consider Godot/Unity with WebGL export
- Massive concurrency (>50k concurrent on one node) → consider Elixir/Phoenix
- Heavy 3D → Three.js/Babylon is fine but check if you really need a browser

## Where To Go Next

- Versions: `VERSION.md`
- New APIs the model may not know: `current-best-practices.md`
- Old patterns to avoid: `deprecated-apis.md`
- Per-subsystem detail: `modules/frontend.md`, `modules/backend.md`,
  `modules/realtime.md`, `modules/web-game-patterns.md`
