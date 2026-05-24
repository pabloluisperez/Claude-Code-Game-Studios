/**
 * Staff-system types — per ADR-009 §Key Interfaces.
 *
 * 6 roles, 3 quality tiers, URGENT/ROUTINE message priority.
 * Per ADR-009: qualityFactor by tier: 1→×3.0 (crude), 2→×1.5, 3→×1.0 (fine).
 *
 * Story: STAFF-SYSTEM-001/002
 * Control Manifest: 2026-05-19
 */

export type StaffRole =
  | 'groundskeeper'
  | 'fitness_coach'
  | 'commercial_director'
  | 'scouting_director'
  | 'finance_director'
  | 'head_coach';

export const STAFF_ROLES: readonly StaffRole[] = Object.freeze([
  'groundskeeper',
  'fitness_coach',
  'commercial_director',
  'scouting_director',
  'finance_director',
  'head_coach',
]);

export type StaffQualityTier = 1 | 2 | 3;
export type MessagePriority = 'URGENT' | 'ROUTINE';
export type MessageDirection = 'above' | 'below';

/**
 * Per-tier quality factor that scales perception baseThresholdPct.
 *   tier 1 × 3.0 — only large changes noticed
 *   tier 2 × 1.5 — moderate sensitivity
 *   tier 3 × 1.0 — fine sensitivity, near-baseline
 */
export const QUALITY_FACTOR: Readonly<Record<StaffQualityTier, number>> = Object.freeze({
  1: 3.0,
  2: 1.5,
  3: 1.0,
});

/** Weekly wage by tier (€K). Tier-3 expensive — only hirable at reputation 4+. */
export const STAFF_WEEKLY_WAGE_EURK: Readonly<Record<StaffQualityTier, number>> = Object.freeze({
  1: 1,
  2: 3,
  3: 8,
});

export interface StaffPerceptionConfig {
  readonly staffId: string;
  readonly role: StaffRole;
  readonly qualityTier: StaffQualityTier;
  /** NodeIds this staff member perceives. */
  readonly domain: readonly string[];
  /** Base % change to notice (multiplied by QUALITY_FACTOR per tier). */
  readonly baseThresholdPct: number;
}

/**
 * Per-role default perception domain. Roles cover non-overlapping cascade
 * groups so messages don't duplicate across staff.
 */
export const DEFAULT_DOMAIN_BY_ROLE: Readonly<Record<StaffRole, readonly string[]>> = Object.freeze({
  groundskeeper: ['field_quality'],
  fitness_coach: ['team_fitness', 'injury_risk'],
  commercial_director: ['fan_momentum', 'fan_attendance', 'sponsor_quality'],
  scouting_director: ['scouting_points', 'squad_available_pct'],
  finance_director: ['financial_balance', 'weekly_cashflow', 'financial_status'],
  head_coach: ['staff_morale', 'player_happiness', 'match_performance_index'],
});

/** Anti-spam limit: max ROUTINE messages per staff member per week. */
export const MAX_ROUTINE_MESSAGES_PER_STAFF_PER_WEEK = 2;
