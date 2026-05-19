/**
 * Contract renewal service — emit ContractRenewalOffer events at season_end
 * for contracts with ≤8 weeks remaining; resolve accept/decline/counter.
 *
 * Per `design/gdd/player-management.md` and ADR-016 + ADR-015 (event payloads):
 *   - 8-week renewal window before contract expiry.
 *   - Default decision on timeout = 'decline'.
 *   - Counter accepted if counterSalary ≤ market_wage × 1.5; else decline.
 *
 * Story: PLAYER-MANAGEMENT-011 (TR-PM-011)
 */

import { computeMarketWageF10, computeTransferValue } from '@smt/shared';
import type { Player } from '@smt/db';
import * as PlayersRepo from './repo';

export const RENEWAL_WARNING_WEEKS = 8;
export const DEFAULT_RENEWAL_CONTRACT_WEEKS = 104;
export const COUNTER_MAX_MULTIPLIER = 1.5;

export interface RenewalCandidate {
  readonly playerId: string;
  readonly weeksRemaining: number;
  readonly proposedSalaryEurK: number;
}

/**
 * Scan all players belonging to `clubId` and return those eligible for the
 * renewal warning (≤ 8 weeks left). The proposedSalary is the player's
 * market_wage × 1.0 — a fair offer the manager can accept or counter.
 */
export async function scanContractRenewals(
  tx: Parameters<typeof PlayersRepo.createPlayers>[0],
  playthroughId: string,
  clubId: string,
  currentWeek: number,
): Promise<readonly RenewalCandidate[]> {
  const players = await PlayersRepo.findByClub(tx, playthroughId, clubId);
  const renewals: RenewalCandidate[] = [];
  for (const player of players) {
    const weeksRemaining = player.contractEndWeek - currentWeek;
    if (weeksRemaining <= 0 || weeksRemaining > RENEWAL_WARNING_WEEKS) continue;
    const ageYears = Math.floor((currentWeek - player.birthWeek) / 52);
    const transferValue = computeTransferValue({
      skill: player.skill,
      age: ageYears,
      form: player.form,
    });
    const marketWage = computeMarketWageF10(transferValue);
    const proposedSalaryEurK = Math.max(1, Math.round(marketWage * 10) / 10);
    renewals.push({
      playerId: player.id,
      weeksRemaining,
      proposedSalaryEurK,
    });
  }
  return renewals;
}

export type RenewalResolution =
  | { kind: 'accept'; salaryEurK: number; contractWeeks?: number }
  | { kind: 'decline' }
  | { kind: 'counter'; counterSalaryEurK: number; contractWeeks?: number };

export type RenewalOutcome =
  | { ok: true; resolution: 'accepted' | 'declined' | 'counter_accepted' }
  | { ok: false; reason: 'player_not_found' | 'counter_too_high' };

/**
 * Resolve a renewal decision. Updates `salaryEurK` + `contractEndWeek` on
 * accept; sets `availability='leaving'` on decline.
 *
 * Counter: accepted if counter ≤ market_wage × COUNTER_MAX_MULTIPLIER; else
 * declined (player leaves free at contract end).
 */
export async function resolveContractRenewal(
  tx: Parameters<typeof PlayersRepo.createPlayers>[0],
  playerId: string,
  resolution: Readonly<RenewalResolution>,
  currentWeek: number,
): Promise<RenewalOutcome> {
  const player = await PlayersRepo.findById(tx, playerId);
  if (!player) {
    return { ok: false, reason: 'player_not_found' };
  }
  const contractWeeks =
    'contractWeeks' in resolution
      ? resolution.contractWeeks ?? DEFAULT_RENEWAL_CONTRACT_WEEKS
      : DEFAULT_RENEWAL_CONTRACT_WEEKS;

  if (resolution.kind === 'accept') {
    await PlayersRepo.updatePlayer(tx, playerId, {
      salaryEurK: resolution.salaryEurK,
      contractStartWeek: currentWeek,
      contractEndWeek: currentWeek + contractWeeks,
    });
    return { ok: true, resolution: 'accepted' };
  }

  if (resolution.kind === 'decline') {
    await PlayersRepo.updatePlayer(tx, playerId, {
      availability: 'leaving',
    });
    return { ok: true, resolution: 'declined' };
  }

  // counter
  const ageYears = Math.floor((currentWeek - player.birthWeek) / 52);
  const transferValue = computeTransferValue({
    skill: player.skill,
    age: ageYears,
    form: player.form,
  });
  const marketWage = computeMarketWageF10(transferValue);
  const ceiling = marketWage * COUNTER_MAX_MULTIPLIER;
  if (resolution.counterSalaryEurK > ceiling) {
    // Counter too high → player leaves
    await PlayersRepo.updatePlayer(tx, playerId, {
      availability: 'leaving',
    });
    return { ok: false, reason: 'counter_too_high' };
  }
  await PlayersRepo.updatePlayer(tx, playerId, {
    salaryEurK: resolution.counterSalaryEurK,
    contractStartWeek: currentWeek,
    contractEndWeek: currentWeek + contractWeeks,
  });
  return { ok: true, resolution: 'counter_accepted' };
}
