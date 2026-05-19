export * from './types/clubs.js';
export * from './types/socket.js';
export * from './schemas/auth.js';
export * from './schemas/clubs.js';

// Player management exports (Story PM-003..009)
export {
  computeSkill,
  SKILL_MIN as PM_SKILL_MIN,
  SKILL_MAX as PM_SKILL_MAX,
  type Position as PMPosition,
  type PositionStats,
} from './sim/player-management/skill.js';
export {
  generateRoster,
  DEFAULT_ROSTER_SIZE,
  POSITION_QUOTAS,
  type GeneratedPlayer,
  type GenerateRosterArgs,
} from './sim/player-management/world-gen.js';
export {
  MIN_FORM,
  MAX_FORM,
  FORM_DECAY_WEEKLY,
  FORM_GRACE_WEEKS,
  computeFormF4,
  computeFormDecayF5,
  applyFormUpdate,
} from './sim/player-management/form.js';
export {
  INJURY_MIN_WEEKS,
  INJURY_MAX_WEEKS,
  FITNESS_DECAY_MAX,
  FITNESS_RECOVERY_WEEKLY,
  applyInjuryEvent,
  applyWeeklyRecovery,
  computeFitnessPostMatch,
  computeFitnessRecovery,
  type Availability,
  type PlayerLifecycleState,
  type PlayerLifecyclePatch,
} from './sim/player-management/lifecycle.js';
export {
  SQUAD_REGISTERED_SIZE,
  FORFEIT_SQUAD_PCT_THRESHOLD,
  computeSquadAvailablePct,
  squadPctTriggersForceit,
  computeTeamSkill,
  computePlayerHappinessDelta,
  buildWorldStateDecisions,
} from './sim/player-management/world-state-sync.js';
export {
  MORALE_MIN,
  MORALE_MAX,
  WAGE_VALUE_RATIO,
  computeMarketWageF10,
  computeMoraleF11,
  type MatchResult as PMMatchResult,
  type MoraleUpdateArgs,
} from './sim/player-management/morale.js';
export {
  SKILL_FLOOR,
  SKILL_CEILING,
  SKILL_DECAY_MAX,
  DEVELOPMENT_THRESHOLD,
  computeF12Degradation,
  computeWeeklySkillDrift,
  computeEndOfSeasonDevelopment,
} from './sim/player-management/skill-lifecycle.js';
export {
  BASE_VALUE_K,
  SKILL_VALUE_EXP,
  TRANSFER_VALUE_FLOOR,
  computeTransferValue,
  type TransferValueArgs,
} from './sim/player-management/transfer-value.js';

// Match-simulation (MATCH-SIM-013..014)
export type {
  MatchInput,
  MatchOutcome,
  MatchEvent,
  MatchSessionSnapshot,
  MatchSessionState,
  PlayerStats,
  PlayerSlot,
  Lineup,
  FormationPreset,
  TeamInstruction,
  PreMatchSnapshot,
  Position as MatchSimPosition,
} from './sim/sports/football/football-types.js';
export { simulateMatch } from './sim/sports/football/match-simulation.js';
export {
  initMatchSession,
  advanceTick,
  validateDecision,
  applyDefaultDecisionsToSnapshot,
  type MatchDecision,
  type AdvanceTickResult,
  type PauseType,
} from './sim/sports/football/match-session-fsm.js';

// League-system (LEAGUE-SYSTEM-002..007)
export {
  generateRoundRobin,
  type FixtureDraft,
  type RoundRobinArgs,
} from './sim/league-system/round-robin.js';
export {
  computeStandingsSort,
  type StandingsRow,
  type StandingsSortArgs,
  type HeadToHeadMap,
} from './sim/league-system/standings-sort.js';
export {
  isDerby,
  findDerbiesInSeason,
  getRivalClub,
  buildDerbyPairSet,
  isDerbyPair,
  type DerbyClub,
  type DerbyFixture,
} from './sim/league-system/derby.js';
