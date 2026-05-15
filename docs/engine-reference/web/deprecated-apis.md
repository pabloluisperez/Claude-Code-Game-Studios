# Web Stack — Deprecated APIs

Quick "don't use X → use Y" lookup. If an agent suggests anything in the
left column, replace with the right column.

> **Last verified:** 2026-05-15

## Svelte 4 → Svelte 5

| Don't use | Use instead | Why |
|-----------|-------------|-----|
| `export let name: string` | `let { name }: { name: string } = $props()` | Runes API |
| `$: doubled = count * 2` | `const doubled = $derived(count * 2)` | Explicit reactivity |
| `$: { console.log(count); }` | `$effect(() => { console.log(count); })` | Explicit effects |
| `on:click={handler}` | `onclick={handler}` | HTML-style events |
| `bind:value={x}` on prop | `let { value = $bindable() } = $props()` then `bind:value` | New bindable API |
| `<slot />` | `{@render children?.()}` with `let { children } = $props()` | Snippets |
| `<slot name="header" />` | `{@render header?.()}` | Snippets |
| `writable(initial)` for component-local state | `$state(initial)` | Less ceremony, better DX |
| `createEventDispatcher` | Callback props (`onmessage={fn}`) | Removed in v5 |

Stores (`writable`, `readable`, `derived` from `svelte/store`) **still work**
and remain appropriate for cross-route shared state. Just don't default to
them for component-local state.

## SvelteKit 1 → SvelteKit 2

| Don't use | Use instead | Why |
|-----------|-------------|-----|
| `await parent()` inside load without need | Only when actually consuming parent data | Reduces waterfalls |
| `throw redirect(...)` | `redirect(...)` (no `throw`) | v2 changed control flow |
| `throw error(...)` | `error(...)` (no `throw`) | Same |
| `use:enhance={({ form, data, action }) => { ... }}` | `use:enhance={({ formElement, formData, action }) => { ... return async ({ result }) => { ... } }}` | v2 signature |
| Top-level promises in load | `streamed:` returns or just resolve them | v2 deprecated implicit streaming |

## PixiJS v7 → v8

| Don't use | Use instead |
|-----------|-------------|
| `new PIXI.Application({ ... })` synchronously | `const app = new Application(); await app.init({ ... })` |
| `Loader` / `Assets.load` v7 API | `Assets.load(...)` v8 (promise-based) |
| `Graphics.beginFill()` / `endFill()` | `Graphics.fill({ color })` / `.fill()` |
| `Sprite.from(texture)` for atlases | `Assets.get('alias')` after `Assets.load` |
| Filters as a property | New `app.renderer` pipeline; check v8 migration guide |

## Auth — Lucia Library

| Don't use | Use instead |
|-----------|-------------|
| `lucia-auth` npm package | Hand-rolled session pattern in `current-best-practices.md` |
| `@lucia-auth/adapter-drizzle` | Direct Drizzle tables for `sessions` and `users` |
| `lucia.createSession()` | `createSession(token, userId)` (see best-practices) |

## ORM

| Don't use | Use instead | Why |
|-----------|-------------|-----|
| Prisma in new web-template projects | Drizzle | Project-wide decision; one ORM per repo |
| Raw `pg` queries without parameter binding | Drizzle's typed builders, or `db.execute(sql\`...\`)` with `sql.placeholder` | SQL injection risk |
| `prisma db push` style schema | Drizzle migrations via `drizzle-kit generate` + `migrate` | Reproducible deployments |

## HTTP

| Don't use | Use instead | Why |
|-----------|-------------|-----|
| Express middleware patterns in new code | Hono middleware | Stack standardized on Hono |
| Raw `fetch` from `apps/web` to `apps/api` | Hono RPC `hc<AppType>` client | Type safety |
| `JSON.parse(request body)` | `c.req.json()` (Hono) | Handles content-type correctly |
| Manual CORS headers | `cors()` middleware from `hono/cors` | Centralized |

## Real-time

| Don't use | Use instead | Why |
|-----------|-------------|-----|
| Raw `ws` library in `apps/api` | Socket.IO | Rooms, reconnect, auth middleware out of the box |
| Broadcasting to all clients | Room-scoped emits (`io.to('room').emit(...)`) | Cost + isolation |
| Auto-joining users to rooms on connect | Explicit `socket.on('subscribe', ...)` from client | Server doesn't infer scope |

## Validation

| Don't use | Use instead |
|-----------|-------------|
| `yup` schemas | `zod` schemas |
| Hand-rolled type guards | `z.infer<typeof Schema>` + parse |
| Validating only on client | Validate on **both** sides with the same Zod schema from `packages/shared` |

## Logging

| Don't use | Use instead |
|-----------|-------------|
| `console.log` in production code | `logger.info({ ... }, 'message')` from Pino |
| Single-line string logs | Structured: `logger.info({ userId, action }, 'event')` |

## Tests

| Don't use | Use instead |
|-----------|-------------|
| `jest` config | `vitest` config |
| `cypress` for new e2e tests | `playwright` |
| Snapshot tests for UI | Component contract tests + Playwright screenshots |

## Monorepo

| Don't use | Use instead |
|-----------|-------------|
| `npm` or `yarn classic` | `pnpm` |
| Symlinking packages manually | `pnpm-workspace.yaml` + workspace protocol `"@org/shared": "workspace:*"` |
| `lerna` / `nx` | `turbo` |
