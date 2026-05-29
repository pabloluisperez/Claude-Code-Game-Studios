/**
 * Contract status classification. Story 25-2.
 *
 * A player's contract status is determined by:
 *   1. free_agent: contractStatus === 'free_agent' OR clubId is NULL
 *   2. expiring: weeks until contract end ≤ 8 (Bosman threshold)
 *   3. in_contract: everything else
 *
 * The classification is server-authoritative; the frontend receives the
 * computed value and cannot override it.
 */

export type ContractStatus = 'in_contract' | 'expiring' | 'free_agent';

/**
 * Number of weeks until a player's contract expires.
 * Negative values mean the contract has already ended.
 */
export function weeksUntilContractEnd(contractEndWeek: number, currentWeek: number): number {
  return contractEndWeek - currentWeek;
}

/**
 * Classify a player's contract status.
 *
 * @param opts - Classification parameters
 * @param opts.contractStatus - Raw DB column value
 * @param opts.clubId - Player's club (NULL means free agent)
 * @param opts.contractEndWeek - Week when contract ends
 * @param opts.currentWeek - Current playthrough week
 * @returns Classified contract status
 */
export function classifyContractStatus(opts: {
  contractStatus: string | null;
  clubId: string | null;
  contractEndWeek: number;
  currentWeek: number;
}): ContractStatus {
  // Priority 1: explicit free agent or no club
  if (opts.contractStatus === 'free_agent' || opts.clubId === null) {
    return 'free_agent';
  }

  // Priority 2: expiring contract (≤8 weeks remaining — Bosman rule)
  if (weeksUntilContractEnd(opts.contractEndWeek, opts.currentWeek) <= 8) {
    return 'expiring';
  }

  // Priority 3: still under contract
  return 'in_contract';
}
