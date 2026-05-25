/**
 * Pre-built template library covering common event types.
 * v1.2 Sprint 26. Adding more categories is additive.
 *
 * Convention: each event type exports a TemplateGroup that takes a
 * NarrativeContext and returns a string via `render()`.
 */

import type { NarrativeTemplate } from './types.js';

/** Match outcome — variant by win/loss/draw + magnitude. */
export const matchOutcomeTemplates: readonly NarrativeTemplate[] = [
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) >= 3,
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
    variants: [
      '{vocab:time_ref} el {clubName} {vocab:verb_win} al {opponent} {homeScore}-{awayScore}. {vocab:reaction_positive}.',
      'Victoria {vocab:adj_positive} ante el {opponent}: {homeScore}-{awayScore}.',
      'El {clubName} suma. Frente al {opponent}, {homeScore}-{awayScore} y {vocab:reaction_positive}.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) === 0,
    variants: [
      'Empate sin gloria ni pena: {clubName} y {opponent} firmaron {homeScore}-{awayScore}. {vocab:reaction_negative}.',
      'El {clubName} {vocab:verb_draw} con el {opponent}. {homeScore}-{awayScore}. Visto lo visto, suma valdrá.',
      'Punto sufrido en casa: {homeScore}-{awayScore} ante el {opponent}.',
    ],
  },
  {
    when: (ctx) => {
      const d = Number(ctx.variables?.goalDiff ?? 0);
      return d < 0 && d > -3;
    },
    variants: [
      'Derrota {vocab:adj_negative}: el {clubName} {vocab:verb_loss} contra el {opponent}, {homeScore}-{awayScore}. {vocab:reaction_negative}.',
      '{vocab:time_ref} el {clubName} no encontró el camino: {homeScore}-{awayScore} ante el {opponent}.',
      '{vocab:adj_negative} tropiezo ante el {opponent}: {homeScore}-{awayScore}.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) <= -3,
    variants: [
      'Desastre completo. El {opponent} {vocab:verb_win} {awayScore}-{homeScore} a un {clubName} {vocab:adj_negative}. {vocab:reaction_negative}.',
      'Noche para olvidar. {homeScore}-{awayScore} contra el {opponent}. Toca recomponerse rápido.',
      'Goleada {vocab:adj_negative}: {homeScore}-{awayScore}. El {opponent} pasó por encima.',
    ],
  },
];

/** Financial milestone reached (positive). */
export const financialPositiveTemplates: readonly NarrativeTemplate[] = [
  {
    variants: [
      'El club entra en cifras saneadas: balance positivo de {balanceEurK} k€ {?week?en la semana {week}?}.',
      'Buena noticia financiera. Los números acompañan: {balanceEurK} k€ en caja.',
      'El director financiero respira: hemos cerrado la semana con {balanceEurK} k€ positivos.',
    ],
  },
];

/** Financial warning (negative trajectory). */
export const financialWarningTemplates: readonly NarrativeTemplate[] = [
  {
    variants: [
      'El balance no acompaña ({balanceEurK} k€). Hay que actuar con tiento.',
      'Atención: las arcas del club se resienten. {balanceEurK} k€ esta semana — toca revisar plantilla y gastos.',
      'Aviso del director financiero: la inercia financiera nos lleva al rojo si no recortamos.',
    ],
  },
];

/** Press article after a derby. */
export const pressDerbyTemplates: readonly NarrativeTemplate[] = [
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) > 0,
    variants: [
      'La prensa local destaca: "El {clubName} hizo valer la categoría". Crónica {vocab:adj_positive} en los principales medios.',
      'Editorial: "El derbi tuvo {vocab:adj_positive} ganador". El {clubName} se lleva los focos.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) < 0,
    variants: [
      'La prensa local no perdona: "Otro derbi {vocab:adj_negative}". Habrá quien pida cambios.',
      'Crónica {vocab:adj_negative}: los rivales locales celebran. La afición pide reacción.',
    ],
  },
  {
    when: (ctx) => Number(ctx.variables?.goalDiff ?? 0) === 0,
    variants: [
      'Empate sin vencedor moral en el derbi local. Crónicas divididas según el cuaderno.',
      '"Repartieron honores", titula la prensa. Sin claro ganador en el derbi.',
    ],
  },
];

/** Mayor call (career milestone). Always references {city} for consistency. */
export const mayorCallTemplates: readonly NarrativeTemplate[] = [
  {
    variants: [
      'El alcalde de {city} llamó: "Lo que está haciendo con el club es bueno para la ciudad. Cuente conmigo si necesita ayuda con permisos para reformas".',
      'Llamada inesperada del Ayuntamiento de {city}. El alcalde quiere felicitarle por la marcha del {clubName} y ofrece colaboración.',
      'Aviso desde la alcaldía de {city}: el regidor solicita una reunión informal para ver cómo el club puede apoyar iniciativas locales.',
    ],
  },
];
