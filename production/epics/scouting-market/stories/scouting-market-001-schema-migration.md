---
Story: SCOUTING-MARKET-001
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: Logic
GDD Requirement: AC-SCM-12, AC-SCM-22, AC-SCM-25
Governing ADR: ADR-031 §D2
Control Manifest: 2026-05-19
Test Evidence: packages/db/tests/scouting-market-schema.test.ts (7/7 passing)
ImplementedAt: packages/db/src/schema/scouting-market.ts + packages/db/drizzle/0029_scouting_market.sql (renumbered from 0027 — see commit)
---

# Story: Drizzle schema + migration 0027 (5 tables + AI club bargain state)

## Goal

Create 5 new tables per ADR-031 §D2. Schema is the foundation for everything else. Each table has indexes optimized for the read patterns described in the GDD.

## Scope

In `packages/db/src/schema/scouting-market.ts` (new):

```typescript
import { pgTable, uuid, integer, text, real, boolean, jsonb, timestamp, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { clubs } from './clubs';
import { players } from './players';

export const scoutingActions = pgTable('scouting_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').references(() => clubs.id).notNull(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  windowId: uuid('window_id').notNull(),
  actionType: text('action_type').notNull(), // 'scout' | 'deep_scout'
  costPaidEurK: integer('cost_paid_eur_k').notNull(),
  initiatedAt: timestamp('initiated_at').notNull().defaultNow(),
  completesAtWeek: integer('completes_at_week').notNull(),
  completedAt: timestamp('completed_at'),
  refundedEurK: integer('refunded_eur_k'),
  status: text('status').notNull(), // 'pending' | 'completed' | 'refunded' | 'expired'
}, (t) => ({
  byWindowClub: index('idx_scout_window_club').on(t.windowId, t.clubId),
  byPending: index('idx_scout_pending').on(t.status, t.completesAtWeek),
}));

export const transferOffers = pgTable('transfer_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerClubId: uuid('buyer_club_id').references(() => clubs.id).notNull(),
  sellerClubId: uuid('seller_club_id').references(() => clubs.id), // null for free agents
  playerId: uuid('player_id').references(() => players.id).notNull(),
  windowId: uuid('window_id').notNull(),
  feeEurK: integer('fee_eur_k').notNull(),
  wageOfferEurKWeek: integer('wage_offer_eur_k_week').notNull(),
  contractWeeks: integer('contract_weeks').notNull(),
  status: text('status').notNull(), // 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired'
  counterOfferEurK: integer('counter_offer_eur_k'),
  bidNumber: integer('bid_number').notNull(), // 1..MAX_BIDS_PER_PLAYER
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
}, (t) => ({
  byBuyerWindow: index('idx_offers_buyer_window').on(t.buyerClubId, t.windowId),
  byPlayerWindow: index('idx_offers_player_window').on(t.playerId, t.windowId),
}));

export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').references(() => clubs.id).notNull(),
  name: text('name').notNull(),
  filtersJson: jsonb('filters_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  unqClubName: uniqueIndex('uniq_saved_search_club_name').on(t.clubId, t.name),
}));

export const aiClubWindowState = pgTable('ai_club_window_state', {
  clubId: uuid('club_id').references(() => clubs.id).notNull(),
  windowId: uuid('window_id').notNull(),
  bargainFactor: real('bargain_factor').notNull(),
  transferBudgetUsedEurK: integer('transfer_budget_used_eur_k').notNull().default(0),
  rotationCompleted: boolean('rotation_completed').notNull().default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.clubId, t.windowId] }),
}));

export const playerBuyerRejections = pgTable('player_buyer_rejections', {
  playerId: uuid('player_id').references(() => players.id).notNull(),
  buyerClubId: uuid('buyer_club_id').references(() => clubs.id).notNull(),
  windowId: uuid('window_id').notNull(),
  reason: text('reason').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.playerId, t.buyerClubId, t.windowId] }),
}));

export const windowStatus = pgTable('scouting_market_window_status', {
  windowId: uuid('window_id').primaryKey(),
  rotationStartedAt: timestamp('rotation_started_at'),
  rotationCompletedAt: timestamp('rotation_completed_at'),
});
```

Migration 0027 generated via drizzle-kit. Verify:
- All FKs set CASCADE on delete (clubs/players deleted → cascade cleanup)
- All indexes created per definitions above
- Status check constraint on scouting_actions/transfer_offers if desired (DB-level enum)

## Out of Scope

- Service logic (stories 004-006)
- Catalog or formulas (story 002, 003)

## Acceptance Criteria

1. `scouting_actions` table exists with all 11 columns + 2 indexes
2. `transfer_offers` table exists with all 12 columns + 2 indexes
3. `saved_searches` table exists with UNIQUE constraint on (club_id, name)
4. `ai_club_window_state` table exists with composite PK
5. `player_buyer_rejections` table exists with composite PK
6. `scouting_market_window_status` table exists
7. INSERT row in saved_searches with duplicate (club_id, name) → unique violation
8. Migration 0027 applies cleanly on fresh DB
9. Migration 0027 idempotent on rerun (no error)
10. Drizzle types compile: `import { scoutingActions } from '@smt/db'` works in apps/api

## Test Requirements (Logic, BLOCKING)

`packages/db/tests/scouting-market-schema.test.ts`:

- INSERT one row in each of 6 tables, SELECT verify shape
- INSERT duplicate (club_id, name) in saved_searches → expect violation
- INSERT 2 rows with same (clubId, windowId) in aiClubWindowState → expect violation
- Verify FK cascade on clubs.delete (delete a club, verify dependent rows are gone)
- Foreign key resolution: scoutingActions.player_id must reference a real players.id

## Dependencies

- **Upstream**: existing clubs + players + events schemas
- **Downstream**: 002, 004, 005, 006 (all import schema)

## Estimate

**0.5 day.** Schema is mostly mechanical.

## Notes / Gotchas

- Verify migration filename continues from latest existing (likely `0026_world_state_backfill.sql` from stadium-upgrades-001 epic). Adjust to next available number.
- The `windowId` references the `events` table indirectly — verify the FK relationship matches event-system.md's actual event schema. If events use a different ID type, adjust.
- `players.id` and `clubs.id` are assumed UUIDs — verify in existing schema files before locking.
- `bargainFactor` stored as `real` (float). Round to 2 decimal places in service layer for display.
