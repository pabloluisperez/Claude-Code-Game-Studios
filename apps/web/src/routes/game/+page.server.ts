/**
 * Onboarding hub — list user's playthroughs + form action to create a new career.
 *
 * The "create career" action bootstraps everything a new MVP run needs:
 *   1. user's club + 25-player roster + manager profile
 *   2. 11 AI clubs (each with an 18-player roster) so the league is even (12)
 *   3. league + division (D5) + active season (matchdays 1..22 → weeks 1..22)
 *   4. double round-robin fixture schedule (132 fixtures)
 *   5. 12 standings rows (all zeros)
 *   6. initial worldSnapshot at week 0 + manager profile
 *
 * Everything runs in a single transaction so partial failures roll back cleanly.
 *
 * Story: Onboarding + league seeding (HUD-UI / LEAGUE-SYSTEM follow-up)
 * Control Manifest: 2026-05-19
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  clubs,
  playthroughs,
  players,
  worldSnapshots,
  managerProfiles,
  leagues,
  divisions,
  seasons,
  fixtures,
  standings,
  calendarEvents,
  eq,
  desc,
} from '@smt/db';
import {
  defaultWorldState,
  generateRoster,
  generateAiClubs,
  generateDoubleRoundRobin,
  initManagerSkills,
  createSeededRng,
} from '@smt/shared';

const AI_CLUB_COUNT = 11; // user + 11 = 12 clubs (even, needed for round-robin)
const SEASON_START_WEEK = 1;

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();
  if (!user) throw redirect(303, '/login');

  const rows = await db
    .select({
      playthroughId: playthroughs.id,
      clubId: clubs.id,
      clubName: clubs.name,
      city: clubs.city,
      currentWeek: playthroughs.currentWeek,
      updatedAt: playthroughs.updatedAt,
    })
    .from(playthroughs)
    .innerJoin(clubs, eq(clubs.id, playthroughs.clubId))
    .where(eq(playthroughs.userId, user.id))
    .orderBy(desc(playthroughs.updatedAt));

  return { careers: rows };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const clubName = String(form.get('clubName') ?? '').trim();
    const city = String(form.get('city') ?? '').trim();

    if (clubName.length < 2 || clubName.length > 50) {
      return fail(400, { error: 'El nombre del club debe tener entre 2 y 50 caracteres.' });
    }
    if (city.length < 2 || city.length > 50) {
      return fail(400, { error: 'La ciudad debe tener entre 2 y 50 caracteres.' });
    }

    const userId = locals.user.id;
    const userName = locals.user.username;

    const newPlaythroughId = await db.transaction(async (tx) => {
      // ── 1. User club + playthrough ────────────────────────────────────
      const [newClub] = await tx
        .insert(clubs)
        .values({
          managerId: userId,
          name: clubName,
          city,
          division: 'fifth',
          prestige: 1,
          budget: 10000,
          fanBase: 500,
          cityTier: 1,
          currentSeason: 1,
        })
        .returning({ id: clubs.id });

      const [newPlaythrough] = await tx
        .insert(playthroughs)
        .values({ userId, clubId: newClub.id, currentWeek: 0 })
        .returning({ id: playthroughs.id });

      const rng = createSeededRng(newPlaythrough.id);

      // ── 2. User roster ────────────────────────────────────────────────
      const userRoster = generateRoster({
        ctx: { rng, currentWeek: 0, hasMatchThisWeek: false, prevState: defaultWorldState() },
        clubBaseSkill: 50,
        clubSlug: clubName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        currentWeek: 0,
      });

      await tx.insert(players).values(
        userRoster.map((p) => ({
          clubId: newClub.id,
          playthroughId: newPlaythrough.id,
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
          salaryEurK: 2,
          contractStartWeek: 0,
          contractEndWeek: 76,
        })),
      );

      // ── 3. AI clubs + their rosters ───────────────────────────────────
      const aiSeeds = generateAiClubs({
        rng,
        count: AI_CLUB_COUNT,
        currentWeek: 0,
        excludeNames: new Set([clubName]),
      });

      const aiClubRows = await tx
        .insert(clubs)
        .values(
          aiSeeds.map((s) => ({
            managerId: null,
            name: s.name,
            city: s.city,
            division: 'fifth' as const,
            prestige: 1,
            budget: 8000,
            fanBase: 300,
            cityTier: 1,
            currentSeason: 1,
          })),
        )
        .returning({ id: clubs.id });

      // Persist AI rosters (concat all in one insert for speed).
      const aiPlayerRows = aiSeeds.flatMap((seed, i) => {
        const aiClubId = aiClubRows[i]!.id;
        return seed.roster.map((p) => ({
          clubId: aiClubId,
          playthroughId: newPlaythrough.id,
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
          salaryEurK: 1,
          contractStartWeek: 0,
          contractEndWeek: 76,
        }));
      });
      if (aiPlayerRows.length > 0) await tx.insert(players).values(aiPlayerRows);

      // ── 4. League + division + season ─────────────────────────────────
      const [league] = await tx
        .insert(leagues)
        .values({ playthroughId: newPlaythrough.id, name: 'Liga Cascada', country: 'ES' })
        .returning({ id: leagues.id });

      const [division] = await tx
        .insert(divisions)
        .values({ leagueId: league.id, tier: 5, name: 'Quinta División', clubCount: 12 })
        .returning({ id: divisions.id });

      // 12 clubs → 22 matchdays, 1 per week starting week 1.
      const endWeek = SEASON_START_WEEK + 22 - 1;
      const [season] = await tx
        .insert(seasons)
        .values({
          leagueId: league.id,
          divisionId: division.id,
          seasonNumber: 1,
          status: 'active',
          startWeek: SEASON_START_WEEK,
          endWeek,
        })
        .returning({ id: seasons.id });

      // ── 5. Fixtures (double round-robin) ──────────────────────────────
      const allClubIds = [newClub.id, ...aiClubRows.map((c) => c.id)];
      const pairs = generateDoubleRoundRobin({
        clubIds: allClubIds,
        startWeek: SEASON_START_WEEK,
      });

      await tx.insert(fixtures).values(
        pairs.map((p) => ({
          seasonId: season.id,
          divisionId: division.id,
          homeClubId: p.homeClubId,
          awayClubId: p.awayClubId,
          week: p.week,
          matchday: p.matchday,
          status: 'scheduled' as const,
        })),
      );

      // ── 6. Initial standings (all zeros) ──────────────────────────────
      await tx.insert(standings).values(
        allClubIds.map((id) => ({
          seasonId: season.id,
          divisionId: division.id,
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

      // ── 7. WorldSnapshot + manager profile ───────────────────────────
      await tx.insert(worldSnapshots).values({
        playthroughId: newPlaythrough.id,
        week: 0,
        worldState: defaultWorldState(),
        delayedEffectsBuffer: [],
      });

      await tx.insert(managerProfiles).values({
        playthroughId: newPlaythrough.id,
        name: userName,
        skills: initManagerSkills(),
      });

      // ── 8. Calendar events for the season ────────────────────────────
      // Mix of NOTIFY (informational) and STOP (decision-blocking) events.
      // Sample sponsor + board review give the player something to decide.
      await tx.insert(calendarEvents).values([
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK,
          season: 1,
          type: 'season_start',
          priority: 'NOTIFY',
          status: 'pending',
          metadata: { kind: 'season_start' },
        },
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK,
          season: 1,
          type: 'transfer_window_open',
          priority: 'NOTIFY',
          status: 'pending',
          metadata: { kind: 'transfer_window_open' },
        },
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK + 3,
          season: 1,
          type: 'sponsor_offer',
          priority: 'STOP',
          status: 'pending',
          metadata: {
            kind: 'sponsor_offer',
            brand: 'Pueblo Bakery',
            weeklyAmountEurK: 3,
            contractWeeks: 22,
            qualityDelta: 5,
            options: {
              accept: { label: 'Aceptar', description: 'Firma a Pueblo Bakery por 22 semanas.' },
              reject: { label: 'Rechazar', description: 'Mantén el slot libre para una oferta mejor.' },
            },
            defaultOption: 'reject',
          },
        },
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK + 9,
          season: 1,
          type: 'board_meeting',
          priority: 'STOP',
          status: 'pending',
          metadata: {
            kind: 'board_meeting',
            reason: 'mid_season_review',
            options: {
              ambitious: { label: 'Promete ascenso', description: '+20% expectativas, +reputación si cumples.' },
              cautious: { label: 'Estabilizar', description: 'Sin upside, sin downside.' },
              defensive: { label: 'Pedir paciencia', description: 'Salida segura si pierdes confianza.' },
            },
            defaultOption: 'cautious',
          },
        },
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK + 10,
          season: 1,
          type: 'transfer_window_close',
          priority: 'NOTIFY',
          status: 'pending',
          metadata: { kind: 'transfer_window_close' },
        },
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK + 17,
          season: 1,
          type: 'transfer_window_open',
          priority: 'NOTIFY',
          status: 'pending',
          metadata: { kind: 'transfer_window_open' },
        },
        {
          playthroughId: newPlaythrough.id,
          week: endWeek,
          season: 1,
          type: 'transfer_window_close',
          priority: 'NOTIFY',
          status: 'pending',
          metadata: { kind: 'transfer_window_close' },
        },
        {
          playthroughId: newPlaythrough.id,
          week: endWeek,
          season: 1,
          type: 'season_end',
          priority: 'NOTIFY',
          status: 'pending',
          metadata: { kind: 'season_end' },
        },
      ]);

      return newPlaythrough.id;
    });

    throw redirect(303, `/dashboard?new=${newPlaythroughId}`);
  },
};
