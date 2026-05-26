/**
 * Season rollover with multi-tier promotion/relegation.
 *
 * Pablo 2026-05-26 (Fase 2 of Spanish pyramid):
 *
 * Each season-end:
 *   1. All 27 divisions' active seasons are marked completed.
 *   2. Per-tier flow rules apply (direct promotions/relegations only):
 *        T1 ↓ T2: bottom 3 of Primera
 *        T2 ↑ T1: top 3 of Segunda
 *        T2 ↓ T3: bottom 4 of Segunda
 *        T3 ↑ T2: top 4 across 1RFEF groups
 *        T3 ↓ T4: bottom 10 across 1RFEF groups
 *        T4 ↑ T3: top 10 across 2RFEF groups
 *        T4 ↓ T5: bottom 25 across 2RFEF groups
 *        T5 ↑ T4: top 25 across 3RFEF groups
 *        T5 ↓: none (bottom of pyramid)
 *      (Playoff brackets deferred to Fase 3 — direct only here.)
 *   3. Clubs' tier + group_index are updated.
 *   4. Each multi-group tier re-balances its group assignments
 *      (round-robin distribution by strength to keep groups even).
 *   5. New season is created per division with fresh fixtures + zeroed standings.
 *   6. Pretemporada reset (existing logic) + promotion/relegation messages.
 *   7. If user's club changed tier, lazily generate rosters for their new
 *      group's rivals (currently always strength-based — defer to next batch).
 */

import {
  db,
  seasons,
  fixtures,
  standings,
  leagues,
  divisions,
  clubs,
  players,
  staff,
  staffMessages,
  calendarEvents,
  playthroughs,
  eq,
  and,
  desc,
  sql,
  inArray,
  asc,
  lte,
  type Db,
} from '@smt/db';
import { generateDoubleRoundRobin, generateRoster, createSeededRng, defaultWorldState, pickTraits } from '@smt/shared';

const PRESEASON_WEEKS = 5;

interface TierFlow {
  readonly up: number;      // total clubs promoting to tier-1 from this tier
  readonly down: number;    // total clubs relegating to tier+1 from this tier
  readonly groupCount: number;
  readonly clubsPerGroup: number;
}

const TIER_FLOWS: Readonly<Record<number, TierFlow>> = Object.freeze({
  1: { up: 0,  down: 3,  groupCount: 1,  clubsPerGroup: 20 },
  2: { up: 3,  down: 4,  groupCount: 1,  clubsPerGroup: 22 },
  3: { up: 4,  down: 10, groupCount: 2,  clubsPerGroup: 20 },
  4: { up: 10, down: 25, groupCount: 5,  clubsPerGroup: 18 },
  5: { up: 25, down: 0,  groupCount: 18, clubsPerGroup: 18 },
});

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface RolloverResult {
  rolledOver: boolean;
  fromSeason?: number;
  toSeason?: number;
  newSeasonId?: string;
  newSeasonStartWeek?: number;
  userPromoted?: boolean;
  userRelegated?: boolean;
  newTier?: number;
}

