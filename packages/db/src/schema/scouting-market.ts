/**
 * Drizzle schema: scouting-market v1.1 module.
 *
 * Per ADR-031 §D2 (Scouting & Transfer Market — Schema). 6 tables:
 *   - scouting_actions: per-window scout/deep_scout actions with countdown
 *   - transfer_offers: bids on free agents + AI club players
 *   - saved_searches: persisted filter combos per club
 *   - ai_club_window_state: deterministic AI rotation state per window
 *   - player_buyer_rejections: prevents AI clubs from re-bidding same player
 *   - scouting_market_window_status: rotation lifecycle audit
 *
 * Story SCOUTING-MARKET-001.
 */

import {
  pgTable,
  uuid,
  integer,
  text,
  real,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clubs } from './clubs.js';
import { players } from './players.js';
export const scoutingActions = pgTable(
  'scouting_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    windowId: uuid('window_id').notNull(),
    /** Values: 'scout' | 'deep_scout' (text not pgEnum for forward flexibility). */
    actionType: text('action_type').notNull(),
    costPaidEurK: integer('cost_paid_eur_k').notNull(),
    initiatedAt: timestamp('initiated_at', { withTimezone: true }).notNull().defaultNow(),
    completesAtWeek: integer('completes_at_week').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    refundedEurK: integer('refunded_eur_k'),
    /** Values: 'pending' | 'completed' | 'refunded' | 'expired'. */
    status: text('status').notNull(),
  },
  (t) => ({
    byWindowClub: index('idx_scout_window_club').on(t.windowId, t.clubId),
    byPending: index('idx_scout_pending').on(t.status, t.completesAtWeek),
  }),
);

export const transferOffers = pgTable(
  'transfer_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyerClubId: uuid('buyer_club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    /** NULL for free agents. */
    sellerClubId: uuid('seller_club_id').references(() => clubs.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    windowId: uuid('window_id').notNull(),
    feeEurK: integer('fee_eur_k').notNull(),
    wageOfferEurKWeek: integer('wage_offer_eur_k_week').notNull(),
    contractWeeks: integer('contract_weeks').notNull(),
    /** Values: 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired'. */
    status: text('status').notNull(),
    counterOfferEurK: integer('counter_offer_eur_k'),
    bidNumber: integer('bid_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({
    byBuyerWindow: index('idx_offers_buyer_window').on(t.buyerClubId, t.windowId),
    byPlayerWindow: index('idx_offers_player_window').on(t.playerId, t.windowId),
  }),
);

export const savedSearches = pgTable(
  'saved_searches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    filtersJson: jsonb('filters_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unqClubName: uniqueIndex('uniq_saved_search_club_name').on(t.clubId, t.name),
  }),
);

export const aiClubWindowState = pgTable(
  'ai_club_window_state',
  {
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    windowId: uuid('window_id').notNull(),
    bargainFactor: real('bargain_factor').notNull(),
    transferBudgetUsedEurK: integer('transfer_budget_used_eur_k').notNull().default(0),
    rotationCompleted: boolean('rotation_completed').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clubId, t.windowId] }),
  }),
);

export const playerBuyerRejections = pgTable(
  'player_buyer_rejections',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    buyerClubId: uuid('buyer_club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    windowId: uuid('window_id').notNull(),
    reason: text('reason').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.playerId, t.buyerClubId, t.windowId] }),
  }),
);

export const scoutingMarketWindowStatus = pgTable('scouting_market_window_status', {
  windowId: uuid('window_id').primaryKey(),
  rotationStartedAt: timestamp('rotation_started_at', { withTimezone: true }),
  rotationCompletedAt: timestamp('rotation_completed_at', { withTimezone: true }),
});

export const scoutingActionsRelations = relations(scoutingActions, ({ one }) => ({
  club: one(clubs, { fields: [scoutingActions.clubId], references: [clubs.id] }),
  player: one(players, { fields: [scoutingActions.playerId], references: [players.id] }),
}));

export const transferOffersRelations = relations(transferOffers, ({ one }) => ({
  buyerClub: one(clubs, {
    fields: [transferOffers.buyerClubId],
    references: [clubs.id],
    relationName: 'transferBuyer',
  }),
  sellerClub: one(clubs, {
    fields: [transferOffers.sellerClubId],
    references: [clubs.id],
    relationName: 'transferSeller',
  }),
  player: one(players, { fields: [transferOffers.playerId], references: [players.id] }),
}));

export type ScoutingAction = typeof scoutingActions.$inferSelect;
export type NewScoutingAction = typeof scoutingActions.$inferInsert;
export type TransferOffer = typeof transferOffers.$inferSelect;
export type NewTransferOffer = typeof transferOffers.$inferInsert;
export type SavedSearch = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;
export type AiClubWindowState = typeof aiClubWindowState.$inferSelect;
export type PlayerBuyerRejection = typeof playerBuyerRejections.$inferSelect;
