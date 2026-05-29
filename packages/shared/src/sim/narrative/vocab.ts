/**
 * Default Spanish (es-ES) vocabulary tables for the narrative engine.
 * v1.2 Sprint 26-4. Every category holds ≥ 8 entries; combined with multi-slot
 * templates this yields hundreds of distinct renderings per tonal bucket.
 *
 * Invariants enforced by the QA suite (Sprint 26-8):
 *   - no category is empty (every referenced `{vocab:cat}` resolves);
 *   - no entry matches the profanity denylist;
 *   - every category has ≥ 8 entries (variety floor).
 *
 * Adding entries is always safe (more variety). Removing below 8 will fail QA.
 */

import type { VocabTable } from './types.js';

export const DEFAULT_VOCAB: VocabTable = Object.freeze({
  // --- Emotional valence adjectives --------------------------------------
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

  // --- Match-day nouns ----------------------------------------------------
  noun_dia: [
    'tarde', 'partido', 'jornada', 'función', 'capítulo',
    'noche', 'mañana', 'duelo', 'cita', 'matinal',
  ],

  // --- Outcome verbs (3rd person preterite) ------------------------------
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
    'no pasó del empate', 'firmó tablas', 'se conformó con el reparto',
    'rascó un punto',
  ],

  // --- Connectors / time references --------------------------------------
  connector: [
    'aunque', 'pese a', 'sin embargo', 'con todo', 'a pesar de',
    'eso sí', 'curiosamente', 'visto lo visto',
  ],
  time_ref: [
    'esta tarde', 'esta mañana', 'esta noche', 'hoy', 'al cierre de la semana',
    'al término del partido', 'a media tarde', 'antes del pitido final',
  ],

  // --- Crowd reactions ----------------------------------------------------
  reaction_positive: [
    'la afición estalla', 'el campo brama', 'todos sonríen',
    'la grada celebra', 'hay euforia', 'se respira orgullo',
    'el sentimiento es de fiesta', 'la grada se viene arriba',
  ],
  reaction_negative: [
    'el silencio es notorio', 'la afición rumia', 'el vestuario respira hondo',
    'nadie quiere hablar', 'queda un sabor amargo',
    'la afición se marcha cabizbaja', 'crece el malestar',
    'las críticas arrecian',
  ],

  // --- Transfer rumour axes (Sprint 26-5) --------------------------------
  // Singular subjects: templates use them with singular verbs (suena, apunta).
  rumor_source: [
    'la prensa deportiva', 'una fuente cercana al club', 'el mercado',
    'el corrillo del fútbol', 'un medio local', 'el entorno del jugador',
    'la radio nocturna', 'la prensa de la mañana',
  ],
  rumor_verb: [
    'suena con fuerza', 'interesa', 'gusta', 'está en la órbita',
    'aparece en las quinielas', 'figura en la agenda', 'seduce a los despachos',
    'asoma en las listas',
  ],
  adj_rumor: [
    'insistente', 'caliente', 'persistente', 'recurrente', 'creciente',
    'sonado', 'comentado', 'madrugador',
  ],

  // --- Board confidence axes (Sprint 26-5) -------------------------------
  // Singular subjects (used with singular verbs: mantiene, pide, observa).
  noun_board: [
    'la junta directiva', 'el consejo', 'la directiva', 'la propiedad',
    'el palco', 'la dirección deportiva', 'la cúpula del club',
    'la sala de juntas',
  ],
  adj_board_high: [
    'plena', 'firme', 'rotunda', 'sólida', 'intacta',
    'reforzada', 'unánime', 'blindada',
  ],
  adj_board_low: [
    'en entredicho', 'tocada', 'resquebrajada', 'bajo mínimos', 'frágil',
    'en cuestión', 'menguante', 'herida',
  ],

  // --- Finance commentary axes (Sprint 26-7 migration) -------------------
  noun_finance: [
    'el director financiero', 'la dirección económica', 'el área financiera',
    'tesorería', 'el departamento de cuentas', 'la gerencia',
    'la oficina económica', 'el responsable de finanzas',
  ],
});
