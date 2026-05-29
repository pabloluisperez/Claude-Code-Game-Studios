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

// In-game calendar (week → real date).
export {
  weekToDate,
  dayOfSeasonToDate,
  weekPhase,
  CALENDAR_ANCHOR_ISO,
  LEAGUE_KICKOFF_WEEK,
  type InGameDate,
} from './sim/calendar.js';

// Newspaper headlines generator.
export {
  generateHeadlines,
  type Headline,
  type HeadlineContext,
} from './sim/headlines.js';

// Player personality traits (cosmetic in MVP).
export {
  pickTraits,
  describeTraits,
  TRAITS,
  type TraitDef,
} from './sim/player-traits.js';

// Match recap (newspaper-style summary).
export {
  generateMatchRecap,
  type MatchRecapArgs,
} from './sim/match-recap.js';

// Cascade-engine runtime — runTick + the canonical Cascada FC edge definitions.
export { runTick } from './sim/cascade-engine.js';
export { CASCADA_FC_GRAPH, type CascadeEdgeDef } from './sim/cascade-graph.js';
export type { DelayedEffectsBuffer } from './sim/delayed-effects.js';
export { DelayedEffectsJsonSchema } from './sim/delayed-effects.js';

// WorldState + DelayedEffectsBuffer JSON serialization (ADR-005 boundary).
export {
  WorldStateJsonSchema,
  SnapshotPayloadJsonSchema,
  serializeWorldState,
  deserializeWorldState,
  serializeDelayedEffectsBuffer,
  deserializeDelayedEffectsBuffer,
  type SnapshotPayload,
} from './sim/world-state-serde.js';

// Presentation state — day-night + weather (ADR-022, v1.1 Pillar B).
export {
  derivePresentationState,
  timeToDayNightBucket,
  effectiveInfrastructureLevel,
  WEATHER_RAIN_PROBABILITY,
  MATCH_DAY_TIME_OF_DAY,
  RAIN_INFRASTRUCTURE_PENALTY,
  type PresentationState,
  type Weather,
  type DayNightBucket,
} from './sim/presentation-state.js';

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
  type QuickMatchEvent,
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
  suspensionMatches,
  extractSuspensions,
  processYellowAccumulation,
  isPlayerAvailable,
  returnMatchday,
  YELLOW_SEASON_SUSPENSION_THRESHOLD,
  type SuspensionEntry,
  type YellowAccumulationEntry,
} from './sim/sports/football/suspension.js';
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
// Note: TV_RIGHTS_PRIMERA, TV_RIGHTS_SEGUNDA, computeTvRights() removed in
// tv-rights epic per ADR-019 (TR-TVR-009 BREAKING CHANGE). TV revenue is now
// contract-driven via the tv-rights module.
export {
  EN_RIESGO_BALANCE_THRESHOLD,
  CRISIS_BALANCE_THRESHOLD,
  QUIEBRA_BALANCE_THRESHOLD,
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
  computeEffectiveTicketPrice,
  computeMatchDayRevenue,
  computeSponsorIncome,
  computeWeeklyRevenue,
  type MaxTicketArgs,
  type EffectiveTicketPriceArgs,
  type EffectiveTicketPriceResult,
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
  merchUnitCost,
  merchBatchCost,
  merchLeadTimeWeeks,
  computeMerchSales,
  computeConcessionRevenue,
  computeConcessionSales,
  MERCH_BASE_COST,
  MERCH_FLOOR_COST,
  type MerchKind,
  type MerchLine,
  type MerchSaleResult,
  type ConcessionKind,
  type ConcessionPrices,
  type ConcessionLine,
  type ConcessionResult,
} from './sim/economy/commercial.js';
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
  resolveTransferWindow,
  type EventResolveContext,
} from './sim/event-system/resolver.js';
export {
  pickNextStopEvent,
  pickAdvisoryEvents,
  isAdvanceBlocked,
  eventDefaultChoice,
  type PendingEvent,
} from './sim/event-system/fsm.js';

