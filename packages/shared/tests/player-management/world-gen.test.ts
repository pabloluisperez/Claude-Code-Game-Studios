/**
 * Unit tests for F1 computeSkill + generateRoster world-gen.
 *
 * Story: PLAYER-MANAGEMENT-003
 * Acceptance Criteria: AC-PM-01, AC-PM-02 (F1 examples), TR-PM-003 (determinism)
 */

import { describe, it, expect } from 'vitest';
import {
  POSITION_QUOTAS,
  generateRoster,
} from '../../src/sim/player-management/world-gen.js';
import {
  SKILL_MAX,
  SKILL_MIN,
  computeSkill,
} from '../../src/sim/player-management/skill.js';
import type { SimContext } from '../../src/sim/cascade-types.js';
import { defaultWorldState } from '../../src/sim/cascade-types.js';
import { createMatchSimContext } from '../../src/sim/sports/football/match-prng.js';

function makeCtx(seed: string): SimContext {
  return createMatchSimContext(seed, 0).ctx;
}

// ── F1 computeSkill ──────────────────────────────────────────────────────────

describe('F1 — computeSkill per position', () => {
  it('test_ac_pm_01_fwd_known_values', () => {
    // AC-PM-01: FWD finishing=80, speed=75, dribbling=70 → 76
    // 80×0.45 + 75×0.30 + 70×0.25 = 36 + 22.5 + 17.5 = 76.0
    expect(computeSkill('FWD', { finishing: 80, speed: 75, dribbling: 70 })).toBe(76);
  });

  it('test_ac_pm_02_gk_known_values', () => {
    // AC-PM-02: GK reflexes=90, handling=80, kicking=60 → 79
    // 90×0.40 + 80×0.35 + 60×0.25 = 36 + 28 + 15 = 79
    expect(computeSkill('GK', { reflexes: 90, handling: 80, kicking: 60 })).toBe(79);
  });

  it('test_def_position', () => {
    // DEF tackling=80, strength=75, positioning=65 → 80×0.40 + 75×0.35 + 65×0.25 = 32 + 26.25 + 16.25 = 74.5 → 75
    expect(computeSkill('DEF', { tackling: 80, strength: 75, positioning: 65 })).toBe(75);
  });

  it('test_mid_position', () => {
    // MID passing=70, vision=70, workRate=70 → 70×0.35 + 70×0.35 + 70×0.30 = 70
    expect(computeSkill('MID', { passing: 70, vision: 70, workRate: 70 })).toBe(70);
  });

  it('test_skill_clamped_to_min', () => {
    expect(computeSkill('FWD', { finishing: 0, speed: 0, dribbling: 0 })).toBe(SKILL_MIN);
  });

  it('test_skill_clamped_to_max', () => {
    expect(computeSkill('FWD', { finishing: 100, speed: 100, dribbling: 100 })).toBe(SKILL_MAX);
  });

  it('test_undefined_stats_default_to_50', () => {
    // computeSkill('FWD', {}) → all stats default 50 → 50
    expect(computeSkill('FWD', {})).toBe(50);
  });
});

// ── generateRoster determinism ───────────────────────────────────────────────

