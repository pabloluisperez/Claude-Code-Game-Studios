/**
 * /stadium route — v1.1 Sprint 20 + 22.
 *
 * Loads the slim CanvasWorldView from the current playthrough's latest
 * world snapshot. Derives city-progression tier + day-night/weather from
 * pure functions (no schema change required).
 *
 * Per ADR-021: data flows server → component, NEVER mutated client-side.
 * Per ADR-024: query param `?view=text` triggers DOM-only fallback view
 * (same data, no canvas).
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  db,
  worldSnapshots,
  playthroughs,
  clubs,
  loadAdvanceContext,
  eq,
  desc,
} from '@smt/db';
import { derivePresentationState } from '@smt/shared';
import { deriveTier } from '$lib/canvas/tier-derivation';
import { EMPTY_TIER_HISTORY, type TierHistory } from '$lib/canvas/types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/login');

  const view = url.searchParams.get('view');
  const useTextFallback = view === 'text';

  const ctx = await loadAdvanceContext(db, locals.user.id);
  if (!ctx) {
    return {
      hasPlaythrough: false,
      useTextFallback,
      worldView: null,
      derived: null,
      meta: null,
    };
  }

  // Latest snapshot for this playthrough
  const [snapshot] = await db
    .select({
      week: worldSnapshots.week,
      worldState: worldSnapshots.worldState,
    })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, ctx.playthrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  // currentDayOfSeason and currentWeek give us "now" for the derivation.
  const currentDay = ctx.playthrough.currentDayOfSeason ?? ctx.playthrough.currentWeek * 7;
  const presentation = derivePresentationState({
    playthroughId: ctx.playthrough.id,
    week: ctx.playthrough.currentWeek,
    dayOfSeason: currentDay,
  });

  const [club] = await db
    .select({
      name: clubs.name,
      city: clubs.city,
      cityTier: clubs.cityTier,
      division: clubs.division,
      prestige: clubs.prestige,
      fanBase: clubs.fanBase,
      currentSeason: clubs.currentSeason,
    })
    .from(clubs)
    .where(eq(clubs.id, ctx.playthrough.clubId));

  // v1.1 Sprint 23: derive tier from WorldState + tier history (anti-yo-yo).
  // Falls back to club.cityTier if anything is missing (legacy playthroughs
  // pre-v1.1, fresh sessions, etc.).
  const tierHistory =
    (ctx.playthrough as { tierHistory?: TierHistory | null }).tierHistory ??
    EMPTY_TIER_HISTORY;
  const balanceK = snapshot
    ? Number(
        (snapshot.worldState as Record<string, number>)['financial_balance'] ?? 0,
      )
    : 0;
  const derivedTierResult = club
    ? deriveTier(
        {
          prestige: club.prestige,
          financialBalanceK: balanceK,
          fanBase: club.fanBase,
          currentSeason: club.currentSeason,
          division: club.division,
        },
        tierHistory,
      )
    : { tier: 1 as 1 | 2 | 3 | 4 };

  const tier = derivedTierResult.tier;

  // Crowd density only matters if a fixture is live (placeholder NULL).
  const liveFixture = null as null | { crowdDensity: number };

  return {
    hasPlaythrough: true,
    useTextFallback,
    worldView: {
      tier,
      currentTimeOfDay: presentation.currentTimeOfDay,
      weather: presentation.weather,
      infrastructureLevel: snapshot
        ? Number((snapshot.worldState as Record<string, number>)['infrastructure_level'] ?? 0)
        : 0,
      ...(liveFixture !== null ? { liveFixture } : {}),
    },
    derived: {
      week: ctx.playthrough.currentWeek,
      dayOfSeason: currentDay,
      clubName: club?.name ?? 'Mi club',
      clubCity: club?.city ?? '—',
      division: club?.division ?? 'fifth',
    },
    meta: {
      // Per ADR-024: link to the alternate view
      alternateView: useTextFallback ? '/stadium' : '/stadium?view=text',
    },
  };
};
