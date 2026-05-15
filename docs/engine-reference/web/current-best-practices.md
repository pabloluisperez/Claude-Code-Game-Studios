# Web Stack — Current Best Practices

Patterns the LLM may not produce by default because they post-date or
slightly contradict the training data. **Always prefer these.**

> **Last verified:** 2026-05-15

---

## Svelte 5 — Runes (replaces stores-as-default and `$:`)

Use runes for component-local reactive state. Stores still exist but are
secondary; reach for them only for cross-route state.

```svelte
<script lang="ts">
  // Reactive primitive
  let count = $state(0);

  // Derived value (was: `$: doubled = count * 2`)
  const doubled = $derived(count * 2);

  // Side effects (was: `$: { ... }`)
  $effect(() => {
    console.log('count is', count);
    return () => console.log('cleanup');
  });

  // Typed props (was: `export let name: string`)
  let { name, age = 0 }: { name: string; age?: number } = $props();

  // Two-way binding (was: `export let value`)
  let { value = $bindable() }: { value: string } = $props();
</script>

<button onclick={() => count++}>+1</button>  <!-- not on:click -->
```

Key rules:
- Event handlers use HTML-style `onclick={fn}`, not `on:click`
- `$state` for plain values, `$state.raw` for non-reactive objects (e.g. PixiJS instances)
- `$derived.by(() => ...)` for multi-line derived expressions
- Snippets `{#snippet name(arg)}...{/snippet}` + `{@render name(arg)}` replace slots for parameterized content

## SvelteKit 2 — Form Actions and Load

```ts
// +page.server.ts — runs only on server
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  return { user: locals.user };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const data = await request.formData();
    // validate with Zod, call domain service, return result or fail()
  },
};
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();  // $props, not export let
</script>

<form method="POST" use:enhance>
  ...
</form>
```

Always use `+page.server.ts` for forms touching the database. Use
`+page.ts` only for client-safe data fetching.

## Hono RPC — Typed Client

Hono v4 exports a typed RPC client; this eliminates manual fetch typing.

```ts
// apps/api/src/server.ts
const app = new Hono()
  .get('/clubs/:id', zValidator('param', z.object({ id: z.string() })), (c) =>
    c.json({ id: c.req.param('id'), name: 'CD Example' })
  );
export type AppType = typeof app;
```

```ts
// apps/web/src/lib/api.ts
import { hc } from 'hono/client';
import type { AppType } from '@api/server';
export const api = hc<AppType>('/');

// Usage: fully typed
const res = await api.clubs[':id'].$get({ param: { id: '42' } });
const club = await res.json();  // typed
```

## Drizzle — Relational Queries

Prefer the new relational query API over explicit joins.

```ts
// packages/db/src/schema/clubs.ts
import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  overall: integer('overall').notNull(),
});

export const clubsRelations = relations(clubs, ({ many }) => ({
  players: many(players),
}));
```

```ts
// Querying
const club = await db.query.clubs.findFirst({
  where: eq(clubs.id, id),
  with: { players: { orderBy: desc(players.overall), limit: 11 } },
});
```

## Authentication — Hand-Rolled Sessions (Lucia v3 Pattern)

Lucia the library was deprecated in 2025; the **pattern** is still endorsed.
Implement directly with `@oslojs/crypto` and `@oslojs/encoding`.

```ts
// apps/api/src/auth/session.ts
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export async function createSession(token: string, userId: string): Promise<Session> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const session = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  };
  await db.insert(sessions).values(session);
  return session;
}

export async function validateSessionToken(token: string) {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: { user: true },
  });
  if (!row) return null;
  if (Date.now() >= row.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  // Sliding expiration: extend if within last 15 days
  if (Date.now() >= row.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
    row.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await db.update(sessions).set({ expiresAt: row.expiresAt }).where(eq(sessions.id, sessionId));
  }
  return { session: row, user: row.user };
}
```

Store the token in an `HttpOnly` `SameSite=Lax` cookie. Hash with sha256
before persisting — the cookie holds the secret, the DB holds the digest.

## BullMQ — Repeatable Job for Daily Tick

```ts
// apps/api/src/jobs/queues.ts
import { Queue } from 'bullmq';
export const seasonTickQueue = new Queue('season-tick', { connection: redis });

// On boot:
await seasonTickQueue.upsertJobScheduler('daily-tick', { pattern: '0 4 * * *' });
```

```ts
// apps/api/src/jobs/season-tick.worker.ts
import { Worker } from 'bullmq';
new Worker(
  'season-tick',
  async () => { /* advance world clock, age players, tick injuries */ },
  { connection: redis, concurrency: 1 },
);
```

`upsertJobScheduler` (BullMQ 5+) replaces the older `repeat` option.

## Socket.IO — Authenticated Rooms

```ts
// apps/api/src/socket/index.ts
io.use(async (socket, next) => {
  const token = parseSessionCookie(socket.handshake.headers.cookie);
  const ctx = token ? await validateSessionToken(token) : null;
  if (!ctx) return next(new Error('unauth'));
  socket.data.userId = ctx.user.id;
  next();
});

io.on('connection', (socket) => {
  socket.on('club:subscribe', (clubId) => socket.join(`club:${clubId}`));
});

// Emit from anywhere on the server:
io.to(`club:${clubId}`).emit('player:updated', diff);
```

Rooms namespaced as `<entity>:<id>`. Subscribe explicitly — never auto-join.

## Tailwind / DaisyUI

- Compose with `class:` directives in Svelte: `<div class:hidden={!open}>`
- For dynamic class lists prefer `clsx` over template literals
- DaisyUI theme tokens (`bg-base-100`, `text-primary`) survive theme switches; raw Tailwind colors do not

## TypeScript — Strict Everywhere

Every workspace inherits `tsconfig.base.json` with:
- `"strict": true`
- `"noUncheckedIndexedAccess": true`
- `"exactOptionalPropertyTypes": true`
- `"verbatimModuleSyntax": true`

Type-only imports use `import type { ... }`. Re-exports of types use
`export type { ... }`.
