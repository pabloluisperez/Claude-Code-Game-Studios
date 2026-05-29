import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
export const divisionEnum = pgEnum('division', ['fifth', 'fourth', 'third', 'second', 'first']);

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  city: text('city').notNull(),
  division: divisionEnum('division').notNull().default('fifth'),
  /** Pyramid tier 1..5 (1=Primera, 5=3ª RFEF). Source of truth for division resolution. */
  tier: integer('tier').notNull().default(5),
  /** Group index within tier (0-based). Tier 1/2 = 0; Tier 3 = 0/1; Tier 4 = 0-4; Tier 5 = 0-17. */
  groupIndex: integer('group_index').notNull().default(0),
  /** Lightweight team strength for AI clubs in distant divisions (no per-player rosters). 30=Tier 5 baseline, 95=Tier 1 elite. */
  strengthRating: integer('strength_rating').notNull().default(30),
  prestige: integer('prestige').notNull().default(1),
  budget: integer('budget').notNull().default(10000),
  fanBase: integer('fan_base').notNull().default(500),
  cityTier: integer('city_tier').notNull().default(1),
  currentSeason: integer('current_season').notNull().default(1),
  /** Primary kit colour (HEX). */
  kitPrimaryColor: text('kit_primary_color').notNull().default('#1e3a8a'),
  /** Secondary / away kit colour (HEX). */
  kitSecondaryColor: text('kit_secondary_color').notNull().default('#f8fafc'),
  /** Price of a full-season ticket in euros — set by the manager. */
  seasonTicketPriceEur: integer('season_ticket_price_eur').notNull().default(35),
  /** Current season-ticket holder count — recomputed at each season-start. */
  seasonTicketHolders: integer('season_ticket_holders').notNull().default(100),
  /** Highest season number whose season-ticket lump-sum was already paid. */
  lastSeasonTicketPaidSeason: integer('last_season_ticket_paid_season').notNull().default(0),
  /**
   * Number of stadium-board sponsorship slots available. Increases with
   * stadium upgrades; default 4 reflects a Quinta División stadium.
   */
  boardsCapacity: integer('boards_capacity').notNull().default(4),
  /**
   * Season number for which the ticket price has been locked by the user.
   * Once set, the price cannot be changed for that season. Reset on
   * season rollover so the next pretemporada unlocks again.
   */
  seasonTicketPriceLockedSeason: integer('season_ticket_price_locked_season').notNull().default(0),
  /**
   * Running count of holders who have signed up for the upcoming season's
   * abono. Drips up each week of pretemporada + first 3 matchdays.
   */
  seasonTicketHoldersCollected: integer('season_ticket_holders_collected').notNull().default(0),
  /**
   * Manager's chosen starting XI — array of player IDs (typically 11).
   * NULL means auto-pick top 11 by skill (legacy behaviour).
   * Pablo 2026-05-25 — manual XI selection.
   */
  startingLineupPlayerIds: jsonb('starting_lineup_player_ids').$type<string[] | null>(),
  /** Preferred formation for quick-sim and match-session start. */
  preferredFormation: text('preferred_formation').notNull().default('4-4-2'),
  // ── Tienda (#39, Pablo 2026-05-27) — merch (price + manufactured stock) + concessions (price only) ──
  merchScarfPrice: integer('merch_scarf_price').notNull().default(15),
  merchScarfStock: integer('merch_scarf_stock').notNull().default(0),
  merchCapPrice: integer('merch_cap_price').notNull().default(12),
  merchCapStock: integer('merch_cap_stock').notNull().default(0),
  merchShirtPrice: integer('merch_shirt_price').notNull().default(40),
  merchShirtStock: integer('merch_shirt_stock').notNull().default(0),
  concessionFoodPrice: integer('concession_food_price').notNull().default(4),
  concessionSodaPrice: integer('concession_soda_price').notNull().default(3),
  concessionBeerPrice: integer('concession_beer_price').notNull().default(5),
  concessionWaterPrice: integer('concession_water_price').notNull().default(2),
  // ── Tienda rework (#39, Pablo 2026-05-27): manufacture orders (take time) ──
  merchScarfMfgQty: integer('merch_scarf_mfg_qty').notNull().default(0),
  merchScarfMfgWeeksLeft: integer('merch_scarf_mfg_weeks_left').notNull().default(0),
  merchScarfUnitCost: integer('merch_scarf_unit_cost').notNull().default(6),
  merchCapMfgQty: integer('merch_cap_mfg_qty').notNull().default(0),
  merchCapMfgWeeksLeft: integer('merch_cap_mfg_weeks_left').notNull().default(0),
  merchCapUnitCost: integer('merch_cap_unit_cost').notNull().default(5),
  merchShirtMfgQty: integer('merch_shirt_mfg_qty').notNull().default(0),
  merchShirtMfgWeeksLeft: integer('merch_shirt_mfg_weeks_left').notNull().default(0),
  merchShirtUnitCost: integer('merch_shirt_unit_cost').notNull().default(18),
  /**
   * Tactical instruction applied to all quick-sim matches.
   *   'PRESS_HIGH'  — aggressive: +5% strength, more cards/injuries
   *   'HOLD_SHAPE'  — balanced: baseline behaviour
   *   'COUNTER'     — defensive: -5% strength, more FWD-weighted goals
   * Pablo 2026-05-26.
   */
  defaultMatchInstruction: text('default_match_instruction').notNull().default('HOLD_SHAPE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const clubsRelations = relations(clubs, ({ one }) => ({
  manager: one(users, { fields: [clubs.managerId], references: [users.id] })
}));

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
