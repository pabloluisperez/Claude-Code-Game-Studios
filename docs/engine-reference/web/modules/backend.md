# Backend Module — Hono + Drizzle + Sessions + Jobs

Scope: `apps/api/` and `packages/db/`. HTTP routes, database access,
authentication, background jobs.

> **Last verified:** 2026-05-15

## Layout

```
apps/api/
├── src/
│   ├── server.ts              # Composition root: app + RPC export
│   ├── env.ts                 # Validated env (Zod)
│   ├── auth/
│   │   ├── session.ts         # Token creation, validation
│   │   └── middleware.ts      # Hono middleware that hydrates c.var.user
│   ├── modules/<domain>/
│   │   ├── routes.ts          # Hono sub-app
│   │   ├── service.ts         # Business logic (pure where possible)
│   │   ├── repo.ts            # Drizzle queries
│   │   └── *.test.ts          # Vitest
│   ├── socket/
│   │   ├── index.ts           # Socket.IO server bootstrap
│   │   └── namespaces/<ns>.ts # Per-namespace handlers
│   ├── jobs/
│   │   ├── queues.ts          # Queue + scheduler definitions
│   │   └── <name>.worker.ts   # Worker process(es)
│   └── lib/
│       ├── db.ts              # Re-exports Drizzle client
│       ├── redis.ts           # ioredis singleton
│       └── logger.ts          # Pino instance

packages/db/
├── src/schema/<table>.ts       # Drizzle table definitions
├── src/client.ts               # Pool + drizzle() factory
├── drizzle/                    # Generated migrations
└── drizzle.config.ts           # drizzle-kit config
```

## Module Boundaries

One module owns one bounded context (e.g. `clubs`, `players`, `matches`,
`economy`, `transfers`, `social`). Cross-module communication:

- **Allowed**: import another module's `service.ts` exports
- **Forbidden**: import another module's `repo.ts` or query its tables directly
- **Forbidden**: cyclic imports between modules

If two modules need shared types, those types belong in
`packages/shared/types/`, not in either module.

## Hono Routes

```ts
// apps/api/src/modules/clubs/routes.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ClubIdParam, CreateClubInput } from '@shared/schemas/clubs';
import * as svc from './service';
import { requireUser } from '../../auth/middleware';

export const clubs = new Hono()
  .use(requireUser)
  .get('/:id', zValidator('param', ClubIdParam), async (c) => {
    const club = await svc.getClub(c.req.valid('param').id);
    if (!club) return c.json({ error: 'not_found' }, 404);
    return c.json(club);
  })
  .post('/', zValidator('json', CreateClubInput), async (c) => {
    const club = await svc.createClub(c.var.user.id, c.req.valid('json'));
    return c.json(club, 201);
  });
```

```ts
// apps/api/src/server.ts
import { Hono } from 'hono';
import { clubs } from './modules/clubs/routes';
import { players } from './modules/players/routes';

const app = new Hono().basePath('/api')
  .route('/clubs', clubs)
  .route('/players', players);

export type AppType = typeof app;
export default { port: 3001, fetch: app.fetch };
```

Chain `.route(...)` and `.use(...)` calls. Never split the chain — TypeScript
needs the contiguous chain to infer the RPC type.

## Drizzle — Schemas

```ts
// packages/db/src/schema/clubs.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const clubsRelations = relations(clubs, ({ one, many }) => ({
  owner: one(users, { fields: [clubs.ownerId], references: [users.id] }),
}));
```

Generate migrations with `pnpm drizzle-kit generate`. Apply with a checked-in
script that runs `migrate(db, { migrationsFolder: ... })` on boot.

## Drizzle — Queries

```ts
// apps/api/src/modules/clubs/repo.ts
import { db } from '../../lib/db';
import { clubs } from '@db/schema/clubs';
import { eq } from 'drizzle-orm';

export async function findById(id: string) {
  return db.query.clubs.findFirst({
    where: eq(clubs.id, id),
    with: { owner: { columns: { id: true, displayName: true } } },
  });
}
```

For complex aggregations use `db.execute(sql\`...\`)` with `sql.placeholder`
parameters. Never interpolate user input into SQL strings.

## Authentication — Sessions Table

```ts
// packages/db/src/schema/sessions.ts
import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),  // sha256(token), hex
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
```

Session flow (see `current-best-practices.md` for code):

1. User signs in → generate 20-byte random token, base32-encode
2. Hash with sha256 → store as session row keyed by digest
3. Set cookie: `session=<token>; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=2592000`
4. On each request, middleware reads cookie, hashes, looks up session, hydrates `c.var.user`
5. Sliding expiration: extend if within 15 days of expiry
6. Sign out → delete session row, clear cookie

Passwords: hash with `@node-rs/argon2` (cost-tunable, fast in Node).

## Background Jobs (BullMQ)

```ts
// apps/api/src/jobs/queues.ts
import { Queue } from 'bullmq';
import { redis } from '../lib/redis';

export const matchSim = new Queue('match-sim', { connection: redis });
export const seasonTick = new Queue('season-tick', { connection: redis });

export async function ensureSchedulers() {
  await seasonTick.upsertJobScheduler('daily', { pattern: '0 4 * * *' });
}
```

```ts
// apps/api/src/jobs/match-sim.worker.ts
import { Worker } from 'bullmq';
import { simulateMatch } from '@shared/sim/match';
import { redis } from '../lib/redis';

new Worker(
  'match-sim',
  async (job) => {
    const result = simulateMatch(job.data);
    // persist + emit via Socket.IO
  },
  { connection: redis, concurrency: 4 },
);
```

Run workers as separate processes from the HTTP server in production. In dev,
spawn both with `pnpm dev` via Turbo.

## Env Vars

Validate at boot with Zod, fail fast:

```ts
// apps/api/src/env.ts
import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = Env.parse(process.env);
```

## Logging

```ts
import pino from 'pino';
export const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password'],
});
```

Add Hono middleware to log requests with `requestId` (e.g. ULID via
`@oslojs/encoding`). Pass logger as `c.var.logger` enriched with `requestId`.

## Error Handling

```ts
app.onError((err, c) => {
  c.var.logger.error({ err }, 'unhandled');
  return c.json({ error: 'internal' }, 500);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));
```

Throw `HTTPException` from Hono for expected user-facing errors:
`throw new HTTPException(400, { message: 'invalid_action' })`.

## Testing

- Unit tests: pure services + sim engines (`packages/shared/sim/`)
- Integration tests: spin up real Postgres via testcontainers OR a dedicated
  test database; run migrations; tear down after suite
- Never mock the database in integration tests
- HTTP tests: hit `app.fetch(new Request(...))` directly — no real port needed
