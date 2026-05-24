# Story 005: applyTVCorruptionDelta + Threshold Predicates (Pure Functions)

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Logic
> **Estimate**: S (2h — pure functions + 15 unit tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-004` (partial — pure function layer only)
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md)
**ADR Decision Summary**: `applyTVCorruptionDelta()` and `evaluateThresholdCrossings()` are pure exported functions. `roundCorruption()` wraps ALL arithmetic on corruption_exposure. No DB I/O. These are the unit-testable building blocks for Story 006 (tick integration).

**Engine**: Web stack | **Risk**: LOW
**Engine Notes**: `roundCorruption()` = `Math.round(value * 100) / 100`. IEEE 754 drift is the core risk — the tests must verify exact 2-decimal results.

**Control Manifest Rules**:
- Required: 80% unit test coverage for packages/shared/src/sim/ logic.
- Required: Every public function from packages/* has a doc comment.
- Forbidden: `Math.random()` or `Date.now()` in pure functions (N/A here).

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-22a**: `applyTVCorruptionDelta('LOCAL', prev, 'ACTIVE')` → `prev - 0.5` (clamped to 0). `applyTVCorruptionDelta('REGIONAL', prev, 'ACTIVE')` → `prev + 0.5`. `applyTVCorruptionDelta('NACIONAL', prev, 'ACTIVE')` → `prev + 1.5`. Status≠'ACTIVE' → returns `prev` unchanged.
- [ ] **AC-TV-30**: `applyTVCorruptionDelta('LOCAL', 60.5, 'ACTIVE')` → 60.0. `threshold_crossed_upward = (60.5 < 60) AND (60.0 >= 60) = false` — no upward crossing; LOCAL ACTIVE at 60+ doesn't self-cancel.
- [ ] **AC-TV-32**: `evaluateThresholdCrossings(prev, next, threshold)` returns correct boolean for all 7 GDD cases: (59.5, 60.0, 60)→true; (59.5, 60.5, 60)→true; (60.0, 60.5, 60)→false; (65.0, 65.5, 60)→false; (60.5, 60.0, 60)→false; (60.5, 60.2, 60)→false; (50.0, 55.0, 60)→false
- [ ] **AC-TV-33**: `applyTVCorruptionDelta('LOCAL', 0.3, 'ACTIVE')` → `max(0, 0.3-0.5) = max(0, -0.2) = 0` (floor clamp)
- [ ] **AC-TV-34**: `applyTVCorruptionDelta('LOCAL', 0, 'ACTIVE')` → `max(0, 0-0.5) = 0` (no negative values)
- [ ] **CORRUPTION_MAX clamp**: `applyTVCorruptionDelta('NACIONAL', 99.0, 'ACTIVE')` → `min(100, 99.0+1.5) = 100` (ceiling clamp)
- [ ] **roundCorruption**: `roundCorruption(59.9999999)` → 60.0; `roundCorruption(59.9)` → 59.9; `roundCorruption(0.005)` → 0.01 (nearest even)

---

## Implementation Notes

*Derived from ADR-019 §3 (roundCorruption) + GDD F-TV3:*

Location: `packages/shared/src/sim/tv-rights/corruption-delta.ts`

```typescript
export const CORRUPTION_DELTA_PER_WEEK: Record<TVTier, number> = {
  LOCAL: -0.5,
  REGIONAL: 0.5,
  NACIONAL: 1.5,
}
export const TV_SCANDAL_THRESHOLD = 60
export const CORRUPTION_MAX = 100

export function roundCorruption(value: number): number {
  return Math.round(value * 100) / 100
}

/** Pure — paso 2 of 8-step Tick Order. Exported for unit tests (AC-TV-22a). */
export function applyTVCorruptionDelta(
  tier: TVTier,
  prevCorruption: number,
  status: TVStatus,
): number {
  if (status !== 'ACTIVE') return prevCorruption
  const raw = prevCorruption + CORRUPTION_DELTA_PER_WEEK[tier]
  return roundCorruption(Math.min(CORRUPTION_MAX, Math.max(0, raw)))
}

/** Pure — paso 3 and paso 7 of Tick Order. */
export function evaluateThresholdCrossings(
  prev: number,
  next: number,
  threshold: number,
): boolean {
  return prev < threshold && next >= threshold
}
```

These functions have no side effects and require no external dependencies. All 7 GDD test cases in AC-TV-32 must be covered by direct assertions.

---

## Out of Scope

- [Story 006]: Integration of these pure functions into advance() Tick Order
- [Story 007]: Midseason offer generation (which depends on threshold crossing being detected)

---

## QA Test Cases

*Logic — pure unit tests, zero DB, zero network.*

- **AC-TV-22a**: Delta by tier
  - Given/When/Then: applyTVCorruptionDelta('LOCAL', 10.0, 'ACTIVE') === 9.5; REGIONAL → 10.5; NACIONAL → 11.5; status='CANCELLED' → 10.0 unchanged

- **AC-TV-32**: evaluateThresholdCrossings 7 cases
  - See table in AC-TV-32 — each row is one assertion

- **AC-TV-33/34**: floor clamp
  - applyTVCorruptionDelta('LOCAL', 0.3, 'ACTIVE') === 0.0
  - applyTVCorruptionDelta('LOCAL', 0.0, 'ACTIVE') === 0.0

- **AC-TV-30**: LOCAL at 60.5 — decrements but no upward crossing
  - applyTVCorruptionDelta('LOCAL', 60.5, 'ACTIVE') === 60.0
  - evaluateThresholdCrossings(60.5, 60.0, 60) === false

- **CORRUPTION_MAX ceiling**:
  - applyTVCorruptionDelta('NACIONAL', 99.0, 'ACTIVE') === 100.0
  - applyTVCorruptionDelta('NACIONAL', 100.0, 'ACTIVE') === 100.0 (already at ceiling)

- **roundCorruption precision**:
  - roundCorruption(59.9999999) === 60.0
  - roundCorruption(59.9) === 59.9

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/src/tests/tv-rights/corruption-delta.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (type definitions TVTier, TVStatus)
- Unlocks: Story 006 (Tick Order integration consumes these functions)
