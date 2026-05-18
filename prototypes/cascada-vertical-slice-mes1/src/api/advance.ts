// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does one advance() call coherently progress 1 week end-to-end?
// Date: 2026-05-18

import seedrandom from "seedrandom";
import * as repo from "../db/repo.js";
import { mergeDelayedBuffer, runTick } from "../sim/cascade-engine.js";
import { getEventsForWeek, type SliceEvent } from "../sim/event-system.js";
import {
  applyXp,
  initialManagerState,
  maybeGenerateCareerEvent,
  weeklyXpGain,
  type ManagerState,
  type XpGain,
} from "../sim/manager-rpg.js";
import { simulateMatch } from "../sim/match-simulation.js";
import { generateLineup, REAL_PUEBLO } from "../sim/player-gen.js";
import { generateStaffMessages, type StaffMessage } from "../sim/staff-messages.js";
import type {
  DelayedEffect,
  MatchOutcome,
  PlayerDecisions,
  WorldState,
} from "../sim/types.js";

/**
 * advance() — process one game-week for a playthrough.
 *
 * Both the BullMQ worker AND smoke-db CLI go through this function so we
 * have a single source of truth for the weekly loop.
 *
 * Steps:
 *   1. Load latest snapshot
 *   2. Pull this week's fixtures
 *   3. Simulate every fixture
 *      - update standings
 *      - for the player's match, capture worldStateDeltas + apply to state
 *   4. Resolve events for the next-week preview (calendar + random)
 *   5. Run cascade tick with player decisions
 *   6. Persist new snapshot
 *   7. Bump playthroughs.currentWeek
 */
export interface AdvanceResult {
  weekProcessed: number;
  playerMatchOutcome: MatchOutcome | null;
  finalState: WorldState;
  thresholdCrossings: { nodeId: string; reason: string; value: number }[];
  cascadeLog: { edgeId: string; to: string; delta: number; delay: number }[];
  events: SliceEvent[];
  managerState: ManagerState;
  managerXpGains: XpGain[];
  managerLeveledUp: boolean;
  staffMessages: StaffMessage[];
}

