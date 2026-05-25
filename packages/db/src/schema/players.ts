/**
 * Drizzle schema: `players` — one row per player in a playthrough.
 *
 * Per ADR-016: players are normalised (not JSONB-on-club) for efficient per-club
 * lookup. Composite index on (playthroughId, clubId) gives sub-millisecond
 * lineup loads. Expected size ~800 rows × 250 bytes per playthrough = ~200KB.
 *
 * Story: PLAYER-MANAGEMENT-002
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
import { clubs } from './clubs.js';
import { playthroughs } from './playthroughs.js';

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    playthroughId: uuid('playthrough_id')
      .notNull()
      .references(() => playthroughs.id, { onDelete: 'cascade' }),

    // Identity
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    nationality: text('nationality').notNull().default('ES'),
    birthWeek: integer('birth_week').notNull(),
    position: text('position').notNull(), // 'GK' | 'DEF' | 'MID' | 'FWD'

    // Universal stats — `skill` is the OVERALL, derived as the mean of the
    // four core attributes below, capped at 95.
    skill: integer('skill').notNull(),
    fitness: integer('fitness').notNull().default(90),
    morale: integer('morale').notNull().default(60),
    form: integer('form').notNull().default(60),
    stamina: integer('stamina').notNull().default(75),

    // ── Core attributes (0-98). Drive the overall + simulator. ───────────
    /** Pace, sprint, recovery on counter-attacks. */
    velocidad: integer('velocidad').notNull().default(50),
    /** Stamina, work_rate, late-game performance. */
    resistencia: integer('resistencia').notNull().default(50),
    /** Tackling, pressing, card propensity, injury propensity. */
    agresividad: integer('agresividad').notNull().default(50),
    /** Passing, finishing, dribbling, heading, vision. */
    calidad: integer('calidad').notNull().default(50),

    // Position-specific stats (only the relevant 2-3 are set per position)
    reflexes: integer('reflexes'),
    handling: integer('handling'),
    kicking: integer('kicking'),
    strength: integer('strength'),
    tackling: integer('tackling'),
    positioning: integer('positioning'),
    passing: integer('passing'),
    vision: integer('vision'),
    workRate: integer('work_rate'),
    speed: integer('speed'),
    finishing: integer('finishing'),
    dribbling: integer('dribbling'),

    // Development cap (young players only)
    potentialCeiling: integer('potential_ceiling'),

    // Contract
    salaryEurK: integer('salary_eur_k').notNull(),
    contractStartWeek: integer('contract_start_week').notNull(),
    contractEndWeek: integer('contract_end_week').notNull(),
    /**
     * Contract lifecycle status (v1.2 Sprint 25):
     *   - 'in_contract' (default): under contract; not on the transfer market
     *   - 'expiring': within last 8 weeks of contract; shows in market
     *   - 'free_agent': no contract; club_id is NULL; pure free agent
     *
     * Sprint 25-2 / story SCOUTING-MARKET-005 enabler.
     */
    contractStatus: text('contract_status').notNull().default('in_contract'),
    /** Weeks unsigned counter for the F2 desperation discount (free agents only). */
    weeksUnsigned: integer('weeks_unsigned').notNull().default(0),
    /** Wage expectation (€K/week) — used by F2 free agent acceptance. */
    wageExpectationEurKWeek: integer('wage_expectation_eur_k_week').notNull().default(5),
    /**
     * Marked for sale by the owning club (v1.2 Sprint 26-5). When true, the
     * advance pipeline generates one deterministic AI offer per window
     * which the player can accept or reject. Toggled via the /squad UI.
     */
    transferListed: boolean('transfer_listed').notNull().default(false),
    /**
     * Individual training focus (Pablo 2026-05-25). One of:
     *   'velocidad' | 'resistencia' | 'agresividad' | 'calidad' | NULL
     *
     * NULL = not enrolled in individual training. Number of players that can
     * be simultaneously enrolled equals the active fitness_coach's qualityTier
     * (1/2/3), enforced server-side at assignment time.
     *
     * Phase 8e of advance-orchestrator applies +1 to the matching attribute
     * per advance tick (capped at 95).
     */
    trainingFocus: text('training_focus'),

    // Lifecycle
    availability: text('availability').notNull().default('available'),
    injuredUntilWeek: integer('injured_until_week'),
    /**
     * Number of remaining MATCHES (not weeks) the player must miss after a
     * red-card suspension. Pablo's clarification (Sprint 13 playtest): real
     * football suspensions are per-fixture — a bye week doesn't count down.
     *
     * Lifecycle:
     *   - Red card → set to suspensionMatches(reason): 1/2/3
     *   - 5th yellow of season → set to 1 (auto-suspension)
     *   - Each subsequent fixture of the player's club → decrement by 1
     *   - When it hits 0 (or NULL), the player is eligible again
     *
     * Sprint 13 task 13-1 (BUG-PT-5).
     */
    suspendedMatchesRemaining: integer('suspended_matches_remaining'),
    /**
     * Total yellow cards accumulated this season. When reaches 5, the player
     * is auto-suspended for 1 match (suspendedMatchesRemaining = 1) and this
     * counter resets to 0. Cleared at season rollover.
     *
     * Sprint 13 task 13-1 (Pablo clarification: 5-amarillas rule).
     */
    yellowCardsSeason: integer('yellow_cards_season').notNull().default(0),

    // F4 form history — bounded to last 5 entries by repo
    recentRatings: jsonb('recent_ratings')
      .$type<number[]>()
      .notNull()
      .default([]),

    // Player personality traits (0-2 per player, generated at roster creation).
    // Cosmetic in MVP; mechanical effects post-MVP.
    traits: jsonb('traits').$type<string[]>().notNull().default([]),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byClub: index('players_by_club').on(t.playthroughId, t.clubId),
    byPlaythrough: index('players_by_playthrough').on(t.playthroughId),
  }),
);

export const playersRelations = relations(players, ({ one }) => ({
  club: one(clubs, { fields: [players.clubId], references: [clubs.id] }),
  playthrough: one(playthroughs, {
    fields: [players.playthroughId],
    references: [playthroughs.id],
  }),
}));

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
