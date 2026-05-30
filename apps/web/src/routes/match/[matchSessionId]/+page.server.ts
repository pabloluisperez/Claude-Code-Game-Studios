/**
 * Match recap / live page.
 *
 * Loads the user's fixture + the other fixtures from the same matchday +
 * a snapshot of the live standings (computed at the user's match start
 * time, i.e. NOT including this matchday's results yet — gives a
 * "going-into-the-game" feel) and "live" standings (including all the
 * matchday results).
 *
 * Story: HUD-UI-006 + sidebar with other matches + mini standings
 * Control Manifest: 2026-05-20
 */

import type { PageServerLoad, Actions } from './$types';
import { error, redirect, fail } from '@sveltejs/kit';
import {
  db,
  fixtures,
  clubs,
  standings,
  worldSnapshots,
  playthroughs,
  eq,
  and,
  ne,
  desc,
  alias,
  inArray,
} from '@smt/db';
import { computeEffectiveTicketPrice } from '@smt/shared/sim/economy/revenue';
import { playSingleFixture } from '$lib/server/match-day-runner';
import { emitUserMatchResultEffects } from '$lib/server/user-match-result';
import {
  startInteractiveMatch,
  advanceInteractiveSession,
  type InteractiveState,
} from '$lib/server/interactive-match';
import { players as playersTable } from '@smt/db';
import type { MatchDecision } from '@smt/shared';

/** Build the client view for an in-progress interactive session (pause panel). */
async function buildInteractiveView(st: InteractiveState, userSide: 'home' | 'away') {
  const lineup = userSide === 'home' ? st.snapshot.currentLineupHome : st.snapshot.currentLineupAway;
  const onPitch = lineup.slice(0, 11);
  const bench = lineup.slice(11);
  const ids = [...onPitch, ...bench].map((s) => s.player.id);
  const names = ids.length
    ? await db
        .select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName })
        .from(playersTable)
        .where(inArray(playersTable.id, ids))
    : [];
  const nameById = new Map(names.map((n) => [n.id, `${n.firstName} ${n.lastName}`.trim()]));
  const label = (id: string) => nameById.get(id) ?? id.slice(0, 6);
  // Live score from accumulated events (goals minus disallowed).
  let h = 0, a = 0;
  for (const e of st.snapshot.eventsAccumulated) {
    if (e.type === 'goal') { if (e.team === 'home') h++; else if (e.team === 'away') a++; }
  }
  return {
    sessionId: st.sessionId,
    tick: st.snapshot.currentTick,
    pauseType: st.pauseType,
    userSide,
    homeScore: h,
    awayScore: a,
    instruction: userSide === 'home' ? st.snapshot.activeInstructionHome : st.snapshot.activeInstructionAway,
    subsUsed: userSide === 'home' ? st.snapshot.substitutionsUsed : st.snapshot.awaySubstitutionsUsed,
    onPitch: onPitch.map((s) => ({ id: s.player.id, name: label(s.player.id), position: s.player.position })),
    bench: bench.map((s) => ({ id: s.player.id, name: label(s.player.id), position: s.player.position })),
    events: st.snapshot.eventsAccumulated.map((e) => ({ type: e.type, minute: e.minute, team: e.team ?? null })),
  };
}

