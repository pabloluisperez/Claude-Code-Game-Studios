export * from './types/clubs.js';
export * from './types/socket.js';
export * from './schemas/auth.js';
export * from './schemas/clubs.js';

// Cascade-engine type exports (cascade-engine epic — consumed by staff-system,
// match-simulation, and any consumer needing WorldState / NodeId / ThresholdCrossing).
export {
  type NodeId,
  type WorldState,
  type ThresholdCrossing,
  type SimContext,
  type TickResult,
  type CascadeLog,
  defaultWorldState,
  NODE_IDS,
} from './sim/cascade-types.js';

// Seeded PRNG helper — wraps seedrandom so consumers (apps/web onboarding,
// future tooling) don't need to add seedrandom as a direct dependency.
export { createSeededRng } from './sim/rng.js';

// Cascade-engine runtime — runTick + the canonical Cascada FC edge definitions.
export { runTick } from './sim/cascade-engine.js';
export { CASCADA_FC_GRAPH, type CascadeEdgeDef } from './sim/cascade-graph.js';
export type { DelayedEffectsBuffer } from './sim/delayed-effects.js';

// League content generators (AI clubs + double round-robin fixtures).
export {
  generateAiClubs,
  generateDoubleRoundRobin,
  type AiClubSeed,
  type FixturePair,
} from './sim/league-gen.js';

// Quick batch match simulator — used for AI-vs-AI fixtures on advance week.
export {
  quickSimulateMatch,
  type QuickPlayerInput,
  type QuickMatchResult,
} from './sim/quick-match.js';

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

// Economy (ECONOMY-002..006)
export {
  EN_RIESGO_BALANCE_THRESHOLD,
  CRISIS_BALANCE_THRESHOLD,
  QUIEBRA_BALANCE_THRESHOLD,
  TV_RIGHTS_PRIMERA,
  TV_RIGHTS_SEGUNDA,
  PRIMERA_REFERENCE_MAX,
  MAX_TICKET_FLOOR_SEGUNDA,
  MAX_TICKET_FLOOR_PRIMERA,
  PAYROLL_FREEZE_WEEKS,
  PAYROLL_FREEZE_REDUCTION,
  PAYROLL_FREEZE_HAPPINESS_PENALTY,
  MAINTENANCE_BASELINE,
} from './sim/economy/constants.js';
export {
  maxTicketEur,
  marketTicketEur,
  computeMatchDayRevenue,
  computeSponsorIncome,
  computeTvRights,
  computeWeeklyRevenue,
  type MaxTicketArgs,
  type MatchDayRevenueArgs,
  type ActiveSponsorRow,
  type WeeklyRevenueArgs,
  type WeeklyRevenueBreakdown,
} from './sim/economy/revenue.js';
export {
  computePlayerPayroll,
  computeStaffPayroll,
  budgetNodeToEurK,
  computeWeeklyCosts,
  type PlayerForPayroll,
  type StaffForPayroll,
  type WeeklyCostArgs,
  type WeeklyCostBreakdown,
} from './sim/economy/costs.js';
export {
  computeFinancialStatus,
  bankruptcyTransition,
  FINANCIAL_STATUS_NAMES,
  type FinancialStatus,
  type BankruptcyTransition,
} from './sim/economy/bankruptcy.js';

// Manager-RPG (MANAGER-RPG-002..006)
export {
  MANAGER_SKILL_IDS,
  MAX_SKILL_LEVEL,
  type ManagerSkillId,
  type SkillLevel,
  type ManagerSkill,
  type ManagerSkills,
  type ManagerProfile,
  type XpGrant,
  type SkillLevelUp,
} from './sim/manager-rpg/types.js';
export {
  calculateXpToNextLevel,
  initManagerSkills,
  applyXpGrants,
  INITIAL_MANAGER_SKILL,
  type ApplyXpGrantsResult,
} from './sim/manager-rpg/xp.js';
export {
  XP_SOURCES,
  computeXpGrants,
} from './sim/manager-rpg/xp-sources.js';
export {
  getMaxHirableStaffQuality,
  isStaffTierHirable,
  type StaffQualityTier,
} from './sim/manager-rpg/staff-gating.js';

// Staff-system (STAFF-SYSTEM-001..005)
export {
  STAFF_ROLES,
  QUALITY_FACTOR,
  STAFF_WEEKLY_WAGE_EURK,
  DEFAULT_DOMAIN_BY_ROLE,
  MAX_ROUTINE_MESSAGES_PER_STAFF_PER_WEEK,
  type StaffRole,
  type MessagePriority,
  type MessageDirection,
  type StaffPerceptionConfig,
} from './sim/staff-system/types.js';
export {
  STAFF_MESSAGE_TEMPLATES,
  TEMPLATE_FALLBACK,
  resolveMessageTemplate,
  type ResolveTemplateArgs,
} from './sim/staff-system/templates.js';
export {
  buildPerceptionConfig,
  diffWorldStates,
  generateStaffMessages,
  type MinimalStaffMember,
  type GeneratedStaffMessage,
  type GenerateMessagesArgs as StaffPerceptionArgs,
} from './sim/staff-system/perception.js';

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

// Event-system (EVENT-SYSTEM-001..006)
export type {
  EventPriority,
  EventOption,
  EventDecisionPayload,
  EventChoiceId,
  BoardMeetingCrisisPayload,
  BoardMeetingQuiebraPayload,
  NominaFrozenOfferPayload,
  SponsorOfferPayload,
  SponsorRenewalPayload,
  ScandalResponsePayload,
  CorruptionCaughtPayload,
  TransferOfferPayload,
  ContractRenewalOfferPayload,
  YouthPromotionPayload,
  AlcaldeMeetingPayload,
  ExternalManagerOfferPayload,
  StadiumUpgradeOfferPayload,
  SideEffect,
  ResolutionResult,
} from './sim/event-system/types.js';
export {
  resolveEvent,
  resolveDefault,
  type EventResolveContext,
} from './sim/event-system/resolver.js';
export {
  pickNextStopEvent,
  pickAdvisoryEvents,
  isAdvanceBlocked,
  eventDefaultChoice,
  type PendingEvent,
} from './sim/event-system/fsm.js';
