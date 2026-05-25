/**
 * F6: AI club rotation mini-loop (pure-function pieces).
 * Story SCOUTING-MARKET-003. Used by the BullMQ worker in story 24-6.
 */

export const AGE_DECLINE_THRESHOLD = 30;
export const LOW_MORALE_THRESHOLD = 30;
export const TRANSFER_REQUEST_PROB = 0.15;
export const MIN_ROSTER_SIZE = 18;
export const TARGET_ROSTER_SIZE = 22;
export const AI_TRANSFER_BUDGET_PCT = 0.1;
export const FOR_SALE_RATIO_AGE_DECLINE = 0.5;
export const AI_BARGAIN_FACTOR_MIN = 0.85;
export const AI_BARGAIN_FACTOR_MAX = 1.2;

export type RngFn = () => number;

/** Pull a bargain factor from a seeded RNG. Deterministic given the sequence. */
export function generateBargainFactor(rng: RngFn): number {
  return AI_BARGAIN_FACTOR_MIN + rng() * (AI_BARGAIN_FACTOR_MAX - AI_BARGAIN_FACTOR_MIN);
}

export type MarkForSaleResult =
  | { mark: false }
  | { mark: true; reason: 'age_decline' | 'transfer_request' };

/**
 * Decide if a player on an AI club's roster should be marked for sale this window.
 * Pure function — caller persists.
 */
export function shouldMarkForSale(
  player: { age: number; morale: number },
  club: { rosterSize: number },
  rng: RngFn,
): MarkForSaleResult {
  if (player.age > AGE_DECLINE_THRESHOLD && club.rosterSize > MIN_ROSTER_SIZE) {
    if (rng() < FOR_SALE_RATIO_AGE_DECLINE) {
      return { mark: true, reason: 'age_decline' };
    }
  }
  if (player.morale < LOW_MORALE_THRESHOLD) {
    if (rng() < TRANSFER_REQUEST_PROB) {
      return { mark: true, reason: 'transfer_request' };
    }
  }
  return { mark: false };
}

/** Compute AI club transfer budget for this window (10% of balance, floor 0). */
export function aiTransferBudget(club: { financialBalanceEurK: number }): number {
  return Math.max(0, Math.floor(club.financialBalanceEurK * AI_TRANSFER_BUDGET_PCT));
}

/**
 * Compute positional gaps. Returns positions ordered by gap size (largest first).
 * The 4 buckets follow the existing match-sim's GK/DEF/MID/FWD shape.
 */
export function computeSquadGaps(club: { roster: { position: string }[] }): string[] {
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of club.roster) {
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  const targets: Record<string, number> = { GK: 3, DEF: 8, MID: 7, FWD: 4 };
  const gaps: Array<{ pos: string; gap: number }> = [];
  for (const pos in targets) {
    const gap = (targets[pos] ?? 0) - (counts[pos] ?? 0);
    if (gap > 0) gaps.push({ pos, gap });
  }
  return gaps.sort((a, b) => b.gap - a.gap).map((g) => g.pos);
}
