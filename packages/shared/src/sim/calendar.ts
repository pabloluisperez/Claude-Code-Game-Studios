/**
 * In-game calendar mapping: week N → real-world date.
 *
 * Convention:
 *   Week 0 = pre-season start (Saturday of the first week of August 2026).
 *   Week 1..N = league matchdays, one per Saturday.
 *
 * The MVP uses Saturdays as the canonical match day. A future expansion can
 * add midweek fixtures by varying `dayOfWeek` per fixture.
 *
 * Pure functions only — no Date.now() / no Math.random().
 *
 * Story: MVP UX fixes — calendar dates
 * Control Manifest: 2026-05-19
 */

/** Anchor: Sunday 2 August 2026 — pre-season starts here. Matchdays are Sundays. */
export const CALENDAR_ANCHOR_ISO = '2026-08-02';

/** First league matchday: Sunday 6 September 2026 = week 5 from anchor. */
export const LEAGUE_KICKOFF_WEEK = 5;

export interface InGameDate {
  /** ISO `YYYY-MM-DD` (Saturday of the in-game week). */
  readonly iso: string;
  /** Localised Spanish display string, e.g. "Sáb 5 sep 2026". */
  readonly display: string;
  /**
   * Full Spanish display string with day-of-week + ordinal + full month name,
   * e.g. "Miércoles 24 de marzo de 2027". Used in the topbar and any "you
   * are here" markers where space allows.
   */
  readonly displayLong: string;
  /** Year, month (1-12), day (1-31). */
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const MONTH_NAMES_ES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

const MONTH_NAMES_ES_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

const DAY_NAMES_ES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

const DAY_NAMES_ES_LONG = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

/**
 * Convert in-game week (0-based, fractional accepted) to the calendar date
 * it represents. Fractional weeks are interpreted as `anchor + week * 7 days`.
 *
 * Examples:
 *   weekToDate(0)        → anchor day
 *   weekToDate(33)       → 33 weeks after anchor (Sunday of week 33)
 *   weekToDate(33 + 3/7) → 3 days into week 33 (Wednesday)
 *   weekToDate(234/7)    → equivalent to currentDayOfSeason=234
 */
export function weekToDate(week: number): InGameDate {
  const anchor = new Date(`${CALENDAR_ANCHOR_ISO}T00:00:00Z`);
  const target = new Date(anchor.getTime() + week * 7 * 24 * 60 * 60 * 1000);
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const day = target.getUTCDate();
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthName = MONTH_NAMES_ES_SHORT[month - 1] ?? '';
  const monthLong = MONTH_NAMES_ES_LONG[month - 1] ?? '';
  const dow = DAY_NAMES_ES_SHORT[target.getUTCDay()] ?? '';
  const dowLong = DAY_NAMES_ES_LONG[target.getUTCDay()] ?? '';
  const display = `${dow} ${day} ${monthName} ${year}`;
  const displayLong = `${dowLong} ${day} de ${monthLong} de ${year}`;
  return { iso, display, displayLong, year, month, day };
}

/**
 * Convert an absolute day-of-season cursor (0..265+) to the calendar date.
 * Convenience wrapper that internally calls `weekToDate(day / 7)`.
 */
export function dayOfSeasonToDate(currentDayOfSeason: number): InGameDate {
  return weekToDate(currentDayOfSeason / 7);
}

/**
 * Phase label for a given week — useful for the top-bar/calendar header.
 */
export function weekPhase(week: number): 'pretemporada' | 'liga' | 'cierre' {
  if (week < LEAGUE_KICKOFF_WEEK) return 'pretemporada';
  if (week >= LEAGUE_KICKOFF_WEEK && week < LEAGUE_KICKOFF_WEEK + 22) return 'liga';
  return 'cierre';
}