describe('generateRoster — determinism', () => {
  it('test_same_seed_produces_identical_roster', () => {
    const a = generateRoster({
      ctx: makeCtx('determ-seed-A'),
      clubBaseSkill: 60,
      clubSlug: 'club-a',
      currentWeek: 1000,
    });
    const b = generateRoster({
      ctx: makeCtx('determ-seed-A'),
      clubBaseSkill: 60,
      clubSlug: 'club-a',
      currentWeek: 1000,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('test_different_seeds_produce_different_rosters', () => {
    const a = generateRoster({
      ctx: makeCtx('seed-A'),
      clubBaseSkill: 60,
      clubSlug: 'x',
      currentWeek: 1000,
    });
    const b = generateRoster({
      ctx: makeCtx('seed-B'),
      clubBaseSkill: 60,
      clubSlug: 'x',
      currentWeek: 1000,
    });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

// ── Position distribution ────────────────────────────────────────────────────

describe('generateRoster — position distribution', () => {
  it('test_position_quota_default_size_22', () => {
    const roster = generateRoster({
      ctx: makeCtx('pos-quota'),
      clubBaseSkill: 60,
      clubSlug: 'club',
      currentWeek: 1000,
    });
    // Retuned 2026-05-25: DEFAULT_ROSTER_SIZE 25 → 22 (Pablo playtest realism).
    expect(roster.length).toBe(22);
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of roster) counts[p.position]++;
    expect(counts.GK).toBe(POSITION_QUOTAS.GK);
    expect(counts.DEF).toBe(POSITION_QUOTAS.DEF);
    expect(counts.MID).toBe(POSITION_QUOTAS.MID);
    expect(counts.FWD).toBe(POSITION_QUOTAS.FWD);
  });
});

// ── Age distribution ─────────────────────────────────────────────────────────

describe('generateRoster — age distribution', () => {
  it('test_ages_in_18_to_35_range', () => {
    const roster = generateRoster({
      ctx: makeCtx('age-range'),
      clubBaseSkill: 60,
      clubSlug: 'club',
      currentWeek: 5200,
    });
    for (const p of roster) {
      const ageWeeks = 5200 - p.birthWeek;
      const ageYears = Math.floor(ageWeeks / 52);
      expect(ageYears).toBeGreaterThanOrEqual(18);
      expect(ageYears).toBeLessThanOrEqual(35);
    }
  });

  it('test_age_distribution_roughly_30_50_20', () => {
    // Aggregate across many seeds to smooth noise. Sample size widened
    // to 10 seeds (was 5) post-2026-05-21 ROSTER_SIZE drop 40→25; smaller
    // rosters need more seed-coverage to keep distribution stable.
    const buckets = { young: 0, peak: 0, vet: 0, total: 0 };
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']) {
      const roster = generateRoster({
        ctx: makeCtx(seed),
        clubBaseSkill: 60,
        clubSlug: 'club',
        currentWeek: 5200,
      });
      for (const p of roster) {
        const age = Math.floor((5200 - p.birthWeek) / 52);
        if (age <= 23) buckets.young++;
        else if (age <= 29) buckets.peak++;
        else buckets.vet++;
        buckets.total++;
      }
    }
    const youngPct = buckets.young / buckets.total;
    const peakPct = buckets.peak / buckets.total;
    const vetPct = buckets.vet / buckets.total;
    // Allow ±12% drift from target (slightly wider post-roster-resize)
    expect(youngPct).toBeGreaterThan(0.18);
    expect(youngPct).toBeLessThan(0.42);
    expect(peakPct).toBeGreaterThan(0.38);
    expect(peakPct).toBeLessThan(0.62);
    expect(vetPct).toBeGreaterThan(0.08);
    expect(vetPct).toBeLessThan(0.32);
  });
});

// ── Skill distribution ──────────────────────────────────────────────────────

describe('generateRoster — skill values within bounds', () => {
  it('test_all_skills_in_20_to_95', () => {
    const roster = generateRoster({
      ctx: makeCtx('skill-bounds'),
      clubBaseSkill: 60,
      clubSlug: 'club',
      currentWeek: 1000,
    });
    for (const p of roster) {
      expect(p.skill).toBeGreaterThanOrEqual(SKILL_MIN);
      expect(p.skill).toBeLessThanOrEqual(SKILL_MAX);
    }
  });

  it('test_skill_mean_close_to_club_base', () => {
    const roster = generateRoster({
      ctx: makeCtx('skill-mean'),
      clubBaseSkill: 65,
      clubSlug: 'club',
      currentWeek: 1000,
    });
    const mean = roster.reduce((s, p) => s + p.skill, 0) / roster.length;
    expect(mean).toBeGreaterThan(58);
    expect(mean).toBeLessThan(72);
  });
});

// ── Contract staggering ──────────────────────────────────────────────────────

describe('generateRoster — contract staggering', () => {
  it('test_initial_contracts_distributed_across_seasons', () => {
    const roster = generateRoster({
      ctx: makeCtx('contract-stagger'),
      clubBaseSkill: 60,
      clubSlug: 'club',
      currentWeek: 1000,
    });
    // Pablo 2026-05-26: season ≈ 40 weeks; contracts span 1..4 seasons.
    const SEASON = 40;
    const buckets = { s1: 0, s2: 0, s3: 0, s4: 0 };
    for (const p of roster) {
      const weeksLeft = p.contractEndWeek - p.contractStartWeek;
      if (weeksLeft === SEASON) buckets.s1++;
      else if (weeksLeft === SEASON * 2) buckets.s2++;
      else if (weeksLeft === SEASON * 3) buckets.s3++;
      else if (weeksLeft === SEASON * 4) buckets.s4++;
    }
    // At least two distinct contract lengths present (staggered).
    const nonEmpty = [buckets.s1, buckets.s2, buckets.s3, buckets.s4].filter((n) => n > 0).length;
    expect(nonEmpty).toBeGreaterThanOrEqual(2);
  });
});

// ── Identity ─────────────────────────────────────────────────────────────────

describe('generateRoster — identity', () => {
  it('test_all_players_have_non_empty_names', () => {
    const roster = generateRoster({
      ctx: makeCtx('names'),
      clubBaseSkill: 60,
      clubSlug: 'club',
      currentWeek: 1000,
    });
    for (const p of roster) {
      expect(p.firstName.length).toBeGreaterThan(0);
      expect(p.lastName.length).toBeGreaterThan(0);
    }
  });

  it('test_all_players_have_es_nationality', () => {
    const roster = generateRoster({
      ctx: makeCtx('nat'),
      clubBaseSkill: 60,
      clubSlug: 'club',
      currentWeek: 1000,
    });
    for (const p of roster) {
      expect(p.nationality).toBe('ES');
    }
  });
});

// ── Potential ceiling ────────────────────────────────────────────────────────

describe('generateRoster — potential ceiling for young players', () => {
  it('test_young_players_have_potential_ceiling_above_or_equal_skill', () => {
    const roster = generateRoster({
      ctx: makeCtx('potential'),
      clubBaseSkill: 60,
      clubSlug: 'club',
      currentWeek: 5200,
    });
    for (const p of roster) {
      const age = Math.floor((5200 - p.birthWeek) / 52);
      if (age < 24) {
        expect(p.potentialCeiling).toBeDefined();
        expect(p.potentialCeiling!).toBeGreaterThanOrEqual(p.skill);
      } else {
        expect(p.potentialCeiling).toBeUndefined();
      }
    }
  });
});
