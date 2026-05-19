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

export const DEFAULT_ROSTER_SIZE = 40;
export const POSITION_QUOTAS: Readonly<Record<Position, number>> = Object.freeze({
  GK: 4,
  DEF: 12,
  MID: 12,
  FWD: 12,
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
 * Salary calculation per ADR-016 simplified:
 *   salaryEurK = SALARY_BASE × (skill/50) × ageBias × jitter
 * Base = 6 €K/wk (Segunda); ageBias peaks 1.2× at age 27.
 */
function computeSalary(rng: () => number, skill: number, age: number): number {
  const SALARY_BASE = 6;
  const ageBias =
    age >= 25 && age <= 29 ? 1.2 :
    age >= 22 && age <= 24 ? 1.0 :
    age >= 30 && age <= 32 ? 0.9 :
    age >= 33                ? 0.7 :
                               0.8; // young 16-21
  const jitter = 0.9 + rng() * 0.2; // [0.9, 1.1]
  const raw = SALARY_BASE * (skill / 50) * ageBias * jitter;
  return Math.max(1, Math.round(raw));
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
    const skill = computeSkill(position, positionStats);

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
      ...positionStats,
      ...(potentialCeiling !== undefined && { potentialCeiling }),
      salaryEurK,
      contractStartWeek,
      contractEndWeek,
    });
  }

  return players;
}
