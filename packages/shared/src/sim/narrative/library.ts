/**
 * Pre-built template library covering the Sprint 26 target surfaces.
 * v1.2 Sprint 26-3/26-5. Adding more groups is additive.
 *
 * Conventions:
 *   - Each group declares `requiredVars`: the top-level `{var}` slots a caller
 *     MUST provide (gate vars used only in `when`, and conditional `{?cond?...?}`
 *     vars, are NOT listed — see types.ts). The slot-coverage guard test
 *     (`coverageGaps`) enforces this for the whole library.
 *   - Each `when` predicate binds a group to a single tonal bucket so a variant
 *     can never be picked for the wrong situation.
 *   - Numbers are passed pre-formatted (es-ES) by callers; templates never embed
 *     raw locale-sensitive numbers.
 */

import type { Locale, NarrativeTemplate } from './types.js';
import { DEFAULT_LOCALE } from './types.js';

/** Match outcome — variant by win/loss/draw + magnitude (`goalDiff` gate var). */
export const matchOutcomeTemplates: readonly NarrativeTemplate[] = [
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) >= 3,
    requiredVars: ['clubName', 'opponent', 'homeScore', 'awayScore'],
    variants: [
      'Un {vocab:adj_positive} {vocab:noun_dia}: el {clubName} {vocab:verb_win} al {opponent} por {homeScore}-{awayScore}. {vocab:reaction_positive}.',
      '{clubName} {homeScore}, {opponent} {awayScore}. {vocab:connector} algunos lo pidieron antes, el equipo respondió con un partido {vocab:adj_positive}.',
      'Vimos a un {clubName} {vocab:adj_positive}: {homeScore}-{awayScore}. {vocab:reaction_positive}.',
    ],
  },
  {
    when: (ctx) => {
      const d = Number(ctx.variables?.goalDiff ?? 0);
      return d >= 1 && d < 3;
    },
    requiredVars: ['clubName', 'opponent', 'homeScore', 'awayScore'],
    variants: [
      '{vocab:time_ref} el {clubName} {vocab:verb_win} al {opponent} {homeScore}-{awayScore}. {vocab:reaction_positive}.',
      'Triunfo {vocab:adj_positive} ante el {opponent}: {homeScore}-{awayScore}.',
      'El {clubName} suma. Frente al {opponent}, {homeScore}-{awayScore} y {vocab:reaction_positive}.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) === 0,
    requiredVars: ['clubName', 'opponent', 'homeScore', 'awayScore'],
    variants: [
      'Empate {vocab:adj_neutral}, {vocab:noun_dia} sin chispa: {clubName} y {opponent} firmaron {homeScore}-{awayScore}. {vocab:reaction_negative}.',
      'El {clubName} {vocab:verb_draw} con el {opponent}. {homeScore}-{awayScore}. {vocab:connector} lo visto, suma valdrá.',
      'Punto {vocab:adj_neutral} en casa: {homeScore}-{awayScore} ante el {opponent}. {vocab:reaction_negative}.',
    ],
  },
  {
    when: (ctx) => {
      const d = Number(ctx.variables?.goalDiff ?? 0);
      return d < 0 && d > -3;
    },
    requiredVars: ['clubName', 'opponent', 'homeScore', 'awayScore'],
    variants: [
      'Un revés {vocab:adj_negative}: el {clubName} {vocab:verb_loss} contra el {opponent}, {homeScore}-{awayScore}. {vocab:reaction_negative}.',
      '{vocab:time_ref} el {clubName} no encontró el camino: {homeScore}-{awayScore} ante el {opponent}. {vocab:reaction_negative}.',
      '{vocab:adj_negative} tropiezo ante el {opponent}: {homeScore}-{awayScore}. {vocab:reaction_negative}.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) <= -3,
    requiredVars: ['clubName', 'opponent', 'homeScore', 'awayScore'],
    variants: [
      'Desastre completo. El {opponent} {vocab:verb_win} {awayScore}-{homeScore} a un {clubName} {vocab:adj_negative}. {vocab:reaction_negative}.',
      'Noche para olvidar. {homeScore}-{awayScore} contra el {opponent}. Toca recomponerse rápido.',
      'Correctivo {vocab:adj_negative}: {homeScore}-{awayScore}. El {opponent} pasó por encima.',
    ],
  },
];

/** Financial milestone reached (positive). */
export const financialPositiveTemplates: readonly NarrativeTemplate[] = [
  {
    requiredVars: ['balanceEurK'],
    variants: [
      '{vocab:noun_finance} confirma cifras saneadas: balance positivo de {balanceEurK} k€{?week? en la semana {week}?}. Un cierre {vocab:adj_positive}.',
      'Buena noticia financiera: los números acompañan ({balanceEurK} k€ en caja). {vocab:noun_finance} sonríe.',
      '{vocab:noun_finance} respira: cerramos con {balanceEurK} k€ positivos. Margen {vocab:adj_positive} para planificar.',
    ],
  },
];

/** Financial warning (negative trajectory). */
export const financialWarningTemplates: readonly NarrativeTemplate[] = [
  {
    requiredVars: ['balanceEurK'],
    variants: [
      '{vocab:noun_finance} avisa: el balance no acompaña ({balanceEurK} k€). Situación {vocab:adj_negative}.',
      'Atención: las arcas se resienten ({balanceEurK} k€ esta semana). {vocab:noun_finance} pide revisar plantilla y gastos.',
      '{vocab:noun_finance} alerta: la inercia nos lleva al rojo. Panorama {vocab:adj_negative} si no recortamos.',
    ],
  },
];

/** Press article after a derby (`goalDiff` gate var, player perspective). */
export const pressDerbyTemplates: readonly NarrativeTemplate[] = [
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) > 0,
    requiredVars: ['clubName'],
    variants: [
      'La prensa local destaca: "El {clubName} hizo valer la categoría". Crónica {vocab:adj_positive} en los principales medios.',
      'Editorial: "El derbi tuvo un ganador {vocab:adj_positive}". El {clubName} se lleva los focos.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) < 0,
    requiredVars: [],
    variants: [
      'La prensa local no perdona: "Otro derbi {vocab:adj_negative}". Habrá quien pida cambios.',
      'Crónica {vocab:adj_negative}: los rivales locales celebran. La afición pide reacción.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) === 0,
    requiredVars: [],
    variants: [
      'Empate sin vencedor moral en el derbi local. Crónicas divididas según el cuaderno.',
      '"Repartieron honores", titula la prensa. Sin claro ganador en el derbi.',
    ],
  },
];

/** Mayor call (career milestone). Always references {city} for consistency. */
export const mayorCallTemplates: readonly NarrativeTemplate[] = [
  {
    requiredVars: ['city', 'clubName'],
    variants: [
      'El alcalde de {city} llamó: "Lo que está haciendo con el club es bueno para la ciudad. Cuente conmigo si necesita ayuda con permisos para reformas".',
      'Llamada inesperada del Ayuntamiento de {city}. El alcalde quiere felicitarle por la marcha del {clubName} y ofrece colaboración.',
      'Aviso desde la alcaldía de {city}: el regidor solicita una reunión informal para ver cómo el club puede apoyar iniciativas locales.',
    ],
  },
];

// === Sprint 26-5 — new surfaces ============================================

/** Transfer rumour about a player. `clubName` optional (interested club). */
export const rumorTemplates: readonly NarrativeTemplate[] = [
  {
    requiredVars: ['playerName'],
    variants: [
      'En el mercado: {playerName} {vocab:rumor_verb}, según {vocab:rumor_source}. Rumor {vocab:adj_rumor}{?clubName? en torno al {clubName}?}.',
      '{vocab:rumor_source} apunta a {playerName}: {vocab:rumor_verb}. Habrá que seguirlo de cerca.',
      'Rumor {vocab:adj_rumor}: {playerName} {vocab:rumor_verb}. De momento, solo ruido de mercado.',
    ],
  },
];

/**
 * Transfer window open/close blurb. Caller passes `windowOpen`: a positive
 * number (open) or 0 (just closed); the gate vars are not rendered slots.
 */
export const transferWindowTemplates: readonly NarrativeTemplate[] = [
  {
    when: (ctx) => Number(ctx.variables?.windowOpen ?? -1) > 0,
    requiredVars: [],
    variants: [
      'Se abre el mercado de fichajes. {vocab:rumor_source} ya calienta los despachos.',
      'Mercado abierto: es momento de mover ficha. {vocab:noun_board} estará atenta a las oportunidades.',
      'Arranca la ventana de fichajes. Toca decidir altas y bajas con cabeza.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.windowOpen ?? -1) === 0,
    requiredVars: [],
    variants: [
      'Se cierra el mercado de fichajes. La plantilla queda definida hasta la próxima ventana.',
      'Mercado cerrado: ya no hay margen para fichar. A competir con lo que hay.',
      'Baja el telón del mercado. {vocab:noun_board} confía en el plantel decidido.',
    ],
  },
];

/** Sponsor renewal reaction. `amountEurK` optional. */
export const sponsorRenewalTemplates: readonly NarrativeTemplate[] = [
  {
    requiredVars: ['sponsorName'],
    variants: [
      'Renovación cerrada: {sponsorName} sigue confiando en el club{?amountEurK? ({amountEurK} k€)?}. {vocab:noun_finance} lo celebra.',
      'Buenas noticias comerciales: {sponsorName} amplía su acuerdo de patrocinio.',
      '{sponsorName} renueva. Un respaldo {vocab:adj_positive} para las cuentas del club.',
    ],
  },
];

/** Player contract renewal reaction. */
export const contractRenewalTemplates: readonly NarrativeTemplate[] = [
  {
    requiredVars: ['playerName'],
    variants: [
      'Acuerdo de renovación: {playerName} seguirá vistiendo nuestros colores. {vocab:reaction_positive}.',
      '{playerName} renueva su contrato. El vestuario lo recibe como una señal {vocab:adj_positive}.',
      'Atado: {playerName} amplía su vínculo con el club. {vocab:noun_board} respira tranquila.',
    ],
  },
];

/**
 * Promotion / relegation at season end. Caller passes a truthy `promoted` or
 * `relegated` gate var. `clubName`/`divisionName` optional.
 */
export const promotionRelegationTemplates: readonly NarrativeTemplate[] = [
  {
    when: (ctx) => Boolean(ctx.variables?.promoted),
    requiredVars: [],
    variants: [
      '¡Ascenso! El {?clubName?{clubName} ?}logra subir de categoría{?divisionName? a {divisionName}?}. {vocab:reaction_positive}.',
      'Misión cumplida: el club asciende. Una temporada {vocab:adj_positive} que quedará en la memoria.',
      'Objetivo cumplido. El ascenso es una realidad y {vocab:reaction_positive}.',
    ],
  },
  {
    when: (ctx) => Boolean(ctx.variables?.relegated),
    requiredVars: [],
    variants: [
      'Descenso consumado. Un final {vocab:adj_negative} que toca digerir. {vocab:reaction_negative}.',
      'El club baja de categoría. Habrá que reconstruir{?divisionName? desde {divisionName}?}. {vocab:reaction_negative}.',
      'Mal final: el descenso es matemático. {vocab:reaction_negative}.',
    ],
  },
];

/**
 * Board confidence. Caller passes `confidence` (0-100 gate var):
 * high ≥ 70, mid 40-69, low < 40.
 */
export const boardConfidenceTemplates: readonly NarrativeTemplate[] = [
  {
    when: (ctx) => Number(ctx.variables?.confidence ?? 50) >= 70,
    requiredVars: [],
    variants: [
      '{vocab:noun_board} muestra una confianza {vocab:adj_board_high} en el proyecto.',
      'Una confianza {vocab:adj_board_high} desde arriba: {vocab:noun_board} mantiene el rumbo.',
      'Sin sobresaltos en el palco: la confianza es {vocab:adj_board_high}.',
    ],
  },
  {
    when: (ctx) => {
      const c = Number(ctx.variables?.confidence ?? 50);
      return c >= 40 && c < 70;
    },
    requiredVars: [],
    variants: [
      '{vocab:noun_board} observa con una calma {vocab:adj_neutral}. Ni euforia ni alarma.',
      'La confianza de {vocab:noun_board} se mantiene en un tono {vocab:adj_neutral}.',
      'Aguas tranquilas en los despachos, de momento.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.confidence ?? 50) < 40,
    requiredVars: [],
    variants: [
      '{vocab:noun_board} deja ver una confianza {vocab:adj_board_low}. Hay nervios arriba.',
      'Una confianza {vocab:adj_board_low} arriba: {vocab:noun_board} pide resultados.',
      'La paciencia de {vocab:noun_board} se agota. Confianza {vocab:adj_board_low}.',
    ],
  },
];

/**
 * Every template group in the library, for whole-library QA sweeps
 * (slot-coverage, determinism, variety). Keep this in sync when adding groups.
 */
export type TemplateGroupRegistry = readonly {
  name: string;
  groups: readonly NarrativeTemplate[];
}[];

export const ALL_TEMPLATE_GROUPS: TemplateGroupRegistry = [
  { name: 'matchOutcome', groups: matchOutcomeTemplates },
  { name: 'financialPositive', groups: financialPositiveTemplates },
  { name: 'financialWarning', groups: financialWarningTemplates },
  { name: 'pressDerby', groups: pressDerbyTemplates },
  { name: 'mayorCall', groups: mayorCallTemplates },
  { name: 'rumor', groups: rumorTemplates },
  { name: 'transferWindow', groups: transferWindowTemplates },
  { name: 'sponsorRenewal', groups: sponsorRenewalTemplates },
  { name: 'contractRenewal', groups: contractRenewalTemplates },
  { name: 'promotionRelegation', groups: promotionRelegationTemplates },
  { name: 'boardConfidence', groups: boardConfidenceTemplates },
];

/**
 * Locale → template-group registry (Sprint 26-10 scaffolding). Only `es-ES` is
 * populated; a new locale supplies its own translated registry here, leaving
 * the engine and call sites untouched.
 */
export const LIBRARY_BY_LOCALE: Readonly<Record<Locale, TemplateGroupRegistry>> = Object.freeze({
  'es-ES': ALL_TEMPLATE_GROUPS,
});

/** Resolve the template-group registry for a locale (falls back to default). */
export function getLibrary(locale: Locale = DEFAULT_LOCALE): TemplateGroupRegistry {
  return LIBRARY_BY_LOCALE[locale] ?? ALL_TEMPLATE_GROUPS;
}
