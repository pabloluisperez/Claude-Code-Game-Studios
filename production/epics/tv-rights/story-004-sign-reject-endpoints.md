# Story 004: POST /api/tv/sign + Reject Endpoints

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M (3-4h — Hono routes + Drizzle tx + XP grants + HTTP error mapping)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-012` + `TR-TVR-008`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md)
**ADR Decision Summary**: `POST /api/tv/sign` wraps event resolution (`consumed=true`) + contract creation + XP grant in a single Drizzle transaction. `POST /api/tv/reject` wraps event consumed + fan_loyalty increment. HTTP 409 if contract already ACTIVE or offer already consumed. HTTP 400 if illegal tier+duration.

**Engine**: Web stack | **Risk**: LOW
**Engine Notes**: Drizzle transactions require `db.transaction(async (tx) => {...})`. All reads/writes within the tx use the `tx` parameter, not the global `db`. Session auth via cookie (existing pattern from other routes).

**Control Manifest Rules (Feature layer)**:
- Required: All API calls from web go through typed wrappers — no inline fetch() in components.
- Required: Transactional advance() pipeline pattern — sign/reject operations wrap event resolution and state mutation in a single db.transaction().
- Forbidden: Client-side game state mutations (server-authoritative).

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] **AC-TV-15**: `tv_contract_status=ACTIVE` (season S) → generate tv_auction for season S → HTTP 409 `{ error: "tv_auction_already_exists", season_id: S }`. For season S+1, new auction generated normally
- [ ] **AC-TV-16**: Sign REGIONAL → `manager.financial_acumen_xp = X + 10`
- [ ] **AC-TV-17**: Sign NACIONAL → `manager.financial_acumen_xp = X + 25`
- [ ] **AC-TV-18**: Sign LOCAL → financial_acumen_xp unchanged AND fan_loyalty unchanged
- [ ] **AC-TV-18b**: Reject tv_auction → financial_acumen_xp unchanged AND fan_loyalty += 10 exactly
- [ ] **AC-TV-21**: Reject all tv_auction offers → tv_contract_status=NONE (unchanged), rate=0, fan_loyalty += 10, advance unblocked
- [ ] **AC-TV-43**: `tv_contract_status=ACTIVE` → second POST /api/tv/sign → HTTP 409 `{ error: "tv_contract_already_active", current_status: "ACTIVE", current_tier: <tier>, season_id: <S>, season_in_contract: <n> }`
- [ ] **AC-TV-54**: T1 (prev_pos=null) → player rejects the single LOCAL offer → fan_loyalty += 10, tv_contract_status=NONE, advance unblocked; next season_start generates new tv_auction normally

---

## Implementation Notes

*Derived from ADR-019 §5 (POST /api/tv/sign atomicity):*

Routes at `apps/api/src/routes/tv-rights.ts`:

**POST /api/tv/sign**:
1. Parse body with Zod: `{ offerId: number, tier: TVTier, durationSeasons: 1|2|3 }`
2. Call `calculateTVRate()` (Story 002) — TVRangeError → HTTP 400
3. `db.transaction(async (tx) => { ... })`:
   a. Check no active contract (HTTP 409 if exists)
   b. Resolve event: `calendarEvents.update(consumed=true)` — HTTP 409 if already consumed
   c. Insert `tv_contracts` (ACTIVE)
   d. Grant XP if REGIONAL (+10) or NACIONAL (+25) via `grantSkillXP(tx, managerId, 'financial_acumen', xp)`
4. Return `{ ok: true }`

**POST /api/tv/reject**:
1. Parse body: `{ offerId: number }` — validates it's a tv_auction or tv_midseason_offer event
2. `db.transaction(async (tx) => { ... })`:
   a. Load event — HTTP 404 if not found; HTTP 409 if already consumed
   b. Update event consumed=true
   c. `managers.update(fanLoyalty = Math.min(50, currentFanLoyalty + 10))`
3. Return `{ ok: true }` — advance unblocked

Error mapping in Hono middleware:
- `TVRangeError` → HTTP 400 `{ error: 'illegal_tier_duration' }`
- `TVContractConflictError` → HTTP 409 `{ error: 'tv_contract_already_active', ... }`
- `TVOfferExpiredError` → HTTP 409 `{ error: 'tv_offer_expired' }`

---

## Out of Scope

- [Story 003]: Generating the tv_auction event (this story only resolves it)
- [Story 010]: fan_attendance_effective calculation (F-TV4) — this story only increments fan_loyalty
- [Story 006]: Tick pipeline (corruption delta starts accumulating after signing)

---

## QA Test Cases

*Integration — requires DB + Hono test client.*

- **AC-TV-16/17/18**: XP grants by tier
  - Given: manager with financial_acumen_xp=50, tv_auction event with offerId=1
  - When: POST /api/tv/sign { offerId: 1, tier: 'REGIONAL', durationSeasons: 1 }
  - Then: manager.financial_acumen_xp=60; tv_contracts has ACTIVE row; event consumed=true
  - Edge cases: tier='LOCAL' → xp unchanged; tier='NACIONAL' → xp=75

- **AC-TV-43**: Double sign
  - Given: tv_contract_status=ACTIVE for season S
  - When: second POST /api/tv/sign
  - Then: HTTP 409 { error: 'tv_contract_already_active' }; DB unchanged

- **AC-TV-18b/21**: Rejection increments fan_loyalty
  - Given: manager fan_loyalty=0, tv_auction unconsumed
  - When: POST /api/tv/reject { offerId: 1 }
  - Then: fan_loyalty=10; event consumed=true; advance returns 200

- **AC-TV-54**: T1 rejection
  - Given: T1 (prev_season_final_position=null), single LOCAL offer
  - When: POST /api/tv/reject
  - Then: fan_loyalty+=10; tv_contract_status=NONE; next season_start generates tv_auction normally

- **Atomicity**: Simulated crash after event update but before contract insert
  - Given: mock DB failure between event.update and tvContracts.insert
  - When: POST /api/tv/sign
  - Then: both tables in original state (transaction rolled back)

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `packages/api/tests/tv-rights/sign-endpoint.test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (schema), Story 002 (calculateTVRate), Story 003 (tv_auction exists to resolve)
- Unlocks: Story 007 (midseason offer — reject path is symmetric), Story 008 (rollover requires active contract), Story 010 (fan_loyalty incremented here)
