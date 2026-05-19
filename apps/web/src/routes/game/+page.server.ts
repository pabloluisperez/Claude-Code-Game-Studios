/**
 * Onboarding hub — list user's playthroughs + form action to create a new career.
 *
 * The "create career" action bootstraps everything a new MVP run needs:
 *   1. club row (manager = current user, division: fifth)
 *   2. playthrough row (links user ↔ club, currentWeek = 0)
 *   3. 25-player roster via @smt/shared world-gen (deterministic PRNG seeded
 *      by playthrough id)
 *   4. initial worldSnapshot at week 0 with defaultWorldState
 *   5. manager profile (5 skills at level 1, 0 XP)
 *
 * Story: Onboarding (HUD-UI follow-up)
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
  eq,
  desc,
} from '@smt/db';
import {
  defaultWorldState,
  generateRoster,
  initManagerSkills,
  createSeededRng,
} from '@smt/shared';

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
        .values({
          userId,
          clubId: newClub.id,
          currentWeek: 0,
        })
        .returning({ id: playthroughs.id });

      const rng = createSeededRng(newPlaythrough.id);
      const roster = generateRoster({
        ctx: {
          rng,
          currentWeek: 0,
          hasMatchThisWeek: false,
          prevState: defaultWorldState(),
        },
        clubBaseSkill: 50,
        clubSlug: clubName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        currentWeek: 0,
      });

      if (roster.length > 0) {
        await tx.insert(players).values(
          roster.map((p) => ({
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
            // Default contract: 2 seasons (76 weeks) at a flat starter wage.
            salaryEurK: 2,
            contractStartWeek: 0,
            contractEndWeek: 76,
          })),
        );
      }

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

      return newPlaythrough.id;
    });

    throw redirect(303, `/dashboard?new=${newPlaythroughId}`);
  },
};
