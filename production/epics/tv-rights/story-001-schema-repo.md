# Story 001: tv_contracts Schema + TVRightsRepo

> **Epic**: Derechos de Televisión
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M (3-4h — schema + migration + repo functions + integration tests)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-001`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-019: TV Rights Implementation Contract](../../../docs/architecture/ADR-019-tv-rights-implementation-contract.md)
**ADR Decision Summary**: `tv_contracts` is a Drizzle table (NOT WorldState JSON). `fan_loyalty` is an INTEGER column on the `managers` table. Both are first-class entities with typed schemas.

**Engine**: Web stack (TypeScript full-stack monorepo) | **Risk**: LOW
**Engine Notes**: Drizzle returns `numeric` columns as strings — always use `parseFloat()` before arithmetic. `unique().on()` for unique constraints. `drizzle-kit generate` output must be committed.

**Control Manifest Rules (Feature layer)**:
- Required: Cross-module DB access forbidden — tv-rights module writes ONLY to `tv_contracts` and `managers.fan_loyalty`. Other modules read via FK.
- Required: Drizzle partial UNIQUE syntax uses `sql` template literal in `.where()` clauses.
- Required: Drizzle migrations checked in — every `npm run db:generate` output committed.
- Forbidden: Cross-module direct DB access — tv-rights module only reads/writes its own table.

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md`, scoped to this story:*

- [ ] `tv_contracts` Drizzle table exists with all required columns: `id`, `playthroughId` (FK → playthroughs, cascade delete), `seasonId`, `tier` typed `'LOCAL'|'REGIONAL'|'NACIONAL'`, `durationSeasons` ∈ {1,2,3}, `seasonInContract` default 1, `weeklyRateEurK` `numeric(10,2)`, `divisionAtSigning` typed `'D1'|'D2'`, `status` typed FSM union default `'NONE'`, `signedAt`, `cancelledAt`, `cancelledReason`
- [ ] UNIQUE constraint on `(playthroughId, seasonId)` — at most one contract record per playthrough per season
- [ ] `fan_loyalty` INTEGER NOT NULL DEFAULT 0 column added to `managers` table via additive migration
- [ ] Partial UNIQUE INDEX on `calendar_events (playthrough_id, season_id, type) WHERE type IN ('tv_auction', 'tv_midseason_offer')` — idempotent event generation guard
- [ ] `TVRightsRepo` exposes: `findActiveContract(playthroughId)`, `findContractForSeason(playthroughId, seasonId)`, `createContract(tx, data)`, `updateContractStatus(tx, id, status, extras?)`, `incrementSeasonInContract(tx, id)`
- [ ] `drizzle-kit generate` migration produced and committed; applies cleanly on a fresh DB
- [ ] Existing playthroughs are unaffected — `fan_loyalty` defaults to 0 and `tv_contracts` starts empty for all existing rows

---

## Implementation Notes

*Derived from ADR-019 §1 (tv_contracts table) and §2 (fan_loyalty column):*

Schema definition (in `packages/db/src/schema/tv-contracts.ts`):
```typescript
export const tvContracts = pgTable('tv_contracts', {
  id:               serial('id').primaryKey(),
  playthroughId:    integer('playthrough_id').notNull().references(() => playthroughs.id, { onDelete: 'cascade' }),
  seasonId:         integer('season_id').notNull(),
  tier:             text('tier').notNull().$type<'LOCAL' | 'REGIONAL' | 'NACIONAL'>(),
  durationSeasons:  integer('duration_seasons').notNull(),
  seasonInContract: integer('season_in_contract').notNull().default(1),
  weeklyRateEurK:   numeric('weekly_rate_eur_k', { precision: 10, scale: 2 }).notNull(),
  divisionAtSigning: text('division_at_signing').notNull().$type<'D1' | 'D2'>(),
  status:           text('status').notNull().$type<TVStatus>().default('NONE'),
  signedAt:         timestamp('signed_at'),
  cancelledAt:      timestamp('cancelled_at'),
  cancelledReason:  text('cancelled_reason').$type<'scrutiny_tv' | 'scrutiny_cascade' | null>(),
}, (t) => ({
  uniqPlaythroughSeason: unique().on(t.playthroughId, t.seasonId),
}))
```

`fan_loyalty` on managers (additive, second migration):
```typescript
fanLoyalty: integer('fan_loyalty').notNull().default(0),
```

Partial UNIQUE index for calendar_events (third migration, raw SQL in drizzle migration file):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_tv_unique_per_season
ON calendar_events (playthrough_id, season_id, type)
WHERE type IN ('tv_auction', 'tv_midseason_offer');
```

The `TVRightsRepo` module lives at `apps/api/src/modules/tv-rights/tv-rights-repo.ts`. It imports from `packages/db`. All writes take a Drizzle `tx` parameter for transaction safety.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- [Story 002]: F-TV1 rate calculation logic
- [Story 003]: tv_auction event generation
- [Story 004]: HTTP endpoints
- All tick pipeline logic (Stories 005-010)

---

## QA Test Cases

*Integration tests — require a test DB instance.*

- **AC-Schema-1**: tv_contracts table columns and types
  - Given: clean DB with migration applied
  - When: `DESCRIBE tv_contracts` (or Drizzle introspect)
  - Then: all 12 columns present with correct types and constraints
  - Edge cases: insert without required fields → NOT NULL violation; insert duplicate (playthroughId, seasonId) → unique_violation

- **AC-Schema-2**: fan_loyalty column on managers
  - Given: migration applied
  - When: insert new manager record without fan_loyalty
  - Then: fan_loyalty defaults to 0

- **AC-Schema-3**: partial unique index on calendar_events
  - Given: calendar_events with type='tv_auction', playthrough_id=1, season_id=1
  - When: attempt second insert with same (playthrough_id=1, season_id=1, type='tv_auction')
  - Then: PostgreSQL error 23505 unique_violation
  - Edge cases: same (playthrough_id, season_id) with type='fixture' should NOT be blocked

- **AC-Repo-1**: findActiveContract returns ACTIVE contract
  - Given: tv_contracts row with playthroughId=1, status='ACTIVE'
  - When: TVRightsRepo.findActiveContract(1)
  - Then: returns the row with correct typed fields; weeklyRateEurK returned as string (Drizzle numeric)

- **AC-Repo-2**: createContract inserts within transaction
  - Given: open Drizzle transaction
  - When: TVRightsRepo.createContract(tx, { playthroughId: 1, seasonId: 1, tier: 'LOCAL', durationSeasons: 1, weeklyRateEurK: '0.53', divisionAtSigning: 'D2', status: 'ACTIVE', signedAt: now })
  - Then: row inserted; within same tx, findActiveContract(1) returns the row

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `packages/api/tests/tv-rights/schema.test.ts` — must exist and pass against test DB

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None (foundational — schema must exist before any other tv-rights story)
- Unlocks: Stories 002-011 (all require the schema)
