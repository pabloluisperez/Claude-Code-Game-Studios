/**
 * Career milestones — append-only log of "first" events in a playthrough.
 *
 * Story: Alma Pass — career milestones
 * Control Manifest: 2026-05-20
 */

import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { playthroughs } from './playthroughs.js';
export const careerMilestones = pgTable(
  'career_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    /** Stable identifier so each milestone is only unlocked once. */
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    description: text('description').notNull(),
    icon: text('icon').notNull(),
    week: integer('week').notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniquePerPlaythrough: uniqueIndex('career_milestones_pt_kind').on(
      t.playthroughId,
      t.kind,
    ),
  }),
);

export const careerMilestonesRelations = relations(careerMilestones, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [careerMilestones.playthroughId],
    references: [playthroughs.id],
  }),
}));

export type CareerMilestone = typeof careerMilestones.$inferSelect;
export type NewCareerMilestone = typeof careerMilestones.$inferInsert;
