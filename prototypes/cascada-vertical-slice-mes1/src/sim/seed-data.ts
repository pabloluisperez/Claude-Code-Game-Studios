// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does Real Pueblo CF's starting state telegraph "club en ruinas"?
// Date: 2026-05-18

import type { WorldState } from "./types.js";

/**
 * Real Pueblo CF — Segunda División, club en ruinas.
 *
 * Starting state intentionally below default to make decisions matter
 * immediately: low fan_momentum, mediocre staff_morale, mediocre field,
 * fitness slightly below equilibrium. Player must climb out.
 *
 * Defaults in `cascade-engine.md §Catálogo de Nodos` for reference.
 */
export const REAL_PUEBLO_INITIAL: WorldState = {
  // Inputs — start at default neutral until player decides Week 1
  training_intensity: 50,
  ticket_price_index: 50,

  // Internal state — under-equilibrium to telegraph "ruina"
  team_fitness: 55, // default 70 → 15 below equilibrium
  staff_morale: 40, // default 60 → novice staff, underpaid
  fan_momentum: 35, // default 60 → afición desencantada tras descenso ficticio
  fan_attendance: 30, // default 40 → poca gente en el estadio
  match_performance_index: 50, // neutral default (cascade-engine.md catalog); set per-week by match-sim or synthetic in smoke

  // Static context — read-only this slice (no chains write to these)
  field_quality: 40, // default 50 → campo descuidado pero no peligroso
  player_happiness: 50, // default 60 → neutro
  team_skill: 45, // default 50 → Segunda mediocre
  squad_available_pct: 90, // default 90 → plantilla básicamente disponible

  // Streaks
  consecutive_wins: 0,
  consecutive_losses: 2, // arrastra mala racha del año anterior
};

/** Fixed seed for the slice — determinism guarantee. */
export const SLICE_SEED = "real-pueblo-cf-mes1-v1";

/**
 * Pre-baked 4-week schedule (1 month). Match weeks coincide with each
 * weekend; in real MVP the schedule comes from league-system fixtures.
 */
export interface SliceWeek {
  weekNumber: number;
  /** Display label for UI / logs. */
  label: string;
  /** Whether a fixture is scheduled — gates C11, C14. */
  hasMatchThisWeek: boolean;
  /** Synthetic MPI used to drive C6 when there's a match. Production wires this from match-sim output. */
  syntheticMpi?: number;
}

export const SLICE_SCHEDULE: readonly SliceWeek[] = [
  { weekNumber: 1, label: "Semana 1 · Pretemporada cierre", hasMatchThisWeek: true, syntheticMpi: 45 },
  { weekNumber: 2, label: "Semana 2 · Jornada 2 vs Soria", hasMatchThisWeek: true, syntheticMpi: 38 },
  { weekNumber: 3, label: "Semana 3 · Jornada 3 (derbi anunciado)", hasMatchThisWeek: true, syntheticMpi: 58 },
  { weekNumber: 4, label: "Semana 4 · Jornada 4 vs Líder", hasMatchThisWeek: true, syntheticMpi: 30 },
];
