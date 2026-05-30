/**
 * Interactive match driver (ADR-033 Phase 3, web-driven). Builds a MatchInput
 * for the user's fixture from the DB (lineups from players, pre-match snapshot
 * from worldState), so the pure engine (`initMatchSession` / `advanceTick`) can
 * be driven from SvelteKit actions with halftime + substitution-window pauses.
 *
 * The pure engine uses a richer PlayerStats shape than the quick-sim; this is
 * the mapper that bridges the `players` table to it. Pablo 2026-05-30.
 */

import { db, players, clubs, worldSnapshots, fixtures, eq, desc } from '@smt/db';
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
  type QuickMatchResult,
} from '@smt/shared';
import { persistFixtureResult } from './match-day-runner';
import { emitUserMatchResultEffects } from './user-match-result';

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

/**
 * Persist a completed interactive MatchOutcome exactly like a one-shot result:
 * fixtures + standings + per-player side effects (reusing persistFixtureResult)
 * + the user-result hooks (press/afición). Idempotent: no-ops if the fixture is
 * already played. Pablo 2026-05-30 (ADR-033 Phase 5).
 */
export async function applyInteractiveOutcome(args: {
  playthroughId: string;
  clubId: string;
  fixtureId: string;
  outcome: MatchOutcome;
}): Promise<void> {
  const { playthroughId, clubId, fixtureId, outcome } = args;
  const [fx] = await db
    .select({
      seasonId: fixtures.seasonId,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      week: fixtures.week,
      status: fixtures.status,
    })
    .from(fixtures)
    .where(eq(fixtures.id, fixtureId))
    .limit(1);
  if (!fx || fx.status === 'played') return;

  const result: QuickMatchResult = {
    homeScore: outcome.homeScore,
    awayScore: outcome.awayScore,
    winner: outcome.winner,
    homeStrength: 50,
    awayStrength: 50,
    // Engine MatchEvent[] is structurally compatible (extractSuspensions reads
    // player_id; the replay UI reads type/minute/team). Cast across the shapes.
    events: outcome.events as unknown as QuickMatchResult['events'],
    homeStarterIds: outcome.finalLineupHome.slice(0, 11).map((s) => s.player.id),
    awayStarterIds: outcome.finalLineupAway.slice(0, 11).map((s) => s.player.id),
  };

  await db.transaction(async (tx) => {
    await persistFixtureResult(tx, {
      fixtureId,
      seasonId: fx.seasonId,
      homeClubId: fx.homeClubId,
      awayClubId: fx.awayClubId,
      seed: `${playthroughId}:${fixtureId}:interactive`,
      playthroughId,
      week: fx.week,
      isUserDivision: true,
      result,
      playedAt: new Date(),
    });
  });

  await emitUserMatchResultEffects({ playthroughId, clubId, week: fx.week });
}

// ── Session persistence (match_sessions) ───────────────────────────────────
// Web-driven: we store the snapshot between requests so /match can pause at
// halftime / sub windows and resume with the player's decisions.

import { matchSessions, ne, and } from '@smt/db';

function snapshotColumns(snap: MatchSessionSnapshot) {
  return {
    currentTick: snap.currentTick,
    eventsAccumulated: snap.eventsAccumulated as unknown as object[],
    currentLineupHome: snap.currentLineupHome as unknown as object[],
    currentLineupAway: snap.currentLineupAway as unknown as object[],
    homeMomentum: snap.homeMomentum,
    substitutionsUsed: snap.substitutionsUsed,
    awaySubstitutionsUsed: snap.awaySubstitutionsUsed,
    yellowCardsByPlayerId: snap.yellowCardsByPlayerId as unknown as object,
    currentFormationHome: snap.currentFormationHome,
    currentFormationAway: snap.currentFormationAway,
    activeInstructionHome: snap.activeInstructionHome,
    activeInstructionAway: snap.activeInstructionAway,
    prngState: snap.prngState,
    state: snap.state,
    timeoutJobId: snap.timeoutJobId,
    updatedAt: new Date(),
  };
}

type SessionRow = typeof matchSessions.$inferSelect;

function rowToSnapshot(row: SessionRow): MatchSessionSnapshot {
  return {
    currentTick: row.currentTick,
    eventsAccumulated: row.eventsAccumulated as MatchSessionSnapshot['eventsAccumulated'],
    currentLineupHome: row.currentLineupHome as Lineup,
    currentLineupAway: row.currentLineupAway as Lineup,
    homeMomentum: row.homeMomentum,
    substitutionsUsed: row.substitutionsUsed,
    awaySubstitutionsUsed: row.awaySubstitutionsUsed,
    yellowCardsByPlayerId: row.yellowCardsByPlayerId as Record<string, number>,
    currentFormationHome: row.currentFormationHome as FormationPreset,
    currentFormationAway: row.currentFormationAway as FormationPreset,
    activeInstructionHome: row.activeInstructionHome as TeamInstruction | null,
    activeInstructionAway: row.activeInstructionAway as TeamInstruction | null,
    prngState: row.prngState,
    state: row.state as MatchSessionSnapshot['state'],
    timeoutJobId: row.timeoutJobId,
  };
}

