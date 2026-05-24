// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can a minimal Drizzle schema persist WorldState + fixtures + standings for 1 month?
// Date: 2026-05-18

import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { MatchEvent, WorldState } from "../sim/types.js";

/**
 * Slice schema — strict subset of ADR-005 / ADR-011 / ADR-013.
 * Production version is rewritten from scratch using these tables as a
 * structural reference only (per prototype-code.md).
 */

export const clubs = pgTable("clubs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  baseSkill: integer("base_skill").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playthroughs = pgTable("playthroughs", {
  id: text("id").primaryKey(),
  managerClubId: text("manager_club_id")
    .notNull()
    .references(() => clubs.id),
  currentWeek: integer("current_week").notNull().default(1),
  seed: text("seed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * world_snapshots — append-only snapshots of the full WorldState per tick.
 * The latest snapshot for a playthrough is the canonical state.
 * Per ADR-005, the slice uses snapshot-per-tick rather than mutable state.
 */
export const worldSnapshots = pgTable(
  "world_snapshots",
  {
    id: serial("id").primaryKey(),
    playthroughId: text("playthrough_id")
      .notNull()
      .references(() => playthroughs.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    state: jsonb("state").$type<WorldState>().notNull(),
    /** Serialized delayed-effects buffer (DelayedEffect[]). */
    delayedBuffer: jsonb("delayed_buffer").$type<unknown[]>().notNull().default([]),
    /** Manager XP/skills snapshot (added Day 7). */
    managerState: jsonb("manager_state").$type<unknown>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqWeek: uniqueIndex("world_snapshots_playthrough_week").on(
      t.playthroughId,
      t.week,
    ),
  }),
);

export const fixtures = pgTable(
  "fixtures",
  {
    id: text("id").primaryKey(),
    playthroughId: text("playthrough_id")
      .notNull()
      .references(() => playthroughs.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    homeClubId: text("home_club_id")
      .notNull()
      .references(() => clubs.id),
    awayClubId: text("away_club_id")
      .notNull()
      .references(() => clubs.id),
    status: text("status").notNull().default("scheduled"), // 'scheduled' | 'played'
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    matchEvents: jsonb("match_events").$type<MatchEvent[]>(),
  },
  (t) => ({
    uniqMatchup: uniqueIndex("fixtures_playthrough_week_home_away").on(
      t.playthroughId,
      t.week,
      t.homeClubId,
      t.awayClubId,
    ),
  }),
);

export const standings = pgTable(
  "standings",
  {
    id: serial("id").primaryKey(),
    playthroughId: text("playthrough_id")
      .notNull()
      .references(() => playthroughs.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => clubs.id),
    played: integer("played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    goalsFor: integer("goals_for").notNull().default(0),
    goalsAgainst: integer("goals_against").notNull().default(0),
    points: integer("points").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqClubPerPt: uniqueIndex("standings_playthrough_club").on(
      t.playthroughId,
      t.clubId,
    ),
  }),
);

/**
 * match_sessions — stateful interactive match per ADR-013.
 * Holds MatchSessionSnapshot between BullMQ job re-enqueues.
 * Slice only uses this in Day 6+.
 */
export const matchSessions = pgTable(
  "match_sessions",
  {
    id: text("id").primaryKey(),
    playthroughId: text("playthrough_id")
      .notNull()
      .references(() => playthroughs.id, { onDelete: "cascade" }),
    fixtureId: text("fixture_id")
      .notNull()
      .references(() => fixtures.id),
    state: text("state").notNull().default("pre_match"),
    // 'pre_match' | 'in_progress' | 'paused_for_decision' | 'completed' | 'failed' | 'archived'
    snapshot: jsonb("snapshot").$type<unknown>().notNull(),
    timeoutJobId: text("timeout_job_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // ADR-013: partial UNIQUE — only one *non-terminal* MatchSession per playthrough.
    // 'failed' is in the exclusion list per the 2026-05-18 sync chore.
    activePerPlaythrough: uniqueIndex("match_sessions_active_playthrough")
      .on(t.playthroughId)
      .where(sql`${t.state} NOT IN ('completed','archived','failed')`),
  }),
);

/**
 * staff_messages — observation feed (Day 7). Tied to threshold crossings
 * and cascade log entries from the previous tick.
 */
export const staffMessages = pgTable("staff_messages", {
  id: serial("id").primaryKey(),
  playthroughId: text("playthrough_id")
    .notNull()
    .references(() => playthroughs.id, { onDelete: "cascade" }),
  week: integer("week").notNull(),
  staffRole: text("staff_role").notNull(), // 'head_coach' | 'fitness_coach' | 'finance_director'
  staffTier: integer("staff_tier").notNull().default(1),
  templateKey: text("template_key").notNull(),
  body: text("body").notNull(),
  priority: text("priority").notNull().default("ROUTINE"), // 'ROUTINE' | 'ADVISORY' | 'BLOCKING'
  causalNodeId: text("causal_node_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
