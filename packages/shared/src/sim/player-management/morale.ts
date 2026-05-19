/**
 * F10 — market wage reference + F11 — morale weekly update.
 *
 * Per `design/gdd/player-management.md` §F10-F11:
 *   F10: market_wage = transfer_value × WAGE_VALUE_RATIO (0.02).
 *   F11: morale_delta = result_bonus + wage_ratio_bonus + playing_time_bonus
 *        morale_next = clamp(morale + delta, 0, 100)
 *
 * Story: PLAYER-MANAGEMENT-007 (TR-PM-007)
 */

export const MORALE_MIN = 0;
export const MORALE_MAX = 100;
export const MORALE_WIN_BONUS = 3;
export const MORALE_LOSS_PENALTY = 2;
export const MORALE_WAGE_BONUS = 2;
export const MORALE_WAGE_PENALTY = 3;
export const WAGE_VALUE_RATIO = 0.02;

/** F10 — market_wage = transfer_value × WAGE_VALUE_RATIO. */
export function computeMarketWageF10(transferValueEurK: number): number {
  return transferValueEurK * WAGE_VALUE_RATIO;
}

export type MatchResult = 'win' | 'draw' | 'loss' | 'none';
export type PlayerStatusForMorale = 'available' | 'injured' | 'suspended';

export interface MoraleUpdateArgs {
  readonly morale: number;
  readonly matchResult: MatchResult;
  /** Player's weekly wage in €K. */
  readonly wage: number;
  /** Market reference wage (F10). */
  readonly marketWage: number;
  readonly minutesPlayed: number;
  readonly status: PlayerStatusForMorale;
}

/**
 * F11 — weekly morale update.
 * Three independent bonus components added, then clamped to [0, 100].
 */
export function computeMoraleF11(args: Readonly<MoraleUpdateArgs>): number {
  let delta = 0;

  // result_bonus
  if (args.matchResult === 'win') delta += MORALE_WIN_BONUS;
  else if (args.matchResult === 'loss') delta -= MORALE_LOSS_PENALTY;

  // wage_ratio_bonus
  if (args.wage >= args.marketWage * 0.9) delta += MORALE_WAGE_BONUS;
  else if (args.wage < args.marketWage * 0.6) delta -= MORALE_WAGE_PENALTY;

  // playing_time_bonus — only for available players
  if (args.status === 'available') {
    if (args.minutesPlayed >= 30) delta += 1;
    else if (args.minutesPlayed === 0) delta -= 1;
  }

  const next = args.morale + delta;
  if (next < MORALE_MIN) return MORALE_MIN;
  if (next > MORALE_MAX) return MORALE_MAX;
  return next;
}
