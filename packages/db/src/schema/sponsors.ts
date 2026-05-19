/**
 * Drizzle schema: `sponsors` — sponsor lifecycle tracking per ADR-014.
 *
 * Per ADR-014: the cascade node `sponsor_quality` (numeric) lives in WorldState.
 * This table tracks the per-sponsor contract metadata that doesn't belong in
 * cascade nodes: weekly income amount, contract dates, scandal-cancellation
 * reason. One row per sponsor contract (active or historical).
 *
 * Story: ECONOMY-001
 * Control Manifest: 2026-05-19
 */

import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clubs } from './clubs';
import { playthroughs } from './playthroughs';

export const sponsors = pgTable(
  'sponsors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    /** Sponsor brand/name (procedural — placeholder until UX surface defined). */
    name: text('name').notNull(),
    /** Tier 1=local, 2=regional, 3=national; affects weekly_eur_k + sponsor_quality contribution. */
    tier: integer('tier').notNull(),
    /** Weekly income in €K (typically 0.5..15). */
    weeklyEurK: integer('weekly_eur_k').notNull(),
    /** Cascade `sponsor_quality` contribution (0..100). */
    qualityContribution: integer('quality_contribution').notNull(),
    /** Status: active | cancelled | expired. */
    status: text('status').notNull().default('active'),
    /** Reason when cancelled (e.g., 'scandal' | 'expired' | 'manual'). Null while active. */
    cancellationReason: text('cancellation_reason'),
    startedWeek: integer('started_week').notNull(),
    endsWeek: integer('ends_week').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byClubStatus: index('sponsors_club_status').on(t.playthroughId, t.clubId, t.status),
  }),
);

export const sponsorsRelations = relations(sponsors, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [sponsors.playthroughId],
    references: [playthroughs.id],
  }),
  club: one(clubs, {
    fields: [sponsors.clubId],
    references: [clubs.id],
  }),
}));

export type Sponsor = typeof sponsors.$inferSelect;
export type NewSponsor = typeof sponsors.$inferInsert;
