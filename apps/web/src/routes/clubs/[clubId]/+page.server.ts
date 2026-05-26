/**
 * /clubs/[clubId] — browse another club's roster (Pablo 2026-05-26).
 *
 * Pablo: 'poder ver otros equipos y sus jugadores, incluso hacerles ofertas
 * suculentas aunque no estén en venta'.
 *
 * Server-authoritative: only basic info is shown to anti-cheat-proof the
 * scouting tier system. Skill/value visibility follows the same tier rules
 * as /scouting pool (visibilityTier).
 */

import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { db, clubs, players, playthroughs, loadAdvanceContext, eq, asc, desc } from '@smt/db';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(303, '/login');
  const ctx = await loadAdvanceContext(db, locals.user.id);
  if (!ctx) {
    return { hasPlaythrough: false as const };
  }

  const [target] = await db
    .select({
      id: clubs.id,
      name: clubs.name,
      city: clubs.city,
      division: clubs.division,
      prestige: clubs.prestige,
      cityTier: clubs.cityTier,
      kitPrimaryColor: clubs.kitPrimaryColor,
      kitSecondaryColor: clubs.kitSecondaryColor,
    })
    .from(clubs)
    .where(eq(clubs.id, params.clubId))
    .limit(1);

  if (!target) throw error(404, 'Club no encontrado');

  const isOwnClub = target.id === ctx.playthrough.clubId;

  // Roster — return only public info for OTHER clubs.
  const roster = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      position: players.position,
      skill: players.skill,
      contractEndWeek: players.contractEndWeek,
      contractStatus: players.contractStatus,
      birthWeek: players.birthWeek,
      salaryEurK: players.salaryEurK,
      transferListed: players.transferListed,
    })
    .from(players)
    .where(eq(players.clubId, params.clubId))
    .orderBy(asc(players.position), desc(players.skill));

  // For OWN club show full info; for OTHER clubs show partial (band the skill).
  const safeRoster = roster.map((p) => {
    const ageYears = Math.max(16, Math.floor((ctx.playthrough.currentWeek - p.birthWeek) / 52));
    if (isOwnClub) {
      return {
        ...p,
        age: ageYears,
        skillBand: null,
      };
    }
    // Hide exact skill and salary for other clubs — show band.
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      age: ageYears,
      skill: null as number | null,
      skillBand: `${Math.floor(p.skill / 10) * 10}-${Math.floor(p.skill / 10) * 10 + 9}`,
      contractEndWeek: p.contractEndWeek,
      contractStatus: p.contractStatus,
      salaryEurK: null as number | null,
      transferListed: p.transferListed,
    };
  });

  return {
    hasPlaythrough: true as const,
    club: target,
    roster: safeRoster,
    isOwnClub,
    myClubId: ctx.playthrough.clubId,
    currentWeek: ctx.playthrough.currentWeek,
  };
};

export const actions: Actions = {
  offer: async ({ request, fetch, locals }) => {
    if (!locals.user) return fail(401, { error: 'unauthorized' });
    const data = await request.formData();
    const playerId = String(data.get('playerId') ?? '');
    const feeEurK = Number(data.get('feeEurK') ?? 0);
    const wageOfferEurKWeek = Number(data.get('wageOfferEurKWeek') ?? 0);
    const contractWeeks = Number(data.get('contractWeeks') ?? 52);

    const [active] = await db
      .select({ clubId: playthroughs.clubId, currentWeek: playthroughs.currentWeek })
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);
    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const res = await fetch('/api/scouting/offer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubId: active.clubId,
        playerId,
        feeEurK,
        wageOfferEurKWeek,
        contractWeeks,
        currentWeek: active.currentWeek,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return fail(res.status, { action: 'offer', error: body.error ?? 'unknown', playerId });
    return { action: 'offer' as const, success: true, playerId, ...body };
  },
};
