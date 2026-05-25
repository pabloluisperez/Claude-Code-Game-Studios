/**
 * Scouting & transfer market shared types. Story SCOUTING-MARKET-002.
 */

export type VisibilityTier = 0 | 1 | 2 | 3;
export type ScoutAction = 'scout' | 'deep_scout';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';
export type ActionStatus = 'pending' | 'completed' | 'refunded' | 'expired';

/**
 * Live read view of a manager's scouting progress for a given (player, window).
 * Implementations wrap DB queries. Service code receives this interface so
 * the visibility computation is pure-function testable.
 */
export type ManagerScoutState = {
  hasScouted: (playerId: string) => boolean;
  hasDeepScouted: (playerId: string) => boolean;
  scoutCompletedAtWeek: (playerId: string) => number | null;
  deepScoutCompletedAtWeek: (playerId: string) => number | null;
  /** 0 = no Scout Director hired, 1..3 = quality tier of the staff member. */
  scoutDirectorTier: 0 | 1 | 2 | 3;
};

export type PoolVisibility = {
  freeAgents: number | 'ALL';
  aiCurrentDiv: number;
  aiOtherDiv: number;
  total: number | string;
};

export type PoolPlayer = {
  id: string;
  name: string;
  age: number;
  position: string;
  currentClub: string | null;
  contractStatus: 'in_contract' | 'expiring' | 'free_agent';
  visibilityTier: VisibilityTier;

  // T1 reveals
  ovrBand?: string;
  transferValueBand?: string;
  // T2 reveals
  ovrEstimate?: number;
  transferValueEstimate?: number;
  moraleBand?: string;
  // T3 reveals
  ovrExact?: number;
  transferValueExact?: number;
  moraleExact?: number;
  fitnessExact?: number;
  recentForm?: number;
};
