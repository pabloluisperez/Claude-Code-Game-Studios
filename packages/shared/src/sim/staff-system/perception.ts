/**
 * Perception engine — given a WorldState diff + threshold crossings, compute
 * which staff messages should fire this week.
 *
 * Per ADR-009 §Architecture Diagram:
 *   for each staff member:
 *     config = buildPerceptionConfig(staffMember)
 *     for each nodeId in config.domain:
 *       delta = |newValue - prevValue| / nodeRange
 *       threshold = config.baseThresholdPct × qualityFactor(config.qualityTier)
 *       if delta >= threshold:
 *         emit ROUTINE message (until spam limit)
 *   for each BLOCKING threshold crossing:
 *     emit URGENT message (bypasses spam limit)
 *
 * Pure function — caller persists via repo.
 *
 * Story: STAFF-SYSTEM-004 (TR-STAFF-004)
 * Control Manifest: 2026-05-19
 */

import type { NodeId, ThresholdCrossing, WorldState } from '../cascade-types.js';
import { NODE_RANGES } from '../cascade-types.js';
import { resolveMessageTemplate } from './templates.js';
import {
  DEFAULT_DOMAIN_BY_ROLE,
  MAX_ROUTINE_MESSAGES_PER_STAFF_PER_WEEK,
  QUALITY_FACTOR,
  type MessageDirection,
  type MessagePriority,
  type StaffPerceptionConfig,
  type StaffQualityTier,
  type StaffRole,
} from './types.js';

export interface MinimalStaffMember {
  readonly id: string;
  readonly role: StaffRole;
  readonly qualityTier: StaffQualityTier;
}

export interface GeneratedStaffMessage {
  readonly staffId: string;
  readonly role: StaffRole;
  readonly tier: StaffQualityTier;
  readonly priority: MessagePriority;
  readonly templateKey: string;
  readonly content: string;
  readonly nodeId: string;
  readonly direction: MessageDirection;
  readonly isFallback: boolean;
}

/** Build a per-staff perception config (currently from defaults — extensible). */
export function buildPerceptionConfig(
  staff: Readonly<MinimalStaffMember>,
  baseThresholdPct = 0.05,
): StaffPerceptionConfig {
  return {
    staffId: staff.id,
    role: staff.role,
    qualityTier: staff.qualityTier,
    domain: DEFAULT_DOMAIN_BY_ROLE[staff.role],
    baseThresholdPct,
  };
}

/** Normalised |delta| as a fraction of the node's full range. */
function normalisedDelta(nodeId: string, prev: number, next: number): number {
  const range = (NODE_RANGES as Record<string, { min: number; max: number }>)[nodeId];
  if (!range) return 0;
  const span = range.max - range.min;
  if (span === 0) return 0;
  return Math.abs(next - prev) / span;
}

function inferDirection(prev: number, next: number): MessageDirection {
  return next >= prev ? 'above' : 'below';
}

export interface GenerateMessagesArgs {
  readonly staff: readonly MinimalStaffMember[];
  readonly worldStateDiff: Readonly<Record<string, { readonly prev: number; readonly next: number }>>;
  readonly thresholdCrossings: readonly ThresholdCrossing[];
  /** Optional: override default baseThresholdPct per call (tests). */
  readonly baseThresholdPct?: number;
}

/**
 * Generate the week's staff messages from a WorldState diff + threshold crossings.
 *
 *   - ROUTINE messages: emitted when |delta|/range >= baseThreshold × QUALITY_FACTOR
 *     Capped at MAX_ROUTINE_MESSAGES_PER_STAFF_PER_WEEK per staff member.
 *   - URGENT messages: emitted for every BLOCKING threshold crossing in the
 *     staff member's domain. Not subject to the spam cap.
 */
export function generateStaffMessages(
  args: Readonly<GenerateMessagesArgs>,
): readonly GeneratedStaffMessage[] {
  const out: GeneratedStaffMessage[] = [];
  const baseThreshold = args.baseThresholdPct ?? 0.05;

  for (const member of args.staff) {
    const config = buildPerceptionConfig(member, baseThreshold);
    const qualityFactor = QUALITY_FACTOR[config.qualityTier];
    const effectiveThreshold = baseThreshold * qualityFactor;

    let routineCount = 0;

    // ── URGENT (BLOCKING crossings in domain) ──────────────────────────────
    for (const cross of args.thresholdCrossings) {
      if (cross.priority !== 'BLOCKING') continue;
      if (!config.domain.includes(cross.nodeId as NodeId)) continue;
      const direction: MessageDirection = cross.direction;
      const resolved = resolveMessageTemplate({
        role: member.role,
        nodeId: cross.nodeId,
        direction,
        tier: member.qualityTier,
        priority: 'URGENT',
      });
      out.push({
        staffId: member.id,
        role: member.role,
        tier: member.qualityTier,
        priority: 'URGENT',
        templateKey: resolved.templateKey,
        content: resolved.content,
        nodeId: cross.nodeId,
        direction,
        isFallback: resolved.isFallback,
      });
    }

    // ── ROUTINE (perception-driven, capped) ────────────────────────────────
    for (const nodeId of config.domain) {
      if (routineCount >= MAX_ROUTINE_MESSAGES_PER_STAFF_PER_WEEK) break;
      const diff = args.worldStateDiff[nodeId];
      if (!diff) continue;
      const delta = normalisedDelta(nodeId, diff.prev, diff.next);
      if (delta < effectiveThreshold) continue;
      const direction = inferDirection(diff.prev, diff.next);
      const resolved = resolveMessageTemplate({
        role: member.role,
        nodeId,
        direction,
        tier: member.qualityTier,
        priority: 'ROUTINE',
      });
      out.push({
        staffId: member.id,
        role: member.role,
        tier: member.qualityTier,
        priority: 'ROUTINE',
        templateKey: resolved.templateKey,
        content: resolved.content,
        nodeId,
        direction,
        isFallback: resolved.isFallback,
      });
      routineCount += 1;
    }
  }

  return out;
}

/** Compute a WorldState diff (only changed nodes) — convenience for callers. */
export function diffWorldStates(
  prev: Readonly<WorldState>,
  next: Readonly<WorldState>,
): Record<string, { prev: number; next: number }> {
  const diff: Record<string, { prev: number; next: number }> = {};
  for (const key of Object.keys(next) as NodeId[]) {
    const prevValue = prev[key];
    const nextValue = next[key];
    if (prevValue === undefined || nextValue === undefined) continue;
    if (prevValue !== nextValue) {
      diff[key] = { prev: prevValue, next: nextValue };
    }
  }
  return diff;
}
