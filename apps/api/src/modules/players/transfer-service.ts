/**
 * Transfer market service — buy/sell within open transfer windows.
 *
 * Per `design/gdd/player-management.md` and ADR-016:
 *   - Buy: offer ≥ transfer_value × 0.9 → accepted.
 *   - Operations rejected with 'market_closed' outside the window.
 *   - Wrapped in a Drizzle transaction by the route handler (caller).
 *
 * Story: PLAYER-MANAGEMENT-010 (TR-PM-010)
 */

import { computeTransferValue } from '@smt/shared';
import type { Player } from '@smt/db';
import * as PlayersRepo from './repo';

/** Buy acceptance threshold from the GDD: offer ≥ value × 0.9. */
export const BUY_ACCEPTANCE_THRESHOLD = 0.9;

export type TransferRejection =
  | 'market_closed'
  | 'offer_below_threshold'
  | 'player_not_found'
  | 'player_not_for_sale';

export type TransferResult =
  | { ok: true; playerId: string; price: number }
  | { ok: false; reason: TransferRejection };

export interface BuyArgs {
  readonly playthroughId: string;
  readonly buyingClubId: string;
  readonly playerId: string;
  readonly offerEurK: number;
  readonly transferWindowOpen: boolean;
  /** Age derived from currentWeek - player.birthWeek (in seasons). */
  readonly playerAgeYears: number;
  readonly currentWeek: number;
}

/**
 * Attempt to buy a player from an AI club. Returns rejection or success.
 * Caller is responsible for the surrounding Drizzle transaction (which also
 * debits the buying club's balance via economy module).
 */
export async function buyPlayer(
  tx: Parameters<typeof PlayersRepo.createPlayers>[0],
  args: Readonly<BuyArgs>,
): Promise<TransferResult> {
  if (!args.transferWindowOpen) {
    return { ok: false, reason: 'market_closed' };
  }
  const player = await PlayersRepo.findById(tx, args.playerId);
  if (!player) {
    return { ok: false, reason: 'player_not_found' };
  }
  const value = computeTransferValue({
    skill: player.skill,
    age: args.playerAgeYears,
    form: player.form,
  });
  const threshold = value * BUY_ACCEPTANCE_THRESHOLD;
  if (args.offerEurK < threshold) {
    return { ok: false, reason: 'offer_below_threshold' };
  }
  // Reassign player to the buying club
  await PlayersRepo.updatePlayer(tx, args.playerId, {
    clubId: args.buyingClubId,
    contractStartWeek: args.currentWeek,
  });
  return { ok: true, playerId: args.playerId, price: args.offerEurK };
}

export interface SellArgs {
  readonly playthroughId: string;
  readonly sellingClubId: string;
  readonly playerId: string;
  readonly buyerClubId: string;
  readonly offerEurK: number;
  readonly transferWindowOpen: boolean;
  readonly playerAgeYears: number;
  readonly currentWeek: number;
}

/**
 * Resolve a sale: an AI club has made an offer ≥ threshold for one of the
 * manager's players, and the manager accepts. Player moves to buyer club;
 * balance credit happens in the economy module via the caller.
 */
export async function sellPlayer(
  tx: Parameters<typeof PlayersRepo.createPlayers>[0],
  args: Readonly<SellArgs>,
): Promise<TransferResult> {
  if (!args.transferWindowOpen) {
    return { ok: false, reason: 'market_closed' };
  }
  const player = await PlayersRepo.findById(tx, args.playerId);
  if (!player) {
    return { ok: false, reason: 'player_not_found' };
  }
  if (player.clubId !== args.sellingClubId) {
    return { ok: false, reason: 'player_not_for_sale' };
  }
  const value = computeTransferValue({
    skill: player.skill,
    age: args.playerAgeYears,
    form: player.form,
  });
  const threshold = value * BUY_ACCEPTANCE_THRESHOLD;
  if (args.offerEurK < threshold) {
    return { ok: false, reason: 'offer_below_threshold' };
  }
  await PlayersRepo.updatePlayer(tx, args.playerId, {
    clubId: args.buyerClubId,
    contractStartWeek: args.currentWeek,
  });
  return { ok: true, playerId: args.playerId, price: args.offerEurK };
}
