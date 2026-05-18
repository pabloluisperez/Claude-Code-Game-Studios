# ADR-001: Web Stack Adopted from Template Profile

**Status**: Accepted
**Date**: 2026-05-16
**Engine version**: Web stack (TypeScript full-stack monorepo) — see `docs/engine-reference/web/VERSION.md`

---

## Context

Cascada FC is a browser-first soccer management game with a long-term MMO trajectory. The game needs:
- A web delivery model (zero installation, low barrier to entry)
- Server-authoritative architecture (required for future MMO mode)
- Real-time capability (Socket.IO) for future live leagues
- A deterministic simulation engine shared between server and client
- A manageable stack for solo/small-team development

## Decision

Adopt the **Web engine profile** from the Claude Code Game Studios template:

- **Frontend**: SvelteKit 2 + Svelte 5 (runes API) + Tailwind CSS + DaisyUI + PixiJS 8
- **Backend**: Hono 4 + Socket.IO 4 + Drizzle ORM + BullMQ
- **Database**: PostgreSQL 16 + Redis 7
- **Auth**: Hand-rolled sessions using `@oslojs/crypto` + `@oslojs/encoding` (Lucia v3 pattern)
- **Shared**: Zod schemas, domain types, deterministic simulation engines in `packages/shared`
- **Tooling**: pnpm workspaces + Turbo 2 + Vitest 2 + Playwright

npm scope: `@smt` | Package layout: `apps/web`, `apps/api`, `packages/shared`, `packages/db`

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Godot 4 + HTML export | Export fidelity limited; MMO multiplayer requires separate backend anyway; TypeScript monorepo cleaner |
| Unity + WebGL | Large bundle size; WebGL not ideal for UI-heavy management game |
| React + Express | More boilerplate, no integrated type-safety between client/server; SvelteKit has better SSR + form actions for this use case |
| Prisma instead of Drizzle | Codegen daemon required; Drizzle SQL is visible and explicit |
| Auth.js / Better Auth | Lucia (and its successors) add surface area; the @oslojs pattern is minimal and well-understood |

## Consequences

**Positive**:
- One language (TypeScript) throughout
- `packages/shared` enforces type contract between client and server
- Socket.IO rooms map cleanly to future MMO game rooms
- BullMQ enables the daily world-clock tick without a separate process manager
- PixiJS 8 handles the isometric canvas scene efficiently

**Negative / Trade-offs**:
- Svelte 5 runes API is a significant shift from Svelte 3/4; agents must follow `current-best-practices.md`
- Postgres host port pinned to **5433** (not the default 5432) because something on this dev machine intercepts 5432 with broken auth — see `technical-preferences.md` Port Configuration
- No native mobile app — PWA on iOS/Safari has limitations (push notifications, install UX)
- Solo dev must learn the full stack; recommend starting with backend (Hono + Drizzle) before the PixiJS canvas

## GDD Requirements Addressed

- TR-WEB-001: Browser-first delivery (web platform target)
- TR-WEB-002: Server-authoritative state (all game logic on `apps/api`)
- TR-WEB-003: Real-time events ready for MMO (Socket.IO rooms scaffolded)
- TR-WEB-004: Mobile PWA sessions (SvelteKit adapter-node + responsive layout)

## Post-Cutoff Knowledge Gaps

See `docs/engine-reference/web/VERSION.md` for the full list. Highest-risk areas:
- Svelte 5 runes — model changed significantly from Svelte 4 (`$state` replaces `let`, `onclick` replaces `on:click`)
- PixiJS v8 — renderer rewrite; v7 plugins not compatible
- Drizzle relational query API — still evolving; verify against reference docs before new query patterns
- Lucia auth library — deprecated; use `@oslojs/*` pattern instead
