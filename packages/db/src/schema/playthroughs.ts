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
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { clubs } from './clubs.js';

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
   * Day position within the season (0..265 for a 38-week season + buffer).
   *
   * ADR-020 (Day-by-Day Tick): the canonical time-of-day cursor. Lives
   * alongside `currentWeek` (which is now derived: `currentWeek =
   * Math.floor(currentDayOfSeason / 7)`) for backwards compatibility with
   * UI, queries, and tests that still reason in weeks.
   *
   * Invariant: `currentWeek === Math.floor(currentDayOfSeason / 7)`. The
   * orchestrator writes both columns atomically inside `advanceDays` so
   * external readers never observe a drift.
   *
   * Sprint 11 task 11-4: column added; weekly `advance()` continues to
   * advance both in 7-day batches. True day-by-day decomposition (per
   * ADR-020 "Option B → revisit") lands in Sprint 12+ when mid-week pause
   * needs day-granular STOP events. For now the column tracks the same
   * information at higher resolution without changing externally-visible
   * behavior.
   */
  currentDayOfSeason: integer('current_day_of_season').notNull().default(0),
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
  /**
   * v1.1 Sprint 23: city-progression tier history (anti yo-yo state machine).
   *
   * jsonb shape: `{ everReachedTier: 1|2|3|4, weeksBelow: { 2,3,4: number } }`
   * (see apps/web/src/lib/canvas/types.ts TierHistory).
   *
   * Nullable for backward compat — playthroughs created before v1.1 default
   * to EMPTY_TIER_HISTORY when read.
   */
  tierHistory: jsonb('tier_history'),
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
    /**
     * Cascade audit log — CascadeLog[] from runTick. Nullable for backward
     * compat with rows written before Sprint 8 task 8-1 added the column.
     * The cascade engine itself does not READ this back; consumers are
     * audit/debug tooling and future event-system replay paths.
     */
    cascadeLog: jsonb('cascade_log'),
    /**
     * Threshold crossings emitted this tick — ThresholdCrossing[] from runTick.
     * Nullable for the same backward-compat reason. Consumed by event-system
     * (CalendarEvent BLOCKING/ADVISORY generation) on read.
     */
    thresholdCrossings: jsonb('threshold_crossings'),
    /**
     * Seedrandom state if applicable (ADR-013 Option B / match-sim PRNG).
     * NULL on cascade-only ticks; populated on match-week ticks. Persisted as
     * text (JSON.stringify of seedrandom().state()).
     */
    seedState: text('seed_state'),
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
