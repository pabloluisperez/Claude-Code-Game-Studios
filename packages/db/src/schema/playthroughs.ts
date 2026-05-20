/**
 * Drizzle schemas: `playthroughs` and `world_snapshots`.
 *
 * Per ADR-005 (WorldState Persistence):
 * - `playthroughs`: one per (user, club) game-in-progress.
 * - `world_snapshots`: append-only history; one row per advance() tick.
 *   The combination (playthrough_id, week) is UNIQUE.
 *
 * Story: PLAYER-MANAGEMENT-001
 * Control Manifest: 2026-05-19
 */

import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { clubs } from './clubs';

export const playthroughs = pgTable('playthroughs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clubId: uuid('club_id')
    .notNull()
    .references(() => clubs.id, { onDelete: 'cascade' }),
  currentWeek: integer('current_week').notNull().default(0),
  /**
   * Training intensity (0..100) the player has chosen for the upcoming
   * advance. Read by /squad UI; consumed and reset on each advance.
   *
   * Bucket mapping (see UI):
   *   descanso=10 · suave=30 · normal=50 · fuerte=70 · brutal=90
   */
  trainingIntensity: integer('training_intensity').notNull().default(50),
  /**
   * Day (0-6) the advance-week modal was paused on. 0 = no resume needed
   * (fresh week). The modal reads this on open to resume from the paused
   * day, writes to it on cancel, and resets it to 0 when the week commits.
   */
  advanceResumeDay: integer('advance_resume_day').notNull().default(0),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playthroughsRelations = relations(playthroughs, ({ one, many }) => ({
  user: one(users, { fields: [playthroughs.userId], references: [users.id] }),
  club: one(clubs, { fields: [playthroughs.clubId], references: [clubs.id] }),
  worldSnapshots: many(worldSnapshots),
}));

export type Playthrough = typeof playthroughs.$inferSelect;
export type NewPlaythrough = typeof playthroughs.$inferInsert;

/**
 * Append-only history of WorldState. One row per advance() tick.
 * `(playthroughId, week)` is UNIQUE — re-runs of the same tick are forbidden
 * by the schema; the advance worker must check for an existing row before insert.
 */
export const worldSnapshots = pgTable(
  'world_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    week: integer('week').notNull(),
    worldState: jsonb('world_state').notNull(),
    delayedEffectsBuffer: jsonb('delayed_effects_buffer').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniquePerWeek: uniqueIndex('world_snapshots_playthrough_week').on(
      t.playthroughId,
      t.week,
    ),
  }),
);

export const worldSnapshotsRelations = relations(worldSnapshots, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [worldSnapshots.playthroughId],
    references: [playthroughs.id],
  }),
}));

export type WorldSnapshot = typeof worldSnapshots.$inferSelect;
export type NewWorldSnapshot = typeof worldSnapshots.$inferInsert;
