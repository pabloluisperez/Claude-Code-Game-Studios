/**
 * Economy balance constants — per ADR-014 + GDD §Tuning Knobs.
 *
 * Story: ECONOMY-002..004 (TR-ECO-002..004)
 * Control Manifest: 2026-05-19
 */

// ── Bankruptcy thresholds (ADR-014 §Bankruptcy FSM) ───────────────────────────

export const EN_RIESGO_BALANCE_THRESHOLD = 50;     // €K
export const CRISIS_BALANCE_THRESHOLD = -50;       // €K
export const QUIEBRA_BALANCE_THRESHOLD = -200;     // €K
export const CRISIS_CASHFLOW_THRESHOLD = -10;      // €K/wk
export const QUIEBRA_CASHFLOW_THRESHOLD = -20;     // €K/wk
export const EN_RIESGO_CASHFLOW_THRESHOLD = -15;   // €K/wk

// ── TV rights tier (per ADR-011 + GDD economy.md §F4) ────────────────────────

export const TV_RIGHTS_PRIMERA = 8;   // €K/week
export const TV_RIGHTS_SEGUNDA = 3;   // €K/week

// ── Ticket pricing (ADR-014 §MAX_TICKET_EUR formula) ─────────────────────────

export const PRIMERA_REFERENCE_MAX = 60;            // €
export const MAX_TICKET_FLOOR_SEGUNDA = 25;         // € — slice override per ADR-014
export const MAX_TICKET_FLOOR_PRIMERA = 30;         // € — generous floor for D1
export const TICKET_SNAP_STEP = 5;                  // € — UI slider step
export const STADIUM_CAPACITY_SATURATION = 30000;   // seats — capacityFactor saturates here
export const MARKET_TICKET_RATIO = 0.4;             // market = 40% of max

// ── Catch-up payroll freeze (ADR-014 §Congelación de nómina) ─────────────────

export const PAYROLL_FREEZE_WEEKS = 8;
export const PAYROLL_FREEZE_REDUCTION = 0.25;       // 25% reduction in player wages
export const PAYROLL_FREEZE_HAPPINESS_PENALTY = -15; // one-time player_happiness delta

// ── Cost categories — baseline (read from WorldState budget nodes) ────────────

/** Maintenance baseline (fixed weekly) — €K. */
export const MAINTENANCE_BASELINE = 2;
