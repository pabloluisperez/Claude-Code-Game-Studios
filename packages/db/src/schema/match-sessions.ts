/**
 * Drizzle schema: `match_sessions` — per ADR-013.
 *
 * Stores MatchSessionSnapshot between BullMQ job executions. The partial
 * UNIQUE INDEX `match_sessions_active_playthrough` enforces "one active session
 * per playthrough" — excludes `'completed' | 'archived' | 'failed'` so a
 * failed session does NOT block a new match start.
 *
 * Story: MATCH-SIM-015
 * Control Manifest: 2026-05-19
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { clubs } from './clubs.js';
import { playthroughs } from './playthroughs.js';
import { fixtures } from './fixtures.js';

export const matchSessions = pgTable(
  'match_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    fixtureId: uuid('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),

    currentTick: integer('current_tick').notNull().default(0),
    eventsAccumulated: jsonb('events_accumulated').notNull().default([]),
    currentLineupHome: jsonb('current_lineup_home').notNull(),
    currentLineupAway: jsonb('current_lineup_away').notNull(),
    homeMomentum: real('home_momentum').notNull().default(50),

    substitutionsUsed: integer('substitutions_used').notNull().default(0),
    awaySubstitutionsUsed: integer('away_substitutions_used').notNull().default(0),
    yellowCardsByPlayerId: jsonb('yellow_cards_by_player_id').notNull().default({}),

    currentFormationHome: text('current_formation_home').notNull(),
    currentFormationAway: text('current_formation_away').notNull(),
    activeInstructionHome: text('active_instruction_home'),
    activeInstructionAway: text('active_instruction_away'),

    prngState: text('prng_state').notNull(),
    state: text('state').notNull().default('pre_match'),
    timeoutJobId: text('timeout_job_id'),

    seed: text('seed').notNull(),
    playerClubSide: text('player_club_side').notNull(),
    playerClubId: uuid('player_club_id')
      .notNull()
      .references(() => clubs.id),
    preMatchSnapshot: jsonb('pre_match_snapshot').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    // Partial UNIQUE: one active session per playthrough. Failed/completed
    // rows do NOT block a new session (ADR-013 §Session Lock).
    // MUST use `sql` template literal — drizzle-kit fails with raw string.
    activePlaythrough: uniqueIndex('match_sessions_active_playthrough')
      .on(t.playthroughId)
      .where(sql`${t.state} NOT IN ('completed', 'archived', 'failed')`),
    byPlaythroughCreatedAt: index('match_sessions_by_playthrough_created').on(
      t.playthroughId,
      t.createdAt,
    ),
  }),
);

export const matchSessionsRelations = relations(matchSessions, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [matchSessions.playthroughId],
    references: [playthroughs.id],
  }),
  fixture: one(fixtures, {
    fields: [matchSessions.fixtureId],
    references: [fixtures.id],
  }),
  playerClub: one(clubs, {
    fields: [matchSessions.playerClubId],
    references: [clubs.id],
  }),
}));

export type MatchSessionRow = typeof matchSessions.$inferSelect;
export type NewMatchSessionRow = typeof matchSessions.$inferInsert;
