import { describe, it, expect } from 'vitest';
import { generateAmbientStaffMessages } from '../src/lib/server/ambient-staff';
import type { WorldState } from '@smt/shared';

/**
 * Ambient staff messages — noise filter (Pablo 2026-05-29).
 *   - LOW bucket (problem)  → always emitted.
 *   - MID bucket (fine)     → never emitted.
 *   - HIGH bucket (good)    → only ~1 week in 4, staggered per role.
 */

const STAFF = [
  { id: 'g', name: 'Gus Jardín', role: 'groundskeeper', qualityTier: 2 },
];

function world(overrides: Record<string, number>): WorldState {
  return {
    field_quality: 50,
    team_fitness: 50,
    fan_momentum: 50,
    scouting_points: 50,
    financial_status: 0,
    staff_morale: 50,
    ...overrides,
  } as unknown as WorldState;
}

describe('generateAmbientStaffMessages — noise filter', () => {
  it('test_low_bucket_problem_always_emitted', () => {
    for (let week = 0; week < 8; week++) {
      const msgs = generateAmbientStaffMessages({
        activeStaff: STAFF,
        worldState: world({ field_quality: 20 }), // < 40 → low
        week,
      });
      expect(msgs.length, `week ${week}`).toBe(1);
      expect(msgs[0]!.templateKey).toBe('ambient:groundskeeper:0');
    }
  });

  it('test_mid_bucket_never_emitted', () => {
    for (let week = 0; week < 8; week++) {
      const msgs = generateAmbientStaffMessages({
        activeStaff: STAFF,
        worldState: world({ field_quality: 55 }), // 40-69 → mid
        week,
      });
      expect(msgs.length, `week ${week}`).toBe(0);
    }
  });

  it('test_high_bucket_good_news_is_rationed_not_weekly', () => {
    let emitted = 0;
    for (let week = 0; week < 8; week++) {
      const msgs = generateAmbientStaffMessages({
        activeStaff: STAFF,
        worldState: world({ field_quality: 90 }), // >= 70 → high
        week,
      });
      emitted += msgs.length;
      if (msgs.length) expect(msgs[0]!.templateKey).toBe('ambient:groundskeeper:2');
    }
    // Over 8 weeks: emitted sometimes, but far from every week.
    expect(emitted).toBeGreaterThan(0);
    expect(emitted).toBeLessThanOrEqual(2);
  });

  it('test_deterministic_same_week_same_output', () => {
    const args = { activeStaff: STAFF, worldState: world({ field_quality: 90 }), week: 4 };
    const a = generateAmbientStaffMessages(args);
    const b = generateAmbientStaffMessages(args);
    expect(a).toEqual(b);
  });

  it('test_low_bucket_varies_wording_across_weeks', () => {
    const lines = new Set<string>();
    for (let week = 0; week < 12; week++) {
      const msgs = generateAmbientStaffMessages({
        activeStaff: STAFF,
        worldState: world({ field_quality: 20 }),
        week,
      });
      if (msgs[0]) lines.add(msgs[0].content);
    }
    // Engine-driven variant pick (26-9) → more than one distinct phrasing.
    expect(lines.size).toBeGreaterThan(1);
  });

  it('test_finance_director_inverted_bucket_bad_balance_emits', () => {
    // financial_status 2 (Crisis) → bad → low bucket → emitted every week.
    const msgs = generateAmbientStaffMessages({
      activeStaff: [{ id: 'f', name: 'Fina Caja', role: 'finance_director', qualityTier: 2 }],
      worldState: world({ financial_status: 2 }),
      week: 1,
    });
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.templateKey).toBe('ambient:finance_director:0');
  });
});
