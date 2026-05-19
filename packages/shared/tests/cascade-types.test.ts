/**
 * Story: CASCADE-ENGINE-001
 * GDD: cascade-engine.md §Catálogo de Nodos
 * ADR: ADR-002, ADR-003
 * Control Manifest: 2026-05-19
 *
 * Test naming convention: `test_[system]_[scenario]_[expected_result]` per
 *   .claude/rules/test-standards.md.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultWorldState,
  NODE_IDS,
  NODE_RANGES,
  type NodeId,
  type WorldState,
} from '../src/sim/cascade-types.js';

describe('cascade types — NodeId catalog cardinality', () => {
  it('test_cascade_types_node_catalog_has_exactly_20_members', () => {
    // Arrange: NODE_RANGES is the authoritative catalog
    // Act
    const count = NODE_IDS.length;
    // Assert: GDD §Catálogo de Nodos lists exactly 20 nodes
    expect(count).toBe(20);
  });

  it('test_cascade_types_node_ids_match_gdd_catalog', () => {
    // Arrange: the canonical 20 nodes from cascade-engine.md
    const expected: NodeId[] = [
      'groundskeeper_budget',
      'training_intensity',
      'catering_budget',
      'ticket_price_index',
      'scouting_budget',
      'field_quality',
      'injury_risk',
      'team_fitness',
      'staff_morale',
      'player_happiness',
      'fan_momentum',
      'fan_attendance',
      'consecutive_wins',
      'consecutive_losses',
      'scouting_points',
      'sponsor_quality',
      'corruption_exposure',
      'team_skill',
      'match_performance_index',
      'squad_available_pct',
    ];
    // Act
    const actual = new Set(NODE_IDS);
    // Assert: every expected NodeId is present and no extras
    for (const id of expected) {
      expect(actual.has(id)).toBe(true);
    }
    expect(actual.size).toBe(expected.length);
  });
});

describe('cascade types — NODE_RANGES defaults', () => {
  it('test_cascade_types_team_fitness_default_equals_70', () => {
    // Per cascade-engine.md C0 (fitness decay equilibrium)
    expect(NODE_RANGES.team_fitness.default).toBe(70);
  });

  it('test_cascade_types_fan_momentum_default_equals_60', () => {
    // Per entities.yaml fan_momentum row + cascade-engine.md catalog
    expect(NODE_RANGES.fan_momentum.default).toBe(60);
  });

  it('test_cascade_types_injury_risk_default_equals_20', () => {
    expect(NODE_RANGES.injury_risk.default).toBe(20);
  });

  it('test_cascade_types_fan_attendance_default_equals_40', () => {
    expect(NODE_RANGES.fan_attendance.default).toBe(40);
  });

  it('test_cascade_types_scouting_budget_default_equals_30', () => {
    expect(NODE_RANGES.scouting_budget.default).toBe(30);
  });

  it('test_cascade_types_consecutive_streaks_max_is_10', () => {
    // Streak nodes cap at 10 per cascade-engine.md catalog
    expect(NODE_RANGES.consecutive_wins.max).toBe(10);
    expect(NODE_RANGES.consecutive_losses.max).toBe(10);
  });

  it('test_cascade_types_every_node_has_non_undefined_range', () => {
    // Arrange + Act: iterate over every NodeId
    // Assert: no missing rows in the catalog
    for (const id of NODE_IDS) {
      const range = NODE_RANGES[id];
      expect(range, `Missing range for ${id}`).toBeDefined();
      expect(typeof range.min).toBe('number');
      expect(typeof range.max).toBe('number');
      expect(typeof range.default).toBe('number');
      expect(range.min).toBeLessThanOrEqual(range.max);
      expect(range.default).toBeGreaterThanOrEqual(range.min);
      expect(range.default).toBeLessThanOrEqual(range.max);
    }
  });
});

describe('cascade types — defaultWorldState()', () => {
  it('test_cascade_types_default_world_state_has_all_20_nodes', () => {
    // Arrange + Act
    const state = defaultWorldState();
    // Assert: every NodeId is present
    for (const id of NODE_IDS) {
      expect(state[id], `Missing node ${id}`).toBeDefined();
    }
    expect(Object.keys(state).length).toBe(20);
  });

  it('test_cascade_types_default_state_values_match_node_ranges_default', () => {
    // Arrange
    const state = defaultWorldState();
    // Assert: every value equals NODE_RANGES[id].default
    for (const id of NODE_IDS) {
      expect(state[id]).toBe(NODE_RANGES[id].default);
    }
  });

  it('test_cascade_types_default_state_calls_return_distinct_objects', () => {
    // Per docstring: "Always returns a new object — never aliases a cached state"
    // Arrange + Act
    const a = defaultWorldState();
    const b = defaultWorldState();
    // Assert: structurally equal but not the same reference
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    // Mutating one must not affect the other
    a.team_fitness = 0;
    expect(b.team_fitness).toBe(70);
  });
});

describe('cascade types — JSON round-trip (control-manifest no-Map rule)', () => {
  it('test_cascade_types_default_state_round_trips_through_json', () => {
    // Per control-manifest cross-cutting rule: Record<NodeId, number> must
    // round-trip cleanly through JSON.parse(JSON.stringify(...)).
    // This is exactly what Map<> fails — Map serialises as {}.
    // Arrange
    const original = defaultWorldState();
    // Act
    const serialised = JSON.stringify(original);
    const restored = JSON.parse(serialised) as WorldState;
    // Assert
    expect(restored).toEqual(original);
    expect(Object.keys(restored).length).toBe(20);
  });

  it('test_cascade_types_serialised_state_is_not_empty_object', () => {
    // Regression guard: if someone changes WorldState to Map<>, JSON.stringify
    // produces "{}" — this test catches that immediately.
    const state = defaultWorldState();
    const json = JSON.stringify(state);
    expect(json).not.toBe('{}');
    expect(json.length).toBeGreaterThan(50);
    expect(json).toContain('team_fitness');
    expect(json).toContain('70');
  });

  it('test_cascade_types_mutated_state_round_trips_correctly', () => {
    // Arrange: mutate some values
    const state = defaultWorldState();
    state.team_fitness = 55;
    state.fan_momentum = 35;
    state.match_performance_index = 50;
    // Act
    const restored = JSON.parse(JSON.stringify(state)) as WorldState;
    // Assert
    expect(restored.team_fitness).toBe(55);
    expect(restored.fan_momentum).toBe(35);
    expect(restored.match_performance_index).toBe(50);
    expect(restored.injury_risk).toBe(20); // unchanged default
  });
});
