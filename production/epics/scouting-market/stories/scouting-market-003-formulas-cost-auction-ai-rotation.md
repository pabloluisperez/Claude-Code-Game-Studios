---
Story: SCOUTING-MARKET-003
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: Logic
GDD Requirement: AC-SCM-08/09/10/11/16/17/22
Governing ADR: ADR-031, ADR-002 (determinism)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/scouting/{free-agent,auction,cost,ai-rotation}.test.ts (27/27 passing)
ImplementedAt: packages/shared/src/sim/scouting/{free-agent,auction,cost,ai-rotation-logic}.ts
---

# Story: F2 (free agent) + F3 (auction) + F4 (cost) + F6 (AI rotation logic)

## Goal

Implement the 4 remaining pure-function formulas. F2 = free agent acceptance with desperation factor. F3 = AI club counter-offer auction. F4 = scout action cost modifiers. F6 = AI club mini-loop logic (used by worker in story 006).

## Scope

In `packages/shared/src/sim/scouting/free-agent.ts`:

```typescript
export const DESPERATION_DISCOUNT_PCT = 0.25;
export const DESPERATION_WEEKS_FULL_DISCOUNT = 20;

export function freeAgentAcceptance(
  wageOffer: number,
  player: { wageExpectationEurKWeek: number; weeksUnsigned: number }
): boolean {
  const desperation = Math.min(1, player.weeksUnsigned / DESPERATION_WEEKS_FULL_DISCOUNT);
  const effectiveThreshold = player.wageExpectationEurKWeek * (1 - DESPERATION_DISCOUNT_PCT * desperation);
  return wageOffer >= effectiveThreshold;
}
```

In `packages/shared/src/sim/scouting/auction.ts`:

```typescript
export const AI_NEED_PREMIUM = 0.30;
export const AI_COUNTER_OFFER_MARKUP = 0.15;
export const AI_HARD_REJECT_THRESHOLD = 0.85;

export type AuctionResult =
  | { accepted: true }
  | { accepted: false; counterOfferEurK: number }
  | { accepted: false; hardReject: true };

export function aiClubAcceptance(
  feeOfferedEurK: number,
  player: { transferValueEurK: number },
  ai: { bargainFactor: number; needFactor: number }
): AuctionResult {
  const expectedFee = player.transferValueEurK * ai.bargainFactor;
  const acceptThreshold = expectedFee * (1 + ai.needFactor * AI_NEED_PREMIUM);

  if (feeOfferedEurK >= acceptThreshold) {
    return { accepted: true };
  }

  if (feeOfferedEurK >= expectedFee * AI_HARD_REJECT_THRESHOLD) {
    const counter = expectedFee * (1 + (1 - ai.needFactor) * AI_COUNTER_OFFER_MARKUP);
    return { accepted: false, counterOfferEurK: Math.round(counter) };
  }

  return { accepted: false, hardReject: true };
}
```

In `packages/shared/src/sim/scouting/cost.ts`:

```typescript
export const SCOUT_COST_EUR_K = 5;
export const DEEP_SCOUT_COST_EUR_K = 15;
export const SCOUT_DIRECTOR_T3_COST_DISCOUNT = 0.20;

export function scoutActionCost(
  actionType: 'scout' | 'deep_scout',
  modifiers?: { scoutDirectorT3?: boolean }
): number {
  const base = actionType === 'scout' ? SCOUT_COST_EUR_K : DEEP_SCOUT_COST_EUR_K;
  const discount = modifiers?.scoutDirectorT3 ? SCOUT_DIRECTOR_T3_COST_DISCOUNT : 0;
  return Math.round(base * (1 - discount));
}
```

In `packages/shared/src/sim/scouting/ai-rotation-logic.ts`:

