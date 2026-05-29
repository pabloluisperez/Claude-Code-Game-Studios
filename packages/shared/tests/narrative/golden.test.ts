import { describe, it, expect } from 'vitest';
import { render } from '../../src/sim/narrative/engine.js';
import {
  matchOutcomeTemplates,
  pressDerbyTemplates,
  mayorCallTemplates,
  financialPositiveTemplates,
  financialWarningTemplates,
  rumorTemplates,
  transferWindowTemplates,
  sponsorRenewalTemplates,
  contractRenewalTemplates,
  promotionRelegationTemplates,
  boardConfidenceTemplates,
} from '../../src/sim/narrative/library.js';
import type { NarrativeContext, NarrativeTemplate } from '../../src/sim/narrative/types.js';

/**
 * Golden snapshots (Sprint 26-8). Lock the exact canonical output for a fixed
 * (seed, vars) per surface. These catch accidental vocab reordering, template
 * edits, or hash drift, and double as readable documentation of the voice.
 *
 * To intentionally change the voice: update the expected string here in the
 * same commit as the template/vocab change.
 */

type Case = {
  name: string;
  groups: readonly NarrativeTemplate[];
  ctx: NarrativeContext;
  expected: string;
};

const CASES: Case[] = [
  {
    name: 'matchOutcome_bigWin',
    groups: matchOutcomeTemplates,
    ctx: { seed: 42, variables: { homeScore: 4, awayScore: 0, goalDiff: 4, clubName: 'Atlético Soria', opponent: 'CD Numancia' } },
    expected: 'Vimos a un Atlético Soria sólido: 4-0. el sentimiento es de fiesta.',
  },
  {
    name: 'matchOutcome_narrowWin',
    groups: matchOutcomeTemplates,
    ctx: { seed: 19, variables: { homeScore: 2, awayScore: 1, goalDiff: 1, clubName: 'Atlético Soria', opponent: 'CD Numancia' } },
    expected: 'El Atlético Soria suma. Frente al CD Numancia, 2-1 y el sentimiento es de fiesta.',
  },
  {
    name: 'matchOutcome_draw',
    groups: matchOutcomeTemplates,
    ctx: { seed: 7, variables: { homeScore: 1, awayScore: 1, goalDiff: 0, clubName: 'Atlético Soria', opponent: 'CD Numancia' } },
    expected: 'Empate tranquilo, partido sin chispa: Atlético Soria y CD Numancia firmaron 1-1. la afición rumia.',
  },
  {
    name: 'matchOutcome_narrowLoss',
    groups: matchOutcomeTemplates,
    ctx: { seed: 23, variables: { homeScore: 1, awayScore: 2, goalDiff: -1, clubName: 'Atlético Soria', opponent: 'CD Numancia' } },
    expected: 'a media tarde el Atlético Soria no encontró el camino: 1-2 ante el CD Numancia. crece el malestar.',
  },
  {
    name: 'matchOutcome_heavyLoss',
    groups: matchOutcomeTemplates,
    ctx: { seed: 3, variables: { homeScore: 0, awayScore: 4, goalDiff: -4, clubName: 'Atlético Soria', opponent: 'CD Numancia' } },
    expected: 'Noche para olvidar. 0-4 contra el CD Numancia. Toca recomponerse rápido.',
  },
  {
    name: 'pressDerby_win',
    groups: pressDerbyTemplates,
    ctx: { seed: 99, variables: { goalDiff: 2, clubName: 'Atlético Soria' } },
    expected: 'Editorial: "El derbi tuvo un ganador redondo". El Atlético Soria se lleva los focos.',
  },
  {
    name: 'mayorCall',
    groups: mayorCallTemplates,
    ctx: { seed: 5, variables: { city: 'Soria', clubName: 'Atlético Soria' } },
    expected: 'El alcalde de Soria llamó: "Lo que está haciendo con el club es bueno para la ciudad. Cuente conmigo si necesita ayuda con permisos para reformas".',
  },
  {
    name: 'financialPositive',
    groups: financialPositiveTemplates,
    ctx: { seed: 11, variables: { balanceEurK: 250, week: 14 } },
    expected: 'la oficina económica confirma cifras saneadas: balance positivo de 250 k€ en la semana 14. Un cierre majestuoso.',
  },
  {
    name: 'financialWarning',
    groups: financialWarningTemplates,
    ctx: { seed: 13, variables: { balanceEurK: -40 } },
    expected: 'Atención: las arcas se resienten (-40 k€ esta semana). la gerencia pide revisar plantilla y gastos.',
  },
  {
    name: 'rumor',
    groups: rumorTemplates,
    ctx: { seed: 21, variables: { playerName: 'Juan Pérez', clubName: 'CD Numancia' } },
    expected: 'Rumor caliente: Juan Pérez interesa. De momento, solo ruido de mercado.',
  },
  {
    name: 'transferWindow_open',
    groups: transferWindowTemplates,
    ctx: { seed: 8, variables: { windowOpen: 1 } },
    expected: 'Se abre el mercado de fichajes. la prensa de la mañana ya calienta los despachos.',
  },
  {
    name: 'transferWindow_close',
    groups: transferWindowTemplates,
    ctx: { seed: 8, variables: { windowOpen: 0 } },
    expected: 'Se cierra el mercado de fichajes. La plantilla queda definida hasta la próxima ventana.',
  },
  {
    name: 'sponsorRenewal',
    groups: sponsorRenewalTemplates,
    ctx: { seed: 14, variables: { sponsorName: 'Caja Rural', amountEurK: 120 } },
    expected: 'Renovación cerrada: Caja Rural sigue confiando en el club (120 k€). el director financiero lo celebra.',
  },
  {
    name: 'contractRenewal',
    groups: contractRenewalTemplates,
    ctx: { seed: 6, variables: { playerName: 'Juan Pérez' } },
    expected: 'Acuerdo de renovación: Juan Pérez seguirá vistiendo nuestros colores. hay euforia.',
  },
  {
    name: 'promotion',
    groups: promotionRelegationTemplates,
    ctx: { seed: 2, variables: { promoted: 1, clubName: 'Atlético Soria', divisionName: 'Primera' } },
    expected: 'Objetivo cumplido. El ascenso es una realidad y hay euforia.',
  },
  {
    name: 'relegation',
    groups: promotionRelegationTemplates,
    ctx: { seed: 4, variables: { relegated: 1, divisionName: 'Segunda' } },
    expected: 'Descenso consumado. Un final desordenado que toca digerir. queda un sabor amargo.',
  },
  {
    name: 'boardConfidence_high',
    groups: boardConfidenceTemplates,
    ctx: { seed: 1, variables: { confidence: 85 } },
    expected: 'Una confianza plena desde arriba: el palco mantiene el rumbo.',
  },
  {
    name: 'boardConfidence_mid',
    groups: boardConfidenceTemplates,
    ctx: { seed: 1, variables: { confidence: 55 } },
    expected: 'La confianza de la junta directiva se mantiene en un tono tranquilo.',
  },
  {
    name: 'boardConfidence_low',
    groups: boardConfidenceTemplates,
    ctx: { seed: 1, variables: { confidence: 20 } },
    expected: 'Una confianza en entredicho arriba: el palco pide resultados.',
  },
];

describe('narrative golden snapshots', () => {
  for (const c of CASES) {
    it(`test_golden_${c.name}`, () => {
      expect(render(c.groups, c.ctx)).toBe(c.expected);
    });
  }
});
