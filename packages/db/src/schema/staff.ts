/**
 * Drizzle schemas: `staff`, `staff_messages` — per ADR-009.
 *
 * 6 roles: groundskeeper, fitness_coach, commercial_director,
 * scouting_director, finance_director, head_coach.
 * 3 quality tiers: 1=novice, 2=experienced, 3=expert. Gated by manager
 * reputation level (P1↔P3 resolution from ADR-010).
 *
 * Story: STAFF-SYSTEM-001
 * Control Manifest: 2026-05-19
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clubs } from './clubs.js';
import { playthroughs } from './playthroughs.js';

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // StaffRole enum
    qualityTier: integer('quality_tier').notNull().default(1),
    weeklyEurK: integer('weekly_eur_k').notNull(),
    name: text('name').notNull(),
    hiredWeek: integer('hired_week').notNull(),
    /** Status: active | dismissed. */
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byClubStatus: index('staff_club_status').on(t.playthroughId, t.clubId, t.status),
  }),
);

export const staffRelations = relations(staff, ({ one, many }) => ({
  playthrough: one(playthroughs, {
    fields: [staff.playthroughId],
    references: [playthroughs.id],
  }),
  club: one(clubs, {
    fields: [staff.clubId],
    references: [clubs.id],
  }),
  messages: many(staffMessages),
}));

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;

export const staffMessages = pgTable(
  'staff_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    week: integer('week').notNull(),
    season: integer('season').notNull(),
    priority: text('priority').notNull(), // 'URGENT' | 'ROUTINE'
    templateKey: text('template_key').notNull(),
    content: text('content').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byWeek: index('staff_messages_week').on(t.playthroughId, t.week),
  }),
);

export const staffMessagesRelations = relations(staffMessages, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [staffMessages.playthroughId],
    references: [playthroughs.id],
  }),
  staff: one(staff, {
    fields: [staffMessages.staffId],
    references: [staff.id],
  }),
}));

export type StaffMessage = typeof staffMessages.$inferSelect;
export type NewStaffMessage = typeof staffMessages.$inferInsert;
