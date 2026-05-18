// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can the interactive Match 3 flow be exercised end-to-end via API?
// Date: 2026-05-18

import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb, schema } from "../../db/client.js";
import * as repo from "../../db/repo.js";
import { mergeDelayedBuffer, runTick } from "../../sim/cascade-engine.js";
import {
  resumeInteractiveMatch,
  startInteractiveMatch,
  type MatchSessionSnapshot,
  type SubstitutionDecision,
} from "../../sim/match-simulation.js";
import { generateLineup } from "../../sim/player-gen.js";
import { REAL_PUEBLO_INITIAL } from "../../sim/seed-data.js";
import seedrandom from "seedrandom";
import type { DelayedEffect, MatchOutcome, PlayerDecisions, WorldState } from "../../sim/types.js";

/**
 * Start an interactive match for a playthrough's current-week fixture
 * involving the player's club. Persists a paused MatchSession at tick 45.
 */
export interface LineupPlayerLite {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
}

export async function startMatch(playthroughId: string): Promise<{
  sessionId: string;
  pausedAtTick: number;
  scoreSoFar: { home: number; away: number };
  eventsSoFar: number;
  /** First-half MatchEvent[] for the client to animate during ticks 1-45. */
  firstHalfEvents: import("../../sim/types.js").MatchEvent[];
  homeClubName: string;
  awayClubName: string;
  playerClubSide: "home" | "away";
  /** Minimal lineup info so the client can show player name + position in events. */
  homeLineup: LineupPlayerLite[];
  awayLineup: LineupPlayerLite[];
}> {
  const playthrough = await repo.getPlaythrough(playthroughId);
  if (!playthrough) throw new Error("playthrough_not_found");

  const fixture = await repo.getFixtureForClubInWeek(
    playthroughId,
    playthrough.managerClubId,
    playthrough.currentWeek,
  );
  if (!fixture) throw new Error("no_fixture_this_week");
  if (fixture.status === "played") throw new Error("fixture_already_played");

  // Check session lock — partial UNIQUE per ADR-013
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.matchSessions)
    .where(eq(schema.matchSessions.playthroughId, playthroughId));
  for (const row of existing) {
    if (!["completed", "archived", "failed"].includes(row.state)) {
      throw new Error("match_already_in_progress");
    }
  }

  const matchSeed = `${playthrough.seed}:match:${playthrough.currentWeek}:${fixture.id}`;
  const isHome = fixture.homeClubId === playthrough.managerClubId;
  const homeClub = await loadClubLite(fixture.homeClubId);
  const awayClub = await loadClubLite(fixture.awayClubId);

  const homeLineup = generateLineup(matchSeed, homeClub.baseSkill, homeClub.slug);
  const awayLineup = generateLineup(matchSeed, awayClub.baseSkill, awayClub.slug);

  const latestSnapshot = await repo.loadLatestSnapshot(playthroughId);
  const worldState = latestSnapshot?.state ?? REAL_PUEBLO_INITIAL;

  const input = {
    homeClubId: fixture.homeClubId,
    awayClubId: fixture.awayClubId,
    homeLineup,
    awayLineup,
    worldState,
    playerClubSide: isHome ? ("home" as const) : ("away" as const),
    seed: matchSeed,
  };

  const snapshot = startInteractiveMatch(input);

  const sessionId = uuid();
  await db.insert(schema.matchSessions).values({
    id: sessionId,
    playthroughId,
    fixtureId: fixture.id,
    state: "paused_for_decision",
    snapshot,
  });

  const lineupLite = (lineup: typeof homeLineup): LineupPlayerLite[] =>
    lineup.map((p) => ({ id: p.id, name: p.name, position: p.position }));

  return {
    sessionId,
    pausedAtTick: snapshot.currentTick,
    scoreSoFar: {
      home: snapshot.state.homeScore,
      away: snapshot.state.awayScore,
    },
    eventsSoFar: snapshot.state.events.length,
    firstHalfEvents: snapshot.state.events,
    homeClubName: homeClub.slug, // production: load name from clubs table
    awayClubName: awayClub.slug,
    playerClubSide: input.playerClubSide,
    homeLineup: lineupLite(homeLineup),
    awayLineup: lineupLite(awayLineup),
  };
}

/**
 * Apply a substitution decision and resume the match to completion.
 * In production this would re-enqueue a BullMQ job (per ADR-013); for the
 * slice CLI we run synchronously and complete in-process.
 */
