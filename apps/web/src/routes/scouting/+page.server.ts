/**
 * /scouting — v1.1 minimal slice (Sprint 24).
 *
 * Lists the visible player pool for the active playthrough's club + provides
 * scout / deep-scout actions. v1.1 deferrals: free agents, offer flow,
 * counter-offer auction, AI club rotation worker — all v1.2+.
 */

import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, clubs, players, transferOffers, loadAdvanceContext, eq, and } from '@smt/db';

type PoolEntry = {
  id: string;
  name: string;
  age: number;
  position: string;
  currentClub: string | null;
  contractStatus: string;
  visibilityTier: 0 | 1 | 2 | 3;
  ovrBand?: string;
  transferValueBand?: string;
  ovrEstimate?: number;
  transferValueEstimate?: number;
  moraleBand?: string;
  ovrExact?: number;
  transferValueExact?: number;
  moraleExact?: number;
  fitnessExact?: number;
  recentForm?: number;
  clubName: string | null;
};

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (!locals.user) throw redirect(303, '/login');

  const ctx = await loadAdvanceContext(db, locals.user.id);
  if (!ctx) {
    return { hasPlaythrough: false, club: null, pool: [] as PoolEntry[], transferWindowOpen: false };
  }

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, division: clubs.division })
    .from(clubs)
    .where(eq(clubs.id, ctx.playthrough.clubId));

  let pool: PoolEntry[] = [];
  let transferWindowOpen = false;
  if (club) {
    try {
      const res = await fetch(
        `/api/scouting/market?clubId=${encodeURIComponent(club.id)}&currentWeek=${ctx.playthrough.currentWeek}`,
      );
      if (res.ok) {
        const body = (await res.json()) as { pool: PoolEntry[]; transferWindowOpen: boolean };
        pool = body.pool;
        transferWindowOpen = body.transferWindowOpen;
      }
    } catch {
      // Tolerate transient API errors — empty pool renders gracefully.
    }
  }

  // Own roster (for the "compare with mine" panel — Pablo 2026-05-25).
  const ownRoster = club
    ? await db
        .select({
          id: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          position: players.position,
          skill: players.skill,
        })
        .from(players)
        .where(eq(players.clubId, club.id))
    : [];

  // Incoming offers (Pablo 2026-05-25 sell-own-players flow).
  const incomingOffers = club
    ? await db
        .select({
          offerId: transferOffers.id,
          playerId: transferOffers.playerId,
          buyerClubId: transferOffers.buyerClubId,
          feeEurK: transferOffers.feeEurK,
          createdAt: transferOffers.createdAt,
          playerFirstName: players.firstName,
          playerLastName: players.lastName,
          playerPosition: players.position,
          playerSkill: players.skill,
          buyerClubName: clubs.name,
        })
        .from(transferOffers)
        .innerJoin(players, eq(players.id, transferOffers.playerId))
        .innerJoin(clubs, eq(clubs.id, transferOffers.buyerClubId))
        .where(
          and(
            eq(transferOffers.sellerClubId, club.id),
            eq(transferOffers.status, 'pending'),
          ),
        )
    : [];

  return { hasPlaythrough: true, club: club ?? null, pool, ownRoster, incomingOffers, transferWindowOpen };
};

export const actions = {
  scout: async ({ request, fetch, locals }) => {
    if (!locals.user) return fail(401, { error: 'unauthorized' });
    const data = await request.formData();
    const clubId = String(data.get('clubId') ?? '');
    const playerId = String(data.get('playerId') ?? '');
    const actionType = String(data.get('actionType') ?? 'scout');

    const res = await fetch('/api/scouting/scout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clubId, playerId, actionType }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return fail(res.status, { action: 'scout', error: body.error ?? 'unknown', playerId });
    }
    return { action: 'scout' as const, success: true, ...body };
  },

  respondOffer: async ({ request, fetch, locals }) => {
    if (!locals.user) return fail(401, { error: 'unauthorized' });
    const data = await request.formData();
    const clubId = String(data.get('clubId') ?? '');
    const offerId = String(data.get('offerId') ?? '');
    const action = String(data.get('responseAction') ?? '') as 'accept' | 'reject';

    const res = await fetch('/api/scouting/respond-offer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clubId, offerId, action }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return fail(res.status, { action: 'respondOffer', error: body.error ?? 'unknown', offerId });
    }
    return { action: 'respondOffer' as const, success: true, offerId, ...body };
  },

  offer: async ({ request, fetch, locals }) => {
    if (!locals.user) return fail(401, { error: 'unauthorized' });
    const data = await request.formData();
    const clubId = String(data.get('clubId') ?? '');
    const playerId = String(data.get('playerId') ?? '');
    const feeEurK = Number(data.get('feeEurK') ?? 0);
    const wageOfferEurKWeek = Number(data.get('wageOfferEurKWeek') ?? 0);
    const contractWeeks = Number(data.get('contractWeeks') ?? 52);

    const ctxLocal = await loadAdvanceContext(db, locals.user.id);
    const currentWeek = ctxLocal?.playthrough.currentWeek ?? 0;

    const res = await fetch('/api/scouting/offer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubId,
        playerId,
        feeEurK,
        wageOfferEurKWeek,
        contractWeeks,
        currentWeek,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return fail(res.status, { action: 'offer', error: body.error ?? 'unknown', playerId });
    }
    return { action: 'offer' as const, success: true, ...body };
  },
} satisfies Actions;
