/**
 * Unit tests for perception engine.
 * Story: STAFF-SYSTEM-004
 */

import { describe, it, expect } from 'vitest';
import {
  buildPerceptionConfig,
  diffWorldStates,
  generateStaffMessages,
  type MinimalStaffMember,
} from '../../src/sim/staff-system/perception.js';
import {
  defaultWorldState,
  type ThresholdCrossing,
  type WorldState,
} from '../../src/sim/cascade-types.js';
import { DEFAULT_DOMAIN_BY_ROLE } from '../../src/sim/staff-system/types.js';

function staff(id: string, role: MinimalStaffMember['role'], qualityTier: 1 | 2 | 3): MinimalStaffMember {
  return { id, role, qualityTier };
}

describe('buildPerceptionConfig', () => {
  it('test_groundskeeper_domain_is_field_quality', () => {
    const cfg = buildPerceptionConfig(staff('s1', 'groundskeeper', 1));
    expect([...cfg.domain]).toEqual(['field_quality']);
  });
});

describe('diffWorldStates', () => {
  it('test_unchanged_returns_empty', () => {
    const ws = defaultWorldState();
    expect(diffWorldStates(ws, ws)).toEqual({});
  });

  it('test_changed_node_included', () => {
    const prev = defaultWorldState();
    const next: WorldState = { ...prev, team_fitness: 50 };
    const diff = diffWorldStates(prev, next);
    expect(diff['team_fitness']).toEqual({ prev: 70, next: 50 });
  });
});

describe('generateStaffMessages — ROUTINE perception', () => {
  it('test_tier_3_notices_small_change', () => {
    // team_fitness range 0..100 (span 100). delta 6 → 6% > 5% threshold × 1.0 = 5%.
    const prev = defaultWorldState(); // team_fitness=70
    const next: WorldState = { ...prev, team_fitness: 64 };
    const messages = generateStaffMessages({
      staff: [staff('s1', 'fitness_coach', 3)],
      worldStateDiff: diffWorldStates(prev, next),
      thresholdCrossings: [],
    });
    const fitMsg = messages.find((m) => m.nodeId === 'team_fitness');
    expect(fitMsg).toBeDefined();
    expect(fitMsg!.direction).toBe('below');
    expect(fitMsg!.tier).toBe(3);
  });

  it('test_tier_1_misses_small_change', () => {
    // tier 1 threshold = 5% × 3.0 = 15%. delta=6% is below.
    const prev = defaultWorldState();
    const next: WorldState = { ...prev, team_fitness: 64 };
    const messages = generateStaffMessages({
      staff: [staff('s1', 'fitness_coach', 1)],
      worldStateDiff: diffWorldStates(prev, next),
      thresholdCrossings: [],
    });
    expect(messages.find((m) => m.nodeId === 'team_fitness')).toBeUndefined();
  });

  it('test_tier_1_catches_large_change', () => {
    // delta = 20% > 15% threshold tier-1
    const prev = defaultWorldState();
    const next: WorldState = { ...prev, team_fitness: 50 };
    const messages = generateStaffMessages({
      staff: [staff('s1', 'fitness_coach', 1)],
      worldStateDiff: diffWorldStates(prev, next),
      thresholdCrossings: [],
    });
    expect(messages.find((m) => m.nodeId === 'team_fitness')).toBeDefined();
  });

  it('test_routine_capped_per_staff_per_week', () => {
    // commercial_director has 3 nodes in domain. With huge deltas in all 3,
    // we should only get MAX=2 ROUTINE messages.
    const prev = defaultWorldState();
    const next: WorldState = {
      ...prev,
      fan_momentum: 10,
      fan_attendance: 10,
      sponsor_quality: 80,
    };
    const messages = generateStaffMessages({
      staff: [staff('s1', 'commercial_director', 3)],
      worldStateDiff: diffWorldStates(prev, next),
      thresholdCrossings: [],
    });
    expect(messages.length).toBe(2);
  });

  it('test_only_domain_nodes_perceived', () => {
    // groundskeeper only sees field_quality. Other changes ignored.
    const prev = defaultWorldState();
    const next: WorldState = { ...prev, team_fitness: 20, fan_momentum: 20 };
    const messages = generateStaffMessages({
      staff: [staff('s1', 'groundskeeper', 3)],
      worldStateDiff: diffWorldStates(prev, next),
      thresholdCrossings: [],
    });
    expect(messages.length).toBe(0);
  });
});

describe('generateStaffMessages — URGENT bypass spam cap', () => {
  function crossing(nodeId: string, direction: 'above' | 'below', priority: 'BLOCKING' | 'ADVISORY'): ThresholdCrossing {
    return {
      nodeId,
      threshold: 50,
      direction,
      priority,
      previousValue: 30,
      newValue: 80,
      reason: `${nodeId}:${direction}`,
    };
  }

  it('test_blocking_crossing_emits_urgent', () => {
    const messages = generateStaffMessages({
      staff: [staff('s1', 'finance_director', 2)],
      worldStateDiff: {},
      thresholdCrossings: [crossing('financial_status', 'above', 'BLOCKING')],
    });
    expect(messages.length).toBe(1);
    expect(messages[0]!.priority).toBe('URGENT');
    expect(messages[0]!.nodeId).toBe('financial_status');
  });

  it('test_advisory_crossings_ignored', () => {
    const messages = generateStaffMessages({
      staff: [staff('s1', 'finance_director', 3)],
      worldStateDiff: {},
      thresholdCrossings: [crossing('financial_balance', 'below', 'ADVISORY')],
    });
    expect(messages.length).toBe(0);
  });

  it('test_urgent_outside_domain_ignored', () => {
    // commercial_director doesn't see financial_status
    const messages = generateStaffMessages({
      staff: [staff('s1', 'commercial_director', 3)],
      worldStateDiff: {},
      thresholdCrossings: [crossing('financial_status', 'above', 'BLOCKING')],
    });
    expect(messages.length).toBe(0);
  });

  it('test_urgent_bypasses_routine_cap', () => {
    // 3 BLOCKING crossings in commercial_director's domain — all should fire
    // despite ROUTINE cap of 2.
    const messages = generateStaffMessages({
      staff: [staff('s1', 'commercial_director', 3)],
      worldStateDiff: {},
      thresholdCrossings: [
        crossing('fan_momentum', 'below', 'BLOCKING'),
        crossing('fan_attendance', 'below', 'BLOCKING'),
        crossing('sponsor_quality', 'below', 'BLOCKING'),
      ],
    });
    expect(messages.length).toBe(3);
    for (const m of messages) expect(m.priority).toBe('URGENT');
  });
});

describe('DEFAULT_DOMAIN_BY_ROLE coverage', () => {
  it('test_all_6_roles_have_domain', () => {
    for (const role of [
      'groundskeeper',
      'fitness_coach',
      'commercial_director',
      'scouting_director',
      'finance_director',
      'head_coach',
    ] as const) {
      const dom = DEFAULT_DOMAIN_BY_ROLE[role];
      expect(dom.length).toBeGreaterThan(0);
    }
  });
});
