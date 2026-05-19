/**
 * Drizzle schema: `calendar_events` — per ADR-008 + ADR-015.
 *
 * Stores scheduled events (matches, season_start/end, sponsor offers, etc.)
 * + pending special events awaiting player decision. The `metadata` jsonb
 * column carries the typed EventDecisionPayload (ADR-015).
 *
 * Per ADR-015: calendar_events is mutable specifically for resolution tracking
 * (the ONE exception to ADR-005's append-only rule).
 *
 * Story: EVENT-SYSTEM-001
 * Control Manifest: 2026-05-19
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { playthroughs } from './playthroughs';

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),
    week: integer('week').notNull(),
    season: integer('season').notNull(),
    /** CalendarEventType per ADR-008 (extensible string). */
    type: text('type').notNull(),
    /** Priority: 'STOP' (blocks advance) | 'ADVISORY' (sidebar) | 'NOTIFY' (toast). */
    priority: text('priority').notNull(),
    /** Status: 'pending' | 'resolved' | 'expired'. */
    status: text('status').notNull().default('pending'),
    /** EventDecisionPayload + audit fields (resolvedChoice, resolvedDeltas). */
    metadata: jsonb('metadata').notNull().default({}),
    consumed: boolean('consumed').notNull().default(false),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pendingByWeek: index('calendar_events_pending_week').on(
      t.playthroughId,
      t.week,
      t.status,
    ),
  }),
);

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [calendarEvents.playthroughId],
    references: [playthroughs.id],
  }),
}));

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
