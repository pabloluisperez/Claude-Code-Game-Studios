---
Story: PLAYER-MANAGEMENT-004
Status: Ready
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-PM-004 (F4 form rolling average + F5 form decay)
Governing ADR: ADR-016 (Player Lifecycle)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/form.test.ts
---

# Story 004: F4 Form Rolling Average + F5 Form Decay

> **Epic**: player-management
> **Layer**: Core (shared sim logic)
> **Type**: Logic
> **Estimate**: 0.5 days
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-004` — F4 form update (last 5 match_ratings weighted), F5 form decay (2/week when not playing).

**ADR Governing Implementation**: ADR-016 — Player Lifecycle
**ADR Decision Summary**: Form update uses exponentially-weighted rolling average of last 5 match_ratings (most recent weight 1.0, oldest 0.4). F5 decay applied each week player has not played ≥30 min, after a 5-week grace period.

**Control Manifest Rules (Core layer)**:
- Required: Pure functions — no DB access, injectable `recentRatings` array input
- Required: form clamped [30, 90] per GDD edge case

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] **AC-PM-04**: `computeFormF4([72, 68, 75, 70, 65])` = `70.0` (simple average, GDD F4 example — the ADR uses weighted; verify ADR-016 spec takes precedence: weights [1.0, 0.85, 0.7, 0.55, 0.4]; most-recent-first. **Use ADR-016 weighted version**, document variance from GDD F4 example.)
- [ ] `computeFormF4` with fewer than 5 ratings (1-4): uses only the available weights normalised.
- [ ] `computeFormF4` result clamped to [30, 90].
- [ ] **AC-PM-05**: `computeFormDecayF5(50, 1)` (1 tick of decay after grace period) = 48.0 (form=50 - 2.0, clamped min 30).
- [ ] **AC-PM-06**: `computeFormDecayF5(32, 1)` = 30 (clamped to MIN_FORM).
- [ ] Grace period: decay is NOT applied for weeks 1–5 without playing. Only applied at week 6+.
- [ ] `applyFormUpdate(recentRatings: number[], newRating: number): number[]` — appends `newRating`, keeps last 5. Returns updated array.

## Implementation Notes

File: `packages/shared/src/sim/player-management/form.ts`

```typescript
export const MIN_FORM = 30;
export const MAX_FORM = 90;
export const FORM_DECAY_WEEKLY = 2.0;
export const FORM_GRACE_WEEKS = 5;  // weeks without playing before decay starts
const F4_WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4]; // most-recent first

export function computeFormF4(ratings: number[]): number { ... }
export function computeFormDecayF5(currentForm: number, weeksWithoutPlay: number): number { ... }
export function applyFormUpdate(recentRatings: number[], newRating: number): number[] { ... }
```

## Out of Scope

- Writing updated form to DB (done by advance-worker post-match using PlayersRepo)
- F11 morale (story 007)

## QA Test Cases

- **AC-1**: `computeFormF4([72, 68, 75, 70, 65])` — verify weighted output vs GDD simple average; document which wins
- **AC-2**: `computeFormF4([90, 90, 90, 90, 90])` → 90 (clamped at MAX)
- **AC-3**: `computeFormF4([20])` → 30 (clamped at MIN — single low rating)
- **AC-4**: `computeFormDecayF5(50, 1)` → 48.0 (AC-PM-05)
- **AC-5**: `computeFormDecayF5(32, 1)` → 30 (AC-PM-06)
- **AC-6**: `computeFormDecayF5(50, 0)` → 50 (week 0 = grace period, no decay)
- **AC-7**: `applyFormUpdate([72, 68, 75, 70, 65], 80)` → `[68, 75, 70, 65, 80]` (shifts out oldest, appends newest)
- **AC-8**: `applyFormUpdate([], 70)` → `[70]` (empty → single entry)

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/tests/player-management/form.test.ts` — must exist and pass

## Dependencies

- Depends on: None (pure functions)
- Unlocks: Story 003 (world-gen sets initial form), Story 007 (morale update separate)
