---
Story: STADIUM-UPGRADES-004
Status: Ready
Type: Logic
GDD Requirement: AC-SU-12/13/14/15/18/19/20/21/22/23
Governing ADR: ADR-029, economy.md F1
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/stadium/{cost,duration,capacity,gate}.test.ts (pending)
ImplementedAt: packages/shared/src/sim/stadium/{cost,duration,capacity,gate}.ts
---

# Story: F2 duration_weeks + F4 cost_of_item + F5 stadium_capacity + F6 tier-up gate

## Goal

Implement the four remaining stadium-upgrades formulas. All pure functions, deterministic. F5 reads `STADIUM_CAPACITY_BASE[division]` from economy.md F1 source.

## Scope

In `packages/shared/src/sim/stadium/cost.ts` (new):

```typescript
export const BASE_COST_TIER: Record<ItemTier, number> = { 1: 15, 2: 55, 3: 130, 4: 340 };
export const TRACK_MULTIPLIER: Record<Track, number> = {
  gradas: 1.40, pitch: 0.80, servicios: 0.90, training: 1.10, academy: 1.00,
};
export const CONSTRUCTION_SKILL_DISCOUNT = 0.15;

export function costOfItem(item: { tier: ItemTier; track: Track }, modifiers?: { constructionSkill?: boolean; subsidyPct?: number }): number {
  let cost = BASE_COST_TIER[item.tier] * TRACK_MULTIPLIER[item.track];
  if (modifiers?.constructionSkill) cost *= (1 - CONSTRUCTION_SKILL_DISCOUNT);
  if (modifiers?.subsidyPct) cost *= (1 - modifiers.subsidyPct);
  return Math.round(cost);
}
```

In `packages/shared/src/sim/stadium/duration.ts` (new):

```typescript
export const DURATION_BASE: Record<ItemTier, number> = { 1: 2, 2: 4, 3: 6, 4: 8 };
export const DIRECTOR_MULT_MIN = 0.80;
export const DIRECTOR_MULT_MAX = 1.30;
export const DUR_MIN = 1;
export const DUR_MAX = 16;

function directorMultiplier(skill: number | null | undefined): number {
  if (skill === null || skill === undefined) return 1.0;
  if (skill >= 50) return 1.0 - (skill - 50) * (1 - DIRECTOR_MULT_MIN) / 50;
  return 1.0 + (50 - skill) * (DIRECTOR_MULT_MAX - 1.0) / 50;
}

export function durationWeeks(item: { tier: ItemTier }, directorSkill: number | null = null): number {
  const m = directorMultiplier(directorSkill);
  return clamp(Math.round(DURATION_BASE[item.tier] * m), DUR_MIN, DUR_MAX);
}
```

In `packages/shared/src/sim/stadium/capacity.ts` (new):

```typescript
export const STADIUM_CAPACITY_BASE: Record<'D1' | 'D2', number> = { D1: 12000, D2: 6000 };
export const CAPACITY_PER_GRADA_ITEM: Record<ItemTier, number> = { 1: 700, 2: 1100, 3: 2000, 4: 2700 };

export function stadiumCapacity(division: 'D1' | 'D2', completedGradasByTier: Record<ItemTier, number>): number {
  let total = STADIUM_CAPACITY_BASE[division];
  for (const tier of [1, 2, 3, 4] as ItemTier[]) {
    total += (completedGradasByTier[tier] ?? 0) * CAPACITY_PER_GRADA_ITEM[tier];
  }
  return total;
}
```

In `packages/shared/src/sim/stadium/gate.ts` (new):

```typescript
export const TIER_UP_GATE_PCT = 0.70;

export function itemsRequiredForLevel(itemsInLevel: number): number {
  return Math.ceil(itemsInLevel * TIER_UP_GATE_PCT);
}

export function tierUpReformasGateSatisfied(level: ItemTier, completedCount: number, totalInLevel: number): boolean {
  return completedCount >= itemsRequiredForLevel(totalInLevel);
}
```

## Out of Scope

- Side-effect transactions (story 005)
- Service queries (story 005)
- UI display (story 008)

## Acceptance Criteria

1. **F4**: T2 Gradas → `costOfItem({tier:2, track:'gradas'}) === 77` (55 × 1.40)
2. **F4**: T4 Gradas with Construction skill → `costOfItem({tier:4, track:'gradas'}, {constructionSkill: true}) === 405` (476 × 0.85)
3. **F4**: T4 Gradas with 30% subsidy + Construction → `costOfItem(..., {constructionSkill: true, subsidyPct: 0.30}) === 283` (476 × 0.85 × 0.70)
4. **F2**: T3 with skill 80 → `durationWeeks({tier:3}, 80) === 5`
5. **F2**: T4 with skill 15 → `durationWeeks({tier:4}, 15) === 10`
6. **F2**: T1 with no director → `durationWeeks({tier:1}) === 2`
7. **F2**: T1 with skill 100 → `durationWeeks({tier:1}, 100) === 2` (`round(2 × 0.80) = 2`, clamp at DUR_MIN=1 not needed)
8. **F5**: D2 with no upgrades → `stadiumCapacity('D2', {1:0,2:0,3:0,4:0}) === 6000`
9. **F5**: D1 with all 8 gradas items → `stadiumCapacity('D1', {1:2,2:2,3:2,4:2}) === 25000`
10. **F6**: 10 items in level → `itemsRequiredForLevel(10) === 7`
11. **F6**: `tierUpReformasGateSatisfied(2, 7, 10) === true`
12. **F6**: `tierUpReformasGateSatisfied(2, 6, 10) === false`
13. Pure functions: no I/O, no random, no time

## Test Requirements (Logic, BLOCKING)

`packages/shared/tests/stadium/cost.test.ts`:
- Spot checks per AC 1-3
- All 20 (5 tracks × 4 tiers) cost combinations produce values in expected range [12, 476]

`packages/shared/tests/stadium/duration.test.ts`:
- Spot checks per AC 4-7
- Property: for any skill in [0, 100], `durationWeeks` returns integer in [DUR_MIN, DUR_MAX]
- Edge: skill = 50 → multiplier = 1.0 exactly (no rounding bias)

`packages/shared/tests/stadium/capacity.test.ts`:
- Spot checks per AC 8-9
- D2 with all gradas → 19,000
- Per-tier capacity contribution: completing only N1 items adds 1,400 (2 × 700)

`packages/shared/tests/stadium/gate.test.ts`:
- Spot checks per AC 10-12
- Edge: 0 items in level → `itemsRequiredForLevel(0) === 0` → gate trivially satisfied
- Property: monotonic in totalInLevel

## Dependencies

- **Upstream**: 001 (schema), 002 (catalog for max counts), 003 (types)
- **Downstream**: 005 (service uses costs + durations), 007 (gate hook to city-progression)

## Estimate

**1 day.** 4 small files + 4 test files.

## Notes / Gotchas

- `STADIUM_CAPACITY_BASE` values come from `economy.md F1`. If economy.md changes them, this constant must follow. Future story to extract to shared constants module.
- D3/D4 (lower divisions) not yet supported — MVP scope is D2 + D1. If divisions expand post-MVP, add entries here.
- Future: `costOfItem` modifiers may need to compose multiplicatively in specific order. Document order in JSDoc.
- For payback validation (Capa 3 "8 partidos"), no automated test — it's a runtime assertion in QA playtest (smoke checks).
