// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can a thin repo layer cover all read/write paths needed by advance() + UI?
// Date: 2026-05-18

import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  DelayedEffect,
  MatchEvent,
  MatchOutcome,
  WorldState,
} from "../sim/types.js";
import { getDb, schema } from "./client.js";

// ── Playthrough ──────────────────────────────────────────────────────────────

export async function getPlaythrough(id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.playthroughs)
    .where(eq(schema.playthroughs.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function advancePlaythroughWeek(id: string, newWeek: number): Promise<void> {
  const db = getDb();
  await db
    .update(schema.playthroughs)
    .set({ currentWeek: newWeek })
    .where(eq(schema.playthroughs.id, id))
    .execute();
}

// ── WorldSnapshot ────────────────────────────────────────────────────────────

export async function loadLatestSnapshot(playthroughId: string): Promise<{
  week: number;
  state: WorldState;
  delayedBuffer: DelayedEffect[];
  managerState: unknown;
} | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.worldSnapshots)
    .where(eq(schema.worldSnapshots.playthroughId, playthroughId))
    .orderBy(desc(schema.worldSnapshots.week))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    week: row.week,
    state: row.state,
    delayedBuffer: row.delayedBuffer as DelayedEffect[],
    managerState: row.managerState,
  };
}

export async function saveSnapshot(
  playthroughId: string,
  week: number,
  state: WorldState,
  delayedBuffer: DelayedEffect[],
  managerState: unknown = null,
): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.worldSnapshots)
    .values({
      playthroughId,
      week,
      state,
      delayedBuffer,
      managerState,
    })
    .onConflictDoUpdate({
      target: [schema.worldSnapshots.playthroughId, schema.worldSnapshots.week],
      set: { state, delayedBuffer, managerState },
    });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

export async function getFixturesForWeek(playthroughId: string, week: number) {
  const db = getDb();
  return db
    .select()
    .from(schema.fixtures)
    .where(
      and(
        eq(schema.fixtures.playthroughId, playthroughId),
        eq(schema.fixtures.week, week),
      ),
    );
}

export async function getFixtureForClubInWeek(
  playthroughId: string,
  clubId: string,
  week: number,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.fixtures)
    .where(
      and(
        eq(schema.fixtures.playthroughId, playthroughId),
        eq(schema.fixtures.week, week),
      ),
    );
  return rows.find((f) => f.homeClubId === clubId || f.awayClubId === clubId) ?? null;
}

export async function markFixturePlayed(
  fixtureId: string,
  homeScore: number,
  awayScore: number,
  events: MatchEvent[],
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.fixtures)
    .set({ status: "played", homeScore, awayScore, matchEvents: events })
    .where(eq(schema.fixtures.id, fixtureId))
    .execute();
}

// ── Standings ────────────────────────────────────────────────────────────────

export async function getStandings(playthroughId: string) {
  const db = getDb();
  const rows = await db
    .select({
      clubId: schema.standings.clubId,
      played: schema.standings.played,
      wins: schema.standings.wins,
      draws: schema.standings.draws,
      losses: schema.standings.losses,
      goalsFor: schema.standings.goalsFor,
      goalsAgainst: schema.standings.goalsAgainst,
      points: schema.standings.points,
      clubName: schema.clubs.name,
      clubShortName: schema.clubs.shortName,
    })
    .from(schema.standings)
    .innerJoin(schema.clubs, eq(schema.standings.clubId, schema.clubs.id))
    .where(eq(schema.standings.playthroughId, playthroughId))
    .orderBy(desc(schema.standings.points), desc(schema.standings.goalsFor));
  return rows.map((r, idx) => ({
    ...r,
    goalDifference: r.goalsFor - r.goalsAgainst,
    position: idx + 1,
  }));
}

export interface StandingUpdate {
  playthroughId: string;
  clubId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export async function applyMatchToStandings(
  playthroughId: string,
  outcome: MatchOutcome,
  homeClubId: string,
  awayClubId: string,
): Promise<void> {
  const db = getDb();
  const homePoints = outcome.winner === "home" ? 3 : outcome.winner === "draw" ? 1 : 0;
  const awayPoints = outcome.winner === "away" ? 3 : outcome.winner === "draw" ? 1 : 0;

  await db
    .update(schema.standings)
    .set({
      played: sql`${schema.standings.played} + 1`,
      wins: sql`${schema.standings.wins} + ${outcome.winner === "home" ? 1 : 0}`,
      draws: sql`${schema.standings.draws} + ${outcome.winner === "draw" ? 1 : 0}`,
      losses: sql`${schema.standings.losses} + ${outcome.winner === "away" ? 1 : 0}`,
      goalsFor: sql`${schema.standings.goalsFor} + ${outcome.homeScore}`,
      goalsAgainst: sql`${schema.standings.goalsAgainst} + ${outcome.awayScore}`,
      points: sql`${schema.standings.points} + ${homePoints}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.standings.playthroughId, playthroughId),
        eq(schema.standings.clubId, homeClubId),
      ),
    );

  await db
    .update(schema.standings)
    .set({
      played: sql`${schema.standings.played} + 1`,
      wins: sql`${schema.standings.wins} + ${outcome.winner === "away" ? 1 : 0}`,
      draws: sql`${schema.standings.draws} + ${outcome.winner === "draw" ? 1 : 0}`,
      losses: sql`${schema.standings.losses} + ${outcome.winner === "home" ? 1 : 0}`,
      goalsFor: sql`${schema.standings.goalsFor} + ${outcome.awayScore}`,
      goalsAgainst: sql`${schema.standings.goalsAgainst} + ${outcome.homeScore}`,
      points: sql`${schema.standings.points} + ${awayPoints}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.standings.playthroughId, playthroughId),
        eq(schema.standings.clubId, awayClubId),
      ),
    );
}

// ── Staff messages ───────────────────────────────────────────────────────────

export interface StaffMessageInsert {
  playthroughId: string;
  week: number;
  staffRole: string;
  staffTier: number;
  templateKey: string;
  body: string;
  priority: "ROUTINE" | "ADVISORY" | "BLOCKING";
  causalNodeId?: string | null;
}

export async function insertStaffMessages(messages: StaffMessageInsert[]): Promise<void> {
  if (messages.length === 0) return;
  const db = getDb();
  await db.insert(schema.staffMessages).values(messages);
}

export async function getStaffMessages(playthroughId: string, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(schema.staffMessages)
    .where(eq(schema.staffMessages.playthroughId, playthroughId))
    .orderBy(asc(schema.staffMessages.week), asc(schema.staffMessages.id))
    .limit(limit);
}

export async function markMessageRead(messageId: number): Promise<void> {
  const db = getDb();
  await db
    .update(schema.staffMessages)
    .set({ readAt: new Date() })
    .where(eq(schema.staffMessages.id, messageId))
    .execute();
}
