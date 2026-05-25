---
Story: SCOUTING-MARKET-002
Status: Ready
Type: Logic
GDD Requirement: AC-SCM-01/02/03/04/05/13/14
Governing ADR: ADR-031 §D6, scouting-market.md F1 + F5
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/scouting/visibility.test.ts + pool-size.test.ts
ImplementedAt: packages/shared/src/sim/scouting/{types,visibility,pool-size}.ts
---

# Story: Domain types + F1 visibility tier + F5 pool size

## Goal

Implement the visibility tier computation (F1) and pool size formula (F5) as pure functions. F1 is **server-authoritative** — frontend never decides visibility. F5 determines how many AI players show in the pool based on manager scouting_network_level.

## Scope

In `packages/shared/src/sim/scouting/types.ts` (new):

```typescript
export type VisibilityTier = 0 | 1 | 2 | 3;
export type ScoutAction = 'scout' | 'deep_scout';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';

export type ManagerScoutState = {
  hasScouted: (playerId: string) => boolean;
  hasDeepScouted: (playerId: string) => boolean;
  scoutCompletedAtWeek: (playerId: string) => number | null;
  deepScoutCompletedAtWeek: (playerId: string) => number | null;
  scoutDirectorTier: 0 | 1 | 2 | 3; // 0 = no director hired
};

export type PoolVisibility = {
  freeAgents: number | 'ALL';
  aiCurrentDiv: number;
  aiOtherDiv: number;
  total: number | string;
};
```

In `packages/shared/src/sim/scouting/visibility.ts`:

```typescript
import type { VisibilityTier, ManagerScoutState } from './types';

export const T3_DELAY_WEEKS = 1;
export const T3_SCOUT_DIRECTOR_THRESHOLD_TIER = 2; // ≥ T2 director enables T3

export function visibilityTierOf(
  player: { id: string; inPoolThisWindow: boolean },
  manager: ManagerScoutState,
  currentWeek: number
): VisibilityTier {
  if (!player.inPoolThisWindow) return 0;
  if (!manager.hasScouted(player.id)) return 1;
  if (!manager.hasDeepScouted(player.id)) return 2;
  if (manager.scoutDirectorTier < T3_SCOUT_DIRECTOR_THRESHOLD_TIER) return 2;
  const deepDoneAt = manager.deepScoutCompletedAtWeek(player.id);
  if (deepDoneAt === null) return 2;
  if (currentWeek - deepDoneAt < T3_DELAY_WEEKS) return 2;
  return 3;
}
```

In `packages/shared/src/sim/scouting/pool-size.ts`:

```typescript
import type { PoolVisibility } from './types';

export const AI_PLAYERS_CURRENT_DIV_BASE = 30;
export const AI_PLAYERS_CURRENT_DIV_PER_LEVEL = 5;
export const AI_PLAYERS_OTHER_DIV_BASE = 10;
export const AI_PLAYERS_OTHER_DIV_PER_LEVEL = 3;

export function poolVisibilitySize(scoutingNetworkLevel: number): PoolVisibility {
  const lvl = Math.max(1, Math.min(5, scoutingNetworkLevel));
  const aiCurrentDiv = AI_PLAYERS_CURRENT_DIV_BASE + lvl * AI_PLAYERS_CURRENT_DIV_PER_LEVEL;
  const aiOtherDiv = AI_PLAYERS_OTHER_DIV_BASE + lvl * AI_PLAYERS_OTHER_DIV_PER_LEVEL;
  return {
    freeAgents: 'ALL',
    aiCurrentDiv,
    aiOtherDiv,
    total: `ALL_FREE + ${aiCurrentDiv + aiOtherDiv}`,
  };
}
```

In `packages/shared/src/sim/scouting/visibility-field-stripping.ts`:

```typescript
import type { PoolPlayer } from '@smt/shared/types/scouting';
import type { VisibilityTier } from './types';

export function stripFieldsForTier(player: PoolPlayer, tier: VisibilityTier): PoolPlayer {
  const stripped: PoolPlayer = {
    id: player.id,
    name: player.name,
    age: player.age,
    position: player.position,
    currentClub: player.currentClub,
    contractStatus: player.contractStatus,
    visibilityTier: tier,
  };
  if (tier >= 1) {
    stripped.ovrBand = player.ovrBand;
    stripped.transferValueBand = player.transferValueBand;
  }
  if (tier >= 2) {
    stripped.ovrEstimate = player.ovrEstimate;
    stripped.transferValueEstimate = player.transferValueEstimate;
    stripped.moraleBand = player.moraleBand;
  }
  if (tier >= 3) {
    stripped.ovrExact = player.ovrExact;
    stripped.transferValueExact = player.transferValueExact;
    stripped.moraleExact = player.moraleExact;
    stripped.fitnessExact = player.fitnessExact;
    stripped.recentForm = player.recentForm;
  }
  return stripped;
}
```

## Out of Scope

- F2/F3/F4/F6 (story 003)
- Service / DB integration (stories 004-006)
- UI (story 007)

## Acceptance Criteria

1. F1: player NOT in pool → returns 0
2. F1: in pool, not scouted → returns 1
3. F1: scouted, not deep-scouted → returns 2
4. F1: deep-scouted but no Scout Director T2+ → returns 2
5. F1: deep-scouted with Scout Director T2 and 1+ week elapsed → returns 3
6. F1: deep-scouted with Scout Director T1 → returns 2 (insufficient tier)
7. F1: deep-scouted but current_week - deepDoneAt < T3_DELAY_WEEKS → returns 2 (still in delay)
8. F5: scouting_network_level=1 → aiCurrentDiv=35, aiOtherDiv=13
9. F5: scouting_network_level=5 → aiCurrentDiv=55, aiOtherDiv=25
10. F5: clamps to [1, 5] for out-of-range input
11. Field stripping: T0 player only has 7 fields; T3 has all
12. Pure functions: no I/O, no random, no Date.now

## Test Requirements (Logic, BLOCKING)

`packages/shared/tests/scouting/visibility.test.ts`:
- Cover ACs 1-7 with isolated cases
- Mock `ManagerScoutState` with controlled returns
- Property test: 1000 random states → returns are valid tier values 0/1/2/3

`packages/shared/tests/scouting/pool-size.test.ts`:
- Cover ACs 8-10
- Edge: level=0 → clamps to 1 → 35/13
- Edge: level=6 → clamps to 5 → 55/25

`packages/shared/tests/scouting/field-stripping.test.ts`:
- Verify each tier strips/preserves correctly per AC 11
- T0 + extra fields in input → output only has T0 fields (defense against accidental leak)

## Dependencies

- **Upstream**: 001 (schema for windowId / status enum types)
- **Downstream**: 004 (service uses visibility), 007 (UI consumes tier-filtered data)

## Estimate

**1 day.** 3 small pure files + 3 small test files.

## Notes / Gotchas

- The `stripFieldsForTier` MUST be called server-side before any response is serialized. Frontend can NEVER receive tier-4+ fields when tier is 2 — this is the key cheat-prevention invariant.
- `T3_DELAY_WEEKS` and `T3_SCOUT_DIRECTOR_THRESHOLD_TIER` are exported constants — surface in §7 of GDD for tuning.
- Future: T4 tier (e.g., "completely revealed including hidden personality traits") could be added; the function is designed to extend.
