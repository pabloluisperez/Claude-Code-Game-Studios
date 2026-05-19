/**
 * Drizzle schemas: `leagues`, `divisions`, `seasons` — per ADR-011.
 *
 * One league per country (MVP: 'Liga Cascada' / ES) with 2 divisions × 20 clubs.
 * Seasons rotate yearly; clubs swap divisions via promotion/relegation.
 *
 * Story: LEAGUE-SYSTEM-001
 * Control Manifest: 2026-05-19
 */

import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { playthroughs } from './playthroughs';

export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id')
    .notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  country: text('country').notNull().default('ES'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leaguesRelations = relations(leagues, ({ many, one }) => ({
  playthrough: one(playthroughs, {
    fields: [leagues.playthroughId],
    references: [playthroughs.id],
  }),
  divisions: many(divisions),
  seasons: many(seasons),
}));

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;

export const divisions = pgTable('divisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id')
    .notNull()
    .references(() => leagues.id, { onDelete: 'cascade' }),
  tier: integer('tier').notNull(), // 1 = top, 2 = second, etc.
  name: text('name').notNull(),
  clubCount: integer('club_count').notNull().default(20),
});

export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  league: one(leagues, { fields: [divisions.leagueId], references: [leagues.id] }),
  seasons: many(seasons),
  fixtures: many(fixtures),
  standings: many(standings),
}));

export type Division = typeof divisions.$inferSelect;
export type NewDivision = typeof divisions.$inferInsert;

export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id')
    .notNull()
    .references(() => leagues.id, { onDelete: 'cascade' }),
  divisionId: uuid('division_id')
    .notNull()
    .references(() => divisions.id, { onDelete: 'cascade' }),
  seasonNumber: integer('season_number').notNull(),
  status: text('status').notNull().default('upcoming'), // 'upcoming' | 'active' | 'completed'
  startWeek: integer('start_week').notNull(),
  endWeek: integer('end_week').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  league: one(leagues, { fields: [seasons.leagueId], references: [leagues.id] }),
  division: one(divisions, {
    fields: [seasons.divisionId],
    references: [divisions.id],
  }),
  fixtures: many(fixtures),
  standings: many(standings),
}));

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;

// Forward references — must be declared after `seasons` / `divisions` exist
// We import them via circular-safe module imports below.
import { fixtures } from './fixtures';
import { standings } from './standings';
