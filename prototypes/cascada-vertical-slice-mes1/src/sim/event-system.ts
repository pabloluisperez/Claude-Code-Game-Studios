// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Do calendar + random events add variety without overwhelming the 4-week loop?
// Date: 2026-05-18

import seedrandom from "seedrandom";
import type { PlayerDecisions } from "./types.js";

/**
 * Slice event system — minimal subset of event-system.md.
 *
 * Two event types:
 *   - calendar: pre-baked per week (announced ahead by staff)
 *   - random: 30% chance per week, pulled from a small pool
 *
 * Both can emit deltas as if they were extra Player Decisions.
 */

export type EventCategory = "calendar" | "random";
export type EventPriority = "STOP" | "ROUTINE" | "ADVISORY";

export interface SliceEvent {
  id: string;
  category: EventCategory;
  priority: EventPriority;
  /** Week the event fires. */
  week: number;
  /** Short description for the UI / staff inbox. */
  title: string;
  body: string;
  /** Direct WorldState modulation applied as decisions (Step 3 of cascade tick). */
  decisions?: PlayerDecisions;
}

// ── Calendar events — slice schedule ────────────────────────────────────────

export const CALENDAR_EVENTS: readonly SliceEvent[] = [
  {
    id: "evt-barrio-festival-w3",
    category: "calendar",
    priority: "ADVISORY",
    week: 3,
    title: "Fiesta del barrio el domingo",
    body: "El director comercial avisa: hay fiesta del barrio el domingo. La asistencia puede caer si el partido coincide.",
    // Slight attendance bump for context only — no real cascade effect in slice
  },
  {
    id: "evt-derby-week-w3",
    category: "calendar",
    priority: "ADVISORY",
    week: 3,
    title: "Semana de derbi",
    body: "Monte Real es el rival histórico. La afición lo vive distinto. Una victoria aquí pesa el doble en fan_momentum.",
  },
  {
    id: "evt-lider-w4",
    category: "calendar",
    priority: "ADVISORY",
    week: 4,
    title: "Visitamos al líder",
    body: "Líder de la liga: equipo de Primera con presupuesto 3× el nuestro. El staff sugiere bajar la intensidad de entrenamiento esta semana para preservar piernas.",
  },
];

// ── Random event pool ───────────────────────────────────────────────────────

interface RandomEventTemplate {
  id: string;
  weight: number;
  build: () => Omit<SliceEvent, "week" | "category">;
}

const RANDOM_POOL: readonly RandomEventTemplate[] = [
  {
    id: "rain",
    weight: 30,
    build: () => ({
      id: "evt-rain",
      priority: "ADVISORY",
      title: "Lluvia toda la semana",
      body: "El preparador físico avisa: el campo va a estar muy pesado. Bajar la intensidad para evitar lesiones.",
    }),
  },
  {
    id: "flu",
    weight: 20,
    build: () => ({
      id: "evt-flu",
      priority: "ADVISORY",
      title: "Brote de gripe en el vestuario",
      body: "Dos jugadores con fiebre. El médico recomienda training_intensity ≤ 40 esta semana.",
    }),
  },
  {
    id: "sponsor-call",
    weight: 15,
    build: () => ({
      id: "evt-sponsor",
      priority: "ADVISORY",
      title: "Llamada del patrocinador",
      body: "Quieren un acto promocional el sábado. Buena para fan_momentum si aceptas; mala para la carga de entrenos.",
    }),
  },
  {
    id: "press-rumor",
    weight: 20,
    build: () => ({
      id: "evt-press",
      priority: "ROUTINE",
      title: "La prensa habla de tu suplente estrella",
      body: "Rumor de salida en enero. Por ahora ruido — pero el director deportivo está atento.",
    }),
  },
  {
    id: "youth-promise",
    weight: 15,
    build: () => ({
      id: "evt-youth",
      priority: "ROUTINE",
      title: "Promesa de cantera destaca",
      body: "El responsable de cantera te avisa: hay un chaval de 19 años que merece convocatoria.",
    }),
  },
];

/**
 * Returns calendar + (optional) random events for a given week.
 * Pure: same seed + week → same events.
 */
export function getEventsForWeek(week: number, seed: string): SliceEvent[] {
  const out: SliceEvent[] = CALENDAR_EVENTS.filter((e) => e.week === week);
  // 30% chance of one random event per week
  const rng = seedrandom(`${seed}:events:w${week}`);
  if (rng.double() < 0.3) {
    const totalWeight = RANDOM_POOL.reduce((s, t) => s + t.weight, 0);
    let roll = rng.double() * totalWeight;
    for (const tpl of RANDOM_POOL) {
      roll -= tpl.weight;
      if (roll <= 0) {
        const built = tpl.build();
        out.push({ ...built, category: "random", week });
        break;
      }
    }
  }
  return out;
}
