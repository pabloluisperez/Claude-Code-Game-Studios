/**
 * Interactive match driver (ADR-033 Phase 3, web-driven). Builds a MatchInput
 * for the user's fixture from the DB (lineups from players, pre-match snapshot
 * from worldState), so the pure engine (`initMatchSession` / `advanceTick`) can
 * be driven from SvelteKit actions with halftime + substitution-window pauses.
 *
 * The pure engine uses a richer PlayerStats shape than the quick-sim; this is
 * the mapper that bridges the `players` table to it. Pablo 2026-05-30.
 */

import { db, players, clubs, worldSnapshots, fixtures, eq, and, or, desc } from '@smt/db';
import {
  initMatchSession,
  advanceTick,
  type MatchInput,
  type MatchSessionSnapshot,
  type MatchDecision,
  type MatchOutcome,
  type Lineup,
  type PlayerStats,
  type FormationPreset,
  type TeamInstruction,
} from '@smt/shared';

type DbPlayer = {
  id: string;
  position: string; // 'GK'|'DEF'|'MID'|'FWD'
  skill: number;
  fitness: number;
  morale: number;
  form: number;
  stamina: number;
  velocidad: number;
  resistencia: number;
  agresividad: number;
  calidad: number;
};

const POS_MAP: Record<string, PlayerStats['position']> = {
  GK: 'GOALKEEPER',
  DEF: 'DEFENDER',
  MID: 'MIDFIELDER',
  FWD: 'FORWARD',
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** Map one DB player row → engine PlayerStats (with position-specific attrs). */
function toPlayerStats(p: DbPlayer): PlayerStats {
  const position = POS_MAP[p.position] ?? 'MIDFIELDER';
  const base = {
    id: p.id,
    position,
    skill: clamp(p.skill, 0, 100),
    fitness: clamp(p.fitness, 0, 100),
    morale: clamp(p.morale, 0, 100),
    form: clamp(p.form, 30, 90),
    stamina: clamp(p.stamina, 40, 100),
  };
  // Position-specific attrs derived from the Spanish stat axes.
  switch (position) {
    case 'GOALKEEPER':
      return { ...base, reflexes: clamp(p.calidad, 0, 100), handling: clamp(p.agresividad, 0, 100) };
    case 'DEFENDER':
      return { ...base, strength: clamp(p.agresividad, 0, 100), tackling: clamp(p.calidad, 0, 100) };
    case 'MIDFIELDER':
      return { ...base, passing: clamp(p.calidad, 0, 100), vision: clamp(p.skill, 0, 100) };
    case 'FORWARD':
    default:
      return { ...base, speed: clamp(p.velocidad, 0, 100), finishing: clamp(p.calidad, 0, 100) };
  }
}

/** Build an 11+bench Lineup from a club's roster, honoring a manual XI if set. */
function buildLineup(roster: DbPlayer[], manualXiIds: string[] | null, formation: FormationPreset): Lineup {
  const byId = new Map(roster.map((p) => [p.id, p]));
  let starters: DbPlayer[];
  if (manualXiIds && manualXiIds.length >= 11) {
    starters = manualXiIds.map((id) => byId.get(id)).filter((p): p is DbPlayer => Boolean(p)).slice(0, 11);
  } else {
    starters = [];
  }
  if (starters.length < 11) {
    // Auto-pick by formation: 1 GK + (DEF/MID/FWD per formation) by skill desc.
    const counts: Record<FormationPreset, [number, number, number]> = {
      '4-4-2': [4, 4, 2],
      '4-3-3': [4, 3, 3],
      '3-5-2': [3, 5, 2],
      '5-3-2': [5, 3, 2],
    };
    const [nDef, nMid, nFwd] = counts[formation] ?? [4, 4, 2];
    const chosen = new Set(starters.map((p) => p.id));
    const pool = roster.filter((p) => !chosen.has(p.id)).sort((a, b) => b.skill - a.skill);
    const take = (pred: (p: DbPlayer) => boolean, n: number) => {
      let c = 0;
      for (const p of pool) {
        if (c >= n) break;
        if (!chosen.has(p.id) && pred(p)) { chosen.add(p.id); starters.push(p); c++; }
      }
    };
    if (!starters.some((p) => p.position === 'GK')) take((p) => p.position === 'GK', 1);
    take((p) => p.position === 'DEF', nDef);
    take((p) => p.position === 'MID', nMid);
    take((p) => p.position === 'FWD', nFwd);
    // Fill any shortfall (e.g. missing positions) with best available.
    take(() => true, 11 - starters.length);
  }
  const starterIds = new Set(starters.map((p) => p.id));
  const bench = roster.filter((p) => !starterIds.has(p.id)).sort((a, b) => b.skill - a.skill).slice(0, 7);
  return [...starters, ...bench].map((p, slotIndex) => ({ player: toPlayerStats(p), slotIndex }));
}

function resolveFormation(v: string | null | undefined): FormationPreset {
  return v === '4-3-3' || v === '3-5-2' || v === '5-3-2' ? v : '4-4-2';
}
function resolveInstruction(v: string | null | undefined): TeamInstruction | null {
  return v === 'PRESS_HIGH' || v === 'HOLD_SHAPE' || v === 'COUNTER' ? v : null;
}

const PLAYER_COLS = {
  id: players.id,
  position: players.position,
  skill: players.skill,
  fitness: players.fitness,
  morale: players.morale,
  form: players.form,
  stamina: players.stamina,
  velocidad: players.velocidad,
  resistencia: players.resistencia,
  agresividad: players.agresividad,
  calidad: players.calidad,
  suspendedMatchesRemaining: players.suspendedMatchesRemaining,
  availability: players.availability,
} as const;

/**
 * Assemble a MatchInput for the user's scheduled fixture, or null if it can't
 * (fixture not found / not the user's / no rosters).
 */
export async function buildMatchInput(args: {
  playthroughId: string;
  clubId: string;
  fixtureId: string;
}): Promise<MatchInput | null> {
  const { playthroughId, clubId, fixtureId } = args;
  const [fx] = await db
    .select({ id: fixtures.id, homeClubId: fixtures.homeClubId, awayClubId: fixtures.awayClubId, status: fixtures.status })
    .from(fixtures)
    .where(eq(fixtures.id, fixtureId))
    .limit(1);
  if (!fx) return null;
  const isHome = fx.homeClubId === clubId;
  if (!isHome && fx.awayClubId !== clubId) return null;

  const loadRoster = async (cid: string): Promise<DbPlayer[]> => {
    const rows = await db.select(PLAYER_COLS).from(players).where(eq(players.clubId, cid));
    return rows
      .filter((p) => (p.suspendedMatchesRemaining ?? 0) <= 0 && p.availability !== 'leaving' && p.availability !== 'injured')
      .map((p) => ({
        id: p.id, position: p.position, skill: p.skill, fitness: p.fitness, morale: p.morale,
        form: p.form, stamina: p.stamina, velocidad: p.velocidad, resistencia: p.resistencia,
        agresividad: p.agresividad, calidad: p.calidad,
      }));
  };
  const homeRoster = await loadRoster(fx.homeClubId);
  const awayRoster = await loadRoster(fx.awayClubId);
  if (homeRoster.length < 11 || awayRoster.length < 11) return null;

  const [homeClub] = await db
    .select({ ids: clubs.startingLineupPlayerIds, formation: clubs.preferredFormation, instr: clubs.defaultMatchInstruction })
    .from(clubs).where(eq(clubs.id, fx.homeClubId)).limit(1);
  const [awayClub] = await db
    .select({ ids: clubs.startingLineupPlayerIds, formation: clubs.preferredFormation, instr: clubs.defaultMatchInstruction })
    .from(clubs).where(eq(clubs.id, fx.awayClubId)).limit(1);

  const homeFormation = resolveFormation(homeClub?.formation);
  const awayFormation = resolveFormation(awayClub?.formation);

  const [snap] = await db
    .select({ ws: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, playthroughId))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);
  const ws = (snap?.ws as Record<string, number>) ?? {};
  const userRoster = isHome ? homeRoster : awayRoster;
  const teamSkill = clamp(userRoster.slice(0, 11).reduce((s, p) => s + p.skill, 0) / Math.min(11, userRoster.length), 0, 100);

  return {
    seed: `${playthroughId}:${fixtureId}:interactive`,
    homeLineup: buildLineup(homeRoster, homeClub?.ids ?? null, homeFormation),
    awayLineup: buildLineup(awayRoster, awayClub?.ids ?? null, awayFormation),
    homeFormation,
    awayFormation,
    homeInstruction: resolveInstruction(homeClub?.instr),
    awayInstruction: resolveInstruction(awayClub?.instr),
    preMatchSnapshot: {
      team_fitness: clamp(ws['team_fitness'] ?? 80, 0, 100),
      team_skill: teamSkill,
      squad_available_pct: clamp(ws['squad_available'] ?? 90, 0, 100),
      field_quality: clamp(ws['field_quality'] ?? 60, 0, 100),
      fan_attendance: clamp(ws['fan_attendance'] ?? 50, 0, 100),
      staff_morale: clamp(ws['staff_morale'] ?? 60, 0, 100),
      player_happiness: clamp(ws['player_happiness'] ?? 70, 0, 100),
      injury_risk: clamp(ws['injury_risk'] ?? 30, 0, 100),
    },
    playerClubSide: isHome ? 'home' : 'away',
    playerClubId: clubId,
  };
}

