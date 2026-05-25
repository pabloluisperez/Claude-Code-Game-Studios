---
Story: TROPHIES-HISTORY-001
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: Integration
GDD Requirement: AC-TH-05/08/10/11/12/13/22/25/26
Governing ADR: ADR-030 §D3, D4
Control Manifest: 2026-05-19
Test Evidence: apps/api/tests/museum/routes.test.ts (6/6 passing)
ImplementedAt: apps/api/src/modules/museum/{routes,service,repo}.ts + server.ts mount
---

# Story: Backend museum aggregator API + read-only invariant

## Goal

Expose a single endpoint `GET /api/museum/contents` that aggregates trophies, banners, hall of fame, financial milestones, and stadium history into a single response. **Strictly read-only** — no writes to WorldState or domain tables.

## Scope

In `apps/api/src/modules/museum/repo.ts` (new):

Read-only queries against:
- `league_system` tables (trophy winners)
- `match_results` tables (legendary matches via F1)
- `transfers` tables (legend transfers via F3)
- `world_state_snapshots` (balance history)
- `stadium_upgrade_items` (completed items)

In `apps/api/src/modules/museum/service.ts` (new):

```typescript
export async function getMuseumContents(clubId: string): Promise<MuseumContents> {
  // Run all queries in parallel
  const [trophies, banners, legendTransfers, financialMilestones, stadiumHistory] = await Promise.all([
    repo.getTrophies(clubId),
    repo.getBanners(clubId),  // ascensos + legendary matches
    repo.getLegendTransfers(clubId),
    repo.getFinancialMilestones(clubId),
    repo.getStadiumHistory(clubId),
  ]);

  const totalObjects = trophies.length + banners.length + legendTransfers.length + financialMilestones.length + stadiumHistory.length;
  const museumDensity = Math.min(1, totalObjects / MUSEUM_FULL_OBJECTS);

  return { trophies, banners, legendTransfers, financialMilestones, stadiumHistory, totalObjects, museumDensity };
}
```

In `apps/api/src/modules/museum/routes.ts` (new):

```typescript
const app = new Hono();
app.use('*', requireSession);

// In-memory cache with 60s TTL
const cache = new Map<string, { data: MuseumContents; expiresAt: number }>();

app.get('/contents', async (c) => {
  const session = c.get('session');
  const cached = cache.get(session.clubId);
  if (cached && Date.now() < cached.expiresAt) {
    return c.json(cached.data, 200, { 'X-Museum-Cache': 'hit' });
  }
  const data = await service.getMuseumContents(session.clubId);
  cache.set(session.clubId, { data, expiresAt: Date.now() + 60_000 });
  return c.json(data, 200, { 'X-Museum-Cache': 'miss' });
});

export default app;
```

Cache invalidation hooks (in respective services):
- On `match:end` → invalidate museum cache for that club
- On `season:end` → invalidate all museum caches
- On `stadium:item_complete` → invalidate that club's cache

### Read-only invariant enforcement

Add a custom ESLint rule (or comment-level convention enforced in code review) for `apps/api/src/modules/museum/**`:
- Forbid imports of `*Repo.insert*`, `*Repo.update*`, `*Repo.delete*`
- Allow only `select*` queries
- All Drizzle queries must use `db.query.*` or `db.select(...)`, never `db.insert/update/delete`

## Out of Scope

- Templated text generation (story 003)
- Frontend integration (story 004)

## Acceptance Criteria

1. `GET /api/museum/contents` returns 200 with 5 categories + totals
2. Returns 401 if no session
3. Empty club (new player) returns all arrays empty + totalObjects: 0
4. Veteran club (mock 10 trophies, 30 banners, 25 transfers, 15 milestones, 40 stadium items) returns expected counts
5. Cache HIT on second call within 60s — `X-Museum-Cache: hit` header
6. Cache invalidated on `match:end` event → next call is MISS
7. **READ-ONLY INVARIANT**: integration test spies on DB writes during `GET /api/museum/contents` — assert zero INSERT/UPDATE/DELETE statements
8. Response time <200ms for typical club (50 objects total)
9. Response shape matches `MuseumContents` TypeScript type
10. Determinismo: same data → same response shape + same ordering

## Test Requirements (Integration, BLOCKING)

`apps/api/tests/museum-routes.test.ts`:

- Setup test club with seeded data per category
- ACs 1-10 covered with isolated tests
- Use DB query spy to verify read-only invariant (e.g., mock Drizzle `insert/update/delete` and assert no calls)

## Dependencies

- **Upstream**: stadium-upgrades-006 (`/api/stadium/history` endpoint feeds stadium history) — or implement separately if not yet ready
- **Downstream**: 004 (frontend uses this), 005 (interior scene queries)

## Estimate

**1 day.** Standard CRUD-but-read-only + cache.

## Notes / Gotchas

- The cache is process-local — not Redis. Acceptable for v1.1 (single API instance). For MMO scale, migrate to Redis with invalidation pub/sub.
- The "60s TTL" is a balance between staleness and DB load. Reduce if user complaints about lag; increase if DB query is expensive.
- Invalidation hooks: ensure they're called from the SAME transaction as the underlying write — otherwise stale cache lingers between match:end and next call. Best implemented as post-transaction subscriber.
- If cross-cutting query patterns are needed (e.g., "give me ALL trophies for a player who's been in club X"), defer to v1.2+; the v1.1 aggregator is just per-club.
