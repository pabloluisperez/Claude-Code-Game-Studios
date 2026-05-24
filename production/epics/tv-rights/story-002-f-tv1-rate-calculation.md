# Story 002: F-TV1 Rate Calculation + Guards

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Logic
> **Estimate**: S (2h — pure functions + guards + unit tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-002`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md)
**ADR Decision Summary**: `calculateTVRate(tier, division, durationSeasons)` is a pure function using integer centavo arithmetic to avoid IEEE 754 drift. Guards throw `TVRangeError` for illegal inputs, mapped to HTTP 400 by Hono error middleware.

**Engine**: Web stack | **Risk**: LOW
**Engine Notes**: All arithmetic uses integer centavos to avoid float drift. Math.round at the end is the only rounding operation. Drizzle stores the result as `numeric(10,2)` — use `.toFixed(2)` before DB insert.

**Control Manifest Rules (Feature layer)**:
- Required: Logic in `packages/shared/src/sim/` has 80% minimum test coverage.
- Forbidden: `Math.random()` or `Date.now()` in pure simulation functions (not applicable here — deterministic arithmetic only).

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-07**: REGIONAL 1yr D2 → `tv_weekly_rate_eur_k = 1.75` (`Math.round(175×100×100/10000)/100 = 1.75`)
- [ ] **AC-TV-08**: NACIONAL 1yr D1 → `tv_weekly_rate_eur_k = 7.16` (`Math.round(530×135×100/10000)/100 = 716/100 = 7.16`)
- [ ] **AC-TV-26**: LOCAL 1yr D1 → `tv_weekly_rate_eur_k = 0.72` (`Math.round(53×135×100/10000)/100 = 72/100 = 0.72`)
- [ ] **AC-TV-27**: NACIONAL 1yr D2 → `tv_weekly_rate_eur_k = 5.30`
- [ ] **AC-TV-28**: REGIONAL 1yr D1 → `tv_weekly_rate_eur_k = 2.36` (`Math.round(175×135×100/10000)/100 = 236/100 = 2.36`)
- [ ] **AC-TV-35**: REGIONAL 2yr D2 → 1.84 · NACIONAL 3yr D2 → 5.83 · NACIONAL 3yr D1 → 7.87
- [ ] **AC-TV-42**: REGIONAL 2yr D1 → `tv_weekly_rate_eur_k = 2.48` (`Math.round(175×135×105/10000)/100 = 248/100 = 2.48`)
- [ ] **AC-TV-50**: `POST /api/tv/sign` with `{ tier: "LOCAL", duration_seasons: 2 }` → HTTP 400 `{ error: "illegal_tier_duration" }`
- [ ] **AC-TV-51**: `POST /api/tv/sign` with `{ tier: "REGIONAL", duration_seasons: 3 }` → HTTP 400; similarly `{ tier: "NACIONAL", duration_seasons: 2 }` → HTTP 400

---

## Implementation Notes

*Derived from ADR-019 §Decision and GDD F-TV1:*

Location: `packages/shared/src/sim/tv-rights/rate-calculation.ts`

```typescript
export const TV_BASE_CENTS = { LOCAL: 53, REGIONAL: 175, NACIONAL: 530 } as const
export const DIVISION_MULTIPLIER_CENTS = { D1: 135, D2: 100 } as const
export const DURATION_MULTIPLIER_CENTS = { 1: 100, 2: 105, 3: 110 } as const

export class TVRangeError extends Error {
  constructor(message: string) { super(message); this.name = 'TVRangeError' }
}

// Legal duration_seasons per tier
const LEGAL_DURATIONS: Record<TVTier, ReadonlyArray<number>> = {
  LOCAL: [1],
  REGIONAL: [1, 2],
  NACIONAL: [1, 3],
}

export function calculateTVRate(
  tier: TVTier,
  division: 'D1' | 'D2',
  durationSeasons: 1 | 2 | 3,
): number {
  if (!(division in DIVISION_MULTIPLIER_CENTS))
    throw new TVRangeError(`Unknown division: ${division}`)
  if (![1, 2, 3].includes(durationSeasons))
    throw new TVRangeError(`Invalid duration: ${durationSeasons}`)
  if (!LEGAL_DURATIONS[tier].includes(durationSeasons))
    throw new TVRangeError(`Illegal tier+duration: ${tier}/${durationSeasons}`)

  return Math.round(
    TV_BASE_CENTS[tier] * DIVISION_MULTIPLIER_CENTS[division] * DURATION_MULTIPLIER_CENTS[durationSeasons] / 10000
  ) / 100
}
```

HTTP 400 mapping in `apps/api/src/middleware/error-handler.ts`:
```typescript
if (err instanceof TVRangeError) {
  return c.json({ error: 'illegal_tier_duration', message: err.message }, 400)
}
```

All 6 annual cases + 2 multi-year cases from GDD F-TV1 arithmetic table must be verified by unit tests.

---

## Out of Scope

- [Story 001]: Schema (table where the rate is stored)
- [Story 004]: HTTP endpoint that calls calculateTVRate
- [Story 003]: Unlock rules (which tiers are available)

---

## QA Test Cases

*Logic — unit tests, zero DB.*

- **AC-TV-07**: REGIONAL D2 1yr
  - Given: tier='REGIONAL', division='D2', durationSeasons=1
  - When: calculateTVRate(tier, division, durationSeasons)
  - Then: returns exactly 1.75 (no float drift)
  - Edge cases: Math.round(175×100×100/10000)/100 = Math.round(175)/100 = 175/100 = 1.75

- **AC-TV-08**: NACIONAL D1 1yr (fractional centavos → rounding)
  - Given: tier='NACIONAL', division='D1', durationSeasons=1
  - When: calculateTVRate(...)
  - Then: returns 7.16 (175×135 = 236.25 → Math.round(236.25) = 236 → 2.36 for REGIONAL; 530×135×100/10000 = 715.5 → Math.round(715.5) = 716 → 7.16)

- **AC-TV-35/42**: Multi-year rates
  - Given: REGIONAL 2yr D2 → 1.84; NACIONAL 3yr D2 → 5.83; NACIONAL 3yr D1 → 7.87; REGIONAL 2yr D1 → 2.48
  - When: calculateTVRate for each combo
  - Then: exact values (no drift)

- **AC-TV-50**: Guard — LOCAL 2yr
  - Given: tier='LOCAL', division='D2', durationSeasons=2
  - When: calculateTVRate(...)
  - Then: throws TVRangeError with message containing 'LOCAL/2'
  - Edge cases: LOCAL 3yr also throws; NACIONAL 2yr throws; REGIONAL 3yr throws

- **AC-TV-51**: Guard — invalid division
  - Given: tier='REGIONAL', division='D3', durationSeasons=1
  - When: calculateTVRate(...)
  - Then: throws TVRangeError 'Unknown division: D3'

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `packages/shared/src/tests/tv-rights/rate-calculation.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (Story 001 must be DONE — schema defines the type TVTier)
- Unlocks: Story 004 (sign endpoint calls calculateTVRate)
