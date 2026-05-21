/**
 * /stadium — close-up del estadio con UI de reformas.
 *
 * v1.1 Sprint 22+ (post-split de /stadium → /city).
 *
 * Pablo decision 2026-05-21: la sección "Estadio" muestra el edificio en
 * grande para hacer reformas. La sección "Ciudad" (ahora en /city) tiene
 * la vista isométrica completa; click en el tile del estadio navega aquí.
 *
 * En esta primera versión sólo cargamos el estado actual (capacity, pitch,
 * infrastructure). El catálogo de reformas (upgrades schema + UI de
 * compra) llega en Sprint 23+ una vez se diseñe stadium-upgrades.md.
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, clubs, worldSnapshots, loadAdvanceContext, eq, desc } from '@smt/db';
import { pitchSurface } from '$lib/canvas/tier-derivation';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(303, '/login');

  const ctx = await loadAdvanceContext(db, locals.user.id);
  if (!ctx) {
    return { hasPlaythrough: false, club: null, stadium: null };
  }

  const [club] = await db
    .select({
      name: clubs.name,
      city: clubs.city,
      cityTier: clubs.cityTier,
      kitPrimaryColor: clubs.kitPrimaryColor,
      kitSecondaryColor: clubs.kitSecondaryColor,
      budget: clubs.budget,
    })
    .from(clubs)
    .where(eq(clubs.id, ctx.playthrough.clubId));

  const [snapshot] = await db
    .select({ worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, ctx.playthrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const infraLevel = snapshot
    ? Number((snapshot.worldState as Record<string, number>)['infrastructure_level'] ?? 0)
    : 0;

  // Capacity estimation per tier (until stadium-upgrades.md formalises).
  const capacityByTier: Record<1 | 2 | 3 | 4, number> = {
    1: 500,
    2: 2000,
    3: 8000,
    4: 25000,
  };
  const tier = (club?.cityTier ?? 1) as 1 | 2 | 3 | 4;

  return {
    hasPlaythrough: true,
    club: club ?? null,
    stadium: {
      tier,
      capacity: capacityByTier[tier],
      infrastructureLevel: infraLevel,
      pitchSurface: pitchSurface(infraLevel),
      budget: club?.budget ?? 0,
    },
  };
};
