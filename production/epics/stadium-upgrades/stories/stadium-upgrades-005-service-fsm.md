---
Story: STADIUM-UPGRADES-005
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: Logic
GDD Requirement: AC-SU-04/05/06/07/08/27/28/29/30/35/36
Governing ADR: ADR-029, ADR-014 (economy refund classification)
Control Manifest: 2026-05-19
Test Evidence: apps/api/tests/stadium-upgrades/service.test.ts (20/20 passing)
ImplementedAt: apps/api/src/modules/stadium-upgrades/{service,repo}.ts
---

# Story: Service layer + FSM + transactions (buy, cancel, complete, side effects)

## Goal

Implement the domain service that orchestrates the FSM. Handle `buy`, `cancel`, `tick` (week-tick complete), and `acceptOffer` operations. All state mutations go through transactions; side effects of `Complete` cascade through 8 steps (per GDD §3.2).

## Scope

In `apps/api/src/modules/stadium-upgrades/repo.ts` (new):

- `getActive(clubId): Promise<StadiumUpgradeItem | null>`
- `getCompleted(clubId): Promise<StadiumUpgradeItem[]>` (for catalog state display)
- `insertInProgress(tx, params): Promise<id>`
- `updateStatus(tx, id, status, fields): Promise<void>`
- `decrementWeeksRemaining(tx, id): Promise<weeksRemaining>`

In `apps/api/src/modules/stadium-upgrades/service.ts` (new):

```typescript
type BuyParams = { clubId: string; itemSlug: string; acceptRisk?: boolean; activeOfferId?: string };

export async function buy(p: BuyParams): Promise<Result<{ itemId: string }, BuyError>> {
  return db.transaction(async (tx) => {
    // 1. Load catalog item; if not found → ITEM_NOT_FOUND
    const item = getCatalog().find(i => i.slug === p.itemSlug);
    if (!item) return err('ITEM_NOT_FOUND');

    // 2. Check prereq #1 (track previous level completed)
    const completed = await repo.getCompletedByTrack(tx, p.clubId, item.track);
    if (!hasPrereqInPrevLevel(completed, item.tier)) return err('INVALID_PREREQ');

    // 3. Check prereq #3 (queue free) — DB partial unique index also enforces
    const active = await repo.getActive(tx, p.clubId);
    if (active) return err('SLOT_OCCUPIED');

    // 4. Compute cost (F4) with modifiers
    const offer = p.activeOfferId ? await eventSystem.getOffer(tx, p.clubId, p.activeOfferId) : null;
    const construction = await managerRpg.hasConstructionSkill(tx, p.clubId);
    const cost = costOfItem(item, { constructionSkill: construction, subsidyPct: offer?.subsidyPct });

    // 5. Check prereq #2 (balance) + critical-threshold UX guard (§5.15)
    const balance = await economy.getBalance(tx, p.clubId);
    if (balance < cost) return err('INSUFFICIENT_BALANCE');
    if (!p.acceptRisk && (balance - cost) < economy.CRITICAL_THRESHOLD) return err('CRITICAL_BALANCE_WARNING');

    // 6. Compute duration (F2)
    const directorSkill = await staffSystem.getDirectorInstalacionesSkill(tx, p.clubId);
    const duration = durationWeeks(item, directorSkill);

    // 7. Insert as in_progress (DB partial unique index re-validates queue)
    const newId = await repo.insertInProgress(tx, {
      clubId: p.clubId, itemSlug: item.slug, track: item.track, tier: item.tier,
      costPaidEurK: cost, durationWeeks: duration, weeksRemaining: duration,
      directorSkillSnapshot: directorSkill,
    });

    // 8. Debit economy
    await economy.debit(tx, p.clubId, cost, 'stadium_upgrade_cost');

    return ok({ itemId: newId });
  });
}

export async function cancel(p: { clubId: string; itemId: string }): Promise<Result<{ refundEurK: number }, CancelError>> {
  return db.transaction(async (tx) => {
    const item = await repo.findById(tx, p.itemId);
    if (!item || item.clubId !== p.clubId) return err('NOT_FOUND');
    if (item.status !== 'in_progress') return err('NOT_IN_PROGRESS');
    const refund = Math.round(item.costPaidEurK * 0.50);
    await repo.updateStatus(tx, item.id, 'cancelled', { cancelledAt: new Date() });
    await economy.credit(tx, p.clubId, refund, 'stadium_refund_extraordinary');  // §5.16: classification
    return ok({ refundEurK: refund });
  });
}

export async function tickClub(clubId: string): Promise<void> {
  // Called by world clock once per week-tick
  await db.transaction(async (tx) => {
    const active = await repo.getActive(tx, clubId);
    if (!active) return;

    const balance = await economy.getBalance(tx, clubId);
    if (balance < BANKRUPTCY_BALANCE_FLOOR) return;  // §5.2: pause

    const newWeeksRemaining = active.weeksRemaining! - 1;
    if (newWeeksRemaining <= 0) {
      await completeItem(tx, active);
    } else {
      await repo.decrementWeeksRemaining(tx, active.id);
    }
  });
}

async function completeItem(tx, item: StadiumUpgradeItem): Promise<void> {
  // §3.2 side effects, all in transaction
  // 1. Mark complete
  await repo.updateStatus(tx, item.id, 'complete', { completedAt: new Date() });

  // 2. Increment denormalized counter (atomic SQL)
  const counterField = item.track === 'training' ? 'training_facility_level'
    : item.track === 'academy' ? 'youth_academy_level'
    : 'stadium_upgrade_count';
  await worldState.incrementCounter(tx, item.clubId, counterField);

  // 3. Emit cascade-engine event
  await cascadeEngine.applyDelta(tx, item.clubId, counterField, +1);

  // 4. Re-evaluate tier-up doble gate (calls city-progression service)
  await cityProgression.evaluateTierUp(tx, item.clubId);

  // 5. Re-evaluate Locked items that may now be Available — no-op at DB level
  // (re-evaluation happens client-side on next GET /api/stadium/catalog)

  // 7. Visual feedback: broadcast Socket.IO event (post-tx)
  // 8. Persist staff message
  // (handled after tx commits)
});
```

