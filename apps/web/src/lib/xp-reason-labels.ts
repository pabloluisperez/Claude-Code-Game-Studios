/**
 * Human-readable Spanish labels for manager XP grant reasons.
 *
 * Source codes come from packages/shared/src/sim/manager-rpg/xp-sources.ts and
 * inline calls in advance-orchestrator. Pablo 2026-05-26: 'salen códigos en
 * razón: weekly_routine, match_played, etc., es información irrelevante'.
 */

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  // Match-related
  match_played: 'Partido jugado',
  match_win: 'Victoria',
  match_draw: 'Empate',
  match_loss: 'Derrota',
  underdog_match_won: 'Victoria como underdog',
  away_win: 'Victoria fuera de casa',
  first_5_match_streak: 'Racha de 5 partidos',

  // Financial
  positive_month: 'Mes con balance positivo',
  balanced_finances: 'Finanzas equilibradas',
  survived_negative_month: 'Sobrevivido mes con pérdidas',
  bankruptcy_avoided: 'Quiebra evitada',
  sponsor_negotiated: 'Patrocinio negociado',
  sponsor_signed: 'Patrocinio firmado',

  // Squad / staff
  signed_player: 'Fichaje cerrado',
  contract_renewal_signed: 'Renovación firmada',
  squad_morale_high: 'Vestuario con moral alta',
  five_yellows: 'Sanción por amarillas',

  // Career
  survival: 'Permanencia en la división',
  promotion: 'Ascenso',
  relegation: 'Descenso',
  board_approval: 'Aprobación de la directiva',

  // Routine
  weekly_routine: 'Rutina semanal',
});

export function xpReasonLabel(code: string): string {
  return LABELS[code] ?? code;
}
