---
Story: SCOUTING-MARKET-004
Status: Ready
Type: Logic
GDD Requirement: AC-SCM-06/07/20/21
Governing ADR: ADR-031 §D4
Control Manifest: 2026-05-19
Test Evidence: apps/api/tests/scouting-service.test.ts
ImplementedAt: apps/api/src/modules/scouting-market/{service,repo}.ts
---

# Story: Scout actions service + scout delay countdown

## Goal

Implement the scout / deep-scout action service. Player initiates a scout → cost debited → scoutingAction row created with `status='pending'` and `completesAtWeek=currentWeek + delay`. World clock tick advances completion. Edge cases: refund on window close, expiration.

## Scope

In `apps/api/src/modules/scouting-market/service.ts`:

```typescript
export async function initiateScout(p: { clubId: string; playerId: string; actionType: 'scout' | 'deep_scout'; windowId: string }) {
  return db.transaction(async (tx) => {
    // 1. Verify window is open
    if (!await windowOpen(tx, p.windowId)) return err('WINDOW_CLOSED');

    // 2. For deep_scout, verify T1 → T2 prereq (must already have completed scout)
    if (p.actionType === 'deep_scout') {
      const hasScout = await repo.hasCompletedScout(tx, p.clubId, p.playerId, p.windowId);
      if (!hasScout) return err('INVALID_PREREQ');

      // Verify Scout Director T2+
      const directorTier = await staffSystem.getScoutDirectorTier(tx, p.clubId);
      if (directorTier < 2) return err('INSUFFICIENT_STAFF');
    }

    // 3. Compute cost
    const directorT3 = (await staffSystem.getScoutDirectorTier(tx, p.clubId)) >= 3;
    const cost = scoutActionCost(p.actionType, { scoutDirectorT3: directorT3 });

    // 4. Verify balance
    const balance = await economy.getBalance(tx, p.clubId);
    if (balance < cost) return err('INSUFFICIENT_BALANCE');

    // 5. Determine delay (T3 director with T3 tier halves scout delay)
    const directorTier = await staffSystem.getScoutDirectorTier(tx, p.clubId);
    const delay = directorTier >= 3 ? Math.max(0, SCOUT_DELAY_WEEKS - 1) : SCOUT_DELAY_WEEKS;

    // 6. Insert row
    const currentWeek = await worldClock.getCurrentWeek(tx);
    const actionId = await repo.insertScoutAction(tx, {
      clubId: p.clubId, playerId: p.playerId, windowId: p.windowId,
      actionType: p.actionType, costPaidEurK: cost,
      completesAtWeek: currentWeek + delay,
      status: 'pending',
    });

    // 7. Debit balance
    await economy.debit(tx, p.clubId, cost, 'scouting_scout_cost');

    return ok({ actionId, completesAtWeek: currentWeek + delay });
  });
}

export async function tickResolvePendingScouts(currentWeek: number) {
  return db.transaction(async (tx) => {
    const pending = await repo.getPendingScoutsCompletingAtWeek(tx, currentWeek);

    for (const action of pending) {
      const windowStillOpen = await isWindowOpen(tx, action.windowId);

      if (windowStillOpen) {
        await repo.markCompleted(tx, action.id, new Date());
        // §5.x: emit Socket.IO event for UI refresh
        await realtime.broadcast(action.clubId, 'scouting:scout_complete', { actionId: action.id, playerId: action.playerId });
      } else {
        // §5.9: refund 50%
        const refund = Math.round(action.costPaidEurK * 0.5);
        await repo.markRefunded(tx, action.id, refund);
        await economy.credit(tx, action.clubId, refund, 'scouting_refund_window_closed');
      }
    }
  });
}

export async function expireScoutsOnWindowClose(windowId: string) {
  return db.transaction(async (tx) => {
    // Any still-pending scouts at window close get refund
    const stillPending = await repo.getPendingScoutsByWindow(tx, windowId);
    for (const action of stillPending) {
      const refund = Math.round(action.costPaidEurK * 0.5);
      await repo.markRefunded(tx, action.id, refund);
      await economy.credit(tx, action.clubId, refund, 'scouting_refund_window_closed');
    }

    // Completed scouts: keep records but they no longer grant T2/T3 visibility (visibility.ts already handles via windowId match)
  });
}
```

In `apps/api/src/modules/scouting-market/repo.ts`:

- `insertScoutAction(tx, params)`
- `getPendingScoutsCompletingAtWeek(tx, week)`
- `getPendingScoutsByWindow(tx, windowId)`
- `markCompleted(tx, id, when)`
- `markRefunded(tx, id, amount)`
- `hasCompletedScout(tx, clubId, playerId, windowId)`
- `hasCompletedDeepScout(tx, clubId, playerId, windowId)`

## Out of Scope

- Offer service (story 005)
- AI rotation worker (story 006)
- UI (story 007)

## Acceptance Criteria

1. `initiateScout` happy path: row inserted as `pending`, balance debited
2. `initiateScout` with window closed → returns `err('WINDOW_CLOSED')`, no DB write
3. `initiateScout('deep_scout')` without prior T2-scout → returns `err('INVALID_PREREQ')`
4. `initiateScout('deep_scout')` without Scout Director T2+ → returns `err('INSUFFICIENT_STAFF')`
5. `initiateScout` with balance < cost → returns `err('INSUFFICIENT_BALANCE')`
6. `initiateScout` with T3 director → delay reduces from 1 to 0 weeks (instant)
7. `tickResolvePendingScouts` at week N: pending with completesAtWeek=N → status='completed'
8. `tickResolvePendingScouts` at week N with window closed → status='refunded', 50% credit issued
9. `expireScoutsOnWindowClose` refunds all pending scouts in that window
10. Cost discount with T3 director applied: scoutActionCost('deep_scout', {scoutDirectorT3: true}) = 12 (not 15)
11. Concurrent `initiateScout` from same club, same player, same window → second succeeds (multiple scouts allowed; tier escalates separately)
12. After `markCompleted`, `hasCompletedScout` returns true
13. Determinismo: given world clock + balance state, same inputs → same outputs

## Test Requirements (Integration, BLOCKING)

`apps/api/tests/scouting-service.test.ts` (real DB via test schema):

- Setup test club + balance + player + open window
- Cover ACs 1-13 with isolated test cases
- Mock economy.debit/credit + staffSystem.getScoutDirectorTier + worldClock.getCurrentWeek + realtime.broadcast

## Dependencies

- **Upstream**: 001 (schema), 002 (types), 003 (cost formula F4)
- **Downstream**: 005 (offer service depends on scout state), 007 (UI calls service)

## Estimate

**1.5 days.** Service + repo + cross-module mocks.

## Notes / Gotchas

- Mocks for `economy.debit/credit` and `staffSystem.getScoutDirectorTier`: stub these in respective modules if not yet available. Real wiring happens in integration tests with full module load.
- T3 director cost discount AND delay reduction both apply — verify in test (not double-discount: applied as separate modifiers).
- The "scouting_scout_cost" and "scouting_refund_window_closed" categories need to be registered in economy.md F-revenue-flow. Propagation pending.
- Future v1.2+: rejected scout requests (e.g., player is in protected status). Not in scope for v1.1.
