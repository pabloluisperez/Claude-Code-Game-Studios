import { describe, expect, it } from 'vitest';
import { generateRoster } from '../src/sim/player-management/world-gen.js';
import { quickSimulateMatch } from '../src/sim/quick-match.js';
import { createSeededRng } from '../src/sim/rng.js';
import { defaultWorldState } from '../src/sim/cascade-types.js';

function buildRoster(seed: string, clubBaseSkill = 50) {
  const rng = createSeededRng(seed);
  return generateRoster({
    ctx: {
      rng,
      currentWeek: 0,
      hasMatchThisWeek: false,
      prevState: defaultWorldState(),
    },
    clubBaseSkill,
    clubSlug: 'test',
    currentWeek: 0,
    rosterSize: 18,
  });
}

describe('generateRoster — 4-attribute model', () => {
  it('every player gets the 4 core attributes', () => {
    const roster = buildRoster('attr-test-1');
    for (const p of roster) {
      expect(p.velocidad).toBeGreaterThanOrEqual(10);
      expect(p.velocidad).toBeLessThanOrEqual(98);
      expect(p.resistencia).toBeGreaterThanOrEqual(10);
      expect(p.agresividad).toBeGreaterThanOrEqual(10);
      expect(p.calidad).toBeGreaterThanOrEqual(10);
    }
  });

  it('skill equals the rounded mean of the 4 attributes (capped at 95)', () => {
    const roster = buildRoster('attr-test-2');
    for (const p of roster) {
      const mean = Math.round((p.velocidad + p.resistencia + p.agresividad + p.calidad) / 4);
      expect(p.skill).toBe(Math.min(95, mean));
    }
  });

  it('overall caps at 95 even for top-tier rolls', () => {
    const roster = buildRoster('attr-test-3', 95);
    for (const p of roster) {
      expect(p.skill).toBeLessThanOrEqual(95);
    }
  });

  it('GKs have higher calidad than agresividad (per-position bias)', () => {
    const roster = buildRoster('attr-test-4');
    const gks = roster.filter((p) => p.position === 'GK');
    expect(gks.length).toBeGreaterThan(0);
    const avgCal = gks.reduce((s, p) => s + p.calidad, 0) / gks.length;
    const avgAgg = gks.reduce((s, p) => s + p.agresividad, 0) / gks.length;
    expect(avgCal).toBeGreaterThan(avgAgg);
  });

  it('DEFs are biased high on agresividad', () => {
    const roster = buildRoster('attr-test-5');
    const defs = roster.filter((p) => p.position === 'DEF');
    const fwds = roster.filter((p) => p.position === 'FWD');
    if (defs.length === 0 || fwds.length === 0) return;
    const defAgg = defs.reduce((s, p) => s + p.agresividad, 0) / defs.length;
    const fwdAgg = fwds.reduce((s, p) => s + p.agresividad, 0) / fwds.length;
    expect(defAgg).toBeGreaterThan(fwdAgg);
  });
});

describe('quickSimulateMatch — agresividad → cards/injuries', () => {
  const placidTeam = Array.from({ length: 11 }, () => ({
    skill: 60,
    form: 60,
    velocidad: 60,
    resistencia: 60,
    agresividad: 30,
    calidad: 60,
  }));
  const violentTeam = Array.from({ length: 11 }, () => ({
    skill: 60,
    form: 60,
    velocidad: 60,
    resistencia: 60,
    agresividad: 85,
    calidad: 60,
  }));

  it('high-agresividad matches generate more cards than placid ones', () => {
    let placidCards = 0;
    let violentCards = 0;
    for (let i = 0; i < 100; i++) {
      const a = quickSimulateMatch({
        homeRoster: placidTeam,
        awayRoster: placidTeam,
        rng: createSeededRng(`placid-${i}`),
      });
      const b = quickSimulateMatch({
        homeRoster: violentTeam,
        awayRoster: violentTeam,
        rng: createSeededRng(`violent-${i}`),
      });
      placidCards += a.events.filter((e) => e.type === 'yellow_card' || e.type === 'red_card').length;
      violentCards += b.events.filter((e) => e.type === 'yellow_card' || e.type === 'red_card').length;
    }
    expect(violentCards).toBeGreaterThan(placidCards * 2);
  });

  it('high-agresividad matches generate more injuries', () => {
    let placidInjuries = 0;
    let violentInjuries = 0;
    for (let i = 0; i < 100; i++) {
      const a = quickSimulateMatch({
        homeRoster: placidTeam,
        awayRoster: placidTeam,
        rng: createSeededRng(`inj-placid-${i}`),
      });
      const b = quickSimulateMatch({
        homeRoster: violentTeam,
        awayRoster: violentTeam,
        rng: createSeededRng(`inj-violent-${i}`),
      });
      placidInjuries += a.events.filter((e) => e.type === 'injury').length;
      violentInjuries += b.events.filter((e) => e.type === 'injury').length;
    }
    expect(violentInjuries).toBeGreaterThan(placidInjuries);
  });

  it('a fast+aggressive but low-calidad team can compete with a high-calidad slow team', () => {
    const fastAggressive = Array.from({ length: 11 }, () => ({
      skill: 60,
      form: 70,
      velocidad: 85,
      resistencia: 70,
      agresividad: 75,
      calidad: 50,
    }));
    const slowQuality = Array.from({ length: 11 }, () => ({
      skill: 65,
      form: 70,
      velocidad: 45,
      resistencia: 55,
      agresividad: 40,
      calidad: 85,
    }));

    let fastWins = 0;
    let qualityWins = 0;
    let draws = 0;
    for (let i = 0; i < 200; i++) {
      const r = quickSimulateMatch({
        homeRoster: fastAggressive,
        awayRoster: slowQuality,
        rng: createSeededRng(`compete-${i}`),
      });
      if (r.winner === 'home') fastWins += 1;
      else if (r.winner === 'away') qualityWins += 1;
      else draws += 1;
    }
    // Neither team should sweep — both win > 20% of matches and draws happen.
    expect(fastWins).toBeGreaterThan(40);
    expect(qualityWins).toBeGreaterThan(40);
    expect(draws).toBeGreaterThan(10);
  });
});
