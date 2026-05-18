// VERTICAL SLICE - NOT FOR PRODUCTION
// Domain-language formatters for player-facing metrics.
// Same UX principle as the slider redesign: player thinks in football
// language, not in engine indices [0,100]. Mapping lives at UI ↔ API boundary.
// Date: 2026-05-18

/** Default stadium capacity for Real Pueblo CF in the slice. */
export const STADIUM_CAPACITY_DEFAULT = 3000;

export type Severity = "good" | "neutral" | "warn" | "bad";
export interface MetricLabel {
  text: string;
  severity: Severity;
}

/**
 * team_fitness — physical/form state of the squad.
 * Default in cascade-engine.md = 70 (equilibrium).
 */
export function formatFitness(value: number): MetricLabel {
  if (value < 30) return { text: "Muy mala", severity: "bad" };
  if (value < 50) return { text: "Mala", severity: "warn" };
  if (value < 65) return { text: "Regular", severity: "neutral" };
  if (value < 80) return { text: "Buena", severity: "good" };
  return { text: "Excelente", severity: "good" };
}

/**
 * fan_momentum — accumulated emotional state of the fan base.
 * Range [0,100]. BLOCKING threshold below 20. Default 60.
 */
export function formatFanMomentum(value: number): MetricLabel {
  if (value < 20) return { text: "En crisis", severity: "bad" };
  if (value < 35) return { text: "Desencantada", severity: "warn" };
  if (value < 50) return { text: "Inquieta", severity: "warn" };
  if (value < 65) return { text: "Neutra", severity: "neutral" };
  if (value < 80) return { text: "Animada", severity: "good" };
  return { text: "En llamas", severity: "good" };
}

/**
 * fan_attendance — % of stadium capacity for the most recent home match.
 * Slice shows both absolute count and qualitative descriptor.
 */
export interface AttendanceLabel {
  absolute: number; // people
  percent: number;
  qualitative: MetricLabel;
}
export function formatAttendance(
  attendancePct: number,
  capacity = STADIUM_CAPACITY_DEFAULT,
): AttendanceLabel {
  const absolute = Math.round((attendancePct / 100) * capacity);
  const percent = Math.round(attendancePct);
  let qualitative: MetricLabel;
  if (attendancePct < 15) qualitative = { text: "Vacío", severity: "bad" };
  else if (attendancePct < 35) qualitative = { text: "Poco lleno", severity: "warn" };
  else if (attendancePct < 60) qualitative = { text: "Medio lleno", severity: "neutral" };
  else if (attendancePct < 85) qualitative = { text: "Lleno", severity: "good" };
  else qualitative = { text: "Lleno hasta la bandera", severity: "good" };
  return { absolute, percent, qualitative };
}

/**
 * injury_risk — likelihood of squad injuries this week.
 */
export function formatInjuryRisk(value: number): MetricLabel {
  if (value < 25) return { text: "Bajo", severity: "good" };
  if (value < 50) return { text: "Medio", severity: "neutral" };
  if (value < 70) return { text: "Alto", severity: "warn" };
  return { text: "Crítico", severity: "bad" };
}

/**
 * match_performance_index — perception of last match performance.
 */
export function formatMpi(value: number): MetricLabel {
  if (value < 25) return { text: "Para olvidar", severity: "bad" };
  if (value < 45) return { text: "Mal partido", severity: "warn" };
  if (value < 55) return { text: "Partido gris", severity: "neutral" };
  if (value < 75) return { text: "Buen partido", severity: "good" };
  return { text: "Partidazo", severity: "good" };
}

export function severityClass(s: Severity): string {
  if (s === "good") return "good";
  if (s === "warn") return "warn";
  if (s === "bad") return "bad";
  return "dim";
}
