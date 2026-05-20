import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const divisionEnum = pgEnum('division', ['fifth', 'fourth', 'third', 'second', 'first']);

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  city: text('city').notNull(),
  division: divisionEnum('division').notNull().default('fifth'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const clubsRelations = relations(clubs, ({ one }) => ({
  manager: one(users, { fields: [clubs.managerId], references: [users.id] })
}));

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
