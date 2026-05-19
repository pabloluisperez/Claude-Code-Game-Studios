/**
 * Unit tests for the rival AI (deterministic formation + substitution decisions).
 *
 * Story: MATCH-SIM-012
 * Acceptance Criteria: AC-MATCH-27, AC-MATCH-32
 * Test Evidence: packages/shared/tests/match-sim/rival-ai.test.ts
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_SUBSTITUTIONS,
  RIVAL_STRENGTH_RATIO_STRONG,
  RIVAL_STRENGTH_RATIO_WEAK,
  RIVAL_SUB_FITNESS_THRESHOLD,
  generateRivalLineup,
  rivalInjurySub,
  rivalSubstitutionPlan,
  selectRivalFormation,
} from '../../src/sim/sports/football/football-rival-ai.js';
import type {
  Lineup,
  PlayerStats,
  Position,
} from '../../src/sim/sports/football/football-types.js';

function makePlayer(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    id: `p-${Math.random()}`,
    position: 'MIDFIELDER',
    skill: 70,
    fitness: 80,
    morale: 70,
    form: 70,
    stamina: 70,
    ...overrides,
  };
}

function makeLineup(players: PlayerStats[]): Lineup {
  return players.map((player, slotIndex) => ({ player, slotIndex }));
}

function makeSquad(n: number, byPos?: Partial<Record<Position, number>>): PlayerStats[] {
  const counts: Record<Position, number> = {
    GOALKEEPER: byPos?.GOALKEEPER ?? 2,
    DEFENDER: byPos?.DEFENDER ?? 8,
    MIDFIELDER: byPos?.MIDFIELDER ?? 8,
    FORWARD: byPos?.FORWARD ?? 7,
  };
  const out: PlayerStats[] = [];
  let idx = 0;
  for (const pos of Object.keys(counts) as Position[]) {
    for (let i = 0; i < counts[pos]; i++) {
      out.push(makePlayer({ id: `${pos}-${i}`, position: pos, skill: 60 + (idx % 30) }));
      idx++;
    }
  }
  return out.slice(0, n);
}

// ── AC-MATCH-32 formation selection ───────────────────────────────────────────

describe('AC-MATCH-32 — selectRivalFormation by strength ratio', () => {
  it('test_strong_rival_picks_4_3_3', () => {
    const home = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 50, form: 70, morale: 70, fitness: 80, stamina: 80 })));
    const away = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 80, form: 80, morale: 80, fitness: 90, stamina: 90 })));
    expect(selectRivalFormation(home, away)).toBe('4-3-3');
  });

  it('test_weak_rival_picks_5_3_2', () => {
    const home = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 85, form: 80, morale: 80, fitness: 90, stamina: 90 })));
    const away = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 40, form: 50, morale: 50, fitness: 60, stamina: 60 })));
    expect(selectRivalFormation(home, away)).toBe('5-3-2');
  });

  it('test_even_rival_picks_4_4_2', () => {
    const home = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 70 })));
    const away = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 70 })));
    expect(selectRivalFormation(home, away)).toBe('4-4-2');
  });

  it('test_strict_boundary_at_1_10_picks_4_4_2', () => {
    // Construct lineups where ratio == 1.10 exactly using uniform stats.
    // mean(rating) = skill×0.35 + form×0.20 + morale×0.15 + fitness×0.30
    // Home all skill=70 etc → mean_home = 70 (all stats 70, stamina 100 → ef=70)
    const home = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 70, form: 70, morale: 70, fitness: 70, stamina: 100 })));
    // For away mean to be exactly 1.10 × 70 = 77, need all stats=77 with stamina=100
    const away = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 77, form: 77, morale: 77, fitness: 77, stamina: 100 })));
    expect(selectRivalFormation(home, away)).toBe('4-4-2');
  });

  it('test_constants', () => {
    expect(RIVAL_STRENGTH_RATIO_STRONG).toBeCloseTo(1.1, 10);
    expect(RIVAL_STRENGTH_RATIO_WEAK).toBeCloseTo(0.9, 10);
  });
});

// ── AC-MATCH-27 substitution planning ─────────────────────────────────────────

describe('AC-MATCH-27 — rivalSubstitutionPlan', () => {
  it('test_zero_subs_when_all_fit', () => {
    const lineup = makeLineup(
      Array(11).fill(0).map(() => makePlayer({ fitness: 90, stamina: 100 })),
    );
    const bench = makeLineup(Array(7).fill(0).map(() => makePlayer({ fitness: 90 })));
    const plan = rivalSubstitutionPlan({
      tick: 45,
      currentLineupAway: lineup,
      bench,
      awaySubstitutionsUsed: 0,
    });
    expect(plan).toEqual([]);
  });

  it('test_subs_when_unfit_starter_and_position_match_on_bench', () => {
    const starter = makePlayer({
      id: 'unfit',
      position: 'DEFENDER',
      fitness: 20,
      stamina: 40,
    });
    const lineup = makeLineup([starter, ...Array(10).fill(0).map(() => makePlayer({ fitness: 90 }))]);
    const benchDef = makePlayer({ id: 'bench-def', position: 'DEFENDER', skill: 80, fitness: 90 });
    const bench = makeLineup([benchDef]);
    const plan = rivalSubstitutionPlan({
      tick: 45,
      currentLineupAway: lineup,
      bench,
      awaySubstitutionsUsed: 0,
    });
    expect(plan.length).toBe(1);
    expect(plan[0]!.from.player.id).toBe('unfit');
    expect(plan[0]!.to.player.id).toBe('bench-def');
  });

  it('test_no_sub_when_bench_has_no_matching_position', () => {
    const starter = makePlayer({
      id: 'unfit-def',
      position: 'DEFENDER',
      fitness: 20,
      stamina: 40,
    });
    const lineup = makeLineup([starter, ...Array(10).fill(0).map(() => makePlayer({ fitness: 90 }))]);
    const bench = makeLineup([makePlayer({ position: 'MIDFIELDER', fitness: 90 })]);
    const plan = rivalSubstitutionPlan({
      tick: 45,
      currentLineupAway: lineup,
      bench,
      awaySubstitutionsUsed: 0,
    });
    expect(plan).toEqual([]);
  });

  it('test_pool_cap_at_5_used_returns_empty', () => {
    const lineup = makeLineup(Array(11).fill(0).map((_, i) => makePlayer({
      id: `s-${i}`,
      position: 'DEFENDER',
      fitness: 20,
      stamina: 40,
    })));
    const bench = makeLineup(Array(7).fill(0).map((_, i) => makePlayer({
      id: `b-${i}`,
      position: 'DEFENDER',
    })));
    expect(
      rivalSubstitutionPlan({
        tick: 45,
        currentLineupAway: lineup,
        bench,
        awaySubstitutionsUsed: 5,
      }),
    ).toEqual([]);
  });

  it('test_pool_cap_at_4_returns_one_sub_only', () => {
    const lineup = makeLineup(Array(11).fill(0).map((_, i) => makePlayer({
      id: `s-${i}`,
      position: 'DEFENDER',
      fitness: 20,
      stamina: 40,
    })));
    const bench = makeLineup(Array(7).fill(0).map((_, i) => makePlayer({
      id: `b-${i}`,
      position: 'DEFENDER',
    })));
    const plan = rivalSubstitutionPlan({
      tick: 45,
      currentLineupAway: lineup,
      bench,
      awaySubstitutionsUsed: 4,
    });
    expect(plan.length).toBe(1);
  });

  it('test_highest_rated_bench_player_chosen', () => {
    const starter = makePlayer({
      id: 'unfit',
      position: 'FORWARD',
      fitness: 20,
      stamina: 40,
    });
    const lineup = makeLineup([starter, ...Array(10).fill(0).map(() => makePlayer({ fitness: 90 }))]);
    const benchLow = makePlayer({ id: 'low', position: 'FORWARD', skill: 60, fitness: 90 });
    const benchHigh = makePlayer({ id: 'high', position: 'FORWARD', skill: 90, fitness: 90 });
    const bench = makeLineup([benchLow, benchHigh]);
    const plan = rivalSubstitutionPlan({
      tick: 45,
      currentLineupAway: lineup,
      bench,
      awaySubstitutionsUsed: 0,
    });
    expect(plan[0]!.to.player.id).toBe('high');
  });

  it('test_threshold_constants', () => {
    expect(RIVAL_SUB_FITNESS_THRESHOLD).toBe(40);
    expect(MAX_SUBSTITUTIONS).toBe(5);
  });
});

// ── rivalInjurySub fallback ───────────────────────────────────────────────────

describe('rivalInjurySub — same-position then any-position fallback', () => {
  it('test_injury_sub_prefers_same_position', () => {
    const inj = makePlayer({ id: 'inj', position: 'DEFENDER' });
    const lineup = makeLineup([inj]);
    const benchDef = makePlayer({ id: 'b-def', position: 'DEFENDER', skill: 70 });
    const benchFwd = makePlayer({ id: 'b-fwd', position: 'FORWARD', skill: 90 });
    const bench = makeLineup([benchFwd, benchDef]);
    const sub = rivalInjurySub({
      tick: 45,
      injuredPlayer: inj,
      currentLineupAway: lineup,
      bench,
      awaySubstitutionsUsed: 0,
    });
    expect(sub).not.toBeNull();
    expect(sub!.to.player.id).toBe('b-def');
  });

  it('test_injury_sub_falls_back_to_any_position', () => {
    const inj = makePlayer({ id: 'inj', position: 'DEFENDER' });
    const lineup = makeLineup([inj]);
    const benchFwd = makePlayer({ id: 'b-fwd', position: 'FORWARD' });
    const bench = makeLineup([benchFwd]);
    const sub = rivalInjurySub({
      tick: 45,
      injuredPlayer: inj,
      currentLineupAway: lineup,
      bench,
      awaySubstitutionsUsed: 0,
    });
    expect(sub).not.toBeNull();
    expect(sub!.to.player.id).toBe('b-fwd');
  });

  it('test_injury_sub_null_when_at_cap', () => {
    const inj = makePlayer({ id: 'inj' });
    const lineup = makeLineup([inj]);
    const bench = makeLineup([makePlayer({ id: 'b' })]);
    expect(
      rivalInjurySub({
        tick: 45,
        injuredPlayer: inj,
        currentLineupAway: lineup,
        bench,
        awaySubstitutionsUsed: 5,
      }),
    ).toBeNull();
  });
});

// ── Lineup generation ─────────────────────────────────────────────────────────

describe('generateRivalLineup — minima + bench selection', () => {
  it('test_lineup_has_11_starters_with_minima', () => {
    const squad = makeSquad(25, { GOALKEEPER: 5, DEFENDER: 10, MIDFIELDER: 5, FORWARD: 5 });
    const out = generateRivalLineup(squad);
    const starters = out.slice(0, 11);
    expect(starters.length).toBe(11);
    const positions = starters.map((s) => s.player.position);
    expect(positions.filter((p) => p === 'GOALKEEPER').length).toBeGreaterThanOrEqual(1);
    expect(positions.filter((p) => p === 'DEFENDER').length).toBeGreaterThanOrEqual(2);
    expect(positions.filter((p) => p === 'FORWARD').length).toBeGreaterThanOrEqual(2);
  });

  it('test_emergency_gk_promotion_when_no_gk_in_squad', () => {
    const squad = makeSquad(20, { GOALKEEPER: 0, DEFENDER: 8, MIDFIELDER: 7, FORWARD: 5 });
    const out = generateRivalLineup(squad);
    const promoted = out.find((s) => s.player.assignedAs === 'GOALKEEPER');
    expect(promoted).toBeDefined();
  });

  it('test_lineup_includes_up_to_7_bench', () => {
    const squad = makeSquad(20);
    const out = generateRivalLineup(squad);
    const bench = out.slice(11);
    expect(bench.length).toBeLessThanOrEqual(7);
  });

  it('test_throws_when_squad_too_small', () => {
    const squad = makeSquad(8);
    expect(() => generateRivalLineup(squad)).toThrow();
  });
});

// ── Determinism ──────────────────────────────────────────────────────────────

describe('rival AI — determinism', () => {
  it('test_selectRivalFormation_deterministic', () => {
    const h = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 60 })));
    const a = makeLineup(Array(11).fill(0).map(() => makePlayer({ skill: 80 })));
    expect(selectRivalFormation(h, a)).toBe(selectRivalFormation(h, a));
  });

  it('test_rivalSubstitutionPlan_deterministic', () => {
    const lineup = makeLineup(Array(11).fill(0).map((_, i) => makePlayer({ id: `${i}` })));
    const bench = makeLineup([makePlayer({ id: 'b' })]);
    const a = rivalSubstitutionPlan({ tick: 45, currentLineupAway: lineup, bench, awaySubstitutionsUsed: 0 });
    const b = rivalSubstitutionPlan({ tick: 45, currentLineupAway: lineup, bench, awaySubstitutionsUsed: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
