---
Story: PLAYER-MANAGEMENT-009
Status: Complete
Last Updated: 2026-05-19
Type: Logic
GDD Requirement: TR-PM-009 (F6 transfer_value formula)
Governing ADR: ADR-016 (Player Lifecycle)
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/player-management/transfer-value.test.ts
---

# Story 009: F6 Transfer Value Formula

> **Epic**: player-management
> **Layer**: Core (shared sim logic)
> **Type**: Logic
> **Estimate**: 0.5 days
> **Manifest Version**: 2026-05-19

## Context

**GDD**: `design/gdd/player-management.md`
**Requirement**: `TR-PM-009` — F6 transfer_value_eur_k = BASE_VALUE_K × skill_factor × age_factor × form_factor.

**ADR Governing Implementation**: ADR-016
**ADR Decision Summary**: Transfer value is a pure computation from player attributes. No DB access required. Minimum clamped to 0.1 €K to prevent negative values from corrupt data.

## Acceptance Criteria

*From GDD `design/gdd/player-management.md`:*

- [ ] **AC-PM-16**: `computeTransferValue({ skill: 75, age: 22, form: 70 })` ≈ `10.45 €K`. (`skill_factor=(75/50)^1.8≈2.07`; `age_factor=1.2`; `form_factor=0.8+(70-60)/100×0.4=0.84` → `5×2.07×1.2×0.84 ≈ 10.45`). Tolerance ±0.5 €K.
- [ ] **AC-PM-17**: `computeTransferValue({ skill: 20, age: 40, form: 30 })` ≥ `0.1 €K` (minimum clamp, never negative).
- [ ] `age_factor` follows the discrete table from GDD Tuning Knobs (age 16-18→0.7; 19-21→0.9; 22-24→1.2; 25-27→1.0; 28-30→0.85; 31-33→0.60; 34+→0.35).
- [ ] `form_factor` range: at form=30 → `0.8 + (30-60)/100×0.4 = 0.68`; at form=90 → `0.92`.
- [ ] Output ≥ `0.1` for any valid inputs.

## Implementation Notes

File: `packages/shared/src/sim/player-management/transfer-value.ts`

```typescript
export const BASE_VALUE_K = 5.0;
export const SKILL_VALUE_EXP = 1.8;
export const WAGE_VALUE_RATIO = 0.02;

const AGE_FACTORS: Array<{ minAge: number; factor: number }> = [
  { minAge: 34, factor: 0.35 },
  { minAge: 31, factor: 0.60 },
  { minAge: 28, factor: 0.85 },
  { minAge: 25, factor: 1.0 },
  { minAge: 22, factor: 1.2 },
  { minAge: 19, factor: 0.9 },
  { minAge: 0,  factor: 0.7 },
];

export function computeTransferValue(args: { skill: number; age: number; form: number }): number { ... }
```

## Out of Scope

- Transfer market buy/sell logic (story 010)
- Salary calculation (story 003 world-gen handles initial salary)

## QA Test Cases

- **AC-1**: `computeTransferValue({skill:75, age:22, form:70})` ≈ 10.45 ±0.5 (AC-PM-16)
- **AC-2**: `computeTransferValue({skill:20, age:40, form:30})` ≥ 0.1 (AC-PM-17)
- **AC-3**: `computeTransferValue({skill:50, age:24, form:60})` ≈ BASE_VALUE_K (5.0) ± 10% (reference point)
- **AC-4**: age=22 → age_factor=1.2; age=34 → age_factor=0.35
- **AC-5**: form=30 → form_factor≈0.68; form=90 → form_factor≈0.92
- **AC-6**: `computeTransferValue` pure — no Math.random(), no DB access

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/tests/player-management/transfer-value.test.ts` — must pass

## Dependencies

- Depends on: None (pure formula)
- Unlocks: Story 010 (transfer market uses transfer_value for offer acceptance threshold)
