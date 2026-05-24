// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Are the 6 chosen cascades observable + interesting in one in-game month?
// Date: 2026-05-18

import type { CascadeEdgeDef, ThresholdConfig } from "./types.js";

/**
 * Cascade graph — data, not code (cascade-engine.md Rule 10).
 *
 * Slice subset (6 of ~18 MVP chains, plus C0 baseline):
 *   - C0   team_fitness decay toward 70 (baseline equilibrium)
 *   - C4   training_intensity → team_fitness (delay 1, COUNTERINTUITIVE parabola)
 *   - C6   match_performance_index → fan_momentum (delay 0, asymmetric hysteresis)
 *   - C8   fan_momentum × ticket_price_index → fan_attendance (delay 0, price-momentum interaction)
 *   - C11  staff_morale → match_performance_index (delay 0, match weeks only)
 *   - C14  field_quality → match_performance_index (delay 0, match weeks only, home advantage)
 *   - C15  ticket_price_index → fan_momentum (delay 2, COUNTERINTUITIVE cumulative erosion)
 *
 * Constants are inlined here — production version will use a tuning config file.
 */

// ── Tuning constants (per cascade-engine.md Formulas section) ────────────────

// C0
const K_fit_decay = 0.05;
const FIT_EQUILIBRIUM = 70;

// C4
const K_C4 = 8.0;
const NOISE_C4_AMP = 2.0;
const T_low = 25;
const T_high = 75;
const MORALE_SCALE_MIN = 0.5;
const C4_NORMALIZER = ((T_high - T_low) ** 2) / 4; // 625

// C6
const K_win_base = 8.0;
const K_loss_base = 8.0; // ratio 1.0 post-R4 2026-05-18

// C8
const ATTEND_MAX_BASE = 60;
const ATTEND_MIN_BASE = 5;
const MOMENTUM_TOLERANCE_DIVISOR = 120;
const PRICE_BONUS_K = 0.25;

// C11
const K_morale_perf = 8.0;

// C14
const K_home_advantage = 6.0;
const NOISE_C14_AMP = 2.0;

// C15
const K_price_erosion = 0.12;
const T_price_danger = 65;

// ── Helpers ──────────────────────────────────────────────────────────────────

function noise(rng: () => number, amp: number): number {
  return (rng() - 0.5) * amp;
}

// ── Edge definitions ─────────────────────────────────────────────────────────

export const CASCADE_EDGES: readonly CascadeEdgeDef[] = [
  {
    id: "C0",
    counterintuitive: false,
    description: "team_fitness decay toward 70",
    delay: 0,
    reads: ["team_fitness"],
    to: "team_fitness",
    matchWeekOnly: false,
    transferFn: (ctx) => -K_fit_decay * (ctx.prevState.team_fitness - FIT_EQUILIBRIUM),
  },
  {
    id: "C4",
    counterintuitive: true,
    description: "training_intensity → team_fitness (inverted parabola, sweet spot 40-60)",
    delay: 1,
    reads: ["training_intensity", "staff_morale"],
    to: "team_fitness",
    matchWeekOnly: false,
    transferFn: (ctx) => {
      const I = ctx.prevState.training_intensity;
      const SM = ctx.prevState.staff_morale;
      const K_eff = K_C4 * (MORALE_SCALE_MIN + (SM / 100) * (1 - MORALE_SCALE_MIN));
      const parabola = ((I - T_low) * (T_high - I)) / C4_NORMALIZER;
      return K_eff * parabola + noise(ctx.rng, NOISE_C4_AMP);
    },
  },
  {
    id: "C6",
    counterintuitive: true,
    description: "match_performance_index → fan_momentum (asymmetric hysteresis)",
    delay: 0,
    reads: ["match_performance_index"],
    to: "fan_momentum",
    matchWeekOnly: false, // C6 reads MPI which is only nonzero on match weeks, but applies whenever MPI is set
    transferFn: (ctx) => {
      const MPI = ctx.prevState.match_performance_index;
      if (MPI >= 50) {
        const P_win = (MPI - 50) / 50;
        return K_win_base * Math.log(1 + P_win);
      }
      const P_loss = (50 - MPI) / 50;
      return -K_loss_base * (1 + P_loss * P_loss);
    },
  },
  {
    id: "C8",
    counterintuitive: true,
    description: "fan_momentum × ticket_price_index → fan_attendance",
    delay: 0,
    reads: ["fan_momentum", "ticket_price_index", "fan_attendance"],
    to: "fan_attendance",
    matchWeekOnly: false,
    transferFn: (ctx) => {
      const Fm = ctx.prevState.fan_momentum;
      const TPI = ctx.prevState.ticket_price_index;
      const A_prev = ctx.prevState.fan_attendance;
      const attendance_base = (Fm / 100) * ATTEND_MAX_BASE + ATTEND_MIN_BASE;
      const price_penalty =
        Math.max(0, TPI - 50) * (1 - Fm / MOMENTUM_TOLERANCE_DIVISOR);
      const price_bonus = Math.max(0, 50 - TPI) * PRICE_BONUS_K;
      const target = attendance_base + price_bonus - price_penalty;
      return target - A_prev;
    },
  },
  {
    id: "C11",
    counterintuitive: false,
    description: "staff_morale → match_performance_index (match weeks only)",
    delay: 0,
    reads: ["staff_morale"],
    to: "match_performance_index",
    matchWeekOnly: true,
    transferFn: (ctx) => (K_morale_perf * (ctx.prevState.staff_morale - 50)) / 50,
  },
  {
    id: "C14",
    counterintuitive: false,
    description: "field_quality → match_performance_index (home advantage, match weeks only)",
    delay: 0,
    reads: ["field_quality"],
    to: "match_performance_index",
    matchWeekOnly: true,
    transferFn: (ctx) => {
      const Fq = ctx.prevState.field_quality;
      return (K_home_advantage * (Fq - 50)) / 50 + noise(ctx.rng, NOISE_C14_AMP);
    },
  },
  {
    id: "C15",
    counterintuitive: true,
    description: "ticket_price_index → fan_momentum (cumulative erosion, 2w delay)",
    delay: 2,
    reads: ["ticket_price_index"],
    to: "fan_momentum",
    matchWeekOnly: false,
    transferFn: (ctx) => {
      const TPI = ctx.prevState.ticket_price_index;
      return -K_price_erosion * Math.max(0, TPI - T_price_danger);
    },
  },
];

/**
 * Threshold detection — subset of cascade-engine.md table.
 * Only thresholds for nodes that this slice's chains actually write to.
 */
export const THRESHOLDS: readonly ThresholdConfig[] = [
  {
    nodeId: "fan_momentum",
    value: 20,
    direction: "below",
    priority: "BLOCKING",
    reason: "fan_base_in_crisis",
  },
  {
    nodeId: "fan_momentum",
    value: 75,
    direction: "above",
    priority: "ADVISORY",
    reason: "momentum_very_high",
  },
];