```typescript
export const AGE_DECLINE_THRESHOLD = 30;
export const LOW_MORALE_THRESHOLD = 30;
export const TRANSFER_REQUEST_PROB = 0.15;
export const MIN_ROSTER_SIZE = 18;
export const TARGET_ROSTER_SIZE = 22;
export const AI_TRANSFER_BUDGET_PCT = 0.10;
export const FOR_SALE_RATIO_AGE_DECLINE = 0.50;
export const AI_BARGAIN_FACTOR_MIN = 0.85;
export const AI_BARGAIN_FACTOR_MAX = 1.20;

export type RngFn = () => number; // 0..1, seeded

/**
 * Computes bargain factor for an AI club at a given window.
 * Deterministic given the same rng sequence.
 */
export function generateBargainFactor(rng: RngFn): number {
  return AI_BARGAIN_FACTOR_MIN + rng() * (AI_BARGAIN_FACTOR_MAX - AI_BARGAIN_FACTOR_MIN);
}

/**
 * Decides if a player on AI club's roster should be marked for sale this window.
 * Pure function — caller manages persistence.
 */
export function shouldMarkForSale(
  player: { age: number; morale: number },
  club: { rosterSize: number },
  rng: RngFn
): { mark: boolean; reason?: 'age_decline' | 'transfer_request' } {
  if (player.age > AGE_DECLINE_THRESHOLD && club.rosterSize > MIN_ROSTER_SIZE) {
    if (rng() < FOR_SALE_RATIO_AGE_DECLINE) {
      return { mark: true, reason: 'age_decline' };
    }
  }
  if (player.morale < LOW_MORALE_THRESHOLD) {
    if (rng() < TRANSFER_REQUEST_PROB) {
      return { mark: true, reason: 'transfer_request' };
    }
  }
  return { mark: false };
}

/**
 * Computes AI club transfer budget for this window.
 */
export function aiTransferBudget(club: { financialBalanceEurK: number }): number {
  return Math.max(0, Math.floor(club.financialBalanceEurK * AI_TRANSFER_BUDGET_PCT));
}

/**
 * Compute squad gaps — positions where the AI club has fewer than expected players.
 * Returns array of positions ordered by need priority.
 */
export function computeSquadGaps(
  club: { roster: { position: string }[] }
): string[] {
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of club.roster) {
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  // Target ratios per position
  const targets: Record<string, number> = { GK: 3, DEF: 8, MID: 7, FWD: 4 };
  const gaps: { pos: string; gap: number }[] = [];
  for (const pos in targets) {
    const gap = targets[pos] - (counts[pos] ?? 0);
    if (gap > 0) gaps.push({ pos, gap });
  }
  return gaps.sort((a, b) => b.gap - a.gap).map((g) => g.pos);
}
```

## Out of Scope

- Service / DB layer (stories 004-006)
- BullMQ worker integration (story 006)

## Acceptance Criteria

1. F2: wage_offer=10, player.expectation=10, weeksUnsigned=0 → accept=true
2. F2: wage_offer=10, player.expectation=15, weeksUnsigned=0 → accept=false
3. F2: wage_offer=7.5, player.expectation=10, weeksUnsigned=20 → accept=true (full desperation discount)
4. F2: wage_offer=7.5, player.expectation=10, weeksUnsigned=40 → accept=true (capped at full discount)
5. F3: fee=120, transferValue=100, bargainFactor=1.0, needFactor=0 → accepted=true (>= 100 * 1.0)
6. F3: fee=130, transferValue=100, bargainFactor=1.0, needFactor=1.0 → accepted=true (>= 100 * 1.30)
7. F3: fee=85, transferValue=100, bargainFactor=1.0, needFactor=0 → counter-offer (85 >= 85)
8. F3: counter-offer value at needFactor=0 → expectedFee * 1.15 = 115
9. F3: fee=80, transferValue=100, bargainFactor=1.0 → hard reject (80 < 85)
10. F4: scoutActionCost('scout') = 5
11. F4: scoutActionCost('deep_scout') = 15
12. F4: scoutActionCost('deep_scout', {scoutDirectorT3: true}) = 12 (15 * 0.80)
13. F6: generateBargainFactor with rng() returning 0.5 → exactly 1.025 (midpoint)
14. F6: shouldMarkForSale on player.age=31, club.rosterSize=20, rng=0.40 → mark=true (40% < 50%)
15. F6: shouldMarkForSale on player.age=31, club.rosterSize=18 → mark=false (at MIN_ROSTER)
16. F6: aiTransferBudget on balance=1000 → 100 (10%)
17. F6: computeSquadGaps with all GKs missing → returns ['GK', ...] first
18. F6: computeSquadGaps with full roster → returns []
19. All functions deterministic — same rng → same output

## Test Requirements (Logic, BLOCKING)

`packages/shared/tests/scouting/free-agent.test.ts`:
- Cover ACs 1-4
- Property: desperation always in [0, 1] → effectiveThreshold always in [expectation*0.75, expectation]

`packages/shared/tests/scouting/auction.test.ts`:
- Cover ACs 5-9
- Edge: bargainFactor=1.20 (highest) → expectedFee=120 → accept threshold higher
- Property: 1000 random inputs → all paths return valid AuctionResult

`packages/shared/tests/scouting/cost.test.ts`:
- Cover ACs 10-12
- Verify rounding (cost is always integer)

`packages/shared/tests/scouting/ai-rotation.test.ts`:
- Cover ACs 13-18
- Determinism: same seed sequence → same bargainFactor output 1000 times

## Dependencies

- **Upstream**: 002 (types)
- **Downstream**: 004 (scout actions use F4 cost), 005 (offer service uses F2 + F3), 006 (AI worker uses F6)

## Estimate

**1 day.** 4 small files + 4 small test files.

## Notes / Gotchas

- All rng parameters are seeded — never use `Math.random()`. Story 006 sets up seeded rng based on `worldSeed + windowId + clubId`.
- `Math.round` for cost/counter-offer ensures integer outputs (consistent with €K granularity).
- The `computeSquadGaps` targets (GK:3, DEF:8, MID:7, FWD:4) sum to 22 = TARGET_ROSTER_SIZE. If TARGET changes, update targets dictionary too.
- Future v1.2+ may add formation-specific targets (e.g., 5-3-2 needs more DEFs). Leave structure flexible.
