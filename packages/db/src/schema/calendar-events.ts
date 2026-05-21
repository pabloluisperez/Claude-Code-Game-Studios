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
    /**
     * Day-of-season when this event fires (0..265). ADR-020 §6.
     *
     * Sprint 12 task 12-1: NEW column. Nullable so legacy events (which
     * only had week granularity) continue to work — the orchestrator falls
     * back to `week * 7` (start of the event's week) when this is NULL.
     *
     * Events created on or after Sprint 12 that want mid-week semantics
     * MUST populate this column. The advance loop reads this to decide
     * whether to halt mid-week.
     */
    scheduledDayOfSeason: integer('scheduled_day_of_season'),
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
