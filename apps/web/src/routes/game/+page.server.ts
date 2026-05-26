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
  staff,
  eq,
  desc,
} from '@smt/db';
import {
  defaultWorldState,
  generateRoster,
  generateAiClubs,
  initManagerSkills,
  createSeededRng,
  pickTraits,
  STAFF_WEEKLY_WAGE_EURK,
  LEAGUE_KICKOFF_WEEK,
} from '@smt/shared';
import { persistPyramid } from '$lib/server/league-pyramid';

// User starts in 3ª RFEF group 1 with 17 AI rivals (Tier 5 has 18 clubs/group).
const USER_TIER = 5 as const;
const USER_GROUP_INDEX = 0 as const;
const USER_GROUP_CLUB_COUNT = 18; // matches PYRAMID Tier 5 clubsPerGroup
const AI_CLUBS_IN_USER_GROUP = USER_GROUP_CLUB_COUNT - 1; // 17 AI clubs in user's group
// Season schedule (in-game weeks):
//   0..4   pretemporada (no matches)
//   5..26  liga (matchdays 1..22)
//   27+    cierre + nueva temporada (handled by season-rollover)
const SEASON_START_WEEK = LEAGUE_KICKOFF_WEEK; // 5

const INITIAL_STAFF_NAMES: Readonly<Record<string, string>> = {
  groundskeeper: 'Antonio García',
  fitness_coach: 'Marta Aguilar',
  head_coach: 'Luis Pérez',
};

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
    const managerName = String(form.get('managerName') ?? '').trim();
    const kitPrimaryRaw = String(form.get('kitPrimaryColor') ?? '#1e3a8a').trim();
    const kitSecondaryRaw = String(form.get('kitSecondaryColor') ?? '#f8fafc').trim();
    const HEX = /^#[0-9a-fA-F]{6}$/;
    const kitPrimaryColor = HEX.test(kitPrimaryRaw) ? kitPrimaryRaw : '#1e3a8a';
    const kitSecondaryColor = HEX.test(kitSecondaryRaw) ? kitSecondaryRaw : '#f8fafc';

    if (clubName.length < 2 || clubName.length > 50) {
      return fail(400, { error: 'El nombre del club debe tener entre 2 y 50 caracteres.' });
    }
    if (city.length < 2 || city.length > 50) {
      return fail(400, { error: 'La ciudad debe tener entre 2 y 50 caracteres.' });
    }
    if (managerName.length < 2 || managerName.length > 50) {
      return fail(400, { error: 'Tu nombre de mánager debe tener entre 2 y 50 caracteres.' });
    }

    const userId = locals.user.id;

    const newPlaythroughId = await db.transaction(async (tx) => {
      // ── 1. User club + playthrough ────────────────────────────────────
      const [newClub] = await tx
        .insert(clubs)
        .values({
          managerId: userId,
          name: clubName,
          city,
          division: 'fifth',
          tier: USER_TIER,
          groupIndex: USER_GROUP_INDEX,
          strengthRating: 35,
          prestige: 1,
          budget: 10000,
          fanBase: 500,
          cityTier: 1,
          currentSeason: 1,
          kitPrimaryColor,
          kitSecondaryColor,
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
        userRoster.map((p, i) => ({
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
          traits: [...pickTraits(`${newPlaythrough.id}:user:${i}:${p.firstName}${p.lastName}`)],
        })),
      );

      // ── 3. AI rivals in user's group + full rosters ───────────────────
      // Only the user's tier-5 group gets per-player rosters. Other 26
      // divisions get lightweight clubs (strength_rating only).
      const aiSeeds = generateAiClubs({
        rng,
        count: AI_CLUBS_IN_USER_GROUP,
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
            tier: USER_TIER,
            groupIndex: USER_GROUP_INDEX,
            strengthRating: 35,
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
        return seed.roster.map((p, j) => ({
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
          velocidad: p.velocidad,
          resistencia: p.resistencia,
          agresividad: p.agresividad,
          calidad: p.calidad,
          salaryEurK: 1,
          contractStartWeek: 0,
          contractEndWeek: 76,
          traits: [...pickTraits(`${newPlaythrough.id}:ai${i}:${j}:${p.firstName}${p.lastName}`)],
        }));
      });
      if (aiPlayerRows.length > 0) await tx.insert(players).values(aiPlayerRows);

      // ── 4. League + full pyramid (27 divisions, ~496 clubs) ───────────
      const [league] = await tx
        .insert(leagues)
        .values({ playthroughId: newPlaythrough.id, name: 'Liga TSM', country: 'ES' })
        .returning({ id: leagues.id });

      // Build the full pyramid: spawns all 27 divisions + 482 AI clubs
      // (Tier 1-4 + Tier 5 groups 1-17) + fixtures + standings.
      // The user + 17 AI clubs in Tier 5 group 0 are added inside.
      await persistPyramid(tx, {
        leagueId: league.id,
        playthroughId: newPlaythrough.id,
        userClubId: newClub.id,
        userTier: USER_TIER,
        userGroupIndex: USER_GROUP_INDEX,
        rng,
        seasonStartWeek: SEASON_START_WEEK,
        excludeClubNames: new Set([clubName, ...aiSeeds.map((s) => s.name)]),
      });

      // Season objective for the player (persisted as a NOTIFY event so the
      // dashboard + end-of-season screen can read it).
      const objective = {
        kind: 'season_objective',
        seasonNumber: 1,
        target: 'permanencia',
        targetLabel: 'Permanencia (no quedar último)',
        targetRule: 'top_13_of_18',
      };

      // ── 7. WorldSnapshot + manager profile ───────────────────────────
      await tx.insert(worldSnapshots).values({
        playthroughId: newPlaythrough.id,
        week: 0,
        worldState: defaultWorldState(),
        delayedEffectsBuffer: [],
      });

      await tx.insert(managerProfiles).values({
        playthroughId: newPlaythrough.id,
        name: managerName,
        skills: initManagerSkills(),
      });

      // ── 7b. Initial staff (3 tier-1 hires so messages flow from week 1) ──
      await tx.insert(staff).values(
        (['groundskeeper', 'fitness_coach', 'head_coach'] as const).map((role) => ({
          playthroughId: newPlaythrough.id,
          clubId: newClub.id,
          role,
          qualityTier: 1,
          weeklyEurK: STAFF_WEEKLY_WAGE_EURK[1],
          name: INITIAL_STAFF_NAMES[role] ?? 'Staff inicial',
          hiredWeek: 0,
          status: 'active',
        })),
      );

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
          metadata: { kind: 'season_start', objective },
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
            slot: 'kit',
            brand: 'Pueblo Bakery',
            weeklyAmountEurK: 2,
            contractWeeks: 22,
            qualityDelta: 3,
            description: 'Panadería local, oferta conservadora pero estable.',
          },
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
            slot: 'kit',
            brand: 'Tienda Garcés',
            weeklyAmountEurK: 4,
            contractWeeks: 18,
            qualityDelta: 5,
            description: 'Cadena de electrodomésticos. Pagan bien pero contrato más corto.',
          },
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
            slot: 'kit',
            brand: 'Casinos Verdes',
            weeklyAmountEurK: 6,
            contractWeeks: 22,
            qualityDelta: -4,
            description: 'Oferta jugosa pero la afición no va a estar contenta.',
          },
        },
        // ── Stadium boards offers (multiple slots) ───────────────────────
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK + 3,
          season: 1,
          type: 'sponsor_offer',
          priority: 'STOP',
          status: 'pending',
          metadata: {
            kind: 'sponsor_offer',
            slot: 'stadium_boards',
            brand: 'Bar Lolo',
            weeklyAmountEurK: 1,
            contractWeeks: 22,
            qualityDelta: 1,
            description: 'Cartel pequeño en la valla. El bar de toda la vida.',
          },
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
            slot: 'stadium_boards',
            brand: 'Autoescuela Reyes',
            weeklyAmountEurK: 1,
            contractWeeks: 18,
            qualityDelta: 1,
            description: 'Autoescuela local, contrato a 18 semanas.',
          },
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
            slot: 'stadium_boards',
            brand: 'Pollos Esther',
            weeklyAmountEurK: 2,
            contractWeeks: 22,
            qualityDelta: 1,
            description: 'Asadero conocido. Pagan algo más por mejor visibilidad.',
          },
        },
        // ── Press room offer ─────────────────────────────────────────────
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK + 3,
          season: 1,
          type: 'sponsor_offer',
          priority: 'STOP',
          status: 'pending',
          metadata: {
            kind: 'sponsor_offer',
            slot: 'press_room',
            brand: 'Cervezas Cascada',
            weeklyAmountEurK: 2,
            contractWeeks: 22,
            qualityDelta: 2,
            description: 'Marca de la cerveza local detrás del director técnico en ruedas de prensa.',
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
          week: SEASON_START_WEEK + 34 - 1,
          season: 1,
          type: 'transfer_window_close',
          priority: 'NOTIFY',
          status: 'pending',
          metadata: { kind: 'transfer_window_close' },
        },
        {
          playthroughId: newPlaythrough.id,
          week: SEASON_START_WEEK + 34 - 1,
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
