/**
 * Staff hub — view active staff per role + hire/upgrade form action.
 *
 * Story: Staff hiring follow-up (STAFF-SYSTEM-005)
 * Control Manifest: 2026-05-19
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  staff,
  managerProfiles,
  playthroughs,
  eq,
  and,
  desc,
} from '@smt/db';
import {
  STAFF_ROLES,
  STAFF_WEEKLY_WAGE_EURK,
  DEFAULT_DOMAIN_BY_ROLE,
  getMaxHirableStaffQuality,
  type ManagerSkills,
  type StaffRole,
  type StaffQualityTier,
} from '@smt/shared';

const ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  groundskeeper: 'Jardinero',
  fitness_coach: 'Preparador físico',
  commercial_director: 'Director comercial',
  scouting_director: 'Director de scouting',
  finance_director: 'Director financiero',
  head_coach: 'Segundo entrenador',
};

const NAME_POOL = [
  'Carlos Méndez', 'Ana Robles', 'Javier Soto', 'Lucía Vázquez',
  'Pedro Iglesias', 'Marta Aguilar', 'Roberto Jiménez', 'Elena Castaño',
  'Diego Romero', 'Sara Pinilla', 'Antonio Fernández', 'Patricia Galindo',
  'Manuel Cabrera', 'Beatriz Salgado', 'Luis Pérez', 'Cristina Vega',
  'Andrés Cordero', 'Marina Fuentes',
];

function pickName(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return NAME_POOL[h % NAME_POOL.length]!;
}

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');
  if (!activePlaythrough) return { hasPlaythrough: false as const };

  const [profile] = await db
    .select()
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, activePlaythrough.id))
    .limit(1);

  const skills = (profile?.skills as ManagerSkills) ?? null;
  const reputationLevel = skills?.reputation.level ?? 1;
  const maxHirableTier = getMaxHirableStaffQuality(reputationLevel);

  const activeStaff = await db
    .select()
    .from(staff)
    .where(
      and(
        eq(staff.playthroughId, activePlaythrough.id),
        eq(staff.status, 'active'),
      ),
    )
    .orderBy(staff.role);

  return {
    hasPlaythrough: true as const,
    reputationLevel,
    maxHirableTier,
    activeStaff,
    roles: STAFF_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      domain: DEFAULT_DOMAIN_BY_ROLE[role],
    })),
    wagesByTier: STAFF_WEEKLY_WAGE_EURK,
  };
};

export const actions: Actions = {
  hire: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const role = String(form.get('role') ?? '') as StaffRole;
    const tierRaw = Number(form.get('tier') ?? 0);

    if (!STAFF_ROLES.includes(role)) {
      return fail(400, { error: 'Rol inválido.' });
    }
    if (![1, 2, 3].includes(tierRaw)) {
      return fail(400, { error: 'Tier inválido.' });
    }
    const tier = tierRaw as StaffQualityTier;

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const [profile] = await db
      .select()
      .from(managerProfiles)
      .where(eq(managerProfiles.playthroughId, active.id))
      .limit(1);
    if (!profile) return fail(400, { error: 'Perfil de mánager no encontrado.' });

    const skills = profile.skills as ManagerSkills;
    const maxTier = getMaxHirableStaffQuality(skills.reputation.level);
    if (tier > maxTier) {
      return fail(403, {
        error: `Tu reputación nivel ${skills.reputation.level} solo permite contratar staff tier ${maxTier}.`,
      });
    }

    await db.transaction(async (tx) => {
      // Dismiss any current active staff in this role first (upgrade pattern).
      await tx
        .update(staff)
        .set({ status: 'dismissed' })
        .where(
          and(
            eq(staff.playthroughId, active.id),
            eq(staff.role, role),
            eq(staff.status, 'active'),
          ),
        );

      await tx.insert(staff).values({
        playthroughId: active.id,
        clubId: active.clubId,
        role,
        qualityTier: tier,
        weeklyEurK: STAFF_WEEKLY_WAGE_EURK[tier],
        name: pickName(`${active.id}:${role}:${tier}`),
        hiredWeek: active.currentWeek,
        status: 'active',
      });
    });

    return { ok: true, hired: { role, tier } };
  },

  dismiss: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const staffId = String(form.get('staffId') ?? '');
    if (!staffId) return fail(400, { error: 'Falta staffId.' });

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    await db
      .update(staff)
      .set({ status: 'dismissed' })
      .where(and(eq(staff.id, staffId), eq(staff.playthroughId, active.id)));

    return { ok: true };
  },
};