In `apps/api/src/modules/stadium-upgrades/staff-messages.ts` (separate small file):

- Templated messages per track + tier for "Obra terminada" + "Obra cancelada"

## Out of Scope

- Hono routes (story 006)
- World clock wiring (story 007)
- UI (story 008)
- Subsidy event acceptance flow (deferred to v1.2)

## Acceptance Criteria

1. `buy()` happy path: returns `ok({itemId})`, debits balance, inserts row as in_progress
2. `buy()` with no prereq: returns `err('INVALID_PREREQ')` — no DB write
3. `buy()` with active item: returns `err('SLOT_OCCUPIED')` — DB constraint also blocks
4. `buy()` with insufficient balance: returns `err('INSUFFICIENT_BALANCE')`
5. `buy()` with balance > cost but balance - cost < CRITICAL_THRESHOLD AND not acceptRisk: returns `err('CRITICAL_BALANCE_WARNING')`
6. `buy()` with same prereq fail but acceptRisk=true: succeeds
7. `buy()` applies Construction skill discount when manager has skill T3+
8. `buy()` applies subsidy when valid offer accepted
9. `cancel()` happy path: marks cancelled, refunds 50%, classifies as `stadium_refund_extraordinary`
10. `cancel()` of non-existent or wrong-club item: returns `err('NOT_FOUND')`
11. `cancel()` of already-complete item: returns `err('NOT_IN_PROGRESS')`
12. `tickClub()` decrements weeks_remaining by 1
13. `tickClub()` with bankruptcy state: does NOT decrement (pause)
14. `tickClub()` at weeks_remaining=1: triggers Complete, runs all 8 side effects in transaction
15. `Complete` increments the correct counter based on track
16. `Complete` calls cascade-engine `applyDelta` with correct NodeId
17. `Complete` calls cityProgression.evaluateTierUp once
18. Race: 2 simultaneous `buy()` for same club → one succeeds, other returns SLOT_OCCUPIED (DB unique constraint)
19. All operations atomic — failed mid-transaction leaves no partial state

