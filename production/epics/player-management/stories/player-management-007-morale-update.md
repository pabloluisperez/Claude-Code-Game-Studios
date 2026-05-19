---
Story: PLAYER-MANAGEMENT-007
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-PM-007 (F11 morale update post-match + F10 market wage reference)
Governing ADR: ADR-016 (Player Lifecycle)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/morale.test.ts
---

# Story 007: F10 Market Wage Reference + F11 Morale Update (Post-Match)

> **Epic**: player-management
> **Layer**: Core (shared sim logic)
> **Type**: Logic
> **Estimate**: 0.5 days
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-007` — F10 wage reference calculation, F11 morale delta (result_bonus + wage_ratio_bonus + playing_time_bonus), clamped [0, 100].

**ADR Governing Implementation**: ADR-016
**ADR Decision Summary**: Morale is updated post-match. The delta is composed of three independent bonuses, each clamped independently. Final morale is clamped to [0, 100].

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] `computeMarketWageF10(transferValue: number)` = `transferValue × WAGE_VALUE_RATIO` (WAGE_VALUE_RATIO = 0.02).
- [ ] **AC-PM-23**: `computeMoraleF11({ morale: 65, matchResult: 'win', wage: 0.40, marketWage: 0.44, minutesPlayed: 45, status: 'available' })` = `71`. (`result_bonus=+3, wage_ratio_bonus=+2 (0.40 ≥ 0.44×0.9=0.396), playing_time_bonus=+1 → morale_next=clamp(65+6, 0, 100)=71`)
- [ ] **AC-PM-24**: With morale=15, loss, wage=0.05 < market×0.6, not selected → `morale_next = clamp(15-6, 0, 100) = 9`.
- [ ] Wage ratio bonus: `+MORALE_WAGE_BONUS=2` if `wage ≥ marketWage × 0.9`; `-MORALE_WAGE_PENALTY=3` if `wage < marketWage × 0.6`; `0` otherwise.
- [ ] Playing time bonus: `+1` if minutesPlayed ≥ 30; `-1` if status=available and minutesPlayed=0 (benched and not called on); `0` if status=injured or suspended.
- [ ] Result bonus: `+MORALE_WIN_BONUS=3` on win; `0` on draw or no match; `-MORALE_LOSS_PENALTY=2` on loss.
- [ ] `computeMoraleF11` is pure — no DB access, no randomness.

## Implementation Notes

File: `packages/shared/src/sim/player-management/morale.ts`

```typescript
export const MORALE_WIN_BONUS = 3;
export const MORALE_LOSS_PENALTY = 2;
export const MORALE_WAGE_BONUS = 2;
export const MORALE_WAGE_PENALTY = 3;
export const WAGE_VALUE_RATIO = 0.02;

export function computeMarketWageF10(transferValue: number): number { ... }
export function computeMoraleF11(args: {
  morale: number; matchResult: 'win' | 'draw' | 'loss' | 'none';
  wage: number; marketWage: number;
  minutesPlayed: number; status: 'available' | 'injured' | 'suspended';
}): number { ... }
```

## Out of Scope

- Writing updated morale to DB
- F11 cascade integration path (F9b — story 006)
- Transfer value formula F6 (story 009)

## QA Test Cases

- **AC-1**: `computeMoraleF11({morale:65, matchResult:'win', wage:0.40, marketWage:0.44, minutesPlayed:45, status:'available'})` → 71 (AC-PM-23)
- **AC-2**: `computeMoraleF11({morale:15, matchResult:'loss', wage:0.05, marketWage:0.5, minutesPlayed:0, status:'available'})` → 9 (AC-PM-24)
- **AC-3**: `computeMoraleF11({morale:50, matchResult:'draw', wage:0.30, marketWage:0.30, minutesPlayed:60, status:'available'})` → clamp(50+0+0+1, 0, 100) = 51
- **AC-4**: `computeMoraleF11({morale:5, matchResult:'loss', wage:0.20, marketWage:0.30, minutesPlayed:0, status:'injured'})` → clamp(5-2+0+0, 0, 100) = 3 (status=injured: no playing_time penalty)
- **AC-5**: `computeMarketWageF10(10.0)` → 0.20 (10 × 0.02)
- **AC-6**: Clamp at 0: `computeMoraleF11({morale:2, matchResult:'loss', wage:0.01, marketWage:0.50, minutesPlayed:0, status:'available'})` → 0 (not negative)
- **AC-7**: `computeMoraleF11` — no Math.random() call

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/tests/player-management/morale.test.ts` — must pass

## Dependencies

- Depends on: None (pure formulas)
- Unlocks: Story 009 (F6 transfer value uses morale indirectly via F6's form_factor)
