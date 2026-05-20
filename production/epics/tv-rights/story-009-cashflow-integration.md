# Story 009: Cashflow Integration + Economy Breaking Change

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M (3h — advance() wiring + BREAKING CHANGE cleanup + regression tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-009`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-014: Financial Flow + Bankruptcy Protocol](../../../docs/architecture/ADR-014-economy-financial-flow.md) + [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md)
**ADR Decision Summary**: TV revenue enters cashflow via `TVPrePhaseResult.revenue` in advance() economy phase. The flat constant `getTVRightsWeekly()` and `TV_RIGHTS_SEGUNDA`/`TV_RIGHTS_PRIMERA` must be deleted. Both deprecations are BREAKING CHANGEs — any tests referencing AC-LGS-18/19 must be deprecated.

**Engine**: Web stack | **Risk**: LOW
**Engine Notes**: The advance() economy phase (ADR-014) reads revenue from TVPrePhaseResult — no separate query needed. The cashflow phase happens after the TV pre-phase and cascade tick, before the WorldState snapshot write.

**Control Manifest Rules (Feature layer + Foundation)**:
- Required: Transactional advance() pipeline — TV revenue applies within the same db.transaction().
- Forbidden: Side-channel writes to WorldState (TV revenue must go through the economy cashflow path, not directly).

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-09**: tv_contract_status=NONE → tv_weekly_eur_k=0.0 exact in cashflow
- [ ] Cashflow includes `TVPrePhaseResult.revenue` in weekly calculation — not `getTVRightsWeekly()` return value
- [ ] `getTVRightsWeekly()` function deleted from league-system/economy modules; constants `TV_RIGHTS_SEGUNDA` and `TV_RIGHTS_PRIMERA` deleted from `constants.ts`
- [ ] ACs AC-LGS-18/19 deprecated — tests referencing `getTVRightsWeekly()` or the flat constants removed/deprecated
- [ ] Economy weekly cashflow: `total_revenue = ticket_revenue + sponsor_income + tv_weekly_eur_k` where `tv_weekly_eur_k` comes from TVPrePhaseResult.revenue
- [ ] With ACTIVE contract at 5.30 €K/sem and no other revenue, weekly cashflow reflects 5.30 €K contribution

---

## Implementation Notes

*Derived from ADR-014 §Decision + ADR-019 §4 (advance() execution order):*

In `advance()` for week W:
1. [TV pre-phase] → `preResult.revenue` computed
2. [Cascade tick] → TickResult
3. [Economy phase — extends ADR-014] reads `preResult.revenue`:
   ```typescript
   const tvRevenue = preResult.revenue  // 0 if NONE/CANCELLED; rate if ACTIVE
   const weeklyRevenue = ticketRevenue + sponsorIncome + tvRevenue
   ```
4. TV revenue added to `weekly_cashflow` in WorldState delta

**Files to delete/modify**:
- Delete: `league-system/economy.ts` function `getTVRightsWeekly()`
- Delete: constants `TV_RIGHTS_SEGUNDA`, `TV_RIGHTS_PRIMERA` from `packages/shared/src/sim/constants.ts`
- Deprecate: tests for AC-LGS-18/19 (add comment `// DEPRECATED: AC-LGS-18 — getTVRightsWeekly() removed in tv-rights epic`)
- Verify: no remaining references to `TV_RIGHTS_PRIMERA` or `TV_RIGHTS_SEGUNDA` in codebase

---

## Out of Scope

- [Story 006]: TVPrePhaseResult computation (must be DONE first)
- [Story 010]: F-TV4 fan_attendance_effective (separate modification to matchday revenue)
- League system standing calculation — not affected by this change

---

## QA Test Cases

*Integration — advance() pipeline with TV contract.*

- **AC-TV-09**: NONE → zero TV revenue
  - Given: tv_contract_status=NONE (no contract for season), week advance
  - When: advance() economy phase
  - Then: tv_weekly_eur_k=0.0 in weekly cashflow; total cashflow unaffected by TV line

- **Cashflow contribution**: ACTIVE contract
  - Given: NACIONAL D2 1yr ACTIVE (rate=5.30), no matchday revenue (away week)
  - When: advance() week N
  - Then: weekly_cashflow += 5.30 (TV contribution visible in WorldState delta)

- **BREAKING CHANGE regression**:
  - Given: compile project after deleting getTVRightsWeekly() and constants
  - When: `tsc --noEmit`
  - Then: zero type errors (no remaining references to deleted symbols)

- **AC-LGS-18/19 deprecation**:
  - Given: tests for league-system flat constants
  - When: grep for TV_RIGHTS_SEGUNDA / TV_RIGHTS_PRIMERA in test files
  - Then: no active test assertions referencing them (deprecated comments only)

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `packages/api/tests/tv-rights/cashflow.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 006 (TVPrePhaseResult must exist), Story 008 (rollover complete — cashflow correct for all seasons)
- Unlocks: Story 011 (UI can display TV revenue in /finance)
