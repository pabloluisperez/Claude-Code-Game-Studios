/**
 * Museum / trophies-history shared types. Story TROPHIES-HISTORY-002.
 *
 * Read-only domain: the museum module never mutates state — it aggregates
 * existing data from league-system, match-simulation, player-management,
 * economy, and stadium-upgrades into a single view.
 */

export type MuseumDivision = 'D1' | 'D2';

export type LegendaryMatchInput = {
  goalsFor: number;
  goalsAgainst: number;
  fan_momentum_delta: number;
  is_derby: boolean;
  is_cup_final: boolean;
  result: 'win' | 'draw' | 'loss';
};

export type LegendTransferInput = {
  value_eur_k: number;
  direction: 'in' | 'out';
};

export type PlayerCareerHistory = {
  /** Longest streak of consecutive weeks the player held a TOP_5 slot. */
  max_consecutive_weeks_in_top5: number;
};

export type MuseumObjectCounts = {
  trophies: number;
  banners: number;
  legendTransfers: number;
  financialMilestones: number;
  stadiumHistory: number;
};
