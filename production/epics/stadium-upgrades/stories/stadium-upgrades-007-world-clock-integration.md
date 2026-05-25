---
Story: STADIUM-UPGRADES-007
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: Integration
GDD Requirement: AC-SU-22/24/25/26 + ADR-029 §D5
Governing ADR: ADR-029, ADR-008 (world clock)
Control Manifest: 2026-05-19
Test Evidence: apps/api/tests/stadium-upgrades/tier-evaluator.test.ts (8/8 passing)
ImplementedAt: apps/api/src/modules/stadium-upgrades/tier-evaluator.ts (+ tickAllClubsWithActiveUpgrades entrypoint)
---

# Story: World Clock tick integration + tier-up doble gate hook

## Goal

Wire stadium-upgrades into the existing world clock advance pipeline. Each week-tick calls `stadiumUpgradesService.tickClub()` for every club; on `Complete`, the system re-evaluates city-progression tier-up with the doble gate logic.

## Scope

In `apps/api/src/modules/advance/run-tick.ts` (or wherever the per-club week-tick logic lives — find via grep for ADR-008 references):

Add a new step to the per-club tick pipeline:

```typescript
async function tickClub(tx, clubId: string, currentDay: number, currentWeek: number) {
  // ... existing steps ...

  // NEW: Stadium upgrades tick
  await stadiumUpgradesService.tickClub(tx, clubId);

  // ... existing steps ...
}
```

In `apps/api/src/modules/city-progression/tier-evaluator.ts` (new or extend existing):

```typescript
export async function evaluateTierUp(tx, clubId: string): Promise<TierUpResult> {
  const state = await worldState.getCurrent(tx, clubId);
  const currentTier = state.cityTier;

  // Check métricas gate (gate 1) for tier currentTier + 1
  const nextTier = currentTier + 1;
  if (nextTier > 4) return { tierUp: false, reason: 'AT_MAX' };

  const metricsOk = checkMetricsGate(state, nextTier);  // existing logic
  if (!metricsOk) return { tierUp: false, reason: 'METRICS_NOT_MET' };

  // Check reformas gate (gate 2 — NEW per ADR-029)
  const completedItems = await stadiumUpgradesService.getCompletedItemsCountByLevel(tx, clubId, nextTier);
  const totalItemsInLevel = getCatalog().filter(i => i.tier === nextTier).length;
  const reformasOk = tierUpReformasGateSatisfied(nextTier, completedItems, totalItemsInLevel);

  if (!reformasOk) return { tierUp: false, reason: 'REFORMAS_NOT_MET', required: itemsRequiredForLevel(totalItemsInLevel), completed: completedItems };

  // Both gates pass — promote tier
  await worldState.updateTier(tx, clubId, nextTier);
  return { tierUp: true, newTier: nextTier };
}
```

Also implement `stadiumUpgradesService.getCompletedItemsCountByLevel()` in story 005's service.

## Out of Scope

- Tier-down logic (handled by city-progression existing anti-yo-yo logic, unchanged)
- Animations / UI feedback (story 008)

## Acceptance Criteria

1. World clock week-tick triggers `stadiumUpgradesService.tickClub()` for each club
2. `tickClub()` is wrapped in the same transaction as other per-club week-tick steps (atomicity)
3. Active item with `weeks_remaining = 5` after tick → `weeks_remaining = 4`
4. Active item with `weeks_remaining = 1` after tick → status `Complete` + all 8 side effects executed
5. `evaluateTierUp` called as part of side effects (per story 005 step 4)
6. **Doble gate**: tier-up dispara sólo si BOTH métricas AND reformas requeridas (per AC-SU-24)
7. **Métricas OK + reformas no**: tier-up no dispara, returns `{tierUp: false, reason: 'REFORMAS_NOT_MET'}`
8. **Reformas OK + métricas no**: tier-up no dispara, returns `{tierUp: false, reason: 'METRICS_NOT_MET'}`
9. **Both OK**: tier-up dispara, `worldState.cityTier` incrementa
10. Bankruptcy state: tickClub skips decrement (pause)
11. Determinismo: same state + same week → same result (re-running tick with same data produces same final state)
12. Multiple clubs: each tickClub independent — no cross-club state leak

## Test Requirements (Integration, BLOCKING)

`apps/api/tests/stadium-upgrades-tick.test.ts`:

- Setup multi-club fixtures with controlled state
- Cover ACs 1-12
- Test the integration: kick the world clock advance pipeline, verify stadium-upgrades behavior changes
- Mock or use real `evaluateTierUp` depending on how city-progression module is structured

## QA Test Cases

Source: `production/qa/qa-plan-sprint-22-2026-05-25.md §22-7`.

**Test file**: `apps/api/tests/stadium-upgrades-tick.test.ts` (~15 tests) — Real DB. Trigger world clock advance via service entrypoint.

**Tick pipeline**:
1. Week-tick triggers `stadiumUpgradesService.tickClub()` for each club (spy assertion)
2. `tickClub()` runs in same tx as other per-club steps (atomicity)
3. `weeks_remaining=5` + 1 tick → `weeks_remaining=4`
4. `weeks_remaining=1` + 1 tick → status `complete` + all 8 side effects
5. `evaluateTierUp` called once as part of side effects
6. Bankruptcy: tickClub skips decrement (pause)
7. Multi-club: 2 clubs simultaneous → no cross-club state leak
8. **Determinism (AC-SU-26)**: same fixture × 10 runs → same final state

**Doble gate**:
9. Métricas OK + reformas not → `{tierUp: false, reason: 'REFORMAS_NOT_MET'}`, no tier change
10. Reformas OK + métricas not → `{tierUp: false, reason: 'METRICS_NOT_MET'}`
11. Both OK → `{tierUp: true, newTier}`, `world_state_snapshots.city_tier` incremented

**Edge cases**:
12. Club at `cityTier=4` (max) → `{tierUp: false, reason: 'AT_MAX'}`
13. Club with no active item → no-op
14. Tier-up from old save where `stadium_upgrade_count=0` for tier ≥ 2 → gate fails (intentional v1.1)
15. Advance with 0 clubs → no-op cleanly

**Manual evidence**: None — fully automatable.

## Dependencies

- **Upstream**: 005 (service has `tickClub`), 004 (gate function), 003 (formulas)
- **Downstream**: 008 (UI sees tier-up animation)

## Estimate

**1 day.** Mostly wiring + integration tests.

## Notes / Gotchas

- Find the actual advance pipeline location via `grep -r 'advance.*tick' apps/api/src/modules/advance/`. The pipeline may already exist; just insert the new step.
- The `evaluateTierUp` function is called from BOTH the stadium-upgrades `completeItem` side effect AND any other place where métricas could change (e.g., end of season). Make sure both call sites work.
- Determinismo (AC 11): if there's a known non-determinism issue (e.g., `Date.now()` in some logging path), tests should mock or work around. Don't add randomness to fix.
- Migration step from city-progression's existing métricas-only tier-up to new doble gate: ensure existing test fixtures still pass — backfill `stadium_upgrade_count = 0` makes the gate trivially fail for tier 2+ in old saves, but that's the v1.1 design intent (players must build reformas to advance).
