/**
 * F1 — computeSkill: position-weighted mean of position stats.
 *
 * Per `design/gdd/player-management.md` §F1:
 *   GK:  skill = reflexes×0.40 + handling×0.35 + kicking×0.25
 *   DEF: skill = tackling×0.40 + strength×0.35 + positioning×0.25
 *   MID: skill = passing×0.35 + vision×0.35 + workRate×0.30
 *   FWD: skill = finishing×0.45 + speed×0.30 + dribbling×0.25
 *
 * Output clamped to [SKILL_MIN, SKILL_MAX] = [20, 95].
 *
 * Story: PLAYER-MANAGEMENT-003 (TR-PM-002)
 */

export const SKILL_MIN = 20;
export const SKILL_MAX = 95;

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface PositionStats {
  reflexes?: number;
  handling?: number;
  kicking?: number;
  strength?: number;
  tackling?: number;
  positioning?: number;
  passing?: number;
  vision?: number;
  workRate?: number;
  speed?: number;
  finishing?: number;
  dribbling?: number;
}

export function computeSkill(position: Position, stats: Readonly<PositionStats>): number {
  let raw: number;
  switch (position) {
    case 'GK':
      raw = (stats.reflexes ?? 50) * 0.4
          + (stats.handling ?? 50) * 0.35
          + (stats.kicking  ?? 50) * 0.25;
      break;
    case 'DEF':
      raw = (stats.tackling    ?? 50) * 0.4
          + (stats.strength    ?? 50) * 0.35
          + (stats.positioning ?? 50) * 0.25;
      break;
    case 'MID':
      raw = (stats.passing  ?? 50) * 0.35
          + (stats.vision   ?? 50) * 0.35
          + (stats.workRate ?? 50) * 0.3;
      break;
    case 'FWD':
      raw = (stats.finishing ?? 50) * 0.45
          + (stats.speed     ?? 50) * 0.3
          + (stats.dribbling ?? 50) * 0.25;
      break;
  }
  const rounded = Math.round(raw);
  if (rounded < SKILL_MIN) return SKILL_MIN;
  if (rounded > SKILL_MAX) return SKILL_MAX;
  return rounded;
}