## Test Requirements (Integration, BLOCKING)

`apps/api/tests/stadium-upgrades-service.test.ts` (real DB via testcontainers or test schema):

- Setup: insert test club + WorldState
- Cover ACs 1-19 with isolated test cases
- Use vitest `describe.concurrent` for race condition test (AC 18)
- Mock economy + cascade-engine + cityProgression + staffSystem + managerRpg services where dependencies aren't ready yet (use thin mocks)

## QA Test Cases

Source: `production/qa/qa-plan-sprint-22-2026-05-25.md §22-5`.

**Test file**: `apps/api/tests/stadium-upgrades-service.test.ts` — ~20 integration tests (real DB via testcontainers or isolated schema).

**NOTE**: Although story declares `Type: Logic`, this story IS classified Integration in the QA plan (real DB + service spans modules). Both classifications stand.

**buy() cases**:
1. Happy path → `ok({itemId})`, balance debit, row in DB as `in_progress`
2. No prereq → `err('INVALID_PREREQ')`, verify no DB write (SELECT count unchanged)
3. Active item present → `err('SLOT_OCCUPIED')` from service AND DB constraint blocks
4. Insufficient balance → `err('INSUFFICIENT_BALANCE')`
5. `balance - cost < CRITICAL_THRESHOLD` AND not `acceptRisk` → `err('CRITICAL_BALANCE_WARNING')`
6. Same balance fail + `acceptRisk: true` → succeeds
7. Construction skill T3+ → discount 15% applied
8. Valid event offer → subsidy applied multiplicatively

**cancel() cases**:
9. Happy path → cancelled, refund 50%, classified `stadium_refund_extraordinary` (audit query)
10. Non-existent / wrong-club → `err('NOT_FOUND')`
11. Already-complete item → `err('NOT_IN_PROGRESS')`

**tickClub() cases**:
12. Decrements `weeks_remaining` by 1
13. Bankruptcy state (balance < BANKRUPTCY_BALANCE_FLOOR) → no decrement (pause)
14. `weeks_remaining=1` → Complete + 8 side effects: status, counter, cascade-engine delta, tier-up eval, Socket.IO emit, staff message
15. Counter increments correct field per track (gradas/pitch/servicios → `stadium_upgrade_count`; training → `training_facility_level`; academy → `youth_academy_level`)

**Race + atomicity**:
16. AC-SU-29: 2 simultaneous `buy()` same club (`describe.concurrent`) → one OK, one SLOT_OCCUPIED
17. 2 clubs simultaneous buy → both succeed
18. Mid-tx failure (mock `cascadeEngine.applyDelta` throw) → DB unchanged on rollback

**Edge cases**:
19. `buy()` then immediate `cancel()` in same tx — not allowed (separate calls)
20. `tickClub()` for club with no active item → no-op (no error)

**Manual evidence**: None — fully automatable.

## Dependencies

- **Upstream**: 001 (schema), 002 (catalog), 003 (F1+F3), 004 (F2+F4+F5+F6)
- **Downstream**: 006 (routes call service), 007 (world clock calls tickClub)

## Estimate

**1.5 days.** Service is the meatiest story — many cases + transactional correctness + DB-level tests.

## Notes / Gotchas

- Mocks for economy / cascade-engine / cityProgression / staffSystem / managerRpg services: if these services don't expose the methods yet, **add stubs** to those modules with TODO comments. Don't block this story on cross-module work.
- Drizzle transaction handling: use `db.transaction(async (tx) => ...)` and pass `tx` explicitly to repo methods. Do NOT use module-level `db` inside service methods.
- `Result<T, E>` type: if project has Result pattern, reuse; otherwise use `{ ok: true, value: T } | { ok: false, error: E }` discriminated union.
- The bankruptcy floor check (`balance < BANKRUPTCY_BALANCE_FLOOR`) must use the SAME constant as economy.md F4. Import from `@smt/shared/sim/economy/constants` (extract if needed in this story).
- Critical-balance UX guard (AC 5+6): returns a non-fatal error; client should display warning and re-POST with `acceptRisk: true` to confirm. This is a UX flow, not a hard block.
