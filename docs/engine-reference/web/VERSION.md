# Web Stack — Version Reference

Pinned versions for browser-based game projects built on this template.
This "engine" is a **framework + runtime combination**, not a traditional
game engine. It is a peer of Godot / Unity / Unreal.

| Field | Value |
|-------|-------|
| **Stack Profile** | TypeScript Full-Stack Monorepo |
| **Profile Pinned** | 2026-05-15 |
| **Last Docs Verified** | 2026-05-15 |
| **LLM Knowledge Cutoff** | January 2026 |

## Pinned Versions

### Runtime
| Component | Version | Notes |
|-----------|---------|-------|
| **Node.js** | 22 LTS | Server runtime and dev tooling |
| **pnpm** | 9.x | Required package manager (workspaces) |
| **Target browsers** | Last 2 versions evergreen | Chrome, Firefox, Safari, Edge |

### Frontend
| Component | Version | Risk vs. Cutoff |
|-----------|---------|-----------------|
| **SvelteKit** | 2.x | MEDIUM — major rework since v1 |
| **Svelte** | 5.x | HIGH — runes API replaced `$:` and stores-first patterns |
| **Vite** | 5.x or 6.x | LOW |
| **TypeScript** | 5.4+ | LOW |
| **Tailwind CSS** | 3.4+ | LOW |
| **DaisyUI** | 4.x | LOW |
| **TanStack Table** | 8.x | LOW |
| **socket.io-client** | 4.7+ | LOW |
| **PixiJS** | 8.x | MEDIUM — v8 reworked renderer; v7 patterns deprecated |
| **Chart.js** | 4.x | LOW |

### Backend
| Component | Version | Risk vs. Cutoff |
|-----------|---------|-----------------|
| **Hono** | 4.x | LOW — stable since 2024 |
| **Socket.IO (server)** | 4.7+ | LOW |
| **Drizzle ORM** | 0.36+ | MEDIUM — relational query API still evolving |
| **drizzle-kit** | 0.28+ | MEDIUM — migrations tooling iterates fast |
| **PostgreSQL** | 16 (17 acceptable) | LOW |
| **node-postgres (`pg`)** | 8.x | LOW |
| **Redis** | 7.x | LOW |
| **BullMQ** | 5.x | LOW |
| **Zod** | 3.23+ | LOW |
| **@oslojs/crypto** | latest | LOW |
| **@oslojs/encoding** | latest | LOW |
| **@node-rs/argon2** | latest | LOW — password hashing |
| **Pino** | 9.x | LOW — structured logging |

### Tooling
| Component | Version | Notes |
|-----------|---------|-------|
| **Turbo** | 2.x | Monorepo task orchestrator |
| **Vitest** | 2.x | Unit / integration tests |
| **Playwright** | 1.48+ | End-to-end tests |
| **ESLint** | 9.x (flat config) | Linter |
| **Prettier** | 3.x | Formatter |
| **tsx** | 4.x | TypeScript runner for scripts |
| **Docker** + **Compose** | recent | Local Postgres + Redis |

## Knowledge Gap Warning

The LLM's training data cutoff is **January 2026**. Highest-risk areas where
the model may produce stale code:

| Topic | What changed | Where to verify |
|-------|--------------|-----------------|
| **Svelte 5 runes** | `$state`, `$derived`, `$effect`, `$props`, `$bindable` replace stores-as-default and `let` reactivity. `$:` and `on:click` are deprecated. | `modules/frontend.md`, `current-best-practices.md` |
| **SvelteKit 2 patterns** | `use:enhance` callback signature changed; `cookies` API in `RequestEvent`; error boundaries with `+error.svelte`. | `modules/frontend.md` |
| **PixiJS v8** | Renderer rewrite; `Container` API simplified; v7 plugins not compatible. | `modules/web-game-patterns.md` |
| **Lucia v3 deprecation** | The Lucia library was deprecated in 2025. Use the hand-rolled session pattern with `@oslojs/*` primitives. | `modules/backend.md` |
| **Drizzle relational queries** | `db.query.<table>.findMany({ with: ... })` matured. Older join-style queries still valid but verbose. | `modules/backend.md` |
| **Hono RPC** | `hc<typeof app>(...)` typed client matured in v4. | `modules/backend.md` |

## Verified Sources

- SvelteKit: https://svelte.dev/docs/kit/introduction
- Svelte 5 runes: https://svelte.dev/docs/svelte/what-are-runes
- Hono: https://hono.dev/docs/
- Drizzle: https://orm.drizzle.team/docs/overview
- Socket.IO: https://socket.io/docs/v4/
- PixiJS v8: https://pixijs.com/8.x/guides
- pnpm workspaces: https://pnpm.io/workspaces
- Turbo: https://turbo.build/repo/docs
- Lucia v3 sessions pattern (archived but recommended): https://lucia-auth.com/sessions/overview
- BullMQ: https://docs.bullmq.io/

## When to Update This File

- New major version of any pinned library
- Knowledge cutoff of the LLM moves forward
- New library added to the stack (also add to `current-best-practices.md`)
- Discovery that the model gets a current API wrong (add to "Knowledge Gap")

Set "Last Docs Verified" date when any trigger above causes an update.
