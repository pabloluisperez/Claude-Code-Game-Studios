import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, players, playthroughs, staff, seasons, leagues, eq, asc, desc, and, sql } from '@smt/db';

const TRAINING_FOCI = ['velocidad', 'resistencia', 'agresividad', 'calidad'] as const;
type TrainingFocus = (typeof TRAINING_FOCI)[number];

const TIER_TO_TRAINEE_CAP: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 3 };

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

  // Fitness coach (Pablo 2026-05-25 individual training cap).
  const [fitnessCoach] = await db
    .select({ id: staff.id, name: staff.name, qualityTier: staff.qualityTier })
    .from(staff)
    .where(
      and(
        eq(staff.playthroughId, activePlaythrough.id),
        eq(staff.role, 'fitness_coach'),
        eq(staff.status, 'active'),
      ),
    )
    .limit(1);

  const trainingCap = fitnessCoach ? (TIER_TO_TRAINEE_CAP[fitnessCoach.qualityTier] ?? 1) : 0;

  // Active season window — used to express contracts in temporadas (Pablo 2026-05-26).
  const [activeSeason] = await db
    .select({ startWeek: seasons.startWeek, endWeek: seasons.endWeek })
    .from(seasons)
    .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
    .where(and(eq(leagues.playthroughId, activePlaythrough.id), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);
  // Season length (weeks) including pretemporada gap; fallback 39.
  const seasonLengthWeeks =
    activeSeason ? (activeSeason.endWeek - activeSeason.startWeek + 1) + 5 : 39;
  const seasonEndWeek = activeSeason?.endWeek ?? activePlaythrough.currentWeek;

  return {
    hasPlaythrough: true as const,
    players: rows,
    currentWeek: activePlaythrough.currentWeek,
    trainingIntensity: pt?.trainingIntensity ?? 50,
    fitnessCoach: fitnessCoach ?? null,
    trainingCap,
    seasonEndWeek,
    seasonLengthWeeks,
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
  toggleSale: async ({ request, fetch, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const data = await request.formData();
    const playerId = String(data.get('playerId') ?? '');
    const listed = data.get('listed') === 'true';
    const [active] = await db
      .select({ clubId: playthroughs.clubId })
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const res = await fetch('/api/scouting/list-for-sale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clubId: active.clubId, playerId, listed }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return fail(res.status, { action: 'toggleSale', error: body.error ?? 'unknown' });
    return { action: 'toggleSale' as const, listed, playerId };
  },

  setTrainingFocus: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const form = await request.formData();
    const playerId = String(form.get('playerId') ?? '');
    const focusRaw = String(form.get('focus') ?? '');
    const focus: TrainingFocus | null = TRAINING_FOCI.includes(focusRaw as TrainingFocus)
      ? (focusRaw as TrainingFocus)
      : null;

    const [active] = await db
      .select({ id: playthroughs.id, clubId: playthroughs.clubId })
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    // Validate the player belongs to this club.
    const [target] = await db
      .select({ id: players.id, clubId: players.clubId })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    if (!target || target.clubId !== active.clubId) {
      return fail(403, { error: 'Ese jugador no pertenece a tu plantilla.' });
    }

    // If clearing (focus=null) → always allowed.
    if (focus === null) {
      await db
        .update(players)
        .set({ trainingFocus: null })
        .where(eq(players.id, playerId));
      return { action: 'setTrainingFocus' as const, playerId, focus: null };
    }

    // If setting → check fitness_coach cap.
    const [fitnessCoach] = await db
      .select({ qualityTier: staff.qualityTier })
      .from(staff)
      .where(
        and(
          eq(staff.playthroughId, active.id),
          eq(staff.role, 'fitness_coach'),
          eq(staff.status, 'active'),
        ),
      )
      .limit(1);

    if (!fitnessCoach) {
      return fail(400, {
        error: 'Necesitas contratar un preparador físico antes de asignar entrenamiento individual.',
      });
    }

    const cap = TIER_TO_TRAINEE_CAP[fitnessCoach.qualityTier] ?? 1;

    const [{ count: assignedCount = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(players)
      .where(
        and(
          eq(players.clubId, active.clubId),
          sql`${players.trainingFocus} IS NOT NULL`,
        ),
      );

    // If the target already had a focus, swapping is allowed (no count increase).
    const [current] = await db
      .select({ trainingFocus: players.trainingFocus })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    const isNewAssignment = current?.trainingFocus == null;

    if (isNewAssignment && Number(assignedCount) >= cap) {
      return fail(400, {
        error: `Tu preparador físico tier ${fitnessCoach.qualityTier} sólo puede entrenar a ${cap} jugador${cap === 1 ? '' : 'es'} a la vez.`,
      });
    }

    await db
      .update(players)
      .set({ trainingFocus: focus })
      .where(eq(players.id, playerId));

    return { action: 'setTrainingFocus' as const, playerId, focus };
  },

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
