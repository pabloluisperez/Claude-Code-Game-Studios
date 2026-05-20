/**
 * Drizzle schemas: `manager_profiles`, `skill_xp_events` — per ADR-010.
 *
 * One manager profile per playthrough (UNIQUE constraint on playthroughId).
 * skill_xp_events is an audit log (one row per XP grant) — used by hud-ui's
 * career log + by post-mortem analytics.
 *
 * Story: MANAGER-RPG-001
 * Control Manifest: 2026-05-19
 */

import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { playthroughs } from './playthroughs';

export const managerProfiles = pgTable('manager_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id')
    .notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' })
    .unique(),
  name: text('name').notNull(),
  /** ManagerSkills (5-skill bundle) as JSONB. */
  skills: jsonb('skills').notNull(),
  /**
   * fan_loyalty per ADR-019 + tv-rights GDD F-TV4. Range [0, 50].
   * Incremented by 10 on rejecting tv_auction / tv_midseason_offer (cap at 50).
   * No decay. Used by F-TV4: fan_attendance_effective = min(1.0, fan_attendance × (1 + fan_loyalty × 0.005)).
   */
  fanLoyalty: integer('fan_loyalty').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const managerProfilesRelations = relations(managerProfiles, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [managerProfiles.playthroughId],
    references: [playthroughs.id],
  }),
}));

export type ManagerProfileRow = typeof managerProfiles.$inferSelect;
export type NewManagerProfileRow = typeof managerProfiles.$inferInsert;

/**
 * Audit log of every XP grant — one row per (week, skillId, reason).
 * Used by the career-log UI and post-mortem analytics.
 */
export const skillXpEvents = pgTable('skill_xp_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id')
    .notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' }),
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  skillId: text('skill_id').notNull(),
  xpGranted: integer('xp_granted').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const skillXpEventsRelations = relations(skillXpEvents, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [skillXpEvents.playthroughId],
    references: [playthroughs.id],
  }),
}));

export type SkillXpEventRow = typeof skillXpEvents.$inferSelect;
export type NewSkillXpEventRow = typeof skillXpEvents.$inferInsert;
