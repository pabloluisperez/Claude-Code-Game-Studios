import { describe, expect, it } from 'vitest';
import { generateHeadlines } from '../src/sim/headlines.js';

const CTX_NO_MATCH = {
  clubName: 'CD Pueblo',
  week: 3,
  weekDateDisplay: 'Sáb 22 ago 2026',
};

describe('generateHeadlines', () => {
  it('produces at least one ambient headline when nothing else happened', () => {
    const out = generateHeadlines(CTX_NO_MATCH);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((h) => h.tag === 'ambient')).toBe(true);
  });

  it('produces a match win headline with the score and opponent', () => {
    const out = generateHeadlines({
      ...CTX_NO_MATCH,
      lastResult: {
        opponentName: 'CF Antiguo',
        isHome: true,
        myScore: 3,
        oppScore: 1,
        outcome: 'win',
      },
    });
    const matchH = out.find((h) => h.tag === 'match');
    expect(matchH).toBeDefined();
    expect(matchH!.text).toContain('CD Pueblo');
    expect(matchH!.text).toMatch(/3.*1|3-1/);
  });

  it('produces a loss headline distinguishable from a win', () => {
    const out = generateHeadlines({
      ...CTX_NO_MATCH,
      lastResult: {
        opponentName: 'CD Calderón',
        isHome: false,
        myScore: 0,
        oppScore: 2,
        outcome: 'loss',
      },
    });
    const matchH = out.find((h) => h.tag === 'match');
    expect(matchH!.text.toLowerCase()).toMatch(
      /derrota|cae|mal partido|vuelve con|tropezón|doblega|disculpas|no encuentra|jornada para olvidar/,
    );
  });

  it('reports position when provided', () => {
    const out = generateHeadlines({
      ...CTX_NO_MATCH,
      position: 1,
      totalClubs: 12,
    });
    const moodH = out.find((h) => h.tag === 'mood');
    expect(moodH).toBeDefined();
    // Top position copy mentions either pos number or "líder/privilegio/sueña/serio".
    expect(moodH!.text).toMatch(/1|líder|privilegio|sueña|serio/);
  });

  it('reports relegation zone in danger language', () => {
    const out = generateHeadlines({
      ...CTX_NO_MATCH,
      position: 11,
      totalClubs: 12,
    });
    const moodH = out.find((h) => h.tag === 'mood');
    expect(moodH!.text.toLowerCase()).toMatch(/alerta|peligrosa|explicaciones/);
  });

  it('mentions new sponsor with brand name', () => {
    const out = generateHeadlines({ ...CTX_NO_MATCH, newSponsor: 'Pueblo Bakery' });
    const spH = out.find((h) => h.tag === 'sponsor');
    expect(spH).toBeDefined();
    expect(spH!.text).toContain('Pueblo Bakery');
  });

  it('mentions cashflow trouble when weekly cashflow is deeply negative', () => {
    const out = generateHeadlines({ ...CTX_NO_MATCH, weeklyCashflow: -50 });
    const finH = out.find((h) => h.tag === 'finance');
    expect(finH).toBeDefined();
    expect(finH!.text.toLowerCase()).toMatch(/rojo|nerviosa|pérdidas|problemas/);
  });

  it('is deterministic for the same input', () => {
    const a = generateHeadlines({ ...CTX_NO_MATCH, position: 6, totalClubs: 12 });
    const b = generateHeadlines({ ...CTX_NO_MATCH, position: 6, totalClubs: 12 });
    expect(a.map((h) => h.text)).toEqual(b.map((h) => h.text));
  });

  it('does not leak unfilled slots', () => {
    const out = generateHeadlines({
      ...CTX_NO_MATCH,
      lastResult: {
        opponentName: 'X',
        isHome: true,
        myScore: 1,
        oppScore: 1,
        outcome: 'draw',
      },
      position: 6,
      totalClubs: 12,
      newSponsor: 'Y',
      newInjuries: 2,
      weeklyCashflow: -30,
    });
    for (const h of out) {
      expect(h.text).not.toMatch(/\{[a-z_]+\}/);
    }
  });
});