function rowToInput(row: SessionRow): MatchInput {
  return {
    seed: row.seed,
    homeLineup: row.currentLineupHome as Lineup,
    awayLineup: row.currentLineupAway as Lineup,
    homeFormation: row.currentFormationHome as FormationPreset,
    awayFormation: row.currentFormationAway as FormationPreset,
    homeInstruction: row.activeInstructionHome as TeamInstruction | null,
    awayInstruction: row.activeInstructionAway as TeamInstruction | null,
    preMatchSnapshot: row.preMatchSnapshot as MatchInput['preMatchSnapshot'],
    playerClubSide: row.playerClubSide as 'home' | 'away',
    playerClubId: row.playerClubId,
  };
}

export interface InteractiveState {
  sessionId: string;
  snapshot: MatchSessionSnapshot;
  pauseType: 'substitution_window' | 'injury_pause' | null;
  completed: boolean;
}

/**
 * Start (or resume) the interactive session for the user's scheduled fixture,
 * advancing to the first pause/completion. Returns null → caller one-shots.
 */
export async function startInteractiveMatch(args: {
  playthroughId: string;
  clubId: string;
  fixtureId: string;
}): Promise<InteractiveState | null> {
  const { playthroughId, clubId, fixtureId } = args;

  // Resume an existing non-terminal session for THIS fixture.
  const [existing] = await db
    .select()
    .from(matchSessions)
    .where(and(eq(matchSessions.fixtureId, fixtureId)))
    .orderBy(desc(matchSessions.createdAt))
    .limit(1);
  if (existing && existing.state !== 'completed' && existing.state !== 'failed' && existing.state !== 'archived') {
    const snap = rowToSnapshot(existing);
    return {
      sessionId: existing.id,
      snapshot: snap,
      pauseType: snap.state === 'paused_for_decision' ? 'substitution_window' : null,
      completed: snap.state === 'completed',
    };
  }

  const input = await buildMatchInput({ playthroughId, clubId, fixtureId });
  if (!input) return null;

  // Drive to the first pause OR completion.
  let snap = initMatchSession(input);
  let pauseType: 'substitution_window' | 'injury_pause' | null = null;
  let outcome: MatchOutcome | null = null;
  let guard = 0;
  while (snap.state !== 'completed' && snap.state !== 'failed' && guard++ < 200) {
    const res = advanceTick(snap, [{ kind: 'no_op' }], input);
    snap = res.nextSnapshot;
    if (res.matchOutcome) { outcome = res.matchOutcome; break; }
    if (res.pauseType) { pauseType = res.pauseType; break; }
  }

  // Free the unique-index slot: fail any OTHER active session for this player.
  await db
    .update(matchSessions)
    .set({ state: 'failed', updatedAt: new Date() })
    .where(and(eq(matchSessions.playthroughId, playthroughId), ne(matchSessions.fixtureId, fixtureId), ne(matchSessions.state, 'completed')));

  const [row] = await db
    .insert(matchSessions)
    .values({
      playthroughId,
      fixtureId,
      seed: input.seed,
      playerClubSide: input.playerClubSide,
      playerClubId: input.playerClubId,
      preMatchSnapshot: input.preMatchSnapshot as unknown as object,
      ...snapshotColumns(snap),
    })
    .returning({ id: matchSessions.id });

  if (outcome) {
    await applyInteractiveOutcome({ playthroughId, clubId, fixtureId, outcome });
    await db.update(matchSessions).set({ state: 'completed', updatedAt: new Date() }).where(eq(matchSessions.id, row!.id));
  }

  return { sessionId: row!.id, snapshot: snap, pauseType, completed: Boolean(outcome) };
}

/**
 * Resume a paused session with the player's decisions, advancing to the next
 * pause OR completion (then persisting the outcome).
 */
export async function advanceInteractiveSession(args: {
  sessionId: string;
  playthroughId: string;
  clubId: string;
  decisions: readonly MatchDecision[];
}): Promise<InteractiveState | null> {
  const { sessionId, playthroughId, clubId, decisions } = args;
  const [row] = await db.select().from(matchSessions).where(eq(matchSessions.id, sessionId)).limit(1);
  if (!row) return null;
  if (row.state === 'completed' || row.state === 'failed') {
    return { sessionId, snapshot: rowToSnapshot(row), pauseType: null, completed: row.state === 'completed' };
  }

  const input = rowToInput(row);
  let snap = rowToSnapshot(row);
  let pending = decisions.length ? decisions : [{ kind: 'no_op' as const }];
  let pauseType: 'substitution_window' | 'injury_pause' | null = null;
  let outcome: MatchOutcome | null = null;
  let guard = 0;
  while (snap.state !== 'completed' && snap.state !== 'failed' && guard++ < 200) {
    const res = advanceTick(snap, pending, input);
    snap = res.nextSnapshot;
    pending = [{ kind: 'no_op' }];
    if (res.matchOutcome) { outcome = res.matchOutcome; break; }
    if (res.pauseType) { pauseType = res.pauseType; break; }
  }

  await db.update(matchSessions).set(snapshotColumns(snap)).where(eq(matchSessions.id, sessionId));

  if (outcome) {
    await applyInteractiveOutcome({ playthroughId, clubId, fixtureId: row.fixtureId, outcome });
    await db.update(matchSessions).set({ state: 'completed', updatedAt: new Date() }).where(eq(matchSessions.id, sessionId));
  }

  return { sessionId, snapshot: snap, pauseType, completed: Boolean(outcome) };
}
