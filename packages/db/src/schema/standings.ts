/**
 * Drizzle schema: `standings` — per ADR-011.
 *
 * One row per (season, division, club). Maintained post-match by
 * applyMatchToStandings (Story 004). Sorted by Story 003's pure function.
 *
 * Story: LEAGUE-SYSTEM-001
 * Control Manifest: 2026-05-19
 */

import {
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { clubs } from './clubs';
import { divisions, seasons } from './leagues';

export const standings = pgTable(
  'standings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    played: integer('played').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    goalsFor: integer('goals_for').notNull().default(0),
    goalsAgainst: integer('goals_against').notNull().default(0),
    points: integer('points').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueClubPerSeasonDivision: unique('standings_club_per_season_div').on(
      t.seasonId,
      t.divisionId,
      t.clubId,
    ),
  }),
);

export const standingsRelations = relations(standings, ({ one }) => ({
  season: one(seasons, { fields: [standings.seasonId], references: [seasons.id] }),
  division: one(divisions, {
    fields: [standings.divisionId],
    references: [divisions.id],
  }),
  club: one(clubs, { fields: [standings.clubId], references: [clubs.id] }),
}));

export type Standing = typeof standings.$inferSelect;
export type NewStanding = typeof standings.$inferInsert;