export async function decideMatch(args: {
  sessionId: string;
  decision: SubstitutionDecision | null;
  playerDecisionsForCascade: PlayerDecisions;
}): Promise<{ outcome: MatchOutcome; cascadeAfter: { state: WorldState } }> {
  const db = getDb();
  const sessionRows = await db
    .select()
    .from(schema.matchSessions)
    .where(eq(schema.matchSessions.id, args.sessionId))
    .limit(1);
  const session = sessionRows[0];
  if (!session) throw new Error("session_not_found");
  if (session.state !== "paused_for_decision") {
    throw new Error(`session_not_paused (state=${session.state})`);
  }

  // Mark in_progress while we resume
  await db
    .update(schema.matchSessions)
    .set({ state: "in_progress", updatedAt: new Date() })
    .where(eq(schema.matchSessions.id, args.sessionId));

  const snapshot = session.snapshot as MatchSessionSnapshot;

  // Re-derive input from fixture + WorldState
  const fixtureRows = await db
    .select()
    .from(schema.fixtures)
    .where(eq(schema.fixtures.id, session.fixtureId))
    .limit(1);
  const fixture = fixtureRows[0]!;
  const playthrough = (await repo.getPlaythrough(session.playthroughId))!;
  const isHome = fixture.homeClubId === playthrough.managerClubId;
  const matchSeed = `${playthrough.seed}:match:${fixture.week}:${fixture.id}`;
  const homeClub = await loadClubLite(fixture.homeClubId);
  const awayClub = await loadClubLite(fixture.awayClubId);
  const homeLineup = generateLineup(matchSeed, homeClub.baseSkill, homeClub.slug);
  const awayLineup = generateLineup(matchSeed, awayClub.baseSkill, awayClub.slug);
  const latest = await repo.loadLatestSnapshot(session.playthroughId);
  const worldState = latest?.state ?? REAL_PUEBLO_INITIAL;

  const input = {
    homeClubId: fixture.homeClubId,
    awayClubId: fixture.awayClubId,
    homeLineup,
    awayLineup,
    worldState,
    playerClubSide: isHome ? ("home" as const) : ("away" as const),
    seed: matchSeed,
  };

  const outcome = resumeInteractiveMatch({
    snapshot,
    decision: args.decision,
    input,
  });

  // Persist fixture played + standings
  await repo.markFixturePlayed(
    fixture.id,
    outcome.homeScore,
    outcome.awayScore,
    outcome.events,
  );
  await repo.applyMatchToStandings(
    session.playthroughId,
    outcome,
    fixture.homeClubId,
    fixture.awayClubId,
  );

  // Apply MPI + injury_risk deltas to state and run cascade tick
  let nextState: WorldState = {
    ...worldState,
    match_performance_index:
      50 + outcome.worldStateDeltas.match_performance_index,
    injury_risk: clamp(
      worldState.injury_risk + outcome.worldStateDeltas.injury_risk,
      0,
      100,
    ),
  };
  let buffer: DelayedEffect[] = latest?.delayedBuffer ?? [];
  const cascadeRng = (() => {
    const f = seedrandom(`${playthrough.seed}:cascade:${fixture.week}`);
    return () => f.double();
  })();
  const tick = runTick({
    prevState: nextState,
    delayedBuffer: buffer,
    decisions: args.playerDecisionsForCascade,
    rng: cascadeRng,
    hasMatchThisWeek: true,
    currentWeek: fixture.week,
  });
  nextState = tick.nextState;
  buffer = mergeDelayedBuffer(buffer, tick.newDelayedEffects, fixture.week);
  await repo.saveSnapshot(session.playthroughId, fixture.week, nextState, buffer);
  await repo.advancePlaythroughWeek(session.playthroughId, fixture.week + 1);

  // Mark session completed
  await db
    .update(schema.matchSessions)
    .set({
      state: "completed",
      updatedAt: new Date(),
      snapshot: { ...snapshot, currentTick: 90, pausedAt: null } as MatchSessionSnapshot,
    })
    .where(eq(schema.matchSessions.id, args.sessionId));

  return { outcome, cascadeAfter: { state: nextState } };
}

async function loadClubLite(
  clubId: string,
): Promise<{ baseSkill: number; slug: string }> {
  const db = getDb();
  const rows = await db
    .select({ baseSkill: schema.clubs.baseSkill, slug: schema.clubs.slug })
    .from(schema.clubs)
    .where(eq(schema.clubs.id, clubId))
    .limit(1);
  if (!rows[0]) return { baseSkill: 50, slug: "unk" };
  return rows[0];
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
