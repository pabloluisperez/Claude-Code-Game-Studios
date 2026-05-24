# Story 010: F-TV4 fan_loyalty → fan_attendance_effective

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Logic
> **Estimate**: M (3h — pure function + matchday revenue BREAKING CHANGE + tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-007`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md)
**ADR Decision Summary**: `fan_loyalty` lives on `managers` table (NOT a WorldState/cascade node). `calculateFanAttendanceEffective(fanAttendance, fanLoyalty)` is a pure function: `min(1.0, fanAttendance × (1 + fanLoyalty × 0.005))`. BREAKING CHANGE: matchday revenue consumers must call this function. Location of the BREAKING CHANGE is pending OQ-TV-03 cross-review (economy §F3 or cascade C8).

**Engine**: Web stack | **Risk**: LOW
**Engine Notes**: fan_loyalty is a manager column read at matchday revenue time. It doesn't participate in the cascade graph — no cascade node, no threshold crossing.

**Control Manifest Rules**:
- Required: 80% coverage for packages/shared/src/sim/ logic.
- Required: doc comment on every public function exported from packages/*.
- Note (OQ-TV-03): the exact module that calls calculateFanAttendanceEffective must be decided in cross-review before stories 010 and 009 are closed. Mark this story's implementation as incomplete until the cross-review decision is made.

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-46 (part 1)**: fan_loyalty=0 → fan_attendance_effective = fan_attendance × 1.00 (no effect)
- [ ] **AC-TV-46 (part 2)**: fan_loyalty=10, fan_attendance=0.60 → effective=min(1.0, 0.60×1.05)=min(1.0, 0.63)=0.63 (+5%)
- [ ] **AC-TV-46 (part 3)**: fan_loyalty=50 (cap), fan_attendance=0.60 → effective=min(1.0, 0.60×1.25)=min(1.0, 0.75)=0.75 (+25%)
- [ ] **AC-TV-46 (part 4)**: fan_loyalty=50, fan_attendance=1.0 → effective=min(1.0, 1.0×1.25)=min(1.0, 1.25)=1.0 (clamp enforced)
- [ ] `calculateFanAttendanceEffective(fanAttendance, fanLoyalty)` pure function exported from `packages/shared/src/sim/tv-rights/fan-loyalty.ts`
- [ ] Matchday revenue consumer (economy §F3 or cascade C8 — pending OQ-TV-03 cross-review) reads `fan_loyalty` from managers table and applies F-TV4 via `calculateFanAttendanceEffective()`
- [ ] `fan_loyalty` registered in `entities.yaml` as cross-system entity (range [0,50], type integer, owner tv-rights)

---

## Implementation Notes

*Derived from ADR-019 §2 (fan_loyalty) + GDD F-TV4:*

Location: `packages/shared/src/sim/tv-rights/fan-loyalty.ts`

```typescript
export const FAN_LOYALTY_ATTENDANCE_FACTOR = 0.005
export const FAN_LOYALTY_CAP = 50

/**
 * F-TV4: Converts fan_loyalty to a fan_attendance multiplier.
 * Clamps result to [0, 1.0] — fan_attendance_effective cannot exceed 100% capacity.
 */
export function calculateFanAttendanceEffective(
  fanAttendance: number,  // [0, 1.0] decimal format
  fanLoyalty: number,     // [0, 50] integer
): number {
  const multiplier = 1 + fanLoyalty * FAN_LOYALTY_ATTENDANCE_FACTOR
  return Math.min(1.0, fanAttendance * multiplier)
}
```

**OQ-TV-03 OPEN QUESTION**: The location where `calculateFanAttendanceEffective()` is called in matchday revenue is pending cross-review:
- Option A: `economy.md §F3` consumer reads fan_loyalty from managers and calls F-TV4
- Option B: `cascade-engine.md C8` nodo fan_attendance becomes a derived node with F-TV4 applied

This story implements the pure function. The wiring into matchday revenue is marked as pending. The story can be closed once the pure function tests pass AND the cross-review decision is implemented (even if in a follow-up commit). Mark the wiring subtask separately.

**entities.yaml update** — add before closing:
```yaml
- id: fan_loyalty
  owner: tv-rights
  type: integer
  range: [0, 50]
  default: 0
  description: "Cumulative manager fan loyalty from TV offer rejections. Permanent (no decay). Used by F-TV4 to multiply fan_attendance in matchday revenue."
  cross_system_readers:
    - economy (matchday revenue — F-TV4)
```

---

## Out of Scope

- [Story 004]: fan_loyalty increment on rejection (already implemented in sign/reject endpoints)
- [Story 009]: Cashflow integration (TV revenue direct — F-TV4 is for matchday, not TV weekly income)

---

## QA Test Cases

*Logic — pure unit tests.*

- **AC-TV-46**: F-TV4 calculations
  - Given/When/Then:
    - calculateFanAttendanceEffective(0.60, 0) === 0.60 (no effect)
    - calculateFanAttendanceEffective(0.60, 10) === 0.63 (×1.05)
    - calculateFanAttendanceEffective(0.60, 50) === 0.75 (×1.25, within range)
    - calculateFanAttendanceEffective(1.0, 50) === 1.0 (clamp: 1.0×1.25→1.25, clamped to 1.0)
    - calculateFanAttendanceEffective(0.0, 50) === 0.0 (zero attendance stays zero)
  - Edge cases: fan_loyalty=0 → multiplier=1.0; fan_loyalty=50 (cap) → multiplier=1.25

- **Clamp invariant**:
  - For any fanAttendance ∈ [0,1] and fanLoyalty ∈ [0,50]:
    - calculateFanAttendanceEffective(fanAttendance, fanLoyalty) <= 1.0 (parametric test)

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/src/tests/tv-rights/fan-loyalty.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (fan_loyalty column on managers), Story 004 (fan_loyalty increments implemented)
- Unlocks: Story 011 (UI shows fan_loyalty effect in /finance)