export async function checkAndRolloverSeason(args: {
  playthroughId: string;
  currentWeek: number;
}): Promise<RolloverResult> {
  const { playthroughId, currentWeek } = args;

  return db.transaction(async (tx) => {
    const [league] = await tx
      .select()
      .from(leagues)
      .where(eq(leagues.playthroughId, playthroughId))
      .limit(1);
    if (!league) return { rolledOver: false };

    // Find the USER's active season — drives the rollover trigger. All 27
    // divisions share the same startWeek/endWeek by construction.
    const [userPt] = await tx
      .select({ clubId: playthroughs.clubId })
      .from(playthroughs)
      .where(eq(playthroughs.id, playthroughId))
      .limit(1);
    if (!userPt) return { rolledOver: false };

    const [userClubRow] = await tx
      .select({ tier: clubs.tier, groupIndex: clubs.groupIndex })
      .from(clubs)
      .where(eq(clubs.id, userPt.clubId))
      .limit(1);
    if (!userClubRow) return { rolledOver: false };

    const [userDivision] = await tx
      .select({ id: divisions.id })
      .from(divisions)
      .where(
        and(
          eq(divisions.leagueId, league.id),
          eq(divisions.tier, userClubRow.tier),
          eq(divisions.groupIndex, userClubRow.groupIndex),
        ),
      )
      .limit(1);
    if (!userDivision) return { rolledOver: false };

    const [activeSeason] = await tx
      .select()
      .from(seasons)
      .where(
        and(
          eq(seasons.divisionId, userDivision.id),
          eq(seasons.status, 'active'),
        ),
      )
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);
    if (!activeSeason) return { rolledOver: false };

    if (currentWeek <= activeSeason.endWeek) {
      return { rolledOver: false };
    }

    // ── Mark ALL active seasons for this league as completed ────────────
    await tx
      .update(seasons)
      .set({ status: 'completed' })
      .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')));

    // ── Load completed seasons + their final standings ──────────────────
    const completedSeasonsRows = await tx
      .select({
        seasonId: seasons.id,
        divisionId: seasons.divisionId,
        tier: divisions.tier,
        groupIndex: divisions.groupIndex,
      })
      .from(seasons)
      .innerJoin(divisions, eq(divisions.id, seasons.divisionId))
      .where(
        and(
          eq(seasons.leagueId, league.id),
          eq(seasons.status, 'completed'),
          eq(seasons.seasonNumber, activeSeason.seasonNumber),
        ),
      );

    // ── Compute promotion/relegation movements per tier ─────────────────
    // Per-tier: collect ALL clubs in that tier with their points across groups,
    // sorted desc. Top N up, bottom M down.
    const moves: Array<{ clubId: string; newTier: number; reason: 'promoted' | 'relegated' }> = [];
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const flow = TIER_FLOWS[tier]!;
      const tierDivIds = completedSeasonsRows.filter((s) => s.tier === tier).map((s) => s.divisionId);
      if (tierDivIds.length === 0) continue;

      const tierStandings = await tx
        .select({
          clubId: standings.clubId,
          points: standings.points,
          goalsFor: standings.goalsFor,
          goalsAgainst: standings.goalsAgainst,
          divisionId: standings.divisionId,
        })
        .from(standings)
        .innerJoin(seasons, eq(seasons.id, standings.seasonId))
        .where(
          and(
            inArray(standings.divisionId, tierDivIds),
            eq(seasons.seasonNumber, activeSeason.seasonNumber),
          ),
        )
        .orderBy(desc(standings.points), desc(standings.goalsFor));

      if (flow.up > 0 && tier > 1) {
        const promoted = tierStandings.slice(0, flow.up);
        for (const p of promoted) {
          moves.push({ clubId: p.clubId, newTier: tier - 1, reason: 'promoted' });
        }
      }
      if (flow.down > 0 && tier < 5) {
        const relegated = tierStandings.slice(-flow.down);
        for (const r of relegated) {
          moves.push({ clubId: r.clubId, newTier: tier + 1, reason: 'relegated' });
        }
      }
    }

    // Detect user club's outcome.
    const userMove = moves.find((m) => m.clubId === userPt.clubId);
    const userPromoted = userMove?.reason === 'promoted';
    const userRelegated = userMove?.reason === 'relegated';
    const userNewTier = userMove?.newTier ?? userClubRow.tier;

    // Apply tier moves — group_index reassigned next.
    if (moves.length > 0) {
      // SQL CASE statement keyed by clubId for one round-trip per tier.
      // Simpler: one UPDATE per club (496 clubs → max ~70 updates total).
      for (const m of moves) {
        await tx
          .update(clubs)
          .set({ tier: m.newTier })
          .where(eq(clubs.id, m.clubId));
      }
    }

    // ── Rebalance group_index per multi-group tier ──────────────────────
    // Distribution rule: sort clubs by strengthRating desc, then assign in
    // serpentine pattern across groups so each group has balanced strength.
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const flow = TIER_FLOWS[tier]!;
      if (flow.groupCount === 1) {
        // Single group — everyone is group 0.
        await tx
          .update(clubs)
          .set({ groupIndex: 0 })
          .where(eq(clubs.tier, tier));
        continue;
      }

      const tierClubs = await tx
        .select({ id: clubs.id, strengthRating: clubs.strengthRating })
        .from(clubs)
        .where(eq(clubs.tier, tier))
        .orderBy(desc(clubs.strengthRating));

      // Serpentine: g0, g1, .., gN-1, gN-1, gN-2, .., g0, g0, g1, ...
      // Distributes strength more evenly than naive round-robin.
      for (let i = 0; i < tierClubs.length; i++) {
        const cycle = Math.floor(i / flow.groupCount);
        const posInCycle = i % flow.groupCount;
        const group = cycle % 2 === 0 ? posInCycle : flow.groupCount - 1 - posInCycle;
        await tx
          .update(clubs)
          .set({ groupIndex: group, strengthRating: tierClubs[i]!.strengthRating + (5 - tier) })
          .where(eq(clubs.id, tierClubs[i]!.id));
      }
    }

    // ── Roster-on-promote (Pablo 2026-05-26 #38) ───────────────────────
    // If the user changed tier, generate full rosters for the rivals in
    // their NEW group that are still lightweight (no players) — otherwise
    // the user's division full-sim would face empty rosters next season.
    if (userPromoted || userRelegated) {
      const [userNow] = await tx
        .select({ tier: clubs.tier, groupIndex: clubs.groupIndex })
        .from(clubs)
        .where(eq(clubs.id, userPt.clubId))
        .limit(1);
      if (userNow) {
        const groupClubs = await tx
          .select({ id: clubs.id, strengthRating: clubs.strengthRating })
          .from(clubs)
          .where(and(eq(clubs.tier, userNow.tier), eq(clubs.groupIndex, userNow.groupIndex)));
        for (const gc of groupClubs) {
          if (gc.id === userPt.clubId) continue;
          const [{ n = 0 } = { n: 0 }] = await tx
            .select({ n: sql<number>`COUNT(*)::int` })
            .from(players)
            .where(eq(players.clubId, gc.id));
          if (Number(n) > 0) continue; // already has a roster
          const rng = createSeededRng(`roster:${gc.id}:s${activeSeason.seasonNumber}`);
          const generated = generateRoster({
            ctx: { rng, currentWeek, hasMatchThisWeek: false, prevState: defaultWorldState() },
            clubBaseSkill: gc.strengthRating,
            clubSlug: gc.id,
            currentWeek,
          });
          await tx.insert(players).values(
            generated.map((p, i) => ({
              clubId: gc.id,
              playthroughId,
              firstName: p.firstName,
              lastName: p.lastName,
              nationality: p.nationality,
              birthWeek: p.birthWeek,
              position: p.position,
              skill: p.skill,
              fitness: p.fitness,
              morale: p.morale,
              form: p.form,
              stamina: p.stamina,
              velocidad: p.velocidad,
              resistencia: p.resistencia,
              agresividad: p.agresividad,
              calidad: p.calidad,
              salaryEurK: p.salaryEurK,
              contractStartWeek: p.contractStartWeek,
              contractEndWeek: p.contractEndWeek,
              traits: [...pickTraits(`${gc.id}:gen:${i}:${p.firstName}${p.lastName}`)],
            })),
          );
        }
      }
    }

    // ── Create new seasons + fixtures + standings for ALL 27 divisions ──
    const newStartWeek = activeSeason.endWeek + PRESEASON_WEEKS;
    const newSeasonNumber = activeSeason.seasonNumber + 1;

    // Resolve all divisions in this league, then process each.
    const allDivs = await tx
      .select({ id: divisions.id, tier: divisions.tier, groupIndex: divisions.groupIndex })
      .from(divisions)
      .where(eq(divisions.leagueId, league.id));

    let userNewSeasonId = '';

    for (const div of allDivs) {
      // Collect current clubs by tier+groupIndex (post-promo/relegation + rebalance).
      const groupClubs = await tx
        .select({ id: clubs.id })
        .from(clubs)
        .where(and(eq(clubs.tier, div.tier), eq(clubs.groupIndex, div.groupIndex)));

      if (groupClubs.length < 2) continue;

      const clubsPerGroup = TIER_FLOWS[div.tier]!.clubsPerGroup;
      const matchdays = (clubsPerGroup - 1) * 2;
      const newEndWeek = newStartWeek + matchdays - 1;

      const [newSeason] = await tx
        .insert(seasons)
        .values({
          leagueId: league.id,
          divisionId: div.id,
          seasonNumber: newSeasonNumber,
          status: 'active',
          startWeek: newStartWeek,
          endWeek: newEndWeek,
        })
        .returning({ id: seasons.id });

      const ids = groupClubs.map((c) => c.id);
      const pairs = generateDoubleRoundRobin({ clubIds: ids, startWeek: newStartWeek });

      await tx.insert(fixtures).values(
        pairs.map((p) => ({
          seasonId: newSeason.id,
          divisionId: div.id,
          homeClubId: p.homeClubId,
          awayClubId: p.awayClubId,
          week: p.week,
          matchday: p.matchday,
          status: 'scheduled' as const,
        })),
      );

      await tx.insert(standings).values(
        ids.map((id) => ({
          seasonId: newSeason.id,
          divisionId: div.id,
          clubId: id,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
        })),
      );

      if (div.tier === userNewTier) {
        // Check if this is the user's new (tier, groupIndex).
        const [userInGroup] = await tx
          .select({ groupIndex: clubs.groupIndex })
          .from(clubs)
          .where(eq(clubs.id, userPt.clubId))
          .limit(1);
        if (userInGroup && userInGroup.groupIndex === div.groupIndex) {
          userNewSeasonId = newSeason.id;
        }
      }
    }

    // ── Pretemporada reset (same as before) ─────────────────────────────
    await tx
      .update(players)
      .set({
        fitness: 95,
        morale: sql`GREATEST(${players.morale}, 75)`,
        form: 60,
        yellowCardsSeason: 0,
        suspendedMatchesRemaining: null,
      })
      .where(eq(players.playthroughId, playthroughId));

    await tx
      .update(players)
      .set({ availability: 'available', injuredUntilWeek: null })
      .where(
        and(
          eq(players.playthroughId, playthroughId),
          eq(players.availability, 'injured'),
          lte(players.injuredUntilWeek, currentWeek),
        ),
      );

    await tx
      .update(staffMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(staffMessages.playthroughId, playthroughId),
          eq(staffMessages.season, activeSeason.seasonNumber),
        ),
      );

    await tx
      .update(calendarEvents)
      .set({ status: 'expired', consumed: true })
      .where(
        and(
          eq(calendarEvents.playthroughId, playthroughId),
          eq(calendarEvents.status, 'pending'),
          lte(calendarEvents.week, currentWeek),
        ),
      );

    await tx
      .delete(players)
      .where(
        and(
          eq(players.playthroughId, playthroughId),
          eq(players.availability, 'leaving'),
        ),
      );

    // ── Messages to user ────────────────────────────────────────────────
    const [headCoach] = await tx
      .select({ id: staff.id, name: staff.name })
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
      const TIER_LABELS: Readonly<Record<number, string>> = {
        1: 'Primera División',
        2: 'Segunda División',
        3: 'Primera RFEF',
        4: 'Segunda RFEF',
        5: 'Tercera RFEF',
      };
      const coachName = headCoach.name.split(' ')[0];
      let content = `🏁 ${coachName}: Comienza la temporada ${newSeasonNumber}. Plantilla descansada y lista.`;
      if (userPromoted) {
        content = `🎉 ${coachName}: ¡ASCENDIMOS a ${TIER_LABELS[userNewTier]}! Una temporada inolvidable. La próxima temporada arrancamos en una división más alta.`;
      } else if (userRelegated) {
        content = `😞 ${coachName}: Descendimos a ${TIER_LABELS[userNewTier]}. Toca recomponerse — el objetivo será volver a subir cuanto antes.`;
      }
      await tx.insert(staffMessages).values({
        playthroughId,
        staffId: headCoach.id,
        week: newStartWeek - PRESEASON_WEEKS,
        season: newSeasonNumber,
        priority: userPromoted || userRelegated ? 'URGENT' : 'ROUTINE',
        templateKey: userPromoted ? 'season:promoted' : userRelegated ? 'season:relegated' : 'season:welcome',
        content,
        isRead: false,
      });

      // Pablo 2026-05-26 (#38): season-end classification (champion / european
      // / playoff / mid-table) + playoff explanation. Computed from the user's
      // final position in their (completed-season) division.
      try {
        const finalStandings = await tx
          .select({ clubId: standings.clubId })
          .from(standings)
          .innerJoin(seasons, eq(seasons.id, standings.seasonId))
          .where(
            and(
              eq(standings.divisionId, userDivision.id),
              eq(seasons.seasonNumber, activeSeason.seasonNumber),
            ),
          )
          .orderBy(desc(standings.points), desc(standings.goalsFor));
        const pos = finalStandings.findIndex((s) => s.clubId === userPt.clubId) + 1;
        const tier = userClubRow.tier;
        let classMsg = '';
        if (pos > 0) {
          if (tier === 1) {
            if (pos === 1) classMsg = `🏆 ${coachName}: ¡CAMPEONES DE LIGA! Y a la Champions League. Histórico.`;
            else if (pos <= 5) classMsg = `🥇 ${coachName}: ${pos}º — clasificados para la Champions League.`;
            else if (pos === 6) classMsg = `🥈 ${coachName}: 6º — a la Europa League.`;
            else if (pos === 7) classMsg = `🥉 ${coachName}: 7º — a la Conference League.`;
          } else {
            // Lower tiers: 1-2 direct, 3-6 playoff (Tier 2); 1 direct, 2-5 playoff (3/4/5).
            const directSpots = tier === 2 ? 2 : 1;
            const playoffEnd = tier === 2 ? 6 : 5;
            if (pos <= directSpots) {
              classMsg = `🥇 ${coachName}: ${pos}º — ascenso directo conseguido.`;
            } else if (pos > directSpots && pos <= playoffEnd) {
              classMsg =
                `🎯 ${coachName}: ${pos}º — ¡a PLAYOFF de ascenso! ` +
                `Se enfrentan los clasificados ${directSpots + 1}º-${playoffEnd}º a doble partido; ` +
                `el peor clasificado juega la ida en casa. Los ganadores suben. ¡A por ello!`;
            }
          }
        }
        if (classMsg) {
          await tx.insert(staffMessages).values({
            playthroughId,
            staffId: headCoach.id,
            week: newStartWeek - PRESEASON_WEEKS,
            season: newSeasonNumber,
            priority: 'ROUTINE',
            templateKey: 'season:classification',
            content: classMsg,
            isRead: false,
          });
        }
      } catch {
        // Classification message is decorative — never block rollover.
      }
    }

    return {
      rolledOver: true,
      fromSeason: activeSeason.seasonNumber,
      toSeason: newSeasonNumber,
      newSeasonId: userNewSeasonId,
      newSeasonStartWeek: newStartWeek,
      userPromoted,
      userRelegated,
      newTier: userNewTier,
    };
  });
}
