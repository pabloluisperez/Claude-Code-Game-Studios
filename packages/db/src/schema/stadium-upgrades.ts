/**
 * Drizzle schema: `stadium_upgrade_items`.
 *
 * Per ADR-029 §D2 (Stadium Upgrades Module — Schema):
 * - One row per upgrade item purchased by a club.
 * - Tracks FSM state: queued → in_progress → complete | cancelled.
 * - Partial unique index (applied in migration 0027) enforces queue invariant:
 *   at most 1 in_progress item per club at any time (AC-SU-36 / §3.1.4).
 *
 * Story: STADIUM-UPGRADES-001
 * Control Manifest: 2026-05-19
 */

import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clubs } from './clubs.js';
/**
 * Stadium upgrade items purchased by a club.
 * Each row is one reform/upgrade lifecycle entry.
 */
export const stadiumUpgradeItems = pgTable('stadium_upgrade_items', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** FK to the owning club. Cascade-delete when the club is deleted. */
  clubId: uuid('club_id')
    .notNull()
    .references(() => clubs.id, { onDelete: 'cascade' }),

  /**
   * Catalog item identifier, e.g. "gradas-n2-norte".
   * Must match a slug in design/data/stadium-upgrades-catalog.yaml.
   */
  itemSlug: text('item_slug').notNull(),

  /**
   * Upgrade track the item belongs to.
   * Values: "gradas" | "pitch" | "servicios" | "training" | "academy".
   * Stored as text (not pgEnum) for forward flexibility (ADR-029 §D2 note).
   */
  track: text('track').notNull(),

  /** Tier level within the track: 1..4. */
  tier: integer('tier').notNull(),

  /**
   * FSM state of this upgrade item.
   * Values: "queued" | "in_progress" | "complete" | "cancelled".
   * Stored as text (not pgEnum) for forward flexibility (ADR-029 §D2 note).
   * A partial unique index on (club_id) WHERE status = 'in_progress' enforces
   * the queue invariant at the DB level.
   */
  status: text('status').notNull(),

  /**
   * Cost actually debited from the club balance when queued, in thousands of euros.
   * Snapshot at enqueue time so future formula changes don't alter past items.
   */
  costPaidEurK: integer('cost_paid_eur_k').notNull(),

  /** Original planned duration in weeks, snapshotted at enqueue time. */
  durationWeeks: integer('duration_weeks').notNull(),

  /**
   * Weeks remaining until completion. Only meaningful while status = 'in_progress'.
   * NULL for queued / completed / cancelled rows.
   */
  weeksRemaining: integer('weeks_remaining'),

  /**
   * Director skill level at the moment the upgrade started (used for F2 speed
   * modifier). NULL until the upgrade transitions to in_progress.
   */
  directorSkillSnapshot: integer('director_skill_snapshot'),

  /** When the upgrade transitioned to in_progress. NULL until then. */
  startedAt: timestamp('started_at', { withTimezone: true }),

  /** When the upgrade transitioned to complete. NULL until then. */
  completedAt: timestamp('completed_at', { withTimezone: true }),

  /** When the upgrade was cancelled. NULL unless status = 'cancelled'. */
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stadiumUpgradeItemsRelations = relations(
  stadiumUpgradeItems,
  ({ one }) => ({
    club: one(clubs, {
      fields: [stadiumUpgradeItems.clubId],
      references: [clubs.id],
    }),
  }),
);

export type StadiumUpgradeItem = typeof stadiumUpgradeItems.$inferSelect;
export type NewStadiumUpgradeItem = typeof stadiumUpgradeItems.$inferInsert;
