/**
 * Drizzle schema: `tv_contracts` — per ADR-019 (TV Rights Implementation Contract).
 *
 * TV contracts are a first-class entity (NOT WorldState JSON) because they have:
 *   - A lifecycle FSM (NONE → ACTIVE → CANCELLED/EXPIRED → NONE)
 *   - Multi-season span (rollover via season_in_contract)
 *   - Immutable signing-time fields (division_at_signing, weekly_rate_eur_k)
 *   - Per-season uniqueness constraint
 *
 * Per ADR-019 §1: one row per (playthroughId, season). UNIQUE constraint guards
 * against double-insertion during retry. Status FSM is enforced at the
 * application layer; DB stores the current state as text.
 *
 * Story: TVR-001
 * Control Manifest: 2026-05-19
 */

import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { playthroughs } from './playthroughs';

export const tvContracts = pgTable(
  'tv_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    /** Season number (1-indexed, matches calendar_events.season). */
    season: integer('season').notNull(),
    /** Tier: 'LOCAL' | 'REGIONAL' | 'NACIONAL'. */
    tier: text('tier').notNull(),
    /** Contract length in seasons: 1, 2, or 3 (validated per F-TV1 guards). */
    durationSeasons: integer('duration_seasons').notNull(),
    /** Current season within the contract (1..durationSeasons). */
    seasonInContract: integer('season_in_contract').notNull().default(1),
    /** Weekly rate in €K, computed at signing via F-TV1 — immutable for life of contract. */
    weeklyRateEurK: numeric('weekly_rate_eur_k', { precision: 10, scale: 2 }).notNull(),
    /** Division at the moment of signing — immutable; not recalculated on rollover. */
    divisionAtSigning: text('division_at_signing').notNull(),
    /** FSM state: 'NONE' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED'. */
    status: text('status').notNull().default('NONE'),
    /** When the contract transitioned NONE→ACTIVE. Null while NONE. */
    signedAt: timestamp('signed_at', { withTimezone: true }),
    /** When the contract transitioned ACTIVE→CANCELLED. Null otherwise. */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** Cancellation reason: 'scrutiny_tv' | 'scrutiny_cascade'. Null while ACTIVE. */
    cancelledReason: text('cancelled_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    /** At most one contract record per (playthrough, season) — guards against duplicate inserts. */
    uniqPlaythroughSeason: unique('tv_contracts_playthrough_season_unique').on(
      t.playthroughId,
      t.season,
    ),
    byPlaythroughStatus: index('tv_contracts_playthrough_status').on(
      t.playthroughId,
      t.status,
    ),
  }),
);

export const tvContractsRelations = relations(tvContracts, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [tvContracts.playthroughId],
    references: [playthroughs.id],
  }),
}));

export type TVContractRow = typeof tvContracts.$inferSelect;
export type NewTVContractRow = typeof tvContracts.$inferInsert;

export type TVTier = 'LOCAL' | 'REGIONAL' | 'NACIONAL';
export type TVStatus = 'NONE' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
export type TVDivision = 'D1' | 'D2';
export type TVCancelReason = 'scrutiny_tv' | 'scrutiny_cascade';
