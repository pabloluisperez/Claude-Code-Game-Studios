/**
 * Museum formulas F1-F5 per `design/gdd/trophies-history.md §4`.
 * Story TROPHIES-HISTORY-002. Pure functions, deterministic.
 */

import type {
  LegendaryMatchInput,
  LegendTransferInput,
  MuseumDivision,
  MuseumObjectCounts,
  PlayerCareerHistory,
} from './types.js';

/** A match is "legendary" if its `|fan_momentum_delta|` exceeds this. */
export const LEGENDARY_THRESHOLD = 15;
/** Landslide goal differential: a `5+` goal margin always qualifies. */
export const LANDSLIDE_THRESHOLD = 5;
/** Minimum consecutive weeks in TOP_5 to flag a player as a "top player". */
export const TOP_5_MIN_WEEKS = 20;
/** Per-division threshold for "legend" transfer (in EUR-K). */
export const LEGEND_TRANSFER_THRESHOLD: Record<MuseumDivision, number> = {
  D1: 2000,
  D2: 500,
};
/** Total objects considered "museum full" — caps `museumDensity` at 1.0. */
export const MUSEUM_FULL_OBJECTS = 100;
/** Hard performance cap on objects rendered in the museum scene. */
export const MUSEUM_PERF_CAP = 250;

/** F1: a match qualifies as legendary if ANY of the criteria below match. */
export function legendaryMatchQualifies(m: LegendaryMatchInput): boolean {
  if (Math.abs(m.fan_momentum_delta) > LEGENDARY_THRESHOLD) return true;
  if (m.goalsFor - m.goalsAgainst >= LANDSLIDE_THRESHOLD) return true;
  if (m.is_derby && m.result === 'win') return true;
  if (m.is_cup_final) return true;
  return false;
}

/** F2: player qualifies for the "top player" hall-of-fame slot. */
export function topPlayerFlag(career: PlayerCareerHistory): boolean {
  return career.max_consecutive_weeks_in_top5 >= TOP_5_MIN_WEEKS;
}

/** F3: transfer qualifies as a "legend" by division-specific threshold. */
export function legendTransferQualifies(
  t: LegendTransferInput,
  clubDivision: MuseumDivision,
): boolean {
  return t.value_eur_k >= LEGEND_TRANSFER_THRESHOLD[clubDivision];
}

/** F4: total museum objects across all 5 categories. */
export function museumObjectsCount(c: MuseumObjectCounts): number {
  return (
    c.trophies + c.banners + c.legendTransfers + c.financialMilestones + c.stadiumHistory
  );
}

/** F5: museum visual density 0..1 — drives LoD for the interior scene. */
export function museumDensity(objectsCount: number): number {
  if (objectsCount <= 0) return 0;
  return Math.min(1, objectsCount / MUSEUM_FULL_OBJECTS);
}
