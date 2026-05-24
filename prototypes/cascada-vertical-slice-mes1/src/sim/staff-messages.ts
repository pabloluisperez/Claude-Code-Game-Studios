// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Are staff messages legible enough to communicate cascade effects without exposing the system?
// Date: 2026-05-18

import type { CascadeLogEntry, NodeId, ThresholdCrossing, WorldState } from "./types.js";

/**
 * Staff observation system (slice subset of staff-system.md + ADR-009).
 *
 * 3 staff roles, each watches a specific set of NodeIds. When a node crosses
 * a tier-1 threshold OR a notable cascade fires, the corresponding staff
 * member emits a message. Messages are templated strings (no LLM in slice).
 */

export type StaffRole = "head_coach" | "fitness_coach" | "finance_director";
export type StaffTier = 1 | 2 | 3;
export type MessagePriority = "ROUTINE" | "ADVISORY" | "BLOCKING";

export interface StaffMessage {
  staffRole: StaffRole;
  staffTier: StaffTier;
  templateKey: string;
  body: string;
  priority: MessagePriority;
  causalNodeId: NodeId | null;
}

/**
 * Slice staff config — all tier 1 (novice) until manager hires upgrades (post-slice).
 */
export const SLICE_STAFF: Record<StaffRole, { tier: StaffTier; name: string }> = {
  head_coach: { tier: 1, name: "Mateo" },
  fitness_coach: { tier: 1, name: "Iñaki" },
  finance_director: { tier: 1, name: "Carmen" },
};

/**
 * Which roles observe which nodes.
 */
const ROLE_OBSERVES: Record<StaffRole, readonly NodeId[]> = {
  head_coach: ["team_fitness", "match_performance_index", "player_happiness"],
  fitness_coach: ["team_fitness", "injury_risk"],
  finance_director: ["fan_momentum", "fan_attendance"],
};

/**
 * Threshold-crossing templates by (role, nodeId, direction).
 * Tier 1 messages are vague; tier 3 would name specific players + numbers.
 */
function bodyForThresholdT1(args: {
  role: StaffRole;
  crossing: ThresholdCrossing;
}): string {
  const { role, crossing } = args;
  const dir = crossing.direction;
  const node = crossing.nodeId;
  if (role === "finance_director" && node === "fan_momentum" && dir === "below") {
    return "Los socios están enfadados. Yo lo veo en la oficina cada mañana. Algo hay que hacer con la afición.";
  }
  if (role === "finance_director" && node === "fan_momentum" && dir === "above") {
    return "La gente del bar dice que el equipo está más vivo que nunca. Es buen momento para algo.";
  }
  if (role === "head_coach" && node === "team_fitness" && dir === "below") {
    return "Los chicos llegan a los partidos sin chispa. No sé si es cansancio o moral, pero algo no cuadra.";
  }
  if (role === "fitness_coach" && node === "injury_risk" && dir === "above") {
    return "Hay tirones en el grupo. No te diría nada todavía, pero los entrenos están dejando huella.";
  }
  if (role === "head_coach" && node === "player_happiness" && dir === "below") {
    return "Sala de masaje en silencio. Algo pasa en el vestuario que no me cuentan.";
  }
  return "Algo está pasando con el equipo. Tendrías que echar un ojo.";
}

function bodyForCascadeT1(args: {
  role: StaffRole;
  entry: CascadeLogEntry;
  prevValue: number;
  nextValue: number;
}): string {
  const { role, entry, prevValue, nextValue } = args;
  const delta = nextValue - prevValue;
  const node = entry.to;

  // Tier 1 = vague narrative, no specific numbers
  if (role === "head_coach" && node === "team_fitness" && delta < -2) {
    return "Los chicos están llegando algo más tocados de lo normal a los entrenos.";
  }
  if (role === "head_coach" && node === "team_fitness" && delta > 2) {
    return "Vienen bien al campo esta semana. Se nota que tienen ganas.";
  }
  if (role === "fitness_coach" && node === "team_fitness" && delta < -3) {
    return "Si no bajamos el ritmo va a haber problemas. Te lo digo yo.";
  }
  if (role === "finance_director" && node === "fan_momentum" && delta < -3) {
    return "Recibimos llamadas. La afición está empezando a marcar distancia.";
  }
  if (role === "finance_director" && node === "fan_attendance" && delta < -5) {
    return "Hoy entraron casi vacíos al estadio. No te imaginas lo que duele oírlo.";
  }
  if (role === "finance_director" && node === "fan_momentum" && delta > 2) {
    return "En el bar de enfrente hoy había ambiente. Esto remonta.";
  }
  return "";
}

/**
 * Generate staff messages for one tick.
 * Returns 0..N messages — order matches the canonical (role, node) priority.
 */
export function generateStaffMessages(args: {
  week: number;
  prevState: WorldState;
  nextState: WorldState;
  cascadeLog: readonly CascadeLogEntry[];
  thresholdCrossings: readonly ThresholdCrossing[];
}): StaffMessage[] {
  const { prevState, nextState, cascadeLog, thresholdCrossings } = args;
  const messages: StaffMessage[] = [];
  const seenKey = new Set<string>();

  // 1. Threshold crossings always emit (one message per role × crossing)
  for (const cx of thresholdCrossings) {
    for (const role of Object.keys(ROLE_OBSERVES) as StaffRole[]) {
      if (!ROLE_OBSERVES[role].includes(cx.nodeId)) continue;
      const tier = SLICE_STAFF[role].tier;
      const body = bodyForThresholdT1({ role, crossing: cx });
      const key = `cx:${role}:${cx.nodeId}:${cx.direction}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      messages.push({
        staffRole: role,
        staffTier: tier,
        templateKey: key,
        body,
        priority: cx.priority,
        causalNodeId: cx.nodeId,
      });
    }
  }

  // 2. Notable cascade deltas — emit one tier-appropriate message
  for (const entry of cascadeLog) {
    const node = entry.to as NodeId;
    if (Math.abs(entry.delta) < 2) continue; // only "significant" deltas
    for (const role of Object.keys(ROLE_OBSERVES) as StaffRole[]) {
      if (!ROLE_OBSERVES[role].includes(node)) continue;
      const tier = SLICE_STAFF[role].tier;
      const body = bodyForCascadeT1({
        role,
        entry,
        prevValue: prevState[node],
        nextValue: nextState[node],
      });
      if (!body) continue;
      const key = `cx-log:${role}:${entry.edgeId}:${node}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      messages.push({
        staffRole: role,
        staffTier: tier,
        templateKey: key,
        body,
        priority: "ROUTINE",
        causalNodeId: node,
      });
    }
  }

  return messages;
}