export const load: PageServerLoad = async ({ params, parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  const homeClubs = alias(clubs, 'home_clubs');
  const awayClubs = alias(clubs, 'away_clubs');

  const selectFixture = async () =>
    (
      await db
        .select({
          id: fixtures.id,
          week: fixtures.week,
          matchday: fixtures.matchday,
          seasonId: fixtures.seasonId,
          divisionId: fixtures.divisionId,
          status: fixtures.status,
          homeClubId: fixtures.homeClubId,
          awayClubId: fixtures.awayClubId,
          homeName: homeClubs.name,
          awayName: awayClubs.name,
          homeScore: fixtures.homeScore,
          awayScore: fixtures.awayScore,
          matchOutcomeData: fixtures.matchOutcomeData,
          playedAt: fixtures.playedAt,
        })
        .from(fixtures)
        .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
        .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
        .where(eq(fixtures.id, params.matchSessionId))
        .limit(1)
    )[0];

  let fx = await selectFixture();
  if (!fx) throw error(404, 'Match not found');

  // ADR-033 Phase 3: the user's own fixture is left scheduled by runMatchDay and
  // played INTERACTIVELY here (tick-by-tick with halftime + sub-window pauses).
  // Falls back to a one-shot simulation if the session can't start (so matches
  // never break). `interactive` (when set) drives the live pause/decision UI.
  let interactive: Awaited<ReturnType<typeof buildInteractiveView>> | null = null;
  const isUserScheduled =
    fx.status === 'scheduled' &&
    activePlaythrough &&
    (fx.homeClubId === activePlaythrough.clubId || fx.awayClubId === activePlaythrough.clubId);
  if (isUserScheduled && activePlaythrough) {
    const userSide: 'home' | 'away' = fx.homeClubId === activePlaythrough.clubId ? 'home' : 'away';
    async function oneShotFallback() {
      await playSingleFixture({ playthroughId: activePlaythrough!.id, fixtureId: fx.id });
      await emitUserMatchResultEffects({ playthroughId: activePlaythrough!.id, clubId: activePlaythrough!.clubId, week: fx.week });
      fx = (await selectFixture()) ?? fx;
    }
    try {
      const st = await startInteractiveMatch({
        playthroughId: activePlaythrough.id,
        clubId: activePlaythrough.clubId,
        fixtureId: fx.id,
      });
      if (st && !st.completed) {
        interactive = await buildInteractiveView(st, userSide);
      } else if (st && st.completed) {
        fx = (await selectFixture()) ?? fx; // finished instantly (e.g. forfeit)
      } else {
        await oneShotFallback(); // null → engine couldn't build input
      }
    } catch {
      await oneShotFallback();
    }
  }

  // Other fixtures from the same matchday (everyone else playing today).
  const otherFixtures = await db
    .select({
      id: fixtures.id,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeName: homeClubs.name,
      awayName: awayClubs.name,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      status: fixtures.status,
      matchOutcomeData: fixtures.matchOutcomeData,
    })
    .from(fixtures)
    .innerJoin(homeClubs, eq(homeClubs.id, fixtures.homeClubId))
    .innerJoin(awayClubs, eq(awayClubs.id, fixtures.awayClubId))
    .where(
      and(
        eq(fixtures.seasonId, fx.seasonId),
        eq(fixtures.matchday, fx.matchday),
        ne(fixtures.id, fx.id),
      ),
    );

  // Mini live standings — current snapshot for the same season+division.
  const liveStandings = await db
    .select({
      clubId: standings.clubId,
      clubName: clubs.name,
      played: standings.played,
      points: standings.points,
      goalsFor: standings.goalsFor,
      goalsAgainst: standings.goalsAgainst,
    })
    .from(standings)
    .innerJoin(clubs, eq(clubs.id, standings.clubId))
    .where(
      and(
        eq(standings.seasonId, fx.seasonId),
        eq(standings.divisionId, fx.divisionId),
      ),
    )
    .orderBy(desc(standings.points), desc(standings.goalsFor));

  // Polish walkthrough fix (Pablo, post-Sprint-11): if the user's club is
  // home, surface attendance + gate receipts in the match page. The values
  // are not persisted per-fixture today — we re-derive them from the week
  // snapshot using the same formula as the economy tick (F-TV4 boost
  // included). This is a read-only display; the persisted balance in the
  // snapshot is already correct.
  //
  // Precision note: the economy tick stores cashflow in €K with
  // `Math.round(gross/1000)`, so 12.300 € becomes 12 €K (precision loss).
  // For the player-facing match recap we compute the EXACT gross in euros
  // here (attendance × ticketPrice with F-TV4 boost) — this is display-only
  // and doesn't affect the persisted balance.
  type EcoLine = { label: string; icon: string; units: number; price: number; total: number };
  let homeMatchEconomics:
    | {
        attendance: number;
        lines: EcoLine[];
        totalEur: number;
      }
    | null = null;
  if (
    activePlaythrough &&
    fx.homeClubId === activePlaythrough.clubId &&
    fx.status === 'played'
  ) {
    const [snapshot] = await db
      .select({ worldState: worldSnapshots.worldState })
      .from(worldSnapshots)
      .where(
        and(
          eq(worldSnapshots.playthroughId, activePlaythrough.id),
          eq(worldSnapshots.week, fx.week),
        ),
      )
      .limit(1);
    const [clubRow] = await db
      .select({ division: clubs.division })
      .from(clubs)
      .where(eq(clubs.id, activePlaythrough.clubId))
      .limit(1);

    if (snapshot) {
      const ws = snapshot.worldState as Record<string, number>;
      const stadiumCapacity = ws['stadium_capacity'] ?? 3000;
      const fanCultureIndex = ws['fan_culture_index'] ?? 35;
      const ticketPriceIndex = ws['ticket_price_index'] ?? 50;
      const divisionTier: 1 | 2 = clubRow?.division === 'first' ? 1 : 2;

      // Pablo 2026-05-27: use the ACTUAL attendance + commercial figures that
      // economy-tick computed for this match (stored in the snapshot), instead
      // of recomputing a flat number. Falls back to a sane default if absent.
      const attendance = Math.round(
        ws['last_home_attendance'] ?? stadiumCapacity * ((ws['fan_attendance'] ?? 40) / 100),
      );

      const pricing = computeEffectiveTicketPrice({
        stadiumCapacity,
        divisionTier,
        fanCultureIndex,
        ticketPriceIndex,
      });

      const ticketPrice = Math.round(ws['last_home_ticket_price'] ?? pricing.effectivePriceEur);
      // Pablo 2026-05-27: exact gate = attendance × ticketPrice (no €K rounding).
      // last_home_gate_eur was derived from the €K-rounded matchday revenue
      // (1274×10=12.740 became 13.000), so recompute exactly here.
      const gateReceiptsEur = attendance * ticketPrice;

      // Homogeneous line items: [units, unit price, total] per concept.
      const lines: EcoLine[] = [
        { label: 'Entradas', icon: '🎟', units: attendance, price: ticketPrice, total: gateReceiptsEur },
        { label: 'Bufandas', icon: '🧣', units: ws['last_home_scarf_u'] ?? 0, price: ws['last_home_scarf_p'] ?? 0, total: (ws['last_home_scarf_u'] ?? 0) * (ws['last_home_scarf_p'] ?? 0) },
        { label: 'Gorras', icon: '🧢', units: ws['last_home_cap_u'] ?? 0, price: ws['last_home_cap_p'] ?? 0, total: (ws['last_home_cap_u'] ?? 0) * (ws['last_home_cap_p'] ?? 0) },
        { label: 'Camisetas', icon: '👕', units: ws['last_home_shirt_u'] ?? 0, price: ws['last_home_shirt_p'] ?? 0, total: (ws['last_home_shirt_u'] ?? 0) * (ws['last_home_shirt_p'] ?? 0) },
        { label: 'Bocadillos', icon: '🥪', units: ws['last_home_food_u'] ?? 0, price: ws['last_home_food_p'] ?? 0, total: (ws['last_home_food_u'] ?? 0) * (ws['last_home_food_p'] ?? 0) },
        { label: 'Refrescos', icon: '🥤', units: ws['last_home_soda_u'] ?? 0, price: ws['last_home_soda_p'] ?? 0, total: (ws['last_home_soda_u'] ?? 0) * (ws['last_home_soda_p'] ?? 0) },
        { label: 'Cerveza', icon: '🍺', units: ws['last_home_beer_u'] ?? 0, price: ws['last_home_beer_p'] ?? 0, total: (ws['last_home_beer_u'] ?? 0) * (ws['last_home_beer_p'] ?? 0) },
        { label: 'Agua', icon: '💧', units: ws['last_home_water_u'] ?? 0, price: ws['last_home_water_p'] ?? 0, total: (ws['last_home_water_u'] ?? 0) * (ws['last_home_water_p'] ?? 0) },
      ];
      const totalEur = lines.reduce((s, l) => s + l.total, 0);

      homeMatchEconomics = { attendance, lines, totalEur };
    }
  }

  // Pablo 2026-05-26: which side is the user's club (for confetti gating).
  const myClubSide: 'home' | 'away' | null = !activePlaythrough
    ? null
    : fx.homeClubId === activePlaythrough.clubId
      ? 'home'
      : fx.awayClubId === activePlaythrough.clubId
        ? 'away'
        : null;

  return {
    fixture: fx,
    otherFixtures,
    liveStandings,
    currentWeek: activePlaythrough?.currentWeek ?? 0,
    homeMatchEconomics,
    myClubSide,
    interactive,
  };
};

export const actions: Actions = {
  // Resume the interactive session with the player's halftime / sub-window
  // decisions (substitution + instruction), advancing to the next pause or the
  // final whistle. ADR-033 Phase 4.
  decide: async ({ request, params, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const [activePlaythrough] = await db
      .select({ id: playthroughs.id, clubId: playthroughs.clubId })
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!activePlaythrough) return fail(400, { error: 'No hay carrera activa.' });
    const form = await request.formData();
    const sessionId = String(form.get('sessionId') ?? '');
    if (!sessionId) return fail(400, { error: 'Falta sessionId.' });

    const side = String(form.get('side') ?? 'home') as 'home' | 'away';
    const outId = String(form.get('subOut') ?? '');
    const inId = String(form.get('subIn') ?? '');
    const instruction = String(form.get('instruction') ?? '');

    const decisions: MatchDecision[] = [];
    if (outId && inId) {
      decisions.push({ kind: 'substitution', team: side, from_player_id: outId, to_player_id: inId });
    }
    if (instruction === 'PRESS_HIGH' || instruction === 'HOLD_SHAPE' || instruction === 'COUNTER') {
      decisions.push({ kind: 'instruction_change', instruction });
    }

    const st = await advanceInteractiveSession({
      sessionId,
      playthroughId: activePlaythrough.id,
      clubId: activePlaythrough.clubId,
      decisions,
    });
    // Reload /match: if completed, the fixture is now played → replay/result;
    // otherwise the next pause panel renders.
    throw redirect(303, `/match/${params.matchSessionId}?return=dashboard${st?.completed ? '&done=1' : ''}`);
  },
};
