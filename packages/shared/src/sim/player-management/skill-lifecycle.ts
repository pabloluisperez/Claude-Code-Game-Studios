/**
 * F12 skill degradation (end-of-season) + weekly micro-decay + development.
 *
 * Per `design/gdd/player-management.md` §F12 and ADR-016:
 *   - End-of-season: if age≥30, decay = min(SKILL_DECAY_MAX, floor((age-29)/2)).
 *   - Weekly micro-decay (ADR-016 table): age<28→0; 28-29→-0.05; 30-31→-0.1;
 *     32-33→-0.2; 34+→-0.4. Floor at 20.
 *   - End-of-season development for age<30: if minutesPlayed/maxMinutes≥0.40
 *     and skill<potentialCeiling: skill += min(2, potentialCeiling-skill).
 *
 * Story: PLAYER-MANAGEMENT-008 (TR-PM-008)
 */

export const SKILL_FLOOR = 20;
export const SKILL_CEILING = 95;
export const SKILL_DECAY_MAX = 2;
export const DEVELOPMENT_THRESHOLD = 0.4;
export const DEVELOPMENT_MAX_GAIN = 2;

/**
 * F12 end-of-season skill degradation.
 * Age < 30 → no decay (development handled separately).
 * Age 30 → decay 0 (transition year).
 * Age 31 → decay 1.
 * Age 33+ → decay 2 (capped).
 */
export function computeF12Degradation(age: number, skill: number): number {
  if (age < 30) return skill;
  const decay = Math.min(SKILL_DECAY_MAX, Math.floor((age - 29) / 2));
  return Math.max(SKILL_FLOOR, skill - decay);
}

/**
 * Per-week micro-drift applied during advance() BEFORE the cascade tick.
 * Floored at SKILL_FLOOR.
 */
export function computeWeeklySkillDrift(age: number, skill: number): number {
  let driftPerWeek = 0;
  if (age < 28) driftPerWeek = 0;
  else if (age < 30) driftPerWeek = -0.05;
  else if (age < 32) driftPerWeek = -0.1;
  else if (age < 34) driftPerWeek = -0.2;
  else driftPerWeek = -0.4;

  const next = skill + driftPerWeek;
  return Math.max(SKILL_FLOOR, next);
}

export interface DevelopmentArgs {
  readonly age: number;
  readonly skill: number;
  readonly potentialCeiling: number | null | undefined;
  readonly minutesPlayedSeason: number;
  readonly maxMinutesSeason: number;
}

/**
 * End-of-season development for young players (age < 30).
 * If they played at least DEVELOPMENT_THRESHOLD (40%) of available minutes AND
 * are below their potential ceiling: skill += min(2, ceiling-skill).
 * Older players don't develop.
 */
export function computeEndOfSeasonDevelopment(args: Readonly<DevelopmentArgs>): number {
  if (args.age >= 30) return args.skill;
  if (args.potentialCeiling === undefined || args.potentialCeiling === null) {
    return args.skill;
  }
  if (args.skill >= args.potentialCeiling) return args.skill;
  const playRatio = args.minutesPlayedSeason / args.maxMinutesSeason;
  if (playRatio < DEVELOPMENT_THRESHOLD) return args.skill;
  const gain = Math.min(DEVELOPMENT_MAX_GAIN, args.potentialCeiling - args.skill);
  return Math.min(SKILL_CEILING, args.skill + gain);
}
