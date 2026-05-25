/**
 * /stadium — close-up del estadio con UI de reformas v1.1 (Sprint 22).
 *
 * Story STADIUM-UPGRADES-008. Loads:
 *   - club state (name, cityTier, budget)
 *   - latest worldSnapshot stadium counters (for F1 stadium_visual_level)
 *   - stadium catalog with per-item state from /api/stadium/catalog
 *
 * Form actions:
 *   - buy:    POST /api/stadium/buy
 *   - cancel: POST /api/stadium/cancel
 *
 * The visual_level is computed via F1 from packages/shared and drives sprite
 * selection (replaces the stop-gap tier→v mapping shipped in commit 6edca6b).
 */

import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  clubs,
  worldSnapshots,
  loadAdvanceContext,
  eq,
  desc,
  stadiumUpgradeItems,
} from '@smt/db';
import {
  stadiumVisualLevel,
  infrastructureLevel,
  stadiumCapacity,
  type StadiumItemTier,
} from '@smt/shared';
import { pitchSurface } from '$lib/canvas/tier-derivation';

type CatalogItemState = {
  slug: string;
  track: string;
  tier: number;
  name: string;
  description: string;
  state: 'Locked' | 'Available' | 'Queued' | 'InProgress' | 'Complete';
  weeksRemaining?: number;
};

type CatalogPayload = {
  items: CatalogItemState[];
  active: {
    id: string;
    itemSlug: string;
    weeksRemaining: number | null;
    durationWeeks: number;
  } | null;
};

async function fetchCatalogState(clubId: string, fetchImpl: typeof fetch): Promise<CatalogPayload> {
  const res = await fetchImpl(`/api/stadium/catalog?clubId=${encodeURIComponent(clubId)}`);
  if (!res.ok) {
    return { items: [], active: null };
  }
  return (await res.json()) as CatalogPayload;
}

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (!locals.user) throw redirect(303, '/login');

  const ctx = await loadAdvanceContext(db, locals.user.id);
  if (!ctx) {
    return { hasPlaythrough: false, club: null, stadium: null, catalog: null };
  }

  const [club] = await db
    .select({
      id: clubs.id,
      name: clubs.name,
      city: clubs.city,
      cityTier: clubs.cityTier,
      division: clubs.division,
      kitPrimaryColor: clubs.kitPrimaryColor,
      kitSecondaryColor: clubs.kitSecondaryColor,
      budget: clubs.budget,
    })
    .from(clubs)
    .where(eq(clubs.id, ctx.playthrough.clubId));

  // Read latest snapshot counters (drive F1 + F3 + F5) AND financial_balance
  // (source-of-truth for spendable balance per Pablo 2026-05-25 — supersedes
  // clubs.budget which is an orphan tracker).
  const [snapshot] = await db
    .select({
      stadiumUpgradeCount: worldSnapshots.stadiumUpgradeCount,
      trainingFacilityLevel: worldSnapshots.trainingFacilityLevel,
      youthAcademyLevel: worldSnapshots.youthAcademyLevel,
      worldState: worldSnapshots.worldState,
    })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, ctx.playthrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const financialBalance = snapshot
    ? Number((snapshot.worldState as Record<string, number>)['financial_balance'] ?? club?.budget ?? 0)
    : club?.budget ?? 0;
  const stadiumReformCostWeekly = snapshot
    ? Number((snapshot.worldState as Record<string, number>)['stadium_reform_cost_weekly'] ?? 0)
    : 0;

  // Count completed Gradas items per tier for F5 stadium_capacity.
  const completed = await db
    .select({ tier: stadiumUpgradeItems.tier, track: stadiumUpgradeItems.track })
    .from(stadiumUpgradeItems)
    .where(eq(stadiumUpgradeItems.clubId, ctx.playthrough.clubId));
  const completedGradasByTier: Record<StadiumItemTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let completedGradas = 0;
  let completedPitch = 0;
  let completedServicios = 0;
  for (const row of completed) {
    if (row.track === 'gradas') {
      completedGradas++;
      completedGradasByTier[row.tier as StadiumItemTier]++;
    } else if (row.track === 'pitch') {
      completedPitch++;
    } else if (row.track === 'servicios') {
      completedServicios++;
    }
  }

  const visualLevel = stadiumVisualLevel({
    gradas: completedGradas,
    pitch: completedPitch,
    servicios: completedServicios,
  });
  const infra = infrastructureLevel({
    stadium_upgrade_count: snapshot?.stadiumUpgradeCount ?? 0,
    training_facility_level: snapshot?.trainingFacilityLevel ?? 0,
    youth_academy_level: snapshot?.youthAcademyLevel ?? 0,
  });
  const division = (club?.division ?? 'second') === 'first' ? 'D1' : 'D2';
  const capacity = stadiumCapacity(division, completedGradasByTier);

  const catalogPayload = club ? await fetchCatalogState(club.id, fetch) : { items: [], active: null };

  const tier = (club?.cityTier ?? 1) as 1 | 2 | 3 | 4;

  return {
    hasPlaythrough: true,
    club: club ?? null,
    stadium: {
      tier,
      visualLevel,
      capacity,
      infrastructureLevel: infra,
      pitchSurface: pitchSurface(infra),
      budget: financialBalance,
      reformCostThisWeek: stadiumReformCostWeekly,
    },
    catalog: catalogPayload,
  };
};

export const actions = {
  buy: async ({ request, fetch, locals }) => {
    if (!locals.user) return fail(401, { error: 'unauthorized' });
    const data = await request.formData();
    const clubId = String(data.get('clubId') ?? '');
    const itemSlug = String(data.get('itemSlug') ?? '');
    const acceptRisk = data.get('acceptRisk') === 'true';

    const res = await fetch('/api/stadium/buy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clubId, itemSlug, acceptRisk }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return fail(res.status, { action: 'buy', error: body.error ?? 'unknown', itemSlug });
    }
    return { action: 'buy' as const, success: true, ...body };
  },

  cancel: async ({ request, fetch, locals }) => {
    if (!locals.user) return fail(401, { error: 'unauthorized' });
    const data = await request.formData();
    const clubId = String(data.get('clubId') ?? '');
    const itemId = String(data.get('itemId') ?? '');

    const res = await fetch('/api/stadium/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clubId, itemId }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return fail(res.status, { action: 'cancel', error: body.error ?? 'unknown' });
    }
    return { action: 'cancel' as const, success: true, ...body };
  },
} satisfies Actions;
