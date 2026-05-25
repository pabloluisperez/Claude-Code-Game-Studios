/**
 * Deterministic world-gen: procedurally generate ~800 players (20 clubs × 40)
 * from a seeded ctx.rng() at playthrough creation.
 *
 * Per ADR-016:
 *   - Position distribution: 4 GK + 12 DEF + 12 MID + 12 FWD = 40
 *   - Age distribution: 30% 18-23, 50% 24-29, 20% 30-35
 *   - Skill drawn from a normal-ish distribution centered on clubBaseSkill
 *   - Position-bias factor applied to relevant stats
 *
 * All randomness flows through `ctx.rng()` — same seed → identical roster.
 *
 * Story: PLAYER-MANAGEMENT-003 (TR-PM-003)
 */

import type { SimContext } from '../cascade-types.js';
import { computeSkill, type Position, type PositionStats, SKILL_MAX, SKILL_MIN } from './skill.js';
import { pickName } from './name-pool.js';

/**
 * Default roster size. Retuned 2026-05-21 (Sprint 9 economy-tuning playtest)
 * 40 → 25 — a Quinta División club typically carries ~25 players (12 starters
 * + 6 subs + ~7 backup), not 40. Combined with SALARY_BASE drop 6 → 3, the
 * economy becomes sustainable for the MVP D5 start.
 *
 * Pre-retune: 40 × ~2 €K avg = 80 €K/wk wages → unsustainable vs ~22 €K/wk
 * income. Post-retune: 25 × ~1 €K = 25 €K/wk → matchable.
 */
export const DEFAULT_ROSTER_SIZE = 22;
/**
 * Retuned 2026-05-25 (Pablo: "al empezar liga 22 jugadores").
 * Quotas sum to 22:
 *   GK: 3 (1 starter + 2 backup)
 *   DEF: 7 (4 starters + 3 backup)
 *   MID: 7 (4 starters + 3 backup)
 *   FWD: 5 (3 starters + 2 backup)
 */
export const POSITION_QUOTAS: Readonly<Record<Position, number>> = Object.freeze({
  GK: 3,
  DEF: 7,
  MID: 7,
  FWD: 5,
});
export const WEEKS_PER_SEASON = 52;
export const INITIAL_CONTRACT_WEEKS = 104;

const AGE_BRACKETS: ReadonlyArray<{ minAge: number; maxAge: number; quota: number }> = [
  { minAge: 18, maxAge: 23, quota: 0.3 },
  { minAge: 24, maxAge: 29, quota: 0.5 },
  { minAge: 30, maxAge: 35, quota: 0.2 },
];

export interface GeneratedPlayer {
  firstName: string;
  lastName: string;
  nationality: string;
  position: Position;
  birthWeek: number; // negative offset from currentWeek (e.g. -1248 = 24yo)
  skill: number;
  fitness: number;
  morale: number;
  form: number;
  stamina: number;
  // Core attributes (0-98). skill = round(mean(of these 4)) capped at 95.
  velocidad: number;
  resistencia: number;
  agresividad: number;
  calidad: number;
  // Position-specific stats — only the relevant 2-3 are set per position
  reflexes?: number;
  handling?: number;
  kicking?: number;
  strength?: number;
  tackling?: number;
  positioning?: number;
  passing?: number;
  vision?: number;
  workRate?: number;
  speed?: number;
  finishing?: number;
  dribbling?: number;
  potentialCeiling?: number;
  salaryEurK: number;
  contractStartWeek: number;
  contractEndWeek: number;
}

export interface GenerateRosterArgs {
  ctx: SimContext;
  clubBaseSkill: number;
  clubSlug: string;
  currentWeek: number;
  rosterSize?: number;
}

/**
 * Box-Muller-style normal draw using two ctx.rng() calls. Returns a value
 * roughly N(0, 1). Bounded to [-3, +3] to avoid extreme outliers.
 */
function normalDraw(rng: () => number): number {
  const u1 = Math.max(1e-9, rng()); // avoid log(0)
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-3, Math.min(3, z));
}

/** Return an integer drawn from N(mean, sigma) clamped to [min, max]. */
function clampedNormal(
  rng: () => number,
  mean: number,
  sigma: number,
  min: number,
  max: number,
): number {
  const z = normalDraw(rng);
  const raw = Math.round(mean + sigma * z);
  return Math.max(min, Math.min(max, raw));
}

