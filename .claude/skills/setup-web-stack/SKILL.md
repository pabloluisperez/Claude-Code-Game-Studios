---
name: setup-web-stack
description: "Scaffold the TypeScript full-stack web monorepo (SvelteKit + Hono + Drizzle + Socket.IO + BullMQ) for browser-based game projects. Creates apps/web, apps/api, packages/shared, packages/db, plus pnpm workspace, Turbo config, Docker Compose for Postgres/Redis, base TypeScript config, and initial session-auth schema. Run once when the project's engine is set to 'Web'. Distinct from /setup-engine which targets Godot/Unity/Unreal."
argument-hint: "[--name <project-name>] [--with-pixi] [--skip-install]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task, AskUserQuestion
model: sonnet
agent: web-specialist
---

## Purpose

This skill scaffolds the **TypeScript full-stack web profile** described in
`docs/engine-reference/web/`. It is the Web equivalent of `/setup-engine`
and should be run **once** at the start of a browser-game project after
the engine field in `technical-preferences.md` is set to `Web`.

It produces a working monorepo with:
- `apps/web/` — SvelteKit 2 + Svelte 5 + Tailwind + DaisyUI
- `apps/api/` — Hono 4 + Socket.IO 4 + Pino + Zod
- `packages/shared/` — types, Zod schemas, simulation engines
- `packages/db/` — Drizzle schema + migrations + Postgres client
- `docker-compose.yml` — local Postgres 16 + Redis 7
- `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- A working session-auth flow and one example domain module

## Prerequisites

Verify before starting:

1. `node --version` ≥ 22
2. `pnpm --version` ≥ 9 (install: `npm i -g pnpm@latest`)
3. `docker --version` (for local Postgres + Redis)
4. `technical-preferences.md` has `Engine: Web` set — if not, ask the user to confirm Web is the chosen engine first

If any check fails, surface the gap and ask the user before continuing.

## Phase 1: Confirm Configuration

Use `AskUserQuestion` to confirm:

1. **Project name** (used as monorepo root `name` and `@<scope>/*` package names)
   - Default: derive from the git repo name or current directory
2. **Initial domain module** to scaffold as an example
   - Default: `clubs` (for sports-management games), `accounts`, or `worlds`
3. **Include PixiJS scaffolding now?**
   - Yes: add PixiJS 8 dependency and an example canvas route
   - No: skip canvas; can be added later
4. **Skip `pnpm install`?**
   - For dry runs or when the user wants to inspect before installing

Store all decisions in a working summary the user must approve before any files are written.

## Phase 2: Generate File Tree

Propose the file tree (showing every file to be created) and ask:

> "May I create the following N files? [list every path]"

Wait for explicit approval. Do not write anything yet.

The tree must include:

```
<root>/
├── package.json                          # Root: workspaces, dev scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .nvmrc                                # Node 22
├── .editorconfig
├── .gitignore                            # Adds node_modules, .turbo, build outputs
├── .env.example                          # DATABASE_URL, REDIS_URL, SESSION_*
├── docker-compose.yml                    # Postgres 16 + Redis 7
├── README.md                             # Quick start: pnpm i; docker compose up; pnpm dev
│
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── svelte.config.js
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── src/
│   │   │   ├── app.html
│   │   │   ├── app.css                   # Tailwind directives
│   │   │   ├── app.d.ts                  # Locals type (user, session)
│   │   │   ├── hooks.server.ts           # Session middleware
│   │   │   ├── lib/
│   │   │   │   ├── api.ts                # Hono RPC client
│   │   │   │   ├── sockets/
│   │   │   │   │   └── index.ts          # socket.io-client setup
│   │   │   │   └── components/
│   │   │   │       └── ui/Button.svelte  # Sample DaisyUI button
│   │   │   └── routes/
│   │   │       ├── +layout.svelte
│   │   │       ├── +layout.server.ts     # Loads user from locals
│   │   │       ├── +page.svelte          # Landing page
│   │   │       ├── login/
│   │   │       │   ├── +page.svelte
│   │   │       │   └── +page.server.ts   # Form action: sign in
│   │   │       └── signup/
│   │   │           ├── +page.svelte
│   │   │           └── +page.server.ts   # Form action: register
│   │   └── tests/
│   │       └── smoke.test.ts
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── server.ts                 # Hono app + RPC export
│       │   ├── env.ts                    # Zod-validated env
│       │   ├── lib/
│       │   │   ├── db.ts                 # Drizzle client
│       │   │   ├── redis.ts              # ioredis singleton
│       │   │   └── logger.ts             # Pino instance
│       │   ├── auth/
│       │   │   ├── session.ts            # Token, hash, validate, sliding expiry
│       │   │   ├── password.ts           # @node-rs/argon2 wrappers
│       │   │   ├── middleware.ts         # requireUser, attachUser
│       │   │   └── routes.ts             # POST /auth/signup, /auth/login, /auth/logout
│       │   ├── modules/
│       │   │   └── <initial-module>/
│       │   │       ├── routes.ts
│       │   │       ├── service.ts
│       │   │       ├── repo.ts
│       │   │       └── routes.test.ts
│       │   ├── socket/
│       │   │   ├── index.ts              # Server + auth middleware
│       │   │   └── namespaces/
│       │   │       └── default.ts
│       │   └── jobs/
│       │       ├── queues.ts             # Empty registry
│       │       └── README.md             # How to add a worker
│       └── tests/
│           └── auth.test.ts
│
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── socket.ts             # ServerToClient, ClientToServer
│   │   │   │   └── <initial-module>.ts
│   │   │   ├── schemas/
│   │   │   │   ├── auth.ts
│   │   │   │   └── <initial-module>.ts
│   │   │   └── sim/
│   │   │       └── README.md             # Where deterministic sim code goes
│   │   └── tests/
│   │       └── schemas.test.ts
│   └── db/
│       ├── package.json
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       ├── src/
│       │   ├── client.ts                 # Pool + drizzle()
│       │   └── schema/
│       │       ├── users.ts
│       │       ├── sessions.ts
│       │       └── <initial-module>.ts
│       └── drizzle/                      # Generated migrations (empty)
│
└── tests/
    └── e2e/
        └── auth.spec.ts                  # Playwright signup → login flow
```

Plus a top-level Playwright config and Turbo pipeline definitions for
`dev`, `build`, `lint`, `test`, `db:migrate`, `db:generate`.

## Phase 3: Write Files

For each file, write its full content. Use the patterns documented in
`docs/engine-reference/web/current-best-practices.md` exactly:

- Svelte 5 runes (`$state`, `$derived`, `$props`)
- SvelteKit 2 form actions
- Hono v4 RPC export pattern
- Drizzle relational schema with `relations(...)`
- Hand-rolled sessions using `@oslojs/crypto` + `@oslojs/encoding`
- BullMQ `upsertJobScheduler`

If any pattern in the reference docs has been updated, regenerate from
the current reference, not from memory.

## Phase 4: Install and Verify

Unless `--skip-install` was passed:

1. `pnpm install` from the repo root
2. `docker compose up -d postgres redis`
3. Wait for healthchecks
4. `pnpm --filter @<scope>/db db:generate` (no-op on first run)
5. `pnpm --filter @<scope>/db db:migrate` (creates `users`, `sessions`,
   initial-module tables)
6. `pnpm dev` (run briefly to verify both apps boot, then stop)
7. `pnpm test` (smoke tests must pass)

Report each step's outcome to the user. On failure, do not continue —
diagnose with the user.

## Phase 5: Update Project Documentation

After successful scaffolding:

1. Update `technical-preferences.md`:
   - Confirm `Engine: Web`
   - Fill in version pins from `docs/engine-reference/web/VERSION.md`
   - Fill in naming conventions table (PascalCase classes, camelCase
     variables/functions, kebab-case files, SCREAMING_SNAKE constants)
   - Fill in routing table (which agent for which file type)
2. Append to `README.md` at the repo root: quickstart commands
3. Append to `docs/architecture/` a stub ADR: "Web stack adopted from
   template profile" so the decision is recorded

## Phase 6: Report

Output a final summary:

- Files created (count + tree)
- Services running (web on :5173, api on :3001, postgres on :5432, redis on :6379)
- Next steps:
  - "Run `/brainstorm` to design your game concept"
  - "Run `/design-system <system>` for each major system once you have a concept"
  - "Run `/create-architecture` once GDDs are written"
  - "Specialists available for this engine profile: `web-specialist`,
    `web-frontend-specialist`, `web-backend-specialist`,
    `realtime-multiplayer-specialist`"

## Notes

- This skill **does not** generate game-specific content (no players, no
  matches, no leagues). Game content comes from `/brainstorm` →
  `/design-system` → `/create-stories` → `/dev-story` workflow.
- If the user wants to skip Docker and use a managed Postgres / Redis, ask
  them for the connection URLs in Phase 1 and skip Docker steps.
- If the user is on Windows without WSL2, recommend WSL2 for Docker
  consistency.
