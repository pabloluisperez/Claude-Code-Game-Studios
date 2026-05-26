/**
 * /lineup — manual XI selection.
 *
 * Pablo 2026-05-25: "y la opción de elegir el 11 titular?"
 *
 * Loads the active playthrough's roster and the saved starting_lineup_player_ids
 * + preferred_formation. Action `save` writes back the chosen 11.
 *
 * Validation rules (server-side):
 *   - Must select exactly 11 players
 *   - Must include at least 1 GK
 *   - All player IDs must belong to this club
 *
 * If validation fails, returns fail() with a Spanish error message.
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, players, clubs, eq, asc } from '@smt/db';

const VALID_FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '5-3-2'] as const;
type Formation = (typeof VALID_FORMATIONS)[number];

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return {
      hasPlaythrough: false as const,
      players: [],
      startingLineupIds: [] as string[],
      preferredFormation: '4-4-2' as Formation,
    };
  }

  const rows = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      position: players.position,
      skill: players.skill,
      velocidad: players.velocidad,
      resistencia: players.resistencia,
      agresividad: players.agresividad,
      calidad: players.calidad,
      fitness: players.fitness,
      morale: players.morale,
      form: players.form,
      suspendedMatchesRemaining: players.suspendedMatchesRemaining,
      injuredUntilWeek: players.injuredUntilWeek,
      availability: players.availability,
    })
    .from(players)
    .where(eq(players.clubId, activePlaythrough.clubId))
    .orderBy(asc(players.position), asc(players.lastName));

  const [club] = await db
    .select({
      ids: clubs.startingLineupPlayerIds,
      formation: clubs.preferredFormation,
      instruction: clubs.defaultMatchInstruction,
    })
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId));

  return {
    hasPlaythrough: true as const,
    players: rows,
    currentWeek: activePlaythrough.currentWeek,
    startingLineupIds: (club?.ids ?? []) as string[],
    preferredFormation: (club?.formation ?? '4-4-2') as Formation,
    instruction: (club?.instruction ?? 'HOLD_SHAPE') as 'PRESS_HIGH' | 'HOLD_SHAPE' | 'COUNTER',
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const form = await request.formData();

    const idsRaw = form.getAll('starterIds').map((v) => String(v));
    const formation = String(form.get('formation') ?? '4-4-2') as Formation;
    const instruction = String(form.get('instruction') ?? 'HOLD_SHAPE') as 'PRESS_HIGH' | 'HOLD_SHAPE' | 'COUNTER';
    if (!VALID_FORMATIONS.includes(formation)) {
      return fail(400, { error: `Formación inválida: ${formation}` });
    }
    if (!['PRESS_HIGH', 'HOLD_SHAPE', 'COUNTER'].includes(instruction)) {
      return fail(400, { error: `Instrucción inválida: ${instruction}` });
    }

    // Look up the active playthrough — can't import from $lib/server here as the
    // pattern depends on auth + playthrough resolution; replicate the squad pattern.
    const { playthroughs, desc } = await import('@smt/db');
    const [active] = await db
      .select({ id: playthroughs.id, clubId: playthroughs.clubId })
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    if (idsRaw.length !== 11) {
      return fail(400, {
        error: `Debes seleccionar exactamente 11 jugadores (seleccionaste ${idsRaw.length}).`,
      });
    }

    // Validate that all selected IDs belong to this club and at least 1 is GK.
    const rows = await db
      .select({ id: players.id, position: players.position })
      .from(players)
      .where(eq(players.clubId, active.clubId));
    const rosterMap = new Map(rows.map((r) => [r.id, r.position]));
    let gkCount = 0;
    for (const id of idsRaw) {
      const pos = rosterMap.get(id);
      if (!pos) {
        return fail(400, { error: `Jugador no pertenece a tu plantilla (id: ${id}).` });
      }
      if (pos === 'GK') gkCount++;
    }
    if (gkCount < 1) {
      return fail(400, { error: 'Debes incluir al menos 1 portero (GK) en el XI.' });
    }

    await db
      .update(clubs)
      .set({
        startingLineupPlayerIds: idsRaw,
        preferredFormation: formation,
        defaultMatchInstruction: instruction,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, active.clubId));

    return { ok: true, count: idsRaw.length, formation, instruction };
  },

  clear: async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const { playthroughs, desc } = await import('@smt/db');
    const [active] = await db
      .select({ clubId: playthroughs.clubId })
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    await db
      .update(clubs)
      .set({ startingLineupPlayerIds: null, updatedAt: new Date() })
      .where(eq(clubs.id, active.clubId));

    return { ok: true, cleared: true };
  },
};