export async function advanceOneWeek(
  playthroughId: string,
  decisions: PlayerDecisions,
): Promise<AdvanceResult> {
  const playthrough = await repo.getPlaythrough(playthroughId);
  if (!playthrough) throw new Error(`Playthrough not found: ${playthroughId}`);

  const week = playthrough.currentWeek;

  const latest = await repo.loadLatestSnapshot(playthroughId);
  let state: WorldState =
    latest?.state ?? (await import("../sim/seed-data.js")).REAL_PUEBLO_INITIAL;
  let delayedBuffer: DelayedEffect[] = latest?.delayedBuffer ?? [];

  // ── 2-3: simulate all fixtures of this week ────────────────────────────────
  const fixtures = await repo.getFixturesForWeek(playthroughId, week);
  let playerMatchOutcome: MatchOutcome | null = null;
  const cascadeSeed = `${playthrough.seed}:cascade:${week}`;

  for (const fixture of fixtures) {
    const matchSeed = `${playthrough.seed}:match:${week}:${fixture.id}`;
    const homeClub = await loadClubLite(fixture.homeClubId);
    const awayClub = await loadClubLite(fixture.awayClubId);
    const isPlayerMatch =
      fixture.homeClubId === playthrough.managerClubId ||
      fixture.awayClubId === playthrough.managerClubId;
    const playerClubSide: "home" | "away" =
      fixture.homeClubId === playthrough.managerClubId ? "home" : "away";

    const homeLineup = generateLineup(matchSeed, homeClub.baseSkill, homeClub.slug);
    const awayLineup = generateLineup(matchSeed, awayClub.baseSkill, awayClub.slug);

    const outcome = simulateMatch({
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
      homeLineup,
      awayLineup,
      worldState: state,
      playerClubSide,
      seed: matchSeed,
    });

    await repo.markFixturePlayed(
      fixture.id,
      outcome.homeScore,
      outcome.awayScore,
      outcome.events,
    );
    await repo.applyMatchToStandings(
      playthroughId,
      outcome,
      fixture.homeClubId,
      fixture.awayClubId,
    );

    if (isPlayerMatch) {
      playerMatchOutcome = outcome;
      // Apply player-relevant deltas to the WorldState the cascade tick will read
      state = {
        ...state,
        match_performance_index:
          50 + outcome.worldStateDeltas.match_performance_index,
        injury_risk: clamp(
          state.injury_risk + outcome.worldStateDeltas.injury_risk,
          0,
          100,
        ),
      };
    }
  }

  // ── 4: events ──────────────────────────────────────────────────────────────
  const events = getEventsForWeek(week, playthrough.seed);

  // ── 5: cascade tick ─────────────────────────────────────────────────────────
  const rngFactory = seedrandom(cascadeSeed);
  const rng = (): number => rngFactory.double();
  const hasMatchThisWeek = fixtures.some(
    (f) =>
      f.homeClubId === playthrough.managerClubId ||
      f.awayClubId === playthrough.managerClubId,
  );
  const tickResult = runTick({
    prevState: state,
    delayedBuffer,
    decisions,
    rng,
    hasMatchThisWeek,
    currentWeek: week,
  });
  state = tickResult.nextState;
  delayedBuffer = mergeDelayedBuffer(
    delayedBuffer,
    tickResult.newDelayedEffects,
    week,
  );

  // ── 6: manager-RPG XP + level up ───────────────────────────────────────────
  const prevManager =
    (latest?.managerState as ManagerState | null | undefined) ??
    initialManagerState();
  const xpGains = weeklyXpGain({
    matchOutcome: playerMatchOutcome,
    thresholdCrossings: tickResult.thresholdCrossings,
  });
  const xpResult = applyXp(prevManager, xpGains);
  let managerState = xpResult.state;

  // Career event (week 4 only in slice)
  const standingsRows = await repo.getStandings(playthroughId);
  const playerStandingsRow = standingsRows.find(
    (r) => r.clubId === playthrough.managerClubId,
  );
  const position = playerStandingsRow?.position ?? 20;
  const careerEvent = maybeGenerateCareerEvent({
    week,
    state: managerState,
    currentPosition: position,
  });
  if (careerEvent) {
    managerState = {
      ...managerState,
      careerEvents: [...managerState.careerEvents, careerEvent],
    };
  }

  // ── 7: staff messages ──────────────────────────────────────────────────────
  const staffMessages = generateStaffMessages({
    week,
    prevState: latest?.state ?? state,
    nextState: state,
    cascadeLog: tickResult.log,
    thresholdCrossings: tickResult.thresholdCrossings,
  });
  if (staffMessages.length > 0) {
    await repo.insertStaffMessages(
      staffMessages.map((m) => ({
        playthroughId,
        week,
        staffRole: m.staffRole,
        staffTier: m.staffTier,
        templateKey: m.templateKey,
        body: m.body,
        priority: m.priority,
        causalNodeId: m.causalNodeId,
      })),
    );
  }

  // ── 8: persist snapshot ───────────────────────────────────────────────────
  await repo.saveSnapshot(playthroughId, week, state, delayedBuffer, managerState);

  // ── 9: advance week ────────────────────────────────────────────────────────
  await repo.advancePlaythroughWeek(playthroughId, week + 1);

  return {
    weekProcessed: week,
    playerMatchOutcome,
    finalState: state,
    thresholdCrossings: tickResult.thresholdCrossings.map((x) => ({
      nodeId: x.nodeId,
      reason: x.reason,
      value: x.value,
    })),
    cascadeLog: tickResult.log.map((e) => ({
      edgeId: e.edgeId,
      to: e.to,
      delta: e.delta,
      delay: e.delay,
    })),
    events,
    managerState,
    managerXpGains: xpGains,
    managerLeveledUp: xpResult.leveledUp,
    staffMessages,
  };
}

async function loadClubLite(
  clubId: string,
): Promise<{ baseSkill: number; slug: string }> {
  // Small cache could go here; for the slice we just query inline.
  const { schema, getDb } = await import("../db/client.js");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const rows = await db
    .select({ baseSkill: schema.clubs.baseSkill, slug: schema.clubs.slug })
    .from(schema.clubs)
    .where(eq(schema.clubs.id, clubId))
    .limit(1);
  if (!rows[0]) {
    // Fallback to REAL_PUEBLO defaults — shouldn't happen if seed ran
    return { baseSkill: 50, slug: REAL_PUEBLO.slug };
  }
  return rows[0];
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
