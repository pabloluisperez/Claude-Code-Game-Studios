/**
 * Drizzle schema: `fixtures` — per ADR-011.
 *
 * One row per scheduled match. Updated post-match with score + serialized
 * MatchOutcome (for audit/replay).
 *
 * MATCH-SIM-015's match_sessions table FKs to this.
 *
 * Story: LEAGUE-SYSTEM-001
 * Control Manifest: 2026-05-19
 */

import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clubs } from './clubs.js';
import { divisions, seasons } from './leagues.js';

export const fixtures = pgTable(
  'fixtures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    homeClubId: uuid('home_club_id')
      .notNull()
      .references(() => clubs.id),
    awayClubId: uuid('away_club_id')
      .notNull()
      .references(() => clubs.id),
    week: integer('week').notNull(),
    matchday: integer('matchday').notNull(),
    status: text('status').notNull().default('scheduled'), // 'scheduled' | 'played'
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    matchOutcomeData: jsonb('match_outcome_data'), // null until played
    playedAt: timestamp('played_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueSeasonWeekHome: uniqueIndex('fixtures_season_week_home').on(
      t.seasonId,
      t.week,
      t.homeClubId,
    ),
  }),
);

export const fixturesRelations = relations(fixtures, ({ one }) => ({
  season: one(seasons, { fields: [fixtures.seasonId], references: [seasons.id] }),
  division: one(divisions, {
    fields: [fixtures.divisionId],
    references: [divisions.id],
  }),
  homeClub: one(clubs, {
    fields: [fixtures.homeClubId],
    references: [clubs.id],
    relationName: 'homeFixtures',
  }),
  awayClub: one(clubs, {
    fields: [fixtures.awayClubId],
    references: [clubs.id],
    relationName: 'awayFixtures',
  }),
}));

export type Fixture = typeof fixtures.$inferSelect;
export type NewFixture = typeof fixtures.$inferInsert;