/** Generate position-specific stats with position-bias per ADR-016. */
function generatePositionStats(
  rng: () => number,
  position: Position,
  baseSkill: number,
): PositionStats {
  // bias factor: relevant stats get +3 mean above club base
  const biasedMean = baseSkill + 3;
  const otherMean = baseSkill;
  const sigma = 6;

  switch (position) {
    case 'GK':
      return {
        reflexes: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        handling: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        kicking: clampedNormal(rng, otherMean, sigma, SKILL_MIN, SKILL_MAX),
      };
    case 'DEF':
      return {
        strength: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        tackling: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        positioning: clampedNormal(rng, otherMean, sigma, SKILL_MIN, SKILL_MAX),
      };
    case 'MID':
      return {
        passing: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        vision: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        workRate: clampedNormal(rng, otherMean, sigma, SKILL_MIN, SKILL_MAX),
      };
    case 'FWD':
      return {
        finishing: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        speed: clampedNormal(rng, biasedMean, sigma, SKILL_MIN, SKILL_MAX),
        dribbling: clampedNormal(rng, otherMean, sigma, SKILL_MIN, SKILL_MAX),
      };
  }
}

/** Pick an age bucket then a uniform age within. */
function pickAge(rng: () => number): number {
  const roll = rng();
  let cumulative = 0;
  for (const bracket of AGE_BRACKETS) {
    cumulative += bracket.quota;
    if (roll < cumulative) {
      const range = bracket.maxAge - bracket.minAge + 1;
      return bracket.minAge + Math.floor(rng() * range);
    }
  }
  // Tail safety (cumulative drift): fall to middle bracket
  return 26;
}

/**
 * Salary calculation. Retuned 2026-05-25 (Pablo: "muy difícil compensar pérdidas"
 * + "como un equipo real, paquetes cobrando mucho y buenos cobrando poco").
 *
 *   salaryEurK = max(1, min(20, round(skill × 0.04 × variation)))
 *   variation = 0.3 + rng() × 2.2 → range [0.3, 2.5], mean ~1.4
 *
 * Wide variation produces "anomalies" the manager can exploit:
 *   - skill=70 × 0.4 → 1.1 €K (a chollo — high skill, low salary)
 *   - skill=50 × 2.3 → 4.6 €K (a paquete — average skill, high salary)
 * Mean @ skill=55 → ~3 €K/sem (≈ 12K€/month = realistic Quinta wage).
 * Max @ skill=80 × 2.5 → 8 €K/sem (≈ 32K€/month = top Segunda B).
 *
 * Lineage:
 *   - SALARY_BASE 6 (original, unsustainable)
 *   - 2026-05-21: SALARY_BASE 6 → 3 + narrow jitter [0.9, 1.1]
 *     (predictable but no realism)
 *   - 2026-05-25: skill × 0.04 × wide variation [0.3, 2.5]
 *     (adds paquete/chollo dynamic AND keeps Quinta scale)
 *
 * ageBias dropped — variation swing dwarfs ±20% age effect, and Pablo's
 * "como un equipo real" prioritizes skill anomalies over age curves.
 */
function computeSalary(rng: () => number, skill: number, _age: number): number {
  const variation = 0.3 + rng() * 2.2; // [0.3, 2.5]
  const raw = skill * 0.04 * variation;
  return Math.max(1, Math.min(20, Math.round(raw)));
}

/**
 * Per-position deltas added to a player's base level for each core attribute.
 * Rows sum (approximately) to 0 so the per-position average stays balanced.
 */
const POSITION_BIAS: Readonly<Record<Position, {
  velocidad: number;
  resistencia: number;
  agresividad: number;
  calidad: number;
}>> = Object.freeze({
  GK:  { velocidad: -8,  resistencia: +3,  agresividad: -3,  calidad: +8 },
  DEF: { velocidad: -3,  resistencia:  0,  agresividad: +8,  calidad: -5 },
  MID: { velocidad:  0,  resistencia: +3,  agresividad:  0,  calidad: -3 },
  FWD: { velocidad: +6,  resistencia: -3,  agresividad: -8,  calidad: +5 },
});

const ATTR_MIN = 10;
const ATTR_MAX = 98;
const OVERALL_MAX = 95;

function clampAttr(v: number): number {
  return Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(v)));
}