// TV Rights (TVR-001..010) — per ADR-019 + GDD design/gdd/tv-rights.md
export {
  // Types
  type TVTier,
  type TVStatus,
  type TVDivision,
  type TVDurationSeasons,
  type TVCancelReason,
  type TVRiskFlag,
  type TVDurationOption,
  type TVAuctionOffer,
  type TVAuctionPayload,
  type TVMidseasonOfferPayload,
  type TVPrePhaseResult,
  type TVPostPhaseResult,
  type TVTickContract,
  type AuctionContext,
  // Constants
  TV_BASE_CENTS,
  DIVISION_MULTIPLIER_CENTS,
  DURATION_MULTIPLIER_CENTS,
  CORRUPTION_DELTA_PER_WEEK,
  TV_SCANDAL_THRESHOLD,
  CORRUPTION_MAX,
  MID_SEASON_PENALTY_FACTOR_CENTS,
  MIDSEASON_OFFER_MIN_WEEKS_REMAINING_CUTOFF,
  REGIONAL_MIN_POSITION,
  REGIONAL_MIN_REPUTATION,
  NACIONAL_MIN_REPUTATION,
  FAN_LOYALTY_PER_REJECTION,
  FAN_LOYALTY_CAP,
  FAN_LOYALTY_ATTENDANCE_FACTOR,
  XP_REGIONAL_SIGN,
  XP_NACIONAL_SIGN,
  // Formulas
  calculateTVRate,
  calculateMidseasonRate,
  getLegalDurations,
  TVRangeError,
  applyTVCorruptionDelta,
  evaluateThresholdCrossings,
  crossedTVScandalThreshold,
  roundCorruption,
  parseCorruption,
  generateTVAuctionOffers,
  buildTVAuctionPayload,
  buildMidseasonOffer,
  TIER_BELOW,
  applyTVPrePhase,
  applyTVPostPhase,
  calculateFanAttendanceEffective,
  applyFanLoyaltyRejection,
} from './sim/tv-rights/index.js';

// Stadium upgrades v1.1 (Sprint 22)
export type {
  Track as StadiumTrack,
  ItemTier as StadiumItemTier,
  ItemStatus as StadiumItemStatus,
  CompletedItemsByTrack,
  StadiumState,
} from './sim/stadium/types.js';
export { STADIUM_TRACKS } from './sim/stadium/types.js';
export {
  stadiumVisualLevel,
  G_MAX as STADIUM_GRADAS_MAX,
  P_MAX as STADIUM_PITCH_MAX,
  S_MAX as STADIUM_SERVICIOS_MAX,
} from './sim/stadium/visual-level.js';
export {
  infrastructureLevel,
  STADIUM_ITEMS_MAX,
  TRAINING_ITEMS_MAX,
  ACADEMY_ITEMS_MAX,
} from './sim/stadium/infrastructure.js';
export {
  costOfItem,
  BASE_COST_TIER,
  TRACK_MULTIPLIER,
  CONSTRUCTION_SKILL_DISCOUNT,
  type CostModifiers,
} from './sim/stadium/cost.js';
export {
  durationWeeks,
  DURATION_BASE,
  DUR_MIN,
  DUR_MAX,
} from './sim/stadium/duration.js';
export {
  stadiumCapacity,
  STADIUM_CAPACITY_BASE,
  CAPACITY_PER_GRADA_ITEM,
} from './sim/stadium/capacity.js';
export {
  itemsRequiredForLevel,
  tierUpReformasGateSatisfied,
  TIER_UP_GATE_PCT,
} from './sim/stadium/gate.js';

