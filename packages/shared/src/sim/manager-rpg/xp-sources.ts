/**
 * Event → XP grant mapping — data-driven per ADR-010 §XP Sources.
 *
 * Keys are CalendarEventType values (or extended composite keys). Values are
 * the XP grant(s) to apply when that event fires. Some events grant XP across
 * multiple skills.
 *
 * Story: MANAGER-RPG-004
 * Control Manifest: 2026-05-19
 */

import type { XpGrant } from './types.js';

export const XP_SOURCES: Readonly<Record<string, readonly XpGrant[]>> = Object.freeze({
  // Match outcomes
  match_win:                         [{ skillId: 'tactical_insight', amount: 10, reason: 'match_win' }],
  match_draw:                        [{ skillId: 'tactical_insight', amount: 5,  reason: 'match_draw' }],
  match_loss:                        [{ skillId: 'tactical_insight', amount: 2,  reason: 'match_loss' }],

  // Financial events
  'end_of_month:positive_finances':  [{ skillId: 'financial_acumen', amount: 10, reason: 'positive_month' }],
  'end_of_month:negative_finances':  [{ skillId: 'financial_acumen', amount: 3,  reason: 'survived_negative_month' }],
  bankruptcy_avoided:                [{ skillId: 'financial_acumen', amount: 25, reason: 'bankruptcy_avoided' }],
  sponsor_negotiated:                [{ skillId: 'financial_acumen', amount: 12, reason: 'sponsor_negotiated' }],

  // Player management
  'transfer_window_close:signed':    [{ skillId: 'scouting_network', amount: 15, reason: 'signed_player' }],
  contract_renewal_signed:           [{ skillId: 'man_management',   amount: 8,  reason: 'contract_renewal_signed' }],
  squad_morale_high:                 [{ skillId: 'man_management',   amount: 5,  reason: 'squad_morale_high' }],

  // Board / reputation events
  'board_meeting:passed':            [{ skillId: 'reputation',       amount: 8,  reason: 'board_approval' }],
  'season_end:promoted':             [{ skillId: 'reputation',       amount: 50, reason: 'promotion' }],
  'season_end:relegated':            [{ skillId: 'reputation',       amount: 0,  reason: 'relegation' }],
  'season_end:survived':             [{ skillId: 'reputation',       amount: 15, reason: 'survival' }],

  // Streaks
  first_5_match_win_streak:          [
    { skillId: 'tactical_insight', amount: 25, reason: 'first_5_match_streak' },
    { skillId: 'reputation',       amount: 10, reason: 'first_5_match_streak' },
  ],
  underdog_match_won:                [{ skillId: 'tactical_insight', amount: 15, reason: 'underdog_match_won' }],
});

/**
 * Compute the XP grants for a list of event keys.
 * Unknown event keys are silently dropped (audit log in event-system catches them).
 */
export function computeXpGrants(eventKeys: readonly string[]): readonly XpGrant[] {
  const grants: XpGrant[] = [];
  for (const key of eventKeys) {
    const sourceGrants = XP_SOURCES[key];
    if (sourceGrants) grants.push(...sourceGrants);
  }
  return grants;
}
