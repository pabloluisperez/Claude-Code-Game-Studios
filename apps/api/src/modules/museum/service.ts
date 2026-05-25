/**
 * Museum service. Story TROPHIES-HISTORY-001.
 *
 * Aggregates the 5 categories of museum content + caches with 60s TTL.
 * Read-only — no writes anywhere in this module.
 */

import { museumDensity, museumObjectsCount } from '@smt/shared';
import * as repo from './repo.js';

export type MuseumContents = {
  trophies: repo.TrophyEntry[];
  banners: repo.BannerEntry[];
  legendTransfers: repo.LegendTransferEntry[];
  financialMilestones: repo.FinancialMilestoneEntry[];
  stadiumHistory: repo.StadiumHistoryEntry[];
  totalObjects: number;
  museumDensity: number;
};

export async function getMuseumContents(clubId: string): Promise<MuseumContents> {
  const [trophies, banners, legendTransfers, financialMilestones, stadiumHistory] =
    await Promise.all([
      repo.getTrophies(clubId),
      repo.getBanners(clubId),
      repo.getLegendTransfers(clubId),
      repo.getFinancialMilestones(clubId),
      repo.getStadiumHistory(clubId),
    ]);

  const totalObjects = museumObjectsCount({
    trophies: trophies.length,
    banners: banners.length,
    legendTransfers: legendTransfers.length,
    financialMilestones: financialMilestones.length,
    stadiumHistory: stadiumHistory.length,
  });

  return {
    trophies,
    banners,
    legendTransfers,
    financialMilestones,
    stadiumHistory,
    totalObjects,
    museumDensity: museumDensity(totalObjects),
  };
}

/* ------------------------------------------------------------------ */
/* In-memory cache (per-process). 60s TTL.                            */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { data: MuseumContents; expiresAt: number }>();
const TTL_MS = 60_000;

export async function getMuseumContentsCached(
  clubId: string,
): Promise<{ data: MuseumContents; cached: boolean }> {
  const hit = cache.get(clubId);
  if (hit && Date.now() < hit.expiresAt) {
    return { data: hit.data, cached: true };
  }
  const data = await getMuseumContents(clubId);
  cache.set(clubId, { data, expiresAt: Date.now() + TTL_MS });
  return { data, cached: false };
}

/** Invalidate cache for a specific club. Called from event hooks
 *  (match:end, season:end, stadium:item_complete). */
export function invalidateMuseumCache(clubId: string): void {
  cache.delete(clubId);
}

/** Test-only: clear all cached entries. */
export function _clearMuseumCacheForTests(): void {
  cache.clear();
}