// Museum / trophies-history v1.1 (Sprint 23)
export type {
  MuseumDivision,
  LegendaryMatchInput,
  LegendTransferInput,
  PlayerCareerHistory,
  MuseumObjectCounts,
} from './sim/museum/types.js';
export {
  legendaryMatchQualifies,
  topPlayerFlag,
  legendTransferQualifies,
  museumObjectsCount,
  museumDensity,
  LEGENDARY_THRESHOLD,
  LANDSLIDE_THRESHOLD,
  TOP_5_MIN_WEEKS,
  LEGEND_TRANSFER_THRESHOLD,
  MUSEUM_FULL_OBJECTS,
  MUSEUM_PERF_CAP,
} from './sim/museum/formulas.js';
export {
  trophyTemplates,
  bannerTemplates,
  transferTemplates,
  milestoneTemplates,
  stadiumHistoryTemplate,
  pickAdjective,
  pickTrophyTemplate,
  SUMMARY_ADJECTIVES,
} from './i18n/museum-templates.js';

// Scouting & transfer market v1.1 (Sprint 24)
export type {
  VisibilityTier,
  ScoutAction,
  OfferStatus,
  ActionStatus,
  ManagerScoutState,
  PoolVisibility,
  PoolPlayer,
} from './sim/scouting/types.js';
export {
  visibilityTierOf,
  T3_DELAY_WEEKS,
  T3_SCOUT_DIRECTOR_THRESHOLD_TIER,
} from './sim/scouting/visibility.js';
export {
  poolVisibilitySize,
  AI_PLAYERS_CURRENT_DIV_BASE,
  AI_PLAYERS_CURRENT_DIV_PER_LEVEL,
  AI_PLAYERS_OTHER_DIV_BASE,
  AI_PLAYERS_OTHER_DIV_PER_LEVEL,
} from './sim/scouting/pool-size.js';
export { stripFieldsForTier } from './sim/scouting/visibility-field-stripping.js';
export {
  freeAgentAcceptance,
  DESPERATION_DISCOUNT_PCT,
  DESPERATION_WEEKS_FULL_DISCOUNT,
} from './sim/scouting/free-agent.js';
export {
  aiClubAcceptance,
  type AuctionResult,
  AI_NEED_PREMIUM,
  AI_COUNTER_OFFER_MARKUP,
  AI_HARD_REJECT_THRESHOLD,
} from './sim/scouting/auction.js';
export {
  scoutActionCost,
  SCOUT_COST_EUR_K,
  DEEP_SCOUT_COST_EUR_K,
  SCOUT_DIRECTOR_T3_COST_DISCOUNT,
} from './sim/scouting/cost.js';
export {
  classifyContractStatus,
  weeksUntilContractEnd,
  type ContractStatus,
} from './sim/scouting/contract-status.js';
export {
  generateBargainFactor,
  shouldMarkForSale,
  aiTransferBudget,
  computeSquadGaps,
  AI_BARGAIN_FACTOR_MIN,
  AI_BARGAIN_FACTOR_MAX,
  AGE_DECLINE_THRESHOLD,
  LOW_MORALE_THRESHOLD,
  TRANSFER_REQUEST_PROB,
  MIN_ROSTER_SIZE,
  TARGET_ROSTER_SIZE,
  AI_TRANSFER_BUDGET_PCT,
  FOR_SALE_RATIO_AGE_DECLINE,
  type MarkForSaleResult,
  type RngFn,
} from './sim/scouting/ai-rotation-logic.js';

// Narrative template generator v1.2 (Sprint 26) — replaces deferred LLM Pillar D
export type {
  NarrativeContext,
  NarrativeTemplate,
  VocabTable,
} from './sim/narrative/types.js';
export { render as renderNarrative, pickFromVocab } from './sim/narrative/engine.js';
export { DEFAULT_VOCAB } from './sim/narrative/vocab.js';
export {
  matchOutcomeTemplates,
  financialPositiveTemplates,
  financialWarningTemplates,
  pressDerbyTemplates,
  mayorCallTemplates,
} from './sim/narrative/library.js';
