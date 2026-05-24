/**
 * Match-day runner — given a playthrough and a target week, find all
 * scheduled fixtures for that week, simulate them with the quick-match
 * simulator, persist scores + outcome JSON, and update standings.
 *
 * Used by /dashboard ?/advance.
 *
 * Single transaction per matchday so any error rolls everything back.
 *
 * Story: League follow-up — match-day batch sim wiring
 * Control Manifest: 2026-05-19
 */

import {
  db,
  fixtures,
  standings,
  players,
  staffMessages,
  staff,
  eq,
  and,
  sql,
  inArray,
  type Db,
} from '@smt/db';
import {
  createSeededRng,
  quickSimulateMatch,
  extractSuspensions,
  processYellowAccumulation,
  type QuickMatchResult,
} from '@smt/shared';

export interface MatchDayResult {
  week: number;
  played: number;
  results: Array<{
    fixtureId: string;
    homeClubId: string;
    awayClubId: string;
    homeScore: number;
    awayScore: number;
  }>;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Pull both rosters from `players` and call `quickSimulateMatch`.
 * Uses a per-fixture seed so each result is reproducible.
 */
async function simulateFixture(
  tx: Tx,
  args: { fixtureId: string; homeClubId: string; awayClubId: string; seed: string },
): Promise<QuickMatchResult> {
  const playerCols = {
    id: players.id,
    firstName: players.firstName,
    lastName: players.lastName,
    position: players.position,
    skill: players.skill,
    form: players.form,
    velocidad: players.velocidad,
    resistencia: players.resistencia,
    agresividad: players.agresividad,
    calidad: players.calidad,
  } as const;
  // Sprint 13 task 13-1: suspended players (suspended_matches_remaining > 0)
  // do NOT appear in the match roster — they can't play.
  const homeRosterAll = await tx
    .select({ ...playerCols, suspendedMatchesRemaining: players.suspendedMatchesRemaining })
    .from(players)
    .where(eq(players.clubId, args.homeClubId));
  const awayRosterAll = await tx
    .select({ ...playerCols, suspendedMatchesRemaining: players.suspendedMatchesRemaining })
    .from(players)
    .where(eq(players.clubId, args.awayClubId));

  const homeRoster = homeRosterAll.filter(
    (p) => (p.suspendedMatchesRemaining ?? 0) <= 0,
  );
  const awayRoster = awayRosterAll.filter(
    (p) => (p.suspendedMatchesRemaining ?? 0) <= 0,
  );

  return quickSimulateMatch({
    homeRoster: homeRoster.map((p) => ({
      ...p,
      position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
    })),
    awayRoster: awayRoster.map((p) => ({
      ...p,
      position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
    })),
    rng: createSeededRng(args.seed),
  });
}

/**
 * Apply a single match result to the two clubs' standings rows. Uses
 * `sql` increments so concurrent matchdays don't trample each other.
 */
async function applyToStandings(
  tx: Tx,
  args: {
    seasonId: string;
    homeClubId: string;
    awayClubId: string;
    homeScore: number;
    awayScore: number;
    winner: QuickMatchResult['winner'];
  },
): Promise<void> {
  const { seasonId, homeClubId, awayClubId, homeScore, awayScore, winner } = args;

  // Home club
  await tx
    .update(standings)
    .set({
      played: sql`${standings.played} + 1`,
      wins: winner === 'home' ? sql`${standings.wins} + 1` : standings.wins,
      draws: winner === 'draw' ? sql`${standings.draws} + 1` : standings.draws,
      losses: winner === 'away' ? sql`${standings.losses} + 1` : standings.losses,
      goalsFor: sql`${standings.goalsFor} + ${homeScore}`,
      goalsAgainst: sql`${standings.goalsAgainst} + ${awayScore}`,
      points: sql`${standings.points} + ${winner === 'home' ? 3 : winner === 'draw' ? 1 : 0}`,
      updatedAt: new Date(),
    })
    .where(and(eq(standings.seasonId, seasonId), eq(standings.clubId, homeClubId)));

  // Away club
  await tx
    .update(standings)
    .set({
      played: sql`${standings.played} + 1`,
      wins: winner === 'away' ? sql`${standings.wins} + 1` : standings.wins,
      draws: winner === 'draw' ? sql`${standings.draws} + 1` : standings.draws,
      losses: winner === 'home' ? sql`${standings.losses} + 1` : standings.losses,
      goalsFor: sql`${standings.goalsFor} + ${awayScore}`,
      goalsAgainst: sql`${standings.goalsAgainst} + ${homeScore}`,
      points: sql`${standings.points} + ${winner === 'away' ? 3 : winner === 'draw' ? 1 : 0}`,
      updatedAt: new Date(),
    })
    .where(and(eq(standings.seasonId, seasonId), eq(standings.clubId, awayClubId)));
}

/**
 * Run all `status = 'scheduled'` fixtures in `week`, persisting scores and
 * updating standings. Returns the list of results for caller side effects
 * (e.g. an in-game notification feed).
 */
export async function runMatchDay(args: {
  playthroughId: string;
  week: number;
}): Promise<MatchDayResult> {
  const { playthroughId, week } = args;

  return db.transaction(async (tx) => {
    const scheduledRows = await tx
      .select({
        id: fixtures.id,
        seasonId: fixtures.seasonId,
        homeClubId: fixtures.homeClubId,
        awayClubId: fixtures.awayClubId,
      })
      .from(fixtures)
      .where(and(eq(fixtures.week, week), eq(fixtures.status, 'scheduled')));

    const results: MatchDayResult['results'] = [];
    const playedAt = new Date();

    for (const fx of scheduledRows) {
      const seed = `${playthroughId}:${fx.id}`;
      const result = await simulateFixture(tx, {
        fixtureId: fx.id,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        seed,
      });

      await tx
        .update(fixtures)
        .set({
          status: 'played',
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          matchOutcomeData: {
            winner: result.winner,
            homeStrength: result.homeStrength,
            awayStrength: result.awayStrength,
            events: result.events,
          },
          playedAt,
        })
        .where(eq(fixtures.id, fx.id));

      await applyToStandings(tx, {
        seasonId: fx.seasonId,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winner: result.winner,
      });

      // Sprint 13 task 13-1 (BUG-PT-5): persist suspensions + 5-yellow rule
      // for this fixture. Runs in the same tx as the score persist so a
      // failure rolls everything back.
      await applySuspensions(tx, {
        playthroughId,
        week,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        events: result.events,
      });

      results.push({
        fixtureId: fx.id,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
      });
    }

    return { week, played: results.length, results };
  });
}

/**
 * Sprint 13 task 13-1 (Pablo playtest BUG-PT-5):
 *
 * For each fixture run by match-day:
 *   1. Read all players on both clubs (with current suspension / yellow state)
 *   2. For each red_card event → set suspended_matches_remaining = N(reason)
 *   3. For each yellow_card event → bump yellow_cards_season; if ≥ 5, auto-
 *      suspend (suspended_matches_remaining = 1) and reset counter to 0
 *   4. For all OTHER players (not sentenced this fixture) on the playing
 *      clubs: decrement suspended_matches_remaining by 1; clear to NULL if
 *      it reaches 0
 *   5. Insert staff messages for the user's club describing the sentence
 *
 * Suspensions are per-match, not per-week (Pablo clarification): the
 * counter only ticks when the player's club plays.
 */
async function applySuspensions(
  tx: Tx,
  args: {
    playthroughId: string;
    week: number;
    homeClubId: string;
    awayClubId: string;
    events: QuickMatchResult['events'];
  },
): Promise<void> {
  const { playthroughId, week, homeClubId, awayClubId, events } = args;

  // 1. Read all players on both clubs with their current state.
  const roster = await tx
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      clubId: players.clubId,
      suspendedMatchesRemaining: players.suspendedMatchesRemaining,
      yellowCardsSeason: players.yellowCardsSeason,
    })
    .from(players)
    .where(inArray(players.clubId, [homeClubId, awayClubId]));

  const playerById = new Map(roster.map((p) => [p.id, p]));
  const currentYellowsById: Record<string, number> = {};
  for (const p of roster) {
    currentYellowsById[p.id] = p.yellowCardsSeason;
  }

  // 2. Red-card suspensions.
  const reds = extractSuspensions(events);
  const sentencedThisMatch = new Set<string>();
  const newSuspensionsForMessages: Array<{
    playerId: string;
    matches: number;
    reason: string;
  }> = [];

  for (const r of reds) {
    if (!playerById.has(r.playerId)) continue;
    await tx
      .update(players)
      .set({ suspendedMatchesRemaining: r.matches })
      .where(eq(players.id, r.playerId));
    sentencedThisMatch.add(r.playerId);
    newSuspensionsForMessages.push({
      playerId: r.playerId,
      matches: r.matches,
      reason: r.reason,
    });
  }

  // 3. Yellow-card accumulation (5th yellow → 1-match suspension).
  const yellowAccs = processYellowAccumulation(events, currentYellowsById);
  for (const ya of yellowAccs) {
    if (!playerById.has(ya.playerId)) continue;
    if (ya.triggersSuspension) {
      // Auto-suspension: 1 match + reset counter to 0
      await tx
        .update(players)
        .set({ suspendedMatchesRemaining: 1, yellowCardsSeason: 0 })
        .where(eq(players.id, ya.playerId));
      sentencedThisMatch.add(ya.playerId);
      newSuspensionsForMessages.push({
        playerId: ya.playerId,
        matches: 1,
        reason: 'five_yellows',
      });
    } else {
      await tx
        .update(players)
        .set({ yellowCardsSeason: ya.newSeasonCount })
        .where(eq(players.id, ya.playerId));
    }
  }

  // 4. Decrement remaining counters for all OTHER players on these clubs
  //    who already had an active suspension before this match.
  const toDecrement = roster.filter(
    (p) =>
      !sentencedThisMatch.has(p.id) &&
      p.suspendedMatchesRemaining !== null &&
      p.suspendedMatchesRemaining > 0,
  );
  for (const p of toDecrement) {
    const next = (p.suspendedMatchesRemaining ?? 0) - 1;
    await tx
      .update(players)
      .set({
        suspendedMatchesRemaining: next <= 0 ? null : next,
      })
      .where(eq(players.id, p.id));
  }

  // 5. Staff message for the user-club's coach when a new suspension fires.
  //    Only emit messages for the playthrough's club (the one the user
  //    manages). We resolve it by checking which of (home, away) belongs
  //    to a player we have in roster + the head_coach staff for the
  //    playthrough.
  if (newSuspensionsForMessages.length > 0) {
    const [headCoach] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(
        and(
          eq(staff.playthroughId, playthroughId),
          eq(staff.role, 'head_coach'),
          eq(staff.status, 'active'),
        ),
      )
      .limit(1);

    if (headCoach) {
      for (const s of newSuspensionsForMessages) {
        const p = playerById.get(s.playerId);
        if (!p) continue;
        const reasonLabel =
          s.reason === 'five_yellows'
            ? '5 amarillas acumuladas'
            : s.reason === 'second_yellow'
              ? 'doble amarilla'
              : s.reason === 'violent'
                ? 'roja por conducta violenta'
                : 'roja directa';
        const matchesLabel =
          s.matches === 1 ? '1 partido' : `${s.matches} partidos`;
        await tx.insert(staffMessages).values({
          playthroughId,
          staffId: headCoach.id,
          week,
          season: 1,
          priority: 'URGENT',
          templateKey: `suspension:${s.reason}`,
          content: `Segundo entrenador avisa: ${p.firstName} ${p.lastName} sancionado por ${reasonLabel}. Se pierde ${matchesLabel}.`,
          isRead: false,
        });
      }
    }
  }
}
