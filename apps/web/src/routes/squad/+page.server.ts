import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, players, playthroughs, eq, asc, desc } from '@smt/db';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return {
      hasPlaythrough: false as const,
      players: [],
      currentWeek: 0,
      trainingIntensity: 50,
    };
  }

  const rows = await db
    .select()
    .from(players)
    .where(eq(players.clubId, activePlaythrough.clubId))
    .orderBy(asc(players.position), asc(players.lastName));

  const [pt] = await db
    .select({ trainingIntensity: playthroughs.trainingIntensity })
    .from(playthroughs)
    .where(eq(playthroughs.id, activePlaythrough.id))
    .limit(1);

  return {
    hasPlaythrough: true as const,
    players: rows,
    currentWeek: activePlaythrough.currentWeek,
    trainingIntensity: pt?.trainingIntensity ?? 50,
  };
};

/**
 * Bucket → cascade-engine training_intensity index.
 * Mirrors the prototype's INTENSITY_BUCKETS.
 */
const BUCKET_TO_INDEX: Readonly<Record<string, number>> = {
  descanso: 10,
  suave: 30,
  normal: 50,
  fuerte: 70,
  brutal: 90,
};

export const actions: Actions = {
  setIntensity: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const bucket = String(form.get('bucket') ?? '');
    const intensity = BUCKET_TO_INDEX[bucket];

    if (intensity === undefined) {
      return fail(400, { error: 'Bucket de intensidad inválido.' });
    }

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);

    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    await db
      .update(playthroughs)
      .set({ trainingIntensity: intensity, updatedAt: new Date() })
      .where(eq(playthroughs.id, active.id));

    return { ok: true, intensity, bucket };
  },
};