/**
 * Generate the four core attributes for a player, biased per position around
 * the club's base level and with small individual variance. Returns also the
 * derived `skill` = mean of the four, clamped to OVERALL_MAX.
 */
function generateCoreAttrs(
  rng: () => number,
  position: Position,
  clubBaseSkill: number,
): {
  velocidad: number;
  resistencia: number;
  agresividad: number;
  calidad: number;
  skill: number;
} {
  const bias = POSITION_BIAS[position];
  const baseline = clubBaseSkill + clampedNormal(rng, 0, 6, -15, 15);
  const noise = () => clampedNormal(rng, 0, 4, -10, 10);
  const velocidad   = clampAttr(baseline + bias.velocidad   + noise());
  const resistencia = clampAttr(baseline + bias.resistencia + noise());
  const agresividad = clampAttr(baseline + bias.agresividad + noise());
  const calidad     = clampAttr(baseline + bias.calidad     + noise());
  const mean = (velocidad + resistencia + agresividad + calidad) / 4;
  const skill = Math.min(OVERALL_MAX, Math.round(mean));
  return { velocidad, resistencia, agresividad, calidad, skill };
}

/**
 * Pick contract end week — staggered so ~30% expire each season.
 * Uses a 3-way split: contractStartWeek + {52, 104, 156} weeks.
 */
function pickContractEnd(rng: () => number, startWeek: number): number {
  const roll = rng();
  if (roll < 0.3) return startWeek + 52;       // 30% — 1 season
  if (roll < 0.85) return startWeek + 104;     // 55% — 2 seasons
  return startWeek + 156;                       // 15% — 3 seasons
}

/**
 * Deterministic player generator. Uses ctx.rng() exclusively.
 *
 * The output is a roster of `rosterSize` players (default 40), with the
 * exact position distribution from POSITION_QUOTAS. Calling twice with the
 * same seed produces an identical roster.
 */
export function generateRoster(args: GenerateRosterArgs): GeneratedPlayer[] {
  const rng = args.ctx.rng;
  const size = args.rosterSize ?? DEFAULT_ROSTER_SIZE;
  const players: GeneratedPlayer[] = [];

  // Build position list according to quotas, scaled to roster size
  const positionList: Position[] = [];
  let total = 0;
  for (const [pos, quota] of Object.entries(POSITION_QUOTAS) as [Position, number][]) {
    const count = Math.round((quota / DEFAULT_ROSTER_SIZE) * size);
    for (let i = 0; i < count; i++) positionList.push(pos);
    total += count;
  }
  // Pad/trim to exact `size` (rounding may cause ±1)
  while (positionList.length < size) positionList.push('MID');
  while (positionList.length > size) positionList.pop();

  for (const position of positionList) {
    const { firstName, lastName } = pickName(rng);
    const positionStats = generatePositionStats(rng, position, args.clubBaseSkill);
    // Core 4 attributes (velocidad / resistencia / agresividad / calidad).
    // Mean is the player's overall skill, capped at 95.
    const core = generateCoreAttrs(rng, position, args.clubBaseSkill);
    const skill = core.skill;

    const age = pickAge(rng);
    const ageOffsetJitter = Math.floor(rng() * WEEKS_PER_SEASON);
    const birthWeek = args.currentWeek - (age * WEEKS_PER_SEASON + ageOffsetJitter);

    const form = clampedNormal(rng, 60, 3, 30, 90);
    const morale = 60;
    const stamina = clampedNormal(rng, 70, 6, 40, 100);
    const fitness = 90;

    // Young players have a potential_ceiling (12% above current skill, capped at SKILL_MAX)
    const potentialCeiling =
      age < 24
        ? Math.min(SKILL_MAX, Math.round(skill + clampedNormal(rng, 10, 4, 4, 18)))
        : undefined;

    const salaryEurK = computeSalary(rng, skill, age);
    const contractStartWeek = args.currentWeek;
    const contractEndWeek = pickContractEnd(rng, contractStartWeek);

    players.push({
      firstName,
      lastName,
      nationality: 'ES',
      position,
      birthWeek,
      skill,
      fitness,
      morale,
      form,
      stamina,
      velocidad: core.velocidad,
      resistencia: core.resistencia,
      agresividad: core.agresividad,
      calidad: core.calidad,
      ...positionStats,
      ...(potentialCeiling !== undefined && { potentialCeiling }),
      salaryEurK,
      contractStartWeek,
      contractEndWeek,
    });
  }

  return players;
}
