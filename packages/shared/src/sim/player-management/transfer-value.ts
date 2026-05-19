/**
 * F6 — transfer_value formula.
 *
 * Per `design/gdd/player-management.md` §F6:
 *   transfer_value = BASE_VALUE_K × skill_factor × age_factor × form_factor
 *   skill_factor = (skill/50)^SKILL_VALUE_EXP
 *   age_factor = age_curve[age] (discrete table)
 *   form_factor = 0.8 + (form - 60)/100 × 0.4   (range: 0.68 - 0.92)
 *
 * Minimum clamp: 0.1 €K (defensive guard for corrupt inputs per AC-PM-17).
 *
 * Story: PLAYER-MANAGEMENT-009 (TR-PM-009)
 */

export const BASE_VALUE_K = 5.0;
export const SKILL_VALUE_EXP = 1.8;
export const TRANSFER_VALUE_FLOOR = 0.1;

/** age_curve from GDD Tuning Knobs. */
function ageFactorFor(age: number): number {
  if (age >= 34) return 0.35;
  if (age >= 31) return 0.6;
  if (age >= 28) return 0.85;
  if (age >= 25) return 1.0;
  if (age >= 22) return 1.2;
  if (age >= 19) return 0.9;
  return 0.7; // 16-18
}

export interface TransferValueArgs {
  readonly skill: number;
  readonly age: number;
  readonly form: number;
}

export function computeTransferValue(args: Readonly<TransferValueArgs>): number {
  const skillFactor = Math.pow(args.skill / 50, SKILL_VALUE_EXP);
  const ageFactor = ageFactorFor(args.age);
  const formFactor = 0.8 + ((args.form - 60) / 100) * 0.4;
  const raw = BASE_VALUE_K * skillFactor * ageFactor * formFactor;
  if (raw < TRANSFER_VALUE_FLOOR) return TRANSFER_VALUE_FLOOR;
  // Round to 2 decimals for €K display
  return Math.round(raw * 100) / 100;
}
