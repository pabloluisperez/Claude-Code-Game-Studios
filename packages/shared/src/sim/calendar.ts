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

/** Anchor: Saturday 1 August 2026 — pre-season starts here. */
export const CALENDAR_ANCHOR_ISO = '2026-08-01';

/** First league matchday: Saturday 5 September 2026 = week 5 from anchor. */
export const LEAGUE_KICKOFF_WEEK = 5;

export interface InGameDate {
  /** ISO `YYYY-MM-DD` (Saturday of the in-game week). */
  readonly iso: string;
  /** Localised Spanish display string, e.g. "Sáb 5 sep 2026". */
  readonly display: string;
  /** Year, month (1-12), day (1-31). */
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const MONTH_NAMES_ES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

const DAY_NAMES_ES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

/**
 * Convert in-game week (0-based) to the calendar Saturday it represents.
 */
export function weekToDate(week: number): InGameDate {
  const anchor = new Date(`${CALENDAR_ANCHOR_ISO}T00:00:00Z`);
  const target = new Date(anchor.getTime() + week * 7 * 24 * 60 * 60 * 1000);
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const day = target.getUTCDate();
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthName = MONTH_NAMES_ES_SHORT[month - 1] ?? '';
  const dow = DAY_NAMES_ES_SHORT[target.getUTCDay()] ?? '';
  const display = `${dow} ${day} ${monthName} ${year}`;
  return { iso, display, year, month, day };
}

/**
 * Phase label for a given week — useful for the top-bar/calendar header.
 */
export function weekPhase(week: number): 'pretemporada' | 'liga' | 'cierre' {
  if (week < LEAGUE_KICKOFF_WEEK) return 'pretemporada';
  if (week >= LEAGUE_KICKOFF_WEEK && week < LEAGUE_KICKOFF_WEEK + 22) return 'liga';
  return 'cierre';
}