/**
 * Drive a MatchInput to completion in-memory with a decision hook at each pause
 * (verification + the "Saltar al resultado" interactive path). `decideAt`
 * returns the player's decisions for a pause (default: none → rival AI default).
 */
export function driveInteractive(
  input: MatchInput,
  decideAt?: (snapshot: MatchSessionSnapshot, pauseType: 'substitution_window' | 'injury_pause') => readonly MatchDecision[],
): { outcome: MatchOutcome | null; finalSnapshot: MatchSessionSnapshot } {
  let snap = initMatchSession(input);
  let pending: readonly MatchDecision[] = [{ kind: 'no_op' }];
  let guard = 0;
  while (snap.state !== 'completed' && snap.state !== 'failed' && guard++ < 200) {
    const res = advanceTick(snap, pending, input);
    snap = res.nextSnapshot;
    if (res.matchOutcome) return { outcome: res.matchOutcome, finalSnapshot: snap };
    // Decide what to feed the NEXT resume: the player's choice at this pause,
    // else a no-op (the engine applies rival AI defaults on its own).
    pending =
      res.pauseType && decideAt && decideAt(snap, res.pauseType).length
        ? decideAt(snap, res.pauseType)
        : [{ kind: 'no_op' }];
  }
  return { outcome: null, finalSnapshot: snap };
}
