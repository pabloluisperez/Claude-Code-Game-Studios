/**
 * Default Spanish vocabulary tables for the narrative engine.
 * v1.2 Sprint 26. ~150 unique words across 7 axes — millions of combinations
 * when used with multi-slot templates.
 */

import type { VocabTable } from './types.js';

export const DEFAULT_VOCAB: VocabTable = Object.freeze({
  // Adjectives by emotional valence
  adj_positive: [
    'memorable', 'rotundo', 'inolvidable', 'brillante', 'épico',
    'glorioso', 'soñado', 'majestuoso', 'redondo', 'demoledor',
    'inapelable', 'sólido', 'maduro', 'imperial', 'rotundísimo',
  ],
  adj_negative: [
    'amargo', 'doloroso', 'plomizo', 'soporífero', 'gris',
    'desolador', 'rasposo', 'cuesta arriba', 'agónico', 'sufrido',
    'mediocre', 'desordenado', 'desangelado', 'inquietante', 'frustrante',
  ],
  adj_neutral: [
    'razonable', 'discreto', 'apropiado', 'correcto', 'pausado',
    'cumplidor', 'tranquilo', 'esperado', 'rutinario', 'sereno',
  ],

  // Nouns describing match-day vibes
  noun_dia: [
    'tarde', 'partido', 'jornada', 'función', 'capítulo',
    'noche', 'mañana', 'duelo', 'cita', 'matinal',
  ],

  // Verbs in 3rd person preterite — describe outcomes
  verb_win: [
    'arrolló', 'venció', 'castigó', 'humilló', 'desarboló',
    'fundió', 'doblegó', 'derrotó', 'apaleó', 'aplastó',
  ],
  verb_loss: [
    'sucumbió', 'cayó', 'perdió', 'naufragó', 'tropezó',
    'se hundió', 'fue arrollado', 'fue dominado', 'cedió', 'se diluyó',
  ],
  verb_draw: [
    'empató', 'igualó', 'repartió puntos', 'se quedó a las puertas',
    'no pasó del empate', 'firmó tablas',
  ],

  // Connectors / interjections
  connector: [
    'aunque', 'pese a', 'sin embargo', 'con todo', 'a pesar de',
    'eso sí', 'curiosamente', 'visto lo visto',
  ],

  // Time references
  time_ref: [
    'esta tarde', 'esta mañana', 'esta noche', 'hoy', 'al cierre de la semana',
    'al término del partido',
  ],

  // Reactions
  reaction_positive: [
    'la afición estalla', 'el campo brama', 'todos sonríen',
    'la grada celebra', 'hay euforia', 'se respira orgullo',
  ],
  reaction_negative: [
    'el silencio es notorio', 'la afición rumia', 'el vestuario respira hondo',
    'nadie quiere hablar', 'queda un sabor amargo',
  ],
});
