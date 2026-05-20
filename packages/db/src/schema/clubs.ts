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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const clubsRelations = relations(clubs, ({ one }) => ({
  manager: one(users, { fields: [clubs.managerId], references: [users.id] })
}));

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
