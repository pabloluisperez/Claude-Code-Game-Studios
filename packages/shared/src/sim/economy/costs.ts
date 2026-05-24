/**
 * Weekly cost calculator.
 *
 * Per ADR-014 + GDD economy.md §F3:
 *   costs = playerWages + staffWages + catering + scouting + groundskeeper + maintenance
 *
 * Inputs come from PlayersRepo (Story PM-002), StaffRepo (Story STAFF-001),
 * and WorldState budget nodes (catering_budget, scouting_budget,
 * groundskeeper_budget) — each interpreted as €K/week.
 *
 * Pure function. No DB. No rng.
 *
 * Story: ECONOMY-003 (TR-ECO-003)
 * Control Manifest: 2026-05-19
 */

import { MAINTENANCE_BASELINE } from './constants.js';

// ── Payroll (players + staff) ────────────────────────────────────────────────

export interface PlayerForPayroll {
  readonly salaryEurK: number;
  readonly availability: string;
}

/**
 * Sum of player.salaryEurK for active players.
 * Excludes players with availability='leaving' (post-season — they've already left).
 */
export function computePlayerPayroll(
  players: readonly PlayerForPayroll[],
  payrollMultiplier = 1.0,
): number {
  let total = 0;
  for (const p of players) {
    if (p.availability === 'leaving') continue;
    total += p.salaryEurK;
  }
  return Math.round(total * payrollMultiplier);
}

export interface StaffForPayroll {
  readonly weeklyEurK: number;
}

export function computeStaffPayroll(staff: readonly StaffForPayroll[]): number {
  let total = 0;
  for (const s of staff) total += s.weeklyEurK;
  return total;
}

// ── Cascade-budget costs ─────────────────────────────────────────────────────

/**
 * Convert a 0..100 budget node value to €K/week.
 * The cascade uses normalized 0..100 budget nodes; this scales them to euros.
 * Each system pays differently per the GDD; baseline is 0.4 €K per budget point.
 */
export function budgetNodeToEurK(budgetNodeValue: number): number {
  return Math.round(budgetNodeValue * 0.04 * 10) / 10; // 4 €K at budget=100
}

// ── Aggregate weekly cost ────────────────────────────────────────────────────

export interface WeeklyCostArgs {
  readonly players: readonly PlayerForPayroll[];
  readonly staff: readonly StaffForPayroll[];
  /** WorldState `catering_budget` node value (0..100). */
  readonly cateringBudget: number;
  /** WorldState `scouting_budget` node value (0..100). */
  readonly scoutingBudget: number;
  /** WorldState `groundskeeper_budget` node value (0..100). */
  readonly groundskeeperBudget: number;
  /** Optional multiplier for player wages (set to 0.75 during "Congelación de nómina"). */
  readonly payrollMultiplier?: number;
}

export interface WeeklyCostBreakdown {
  readonly playerWages: number;
  readonly staffWages: number;
  readonly catering: number;
  readonly scouting: number;
  readonly groundskeeper: number;
  readonly maintenance: number;
  readonly total: number;
}

export function computeWeeklyCosts(
  args: Readonly<WeeklyCostArgs>,
): WeeklyCostBreakdown {
  const playerWages = computePlayerPayroll(args.players, args.payrollMultiplier ?? 1.0);
  const staffWages = computeStaffPayroll(args.staff);
  const catering = budgetNodeToEurK(args.cateringBudget);
  const scouting = budgetNodeToEurK(args.scoutingBudget);
  const groundskeeper = budgetNodeToEurK(args.groundskeeperBudget);
  const maintenance = MAINTENANCE_BASELINE;
  const total =
    playerWages + staffWages + catering + scouting + groundskeeper + maintenance;
  return {
    playerWages,
    staffWages,
    catering,
    scouting,
    groundskeeper,
    maintenance,
    total: Math.round(total * 10) / 10, // 1-decimal precision
  };
}
