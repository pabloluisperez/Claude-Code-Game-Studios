---
Story: STADIUM-UPGRADES-006
Status: Ready
Type: Integration
GDD Requirement: AC-SU-05/06/36 + ADR-029 §D4
Governing ADR: ADR-029
Control Manifest: 2026-05-19
Test Evidence: apps/api/tests/stadium-upgrades-routes.test.ts (pending)
ImplementedAt: apps/api/src/modules/stadium-upgrades/routes.ts
---

# Story: Hono routes for /api/stadium + Zod validation + 4xx error codes

## Goal

Expose the stadium-upgrades service via REST endpoints under `/api/stadium`. Validate inputs with Zod. Translate service errors to HTTP status codes per ADR-029 §D4.

## Scope

In `apps/api/src/modules/stadium-upgrades/routes.ts` (new):

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import * as service from './service';
import { requireSession } from '../auth/middleware';

const app = new Hono();

app.use('*', requireSession);

// GET /api/stadium/catalog — full catalog + per-item state for the user's club
app.get('/catalog', async (c) => {
  const session = c.get('session');
  const catalog = getCatalog();
  const completedItems = await service.getCompletedItems(session.clubId);
  const active = await service.getActive(session.clubId);
  // ... compute item-state for each catalog item (Locked/Available/Queued/InProgress/Complete)
  return c.json({ items: itemsWithState, active });
});

// POST /api/stadium/buy
const BuySchema = z.object({
  itemSlug: z.string().regex(/^[a-z0-9-]+$/),
  acceptRisk: z.boolean().optional(),
  activeOfferId: z.string().uuid().optional(),
});
app.post('/buy', zValidator('json', BuySchema), async (c) => {
  const { itemSlug, acceptRisk, activeOfferId } = c.req.valid('json');
  const session = c.get('session');
  const result = await service.buy({ clubId: session.clubId, itemSlug, acceptRisk, activeOfferId });

  if (result.ok) {
    return c.json({ itemId: result.value.itemId }, 200);
  }
  return errorResponse(c, result.error);
});

// POST /api/stadium/cancel
const CancelSchema = z.object({ itemId: z.string().uuid() });
app.post('/cancel', zValidator('json', CancelSchema), async (c) => {
  const { itemId } = c.req.valid('json');
  const session = c.get('session');
  const result = await service.cancel({ clubId: session.clubId, itemId });
  if (result.ok) return c.json({ refundEurK: result.value.refundEurK }, 200);
  return errorResponse(c, result.error);
});

// GET /api/stadium/history — completed items chronological for trophies-history.md
app.get('/history', async (c) => {
  const session = c.get('session');
  const history = await service.getCompletedItemsChronological(session.clubId);
  return c.json({ history });
});

function errorResponse(c, error: string) {
  const map: Record<string, number> = {
    'ITEM_NOT_FOUND': 404,
    'INVALID_PREREQ': 400,
    'SLOT_OCCUPIED': 409,
    'INSUFFICIENT_BALANCE': 402,
    'CRITICAL_BALANCE_WARNING': 409,  // 409 because client needs to confirm
    'NOT_FOUND': 404,
    'NOT_IN_PROGRESS': 409,
  };
  return c.json({ error }, map[error] ?? 500);
}

export default app;
```

Mount in main Hono app:

```typescript
// apps/api/src/index.ts (or wherever modules are mounted)
import stadiumRoutes from './modules/stadium-upgrades/routes';
app.route('/api/stadium', stadiumRoutes);
```

## Out of Scope

- World Clock tick wiring (story 007)
- UI (story 008)

## Acceptance Criteria

1. `GET /api/stadium/catalog` returns 200 with `{items: [...40 with state], active: ...}` for authenticated user
2. `GET /api/stadium/catalog` returns 401 if no session
3. `POST /api/stadium/buy` happy path → 200 `{itemId}`
4. `POST /api/stadium/buy` with invalid slug → 400 (Zod schema error)
5. `POST /api/stadium/buy` with missing prereq → 400 `{error: 'INVALID_PREREQ'}`
6. `POST /api/stadium/buy` with active item → 409 `{error: 'SLOT_OCCUPIED'}`
7. `POST /api/stadium/buy` with insufficient balance → 402 `{error: 'INSUFFICIENT_BALANCE'}`
8. `POST /api/stadium/buy` with critical-balance warning → 409 `{error: 'CRITICAL_BALANCE_WARNING'}` (client should re-POST with `acceptRisk: true`)
9. `POST /api/stadium/buy` with `acceptRisk: true` after critical warning → 200
10. `POST /api/stadium/cancel` happy path → 200 `{refundEurK}`
11. `POST /api/stadium/cancel` of non-existent → 404
12. `POST /api/stadium/cancel` of wrong-club item → 404 (security: don't leak existence)
13. `GET /api/stadium/history` returns chronological completed items (for trophies-history aggregator)
14. All routes return content-type `application/json`
15. All routes log structured (pino) on error

## Test Requirements (Integration, BLOCKING)

`apps/api/tests/stadium-upgrades-routes.test.ts`:

- Supertest-style HTTP tests using Hono's `app.fetch` API
- Cover ACs 1-13
- Use auth fixture (session token for test user)
- Mock service layer responses for clean unit tests; OR use real DB for integration variant

## QA Test Cases

Source: `production/qa/qa-plan-sprint-22-2026-05-25.md §22-6`.

**Test file**: `apps/api/tests/stadium-upgrades-routes.test.ts` (~15 tests) — Hono `app.fetch` API. Service mocked OR real DB for full integration variant.

**Catalog route**:
1. `GET /api/stadium/catalog` + valid session → 200 + `{items: [...40 with state], active: ...}`
2. `GET /api/stadium/catalog` without session → 401

**Buy route**:
3. Happy path → 200 `{itemId}`
4. Zod failure (empty body / missing itemSlug) → 400
5. Invalid slug regex (uppercase, special chars) → 400
6. Service returns `INVALID_PREREQ` → 400 `{error}`
7. Service returns `SLOT_OCCUPIED` → 409
8. Service returns `INSUFFICIENT_BALANCE` → 402
9. Service returns `CRITICAL_BALANCE_WARNING` → 409 (NOT 400 — client confirms)
10. `acceptRisk: true` after warning → 200

**Cancel route**:
11. Happy path → 200 `{refundEurK}`
12. Non-existent itemId → 404
13. Wrong-club itemId → 404 (security: don't leak existence — NOT 403)

**History route**:
14. `GET /api/stadium/history` → 200 + chronological array

**Cross-cutting**:
15. All responses `content-type: application/json`
16. Pino structured log captured on every error path (assert log fixture)

**Manual evidence**:
- [ ] curl smoke against `localhost:3001`, output captured to `production/qa/evidence/22-6-curl-smoke.txt`

## Dependencies

- **Upstream**: 005 (service)
- **Downstream**: 008 (UI calls these routes)

## Estimate

**1 day.** Standard Hono + Zod boilerplate.

## Notes / Gotchas

- The `CRITICAL_BALANCE_WARNING` returns 409 not 400 because it's not an "invalid request" — it's a "conflict with client intent" that needs explicit confirmation. Document the convention.
- For security: `cancel()` of wrong-club item returns 404 not 403 — don't leak existence of other clubs' items
- Logging: log slug + cost + result for every buy/cancel for audit (per economy.md F-revenue-flow audit trail)
- Hono error middleware should catch unhandled exceptions and return 500 with logged stack — don't leak stack to client
