// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does manager XP feel earned, and do skill bumps feel like meaningful unlocks?
// Date: 2026-05-18

import type { MatchOutcome, ThresholdCrossing } from "./types.js";

/**
 * Manager-RPG (slice) — 2 of 5 MVP skills (Tactics, Finance).
 * Levels 1-4. XP curve from manager-rpg.md adapted for short slice.
 */

export type ManagerSkillId = "tactics" | "finance";

export interface ManagerState {
  level: number; // overall manager level (max of skill levels for slice)
  xp: number;
  xpToNextLevel: number;
  skills: Record<ManagerSkillId, number>; // 1-4
  pendingSkillPoints: number;
  careerEvents: ManagerCareerEvent[];
}

export interface ManagerCareerEvent {
  id: string;
  week: number;
  title: string;
  body: string;
  acknowledged: boolean;
}

const LEVEL_UP_THRESHOLDS = [0, 80, 240, 560]; // XP cumulative to reach level 2, 3, 4

export function initialManagerState(): ManagerState {
  return {
    level: 1,
    xp: 0,
    xpToNextLevel: LEVEL_UP_THRESHOLDS[1] ?? 80,
    skills: { tactics: 1, finance: 1 },
    pendingSkillPoints: 0,
    careerEvents: [],
  };
}

export interface XpGain {
  source: string;
  amount: number;
}

/**
 * Compute XP gained for one week's events. Pure: returns the delta + sources;
 * caller mutates state.
 */
export function weeklyXpGain(args: {
  matchOutcome: MatchOutcome | null;
  thresholdCrossings: readonly ThresholdCrossing[];
}): XpGain[] {
  const gains: XpGain[] = [];

  if (args.matchOutcome) {
    gains.push({ source: "match_played", amount: 5 });
    const o = args.matchOutcome;
    // Note: this is player-centric — winner perspective is for the player's club.
    // The slice infers from worldStateDeltas (positive MPI = good for player).
    if (o.worldStateDeltas.match_performance_index >= 15) {
      gains.push({ source: "win_bonus", amount: 10 });
    } else if (o.worldStateDeltas.match_performance_index < -10) {
      gains.push({ source: "loss_learning", amount: 2 });
    }
  }

  // Threshold crossings: BLOCKING crises are XP-rich (handling pressure = growth)
  for (const x of args.thresholdCrossings) {
    if (x.priority === "BLOCKING") gains.push({ source: `crossing:${x.reason}`, amount: 10 });
    else gains.push({ source: `crossing:${x.reason}`, amount: 4 });
  }

  return gains;
}

/**
 * Apply XP and possibly level up. Returns the mutated state + any level-up events.
 */
export function applyXp(state: ManagerState, gains: XpGain[]): {
  state: ManagerState;
  leveledUp: boolean;
  totalGain: number;
} {
  const total = gains.reduce((s, g) => s + g.amount, 0);
  let xp = state.xp + total;
  let level = state.level;
  let pending = state.pendingSkillPoints;
  let leveledUp = false;

  while (level < 4 && xp >= LEVEL_UP_THRESHOLDS[level]!) {
    level++;
    pending++;
    leveledUp = true;
  }

  const nextThreshold =
    level < 4 ? LEVEL_UP_THRESHOLDS[level] ?? 9999 : 9999;

  return {
    state: {
      ...state,
      level,
      xp,
      xpToNextLevel: nextThreshold,
      pendingSkillPoints: pending,
    },
    leveledUp,
    totalGain: total,
  };
}

/**
 * Spend a pending skill point on a specific skill.
 */
export function allocateSkillPoint(
  state: ManagerState,
  skill: ManagerSkillId,
): ManagerState {
  if (state.pendingSkillPoints <= 0) return state;
  const current = state.skills[skill] ?? 1;
  if (current >= 4) return state;
  return {
    ...state,
    pendingSkillPoints: state.pendingSkillPoints - 1,
    skills: { ...state.skills, [skill]: current + 1 },
  };
}

/**
 * Generate a career event when the manager hits a meaningful milestone.
 * Slice version: one event around week 4 — president meeting.
 */
export function maybeGenerateCareerEvent(args: {
  week: number;
  state: ManagerState;
  currentPosition: number; // player's standings position (1..20)
}): ManagerCareerEvent | null {
  if (args.week === 4 && !args.state.careerEvents.find((e) => e.id === "president_w4")) {
    const inDanger = args.currentPosition >= 17;
    return {
      id: "president_w4",
      week: 4,
      title: "El presidente quiere verte el lunes",
      body: inDanger
        ? "Cuatro derrotas seguidas y zona de descenso. El presidente dice que quiere 'una conversación'. Llévate al director financiero."
        : "Mes complicado pero no estamos hundidos. El presidente quiere repasar los números contigo y planificar enero.",
      acknowledged: false,
    };
  }
  return null;
}
