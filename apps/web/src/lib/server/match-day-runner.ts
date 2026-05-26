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
  clubs,
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
    .select({
      ...playerCols,
      suspendedMatchesRemaining: players.suspendedMatchesRemaining,
      availability: players.availability,
    })
    .from(players)
    .where(eq(players.clubId, args.homeClubId));
  const awayRosterAll = await tx
    .select({
      ...playerCols,
      suspendedMatchesRemaining: players.suspendedMatchesRemaining,
      availability: players.availability,
    })
    .from(players)
    .where(eq(players.clubId, args.awayClubId));

  // Sprint 13: suspended; Pablo 2026-05-26: 'leaving' (expired contracts) too.
  const homeRoster = homeRosterAll.filter(
    (p) => (p.suspendedMatchesRemaining ?? 0) <= 0 && p.availability !== 'leaving',
  );
  const awayRoster = awayRosterAll.filter(
    (p) => (p.suspendedMatchesRemaining ?? 0) <= 0 && p.availability !== 'leaving',
  );

  // Pablo 2026-05-26: a manager can field an injured player on purpose. We
  // pass those IDs to quickSim so they occupy the XI slot but contribute 0
  // to strength / events — team plays effectively with fewer players.
  const fullRosterCols = await tx
    .select({ id: players.id, availability: players.availability, injuredUntilWeek: players.injuredUntilWeek })
    .from(players)
    .where(eq(players.clubId, args.homeClubId));
  const fullAwayCols = await tx
    .select({ id: players.id, availability: players.availability, injuredUntilWeek: players.injuredUntilWeek })
    .from(players)
    .where(eq(players.clubId, args.awayClubId));
  const homeUnavailableIds = new Set(
    fullRosterCols.filter((p) => p.availability === 'injured').map((p) => p.id),
  );
  const awayUnavailableIds = new Set(
    fullAwayCols.filter((p) => p.availability === 'injured').map((p) => p.id),
  );

  // Pablo 2026-05-25: pull manual XI selections from clubs (NULL → auto top 11).
  // Pablo 2026-05-26: pull defaultMatchInstruction too.
  // Suspended IDs are silently dropped by quickSimulateMatch's resolveStarters
  // since they're not in the roster passed here.
  const [homeClubRow] = await tx
    .select({
      ids: clubs.startingLineupPlayerIds,
      instruction: clubs.defaultMatchInstruction,
      managerId: clubs.managerId,
    })
    .from(clubs)
    .where(eq(clubs.id, args.homeClubId));
  const [awayClubRow] = await tx
    .select({
      ids: clubs.startingLineupPlayerIds,
      instruction: clubs.defaultMatchInstruction,
      managerId: clubs.managerId,
    })
    .from(clubs)
    .where(eq(clubs.id, args.awayClubId));

  // For AI clubs (no managerId), pick instruction deterministically per fixture.
  function resolveInstruction(
    row: { instruction: string; managerId: string | null } | undefined,
    seed: string,
  ): 'PRESS_HIGH' | 'HOLD_SHAPE' | 'COUNTER' {
    if (row?.managerId) {
      const v = row.instruction as 'PRESS_HIGH' | 'HOLD_SHAPE' | 'COUNTER';
      return v === 'PRESS_HIGH' || v === 'COUNTER' || v === 'HOLD_SHAPE' ? v : 'HOLD_SHAPE';
    }
    const rngLocal = createSeededRng(seed);
    const roll = rngLocal();
    if (roll < 0.33) return 'PRESS_HIGH';
    if (roll < 0.66) return 'COUNTER';
    return 'HOLD_SHAPE';
  }
  const homeInstruction = resolveInstruction(homeClubRow, `${args.seed}:home-instr`);
  const awayInstruction = resolveInstruction(awayClubRow, `${args.seed}:away-instr`);

  // For auto-pick (no manual XI), pre-filter out injured so they're never
  // auto-selected. For manual XI, keep injured in the roster — quickSim's
  // unavailableStarterIds set will mark them as 0-contribution.
  const homeRosterForSim = homeClubRow?.ids
    ? homeRoster
    : homeRoster.filter((p) => !homeUnavailableIds.has(p.id));
  const awayRosterForSim = awayClubRow?.ids
    ? awayRoster
    : awayRoster.filter((p) => !awayUnavailableIds.has(p.id));

  return quickSimulateMatch({
    homeRoster: homeRosterForSim.map((p) => ({
      ...p,
      position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
    })),
    awayRoster: awayRosterForSim.map((p) => ({
      ...p,
      position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
    })),
    homeStarterIds: homeClubRow?.ids ?? null,
    awayStarterIds: awayClubRow?.ids ?? null,
    homeUnavailableStarterIds: homeUnavailableIds,
    awayUnavailableStarterIds: awayUnavailableIds,
    homeInstruction,
    awayInstruction,
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

      // Pablo 2026-05-25: post-match fatigue + morale for starters vs bench.
      // Starters lose 8..15 fitness, bench recover 5..10. Morale shifts by result.
      // Deterministic per-fixture by reusing the same seed for the random jitter.
      await applyMatchEffects(tx, {
        seed: `${seed}:fx-effects`,
        homeClubId: fx.homeClubId,
        awayClubId: fx.awayClubId,
        homeStarterIds: result.homeStarterIds,
        awayStarterIds: result.awayStarterIds,
        winner: result.winner,
      });

      // Pablo 2026-05-26: persist injuries from match events. Before this fix,
      // 'injury' events appeared narratively in match outcome but never updated
      // the player row — so the player remained selectable for the next XI.
      await applyInjuries(tx, {
        seed: `${seed}:fx-injuries`,
        week,
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

// ── Post-match effects ───────────────────────────────────────────────────────

/**
 * Pablo 2026-05-25: starters get tired but earn morale; bench recovers fitness.
 *
 * Per-side rules (applied after each fixture):
 *   STARTERS (the 11 who played):
 *     fitness  -= 8 + rng×7   (so 8..15)
 *     morale   += +3 win / +1 draw / -2 loss
 *   BENCH (rest of the roster):
 *     fitness  += 5 + rng×5   (so 5..10, capped at 100)
 *     morale   += +1 win / 0 draw / -1 loss
 *
 * Clamps: fitness 0..100, morale 30..95 (we don't want full-mental-collapse
 * or impossible-to-buy euphoria after a single match).
 *
 * Deterministic via seeded RNG so same seed → same effects.
 */
async function applyMatchEffects(
  tx: Tx,
  args: {
    seed: string;
    homeClubId: string;
    awayClubId: string;
    homeStarterIds: readonly string[];
    awayStarterIds: readonly string[];
    winner: QuickMatchResult['winner'];
  },
): Promise<void> {
  const rng = createSeededRng(args.seed);

  // Pull full roster for both clubs.
  const roster = await tx
    .select({
      id: players.id,
      clubId: players.clubId,
      fitness: players.fitness,
      morale: players.morale,
    })
    .from(players)
    .where(inArray(players.clubId, [args.homeClubId, args.awayClubId]));

  const homeStarters = new Set(args.homeStarterIds);
  const awayStarters = new Set(args.awayStarterIds);

  function moraleDelta(side: 'home' | 'away', isStarter: boolean): number {
    const won =
      (side === 'home' && args.winner === 'home') ||
      (side === 'away' && args.winner === 'away');
    const lost =
      (side === 'home' && args.winner === 'away') ||
      (side === 'away' && args.winner === 'home');
    if (isStarter) return won ? +3 : args.winner === 'draw' ? +1 : lost ? -2 : 0;
    return won ? +1 : args.winner === 'draw' ? 0 : lost ? -1 : 0;
  }

  // Pablo 2026-05-26: asymptotic fatigue (was linear). A 100-fitness player
  // loses 14, a 50-fitness loses 4, a 30-fitness loses 0 — real players don't
  // drop to 0. The floor sits at FATIGUE_FLOOR (30).
  const FATIGUE_FLOOR = 30;
  const FATIGUE_FACTOR = 0.2;   // decay = (fitness - floor) × factor
  const FATIGUE_NOISE = 3;      // ±3 jitter so each match feels distinct
  const RECOVERY_MIN = 5;
  const RECOVERY_RANGE = 5;     // bench recovers 5..10 per match
  const MORALE_FLOOR = 30;
  const MORALE_CEIL = 95;

  for (const p of roster) {
    const side: 'home' | 'away' = p.clubId === args.homeClubId ? 'home' : 'away';
    const isStarter = side === 'home' ? homeStarters.has(p.id) : awayStarters.has(p.id);

    let nextFit = p.fitness;
    if (isStarter) {
      // Asymptotic decay: never crosses FATIGUE_FLOOR (30).
      const headroom = Math.max(0, p.fitness - FATIGUE_FLOOR);
      const baseDecay = headroom * FATIGUE_FACTOR;
      const noise = Math.floor(rng() * (FATIGUE_NOISE * 2 + 1)) - FATIGUE_NOISE;
      nextFit -= Math.max(0, Math.round(baseDecay + noise));
      if (nextFit < FATIGUE_FLOOR) nextFit = FATIGUE_FLOOR;
    } else {
      nextFit += RECOVERY_MIN + Math.floor(rng() * (RECOVERY_RANGE + 1));
    }
    if (nextFit < 0) nextFit = 0;
    if (nextFit > 100) nextFit = 100;

    let nextMor = p.morale + moraleDelta(side, isStarter);
    if (nextMor < MORALE_FLOOR) nextMor = MORALE_FLOOR;
    if (nextMor > MORALE_CEIL) nextMor = MORALE_CEIL;

    if (nextFit !== p.fitness || nextMor !== p.morale) {
      await tx
        .update(players)
        .set({ fitness: Math.round(nextFit), morale: Math.round(nextMor) })
        .where(eq(players.id, p.id));
    }
  }

  // Pablo 2026-05-25 (deferred): starters gain a small attribute bump
  // from playing — minutes-driven progression. Per-match: 8% probability
  // per starter to gain +1 in a random core attribute (capped 95).
  // Deterministic via the same rng so reproducible per fixture.
  const ATTRIBUTE_KEYS = ['velocidad', 'resistencia', 'agresividad', 'calidad'] as const;
  const PROGRESSION_PROB = 0.08;
  const ATTRIBUTE_CAP = 95;
  const allStarters = [...homeStarters, ...awayStarters];
  for (const starterId of allStarters) {
    if (rng() > PROGRESSION_PROB) continue;
    const attrIdx = Math.floor(rng() * ATTRIBUTE_KEYS.length);
    const attr = ATTRIBUTE_KEYS[attrIdx]!;
    const [current] = await tx
      .select({ [attr]: players[attr] })
      .from(players)
      .where(eq(players.id, starterId))
      .limit(1);
    const value = (current as Record<string, number | null> | undefined)?.[attr];
    if (value === null || value === undefined || value >= ATTRIBUTE_CAP) continue;
    await tx
      .update(players)
      .set({ [attr]: Math.min(ATTRIBUTE_CAP, value + 1) })
      .where(eq(players.id, starterId));
  }
}

// ── Injury persistence ───────────────────────────────────────────────────────

/**
 * Pablo 2026-05-26: persist injuries from match events.
 *
 * For each 'injury' event with a playerId, set:
 *   availability = 'injured'
 *   injuredUntilWeek = week + recoveryWeeks (1..6 weeks, deterministic via seed)
 *
 * Recovery is processed in advance-orchestrator Phase 7-bis: when
 * injuredUntilWeek <= currentWeek, the player flips back to 'available'.
 *
 * Skips injuries for players already injured (no re-aggravation logic for MVP).
 */
async function applyInjuries(
  tx: Tx,
  args: {
    seed: string;
    week: number;
    events: QuickMatchResult['events'];
  },
): Promise<void> {
  const rng = createSeededRng(args.seed);
  const injuryEvents = args.events.filter((e) => e.type === 'injury' && e.playerId);

  for (const e of injuryEvents) {
    if (!e.playerId) continue;
    // Skip if already injured — read first to avoid re-rolling recovery weeks.
    const [existing] = await tx
      .select({ availability: players.availability })
      .from(players)
      .where(eq(players.id, e.playerId))
      .limit(1);
    if (!existing || existing.availability === 'injured') continue;

    // Deterministic recovery duration: 1..6 weeks.
    const recoveryWeeks = 1 + Math.floor(rng() * 6);
    await tx
      .update(players)
      .set({
        availability: 'injured',
        injuredUntilWeek: args.week + recoveryWeeks,
      })
      .where(eq(players.id, e.playerId));
  }
}
