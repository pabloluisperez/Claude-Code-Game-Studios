/**
 * Presentation state: day-night cycle + weather.
 *
 * Per ADR-022. NOT a cascade-engine concern — purely visual/sim state for
 * v1.1 Pillar B (Mundo Isométrico Vivo).
 *
 * Design choice: instead of persisting these values, we DERIVE them
 * deterministically from `(playthroughId, week, dayOfSeason)`. This:
 *
 *   1. Avoids schema migrations
 *   2. Guarantees same playthrough always renders the same day-night/weather
 *   3. Replays trivially reproduce visual state
 *   4. No cascade engine coupling
 *
 * Consumers (match-simulation, isometric-world renderer) call these
 * pure functions any time they need the values.
 */

export type Weather = 'clear' | 'rain';

export type PresentationState = {
  /** Normalized 0..1; 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  currentTimeOfDay: number;
  /** Discrete weather state. */
  weather: Weather;
};

/**
 * Default weather distribution per ADR-022 §D3:
 *   80% clear, 20% rain.
 * Seasonal modulation deferred to v1.3+.
 */
export const WEATHER_RAIN_PROBABILITY = 0.2;

/**
 * Time of day on match-day defaults to dusk start (~late afternoon),
 * matching typical European football scheduling per ADR-022 §D2.
 */
export const MATCH_DAY_TIME_OF_DAY = 0.65;

/**
 * Cheap deterministic hash → uint32. Mulberry32-style for portability.
 * Pure: same input → same output across processes / Node versions.
 */
function hashToUint32(...parts: readonly (string | number)[]): number {
  let h = 0x9e3779b9 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}

/** Convert uint32 → float in [0, 1). Cheap & deterministic. */
function uint32ToFloat01(u: number): number {
  return (u >>> 0) / 0x1_0000_0000;
}

/**
 * Derive presentation state for a given `(playthroughId, week, dayOfSeason)`.
 *
 * The triple uniquely identifies a moment in a playthrough; derivation is
 * pure: same triple → identical output.
 *
 * `isMatchDay` lets match-simulation override `currentTimeOfDay` to the
 * canonical dusk start so live matches always render at the same time.
 */
export function derivePresentationState(args: {
  playthroughId: string;
  week: number;
  dayOfSeason: number;
  isMatchDay?: boolean;
}): PresentationState {
  // currentTimeOfDay: cycles 0..1 across the 7 days of a week (per
  // ADR-022 §D2). dayOfSeason % 7 gives 0..6; divide by 7 → 0..1.
  const baseTime = (args.dayOfSeason % 7) / 7;
  const currentTimeOfDay = args.isMatchDay === true ? MATCH_DAY_TIME_OF_DAY : baseTime;

  // Weather: deterministic per-day via hash → bernoulli with WEATHER_RAIN_PROBABILITY.
  const weatherSeed = hashToUint32(
    args.playthroughId,
    'weather',
    args.week,
    args.dayOfSeason,
  );
  const roll = uint32ToFloat01(weatherSeed);
  const weather: Weather = roll < WEATHER_RAIN_PROBABILITY ? 'rain' : 'clear';

  return { currentTimeOfDay, weather };
}

/**
 * Day-night bucket from a continuous timeOfDay value.
 * Used by isometric renderer for the 4-bucket animation per
 * isometric-world.md §3.5.
 */
export type DayNightBucket = 'dawn' | 'day' | 'dusk' | 'night';

export function timeToDayNightBucket(t: number): DayNightBucket {
  const x = ((t % 1) + 1) % 1; // wrap to [0,1)
  if (x < 0.2) return 'night';
  if (x < 0.35) return 'dawn';
  if (x < 0.7) return 'day';
  if (x < 0.85) return 'dusk';
  return 'night';
}

/**
 * Match-simulation hook: applies the rain penalty to infrastructure_level
 * for a single fixture per ADR-022 §D4.
 *
 * Does NOT mutate state; returns the effective value for use in formulas.
 */
export const RAIN_INFRASTRUCTURE_PENALTY = 10;

export function effectiveInfrastructureLevel(
  baseLevel: number,
  weather: Weather,
): number {
  if (weather === 'rain') {
    return Math.max(0, baseLevel - RAIN_INFRASTRUCTURE_PENALTY);
  }
  return baseLevel;
}
