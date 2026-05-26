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
import { db, clubs, players, playthroughs, staff, loadAdvanceContext, eq, and, asc, desc, sql } from '@smt/db';
import { createSeededRng, generateRoster, defaultWorldState, pickTraits } from '@smt/shared';

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

  // Pablo 2026-05-26: lazy roster generation. AI clubs in distant divisions
  // were spawned without players (Fase 1 perf optimisation). When the user
  // browses to one, generate its roster on-demand. One-shot per club —
  // subsequent visits use the persisted roster.
  const [{ count: existingPlayerCount = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(players)
    .where(eq(players.clubId, target.id));

  if (Number(existingPlayerCount) === 0 && !isOwnClub) {
    // Build base skill from strength_rating (which acts as the club's avg).
    const [strengthRow] = await db
      .select({ strength: clubs.strengthRating })
      .from(clubs)
      .where(eq(clubs.id, target.id))
      .limit(1);
    const baseSkill = strengthRow?.strength ?? 35;
    const rng = createSeededRng(`roster:${target.id}`);
    const generated = generateRoster({
      ctx: { rng, currentWeek: ctx.playthrough.currentWeek, hasMatchThisWeek: false, prevState: defaultWorldState() },
      clubBaseSkill: baseSkill,
      clubSlug: target.id,
      currentWeek: ctx.playthrough.currentWeek,
    });
    await db.insert(players).values(
      generated.map((p, i) => ({
        clubId: target.id,
        playthroughId: ctx.playthrough.id,
        firstName: p.firstName,
        lastName: p.lastName,
        nationality: p.nationality,
        birthWeek: p.birthWeek,
        position: p.position,
        skill: p.skill,
        fitness: p.fitness,
        morale: p.morale,
        form: p.form,
        stamina: p.stamina,
        velocidad: p.velocidad,
        resistencia: p.resistencia,
        agresividad: p.agresividad,
        calidad: p.calidad,
        salaryEurK: p.salaryEurK,
        contractStartWeek: 0,
        contractEndWeek: 76,
        traits: [...pickTraits(`${target.id}:gen:${i}:${p.firstName}${p.lastName}`)],
      })),
    );
  }

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

  // Scout director presence + tier (Pablo 2026-05-26 scout gate).
  const [scoutDir] = await db
    .select({ tier: staff.qualityTier })
    .from(staff)
    .where(
      and(
        eq(staff.playthroughId, ctx.playthrough.id),
        eq(staff.role, 'scouting_director'),
        eq(staff.status, 'active'),
      ),
    )
    .limit(1);
  const scoutTier = scoutDir?.tier ?? 0;

  return {
    hasPlaythrough: true as const,
    club: target,
    roster: safeRoster,
    isOwnClub,
    myClubId: ctx.playthrough.clubId,
    currentWeek: ctx.playthrough.currentWeek,
    scoutTier,
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
