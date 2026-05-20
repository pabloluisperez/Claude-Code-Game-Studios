/**
 * TV Rights — passive contract panel + tv_auction / tv_midseason_offer resolution.
 *
 * Per ADR-019 + design/ux/tv-rights.md.
 *
 * Story: TVR-011 (UI)
 * Control Manifest: 2026-05-19
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
  db,
  tvContracts,
  managerProfiles,
  calendarEvents,
  playthroughs,
  clubs,
  seasons,
  leagues,
  eq,
  and,
  desc,
} from '@smt/db';
import {
  applyFanLoyaltyRejection,
  buildTVAuctionPayload,
  calculateTVRate,
  TVRangeError,
  XP_NACIONAL_SIGN,
  XP_REGIONAL_SIGN,
  type TVAuctionPayload,
  type TVDivision,
  type TVDurationSeasons,
  type TVMidseasonOfferPayload,
  type TVTier,
} from '@smt/shared';

interface TVContractView {
  id: string;
  tier: TVTier;
  durationSeasons: number;
  seasonInContract: number;
  weeklyRateEurK: number;
  divisionAtSigning: TVDivision;
  status: 'NONE' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  signedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
}

interface PendingTVEventView {
  id: string;
  type: 'tv_auction' | 'tv_midseason_offer';
  week: number;
  season: number;
  payload: TVAuctionPayload | TVMidseasonOfferPayload;
}

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');
  if (!activePlaythrough) return { hasPlaythrough: false as const };

  // Active contract (if any).
  const [contractRow] = await db
    .select()
    .from(tvContracts)
    .where(
      and(
        eq(tvContracts.playthroughId, activePlaythrough.id),
        eq(tvContracts.status, 'ACTIVE'),
      ),
    )
    .limit(1);

  // Last cancelled contract for this season (for State C panel rendering).
  const [latestContract] = await db
    .select()
    .from(tvContracts)
    .where(eq(tvContracts.playthroughId, activePlaythrough.id))
    .orderBy(desc(tvContracts.createdAt))
    .limit(1);

  // Pending tv_auction / tv_midseason_offer STOP events.
  const pendingTVEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, activePlaythrough.id),
        eq(calendarEvents.status, 'pending'),
      ),
    );
  const tvPending = pendingTVEvents.filter(
    (e) => e.type === 'tv_auction' || e.type === 'tv_midseason_offer',
  );

  // Current division (for sign action context).
  // Club.division is an enum: 'fifth' | 'fourth' | 'third' | 'second' | 'first'.
  // Map to TVDivision: 'first' → D1, anything else → D2 (MVP only models 2 tiers).
  const [club] = await db
    .select({ id: clubs.id, division: clubs.division })
    .from(clubs)
    .where(eq(clubs.id, activePlaythrough.clubId))
    .limit(1);

  let currentDivision: TVDivision = 'D2';
  if (club) {
    currentDivision = club.division === 'first' ? 'D1' : 'D2';
  }

  // Current season number (for sign action context).
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.playthroughId, activePlaythrough.id))
    .limit(1);
  let currentSeason = 1;
  if (league) {
    const [s] = await db
      .select({ seasonNumber: seasons.seasonNumber })
      .from(seasons)
      .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);
    if (s) currentSeason = s.seasonNumber;
  }

  // Manager fan_loyalty (for rejection consequence preview).
  const [profile] = await db
    .select({ fanLoyalty: managerProfiles.fanLoyalty })
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, activePlaythrough.id))
    .limit(1);

  const contractView: TVContractView | null = contractRow
    ? {
        id: contractRow.id,
        tier: contractRow.tier as TVTier,
        durationSeasons: contractRow.durationSeasons,
        seasonInContract: contractRow.seasonInContract,
        weeklyRateEurK: parseFloat(contractRow.weeklyRateEurK),
        divisionAtSigning: contractRow.divisionAtSigning as TVDivision,
        status: 'ACTIVE',
        signedAt: contractRow.signedAt ? contractRow.signedAt.toISOString() : null,
        cancelledAt: null,
        cancelledReason: null,
      }
    : null;

  const cancelledThisSeason =
    !contractView &&
    latestContract &&
    latestContract.season === currentSeason &&
    latestContract.status === 'CANCELLED'
      ? {
          tier: latestContract.tier as TVTier,
          cancelledAt: latestContract.cancelledAt?.toISOString() ?? null,
          cancelledReason: latestContract.cancelledReason,
        }
      : null;

  return {
    hasPlaythrough: true as const,
    contract: contractView,
    cancelledThisSeason,
    pendingTVEvents: tvPending.map(
      (e) =>
        ({
          id: e.id,
          type: e.type as 'tv_auction' | 'tv_midseason_offer',
          week: e.week,
          season: e.season,
          payload: e.metadata as TVAuctionPayload | TVMidseasonOfferPayload,
        }) satisfies PendingTVEventView,
    ),
    currentWeek: activePlaythrough.currentWeek,
    currentDivision,
    currentSeason,
    managerFanLoyalty: profile?.fanLoyalty ?? 0,
  };
};

export const actions: Actions = {
  /**
   * Sign a tv_auction offer.
   * Form fields: eventId, tier, durationSeasons.
   */
  sign: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const eventId = String(form.get('eventId') ?? '');
    const tier = String(form.get('tier') ?? '') as TVTier;
    const durationStr = String(form.get('durationSeasons') ?? '');
    const durationSeasons = Number(durationStr) as TVDurationSeasons;

    if (!eventId) return fail(400, { error: 'Falta eventId.' });
    if (!['LOCAL', 'REGIONAL', 'NACIONAL'].includes(tier)) {
      return fail(400, { error: 'Tier inválido.' });
    }
    if (![1, 2, 3].includes(durationSeasons)) {
      return fail(400, { error: 'Duración inválida.' });
    }

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    // Determine current division (enum mapping: 'first' → D1, else → D2).
    const [club] = await db
      .select({ id: clubs.id, division: clubs.division })
      .from(clubs)
      .where(eq(clubs.id, active.clubId))
      .limit(1);
    const currentDivision: TVDivision = club?.division === 'first' ? 'D1' : 'D2';

    // Current season.
    const [league] = await db
      .select()
      .from(leagues)
      .where(eq(leagues.playthroughId, active.id))
      .limit(1);
    let currentSeason = 1;
    if (league) {
      const [s] = await db
        .select({ seasonNumber: seasons.seasonNumber })
        .from(seasons)
        .where(and(eq(seasons.leagueId, league.id), eq(seasons.status, 'active')))
        .orderBy(desc(seasons.seasonNumber))
        .limit(1);
      if (s) currentSeason = s.seasonNumber;
    }

    // F-TV1 — TVRangeError mapped to fail(400).
    let rate: number;
    try {
      rate = calculateTVRate(tier, currentDivision, durationSeasons);
    } catch (err) {
      if (err instanceof TVRangeError) {
        return fail(400, { error: `Combinación ilegal: ${err.message}` });
      }
      throw err;
    }

    // Atomic: resolve event + ensure no active contract + insert contract.
    try {
      await db.transaction(async (tx) => {
        // Guard: no active contract.
        const [existing] = await tx
          .select()
          .from(tvContracts)
          .where(and(eq(tvContracts.playthroughId, active.id), eq(tvContracts.status, 'ACTIVE')))
          .limit(1);
        if (existing) {
          throw new Error('tv_contract_already_active');
        }

        // Guard: event exists and is not consumed.
        const [evt] = await tx
          .select()
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.id, eventId),
              eq(calendarEvents.playthroughId, active.id),
              eq(calendarEvents.type, 'tv_auction'),
            ),
          )
          .limit(1);
        if (!evt) throw new Error('tv_offer_not_found');
        if (evt.consumed) throw new Error('tv_offer_expired');

        // Resolve event.
        await tx
          .update(calendarEvents)
          .set({
            consumed: true,
            status: 'resolved',
            resolvedAt: new Date(),
            metadata: {
              ...(evt.metadata as Record<string, unknown>),
              resolvedChoice: { tier, durationSeasons },
            },
          })
          .where(eq(calendarEvents.id, eventId));

        // Insert contract.
        await tx.insert(tvContracts).values({
          playthroughId: active.id,
          season: currentSeason,
          tier,
          durationSeasons,
          seasonInContract: 1,
          weeklyRateEurK: rate.toFixed(2),
          divisionAtSigning: currentDivision,
          status: 'ACTIVE',
          signedAt: new Date(),
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      if (msg === 'tv_contract_already_active') {
        return fail(409, { error: 'Ya tienes un contrato TV activo.' });
      }
      if (msg === 'tv_offer_expired' || msg === 'tv_offer_not_found') {
        return fail(409, { error: 'Esta oferta ya no está disponible.' });
      }
      throw err;
    }

    // Note: XP grant to financial_acumen happens via manager-rpg in the next advance tick.
    // For an in-session signal, return the XP amount in the form result.
    let xpGranted = 0;
    if (tier === 'REGIONAL') xpGranted = XP_REGIONAL_SIGN;
    else if (tier === 'NACIONAL') xpGranted = XP_NACIONAL_SIGN;

    return { ok: true, signed: { tier, durationSeasons, weeklyRateEurK: rate, xpGranted } };
  },

  /**
   * Reject a tv_auction or tv_midseason_offer event.
   * Form fields: eventId.
   */
  reject: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const eventId = String(form.get('eventId') ?? '');
    if (!eventId) return fail(400, { error: 'Falta eventId.' });

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    let fanLoyaltyBefore = 0;
    let fanLoyaltyAfter = 0;
    try {
      await db.transaction(async (tx) => {
        const [evt] = await tx
          .select()
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.id, eventId),
              eq(calendarEvents.playthroughId, active.id),
            ),
          )
          .limit(1);
        if (!evt) throw new Error('tv_offer_not_found');
        if (evt.consumed) throw new Error('tv_offer_expired');
        if (evt.type !== 'tv_auction' && evt.type !== 'tv_midseason_offer') {
          throw new Error('tv_offer_wrong_type');
        }

        await tx
          .update(calendarEvents)
          .set({
            consumed: true,
            status: 'resolved',
            resolvedAt: new Date(),
            metadata: {
              ...(evt.metadata as Record<string, unknown>),
              resolvedChoice: 'reject',
            },
          })
          .where(eq(calendarEvents.id, eventId));

        const [profile] = await tx
          .select({ id: managerProfiles.id, fanLoyalty: managerProfiles.fanLoyalty })
          .from(managerProfiles)
          .where(eq(managerProfiles.playthroughId, active.id))
          .limit(1);
        if (profile) {
          fanLoyaltyBefore = profile.fanLoyalty;
          fanLoyaltyAfter = applyFanLoyaltyRejection(profile.fanLoyalty);
          await tx
            .update(managerProfiles)
            .set({ fanLoyalty: fanLoyaltyAfter })
            .where(eq(managerProfiles.id, profile.id));
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      if (msg === 'tv_offer_expired' || msg === 'tv_offer_not_found') {
        return fail(409, { error: 'Esta oferta ya no está disponible.' });
      }
      throw err;
    }

    return {
      ok: true,
      rejected: {
        fanLoyaltyBefore,
        fanLoyaltyAfter,
        delta: fanLoyaltyAfter - fanLoyaltyBefore,
      },
    };
  },
};

// Used only for the type system — buildTVAuctionPayload is used by the server-side
// auction generator (not in this UI route, but kept for type-safety of payload shape).
void buildTVAuctionPayload;
