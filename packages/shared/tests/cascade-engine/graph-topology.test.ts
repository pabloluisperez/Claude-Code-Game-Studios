/**
 * Story: CASCADE-ENGINE-002
 * GDD: cascade-engine.md §Catálogo de Cadenas + §Core Rules
 * ADR: ADR-003 (data not code, Rule 3, Rule 4, Rule 10)
 * Control Manifest: 2026-05-19
 *
 * Test naming convention: `test_[system]_[scenario]_[expected_result]` per
 *   .claude/rules/test-standards.md.
 *
 * These tests verify the static structure (topology) of CASCADA_FC_GRAPH.
 * No transferFn is called — those functions throw until stories 006–013.
 * Every assertion here must pass without a running engine or a database.
 */

import { describe, expect, it } from 'vitest';
import {
  CASCADA_FC_GRAPH,
  getEdgesByTarget,
  type CascadeEdgeDef,
  // Balance constants — verified as exported, not as magic numbers.
  K_fit_decay,
  K_ground,
  T_safe_high,
  T_danger_peak,
  T_safe_low,
  K_C4,
  T_low,
  T_high,
  MORALE_SCALE_MIN,
  K_catering_fit,
  K_catering_moral,
  K_win_base,
  K_loss_base,
  K_streak_base,
  ATTEND_MAX_BASE,
  ATTEND_MIN_BASE,
  K_scouting,
  DECAY_scouting,
  T_scouting_active,
  K_scouting_roster,
  K_injury,
  IR_base,
  K_field_fatigue,
  T_field_poor,
  K_morale_perf,
  K_desperation,
  T_desperation_threshold,
  DESPERATION_EXP,
  K_squad_fit,
  SQ_optimal,
  K_home_advantage,
  K_price_erosion,
  T_price_danger,
  K_happy_fit,
  K_happy_perf,
  K_sponsor_happy,
  K_corruption_decay,
  SCANDAL_FAN_IMPACT,
  K_safe_high,
  K_danger,
  K_safe_low,
  MOMENTUM_TOLERANCE_DIVISOR,
  PRICE_BONUS_K,
  NOISE_C2_AMP,
  NOISE_C4_AMP,
  NOISE_C9a_AMP,
  NOISE_C14_AMP,
} from '../../src/sim/cascade-graph.js';
import { NODE_IDS, type NodeId } from '../../src/sim/cascade-types.js';

// ── AC #1: Edge count ─────────────────────────────────────────────────────────

describe('cascade graph — edge count', () => {
  it('test_cascade_graph_has_exactly_22_edges', () => {
    // Arrange: GDD §Catálogo de Cadenas lists 22 chains.
    //   C0, C1a, C1b, C2, C3, C4, C5a, C5b, C6, C7, C8,
    //   C9a, C9b, C11, C12, C13, C14, C15, C16a, C16b, C17, C18a.
    //   C10 is a multiplier inside C4; C18b is an event-system consequence.
    // Act
    const count = CASCADA_FC_GRAPH.length;
    // Assert
    expect(count).toBe(22);
  });
});

// ── AC #2: Unique edge ids ────────────────────────────────────────────────────

describe('cascade graph — edge id uniqueness', () => {
  it('test_cascade_graph_all_edge_ids_are_unique', () => {
    // Arrange
    const ids = CASCADA_FC_GRAPH.map((e) => e.id);
    const uniqueIds = new Set(ids);
    // Act + Assert: duplicates would cause a Set size mismatch
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('test_cascade_graph_edge_ids_match_gdd_chain_catalog', () => {
    // Arrange: the canonical 22 chain ids from GDD §Catálogo de Cadenas.
    const expected = new Set([
      'C0', 'C1a', 'C1b', 'C2', 'C3', 'C4', 'C5a', 'C5b',
      'C6', 'C7', 'C8', 'C9a', 'C9b', 'C11', 'C12', 'C13',
      'C14', 'C15', 'C16a', 'C16b', 'C17', 'C18a',
    ]);
    // Act
    const actual = new Set(CASCADA_FC_GRAPH.map((e) => e.id));
    // Assert: symmetric difference must be empty
    for (const id of expected) {
      expect(actual.has(id), `Missing expected edge ${id}`).toBe(true);
    }
    expect(actual.size).toBe(expected.size);
  });

  it('test_cascade_graph_c10_and_c18b_are_absent_from_graph', () => {
    // C10 is NOT an edge — it is a multiplier inside C4 transferFn.
    // C18b is NOT in the graph — it is an event-system consequence.
    const ids = new Set(CASCADA_FC_GRAPH.map((e) => e.id));
    expect(ids.has('C10')).toBe(false);
    expect(ids.has('C18b')).toBe(false);
  });
});

// ── AC #3: All NodeIds referenced are valid ───────────────────────────────────

describe('cascade graph — NodeId validity', () => {
  it('test_cascade_graph_all_fromNode_references_are_valid_node_ids', () => {
    // Arrange
    const validIds = new Set<string>(NODE_IDS);
    // Act + Assert
    for (const edge of CASCADA_FC_GRAPH) {
      expect(
        validIds.has(edge.fromNode),
        `Edge ${edge.id} has unknown fromNode: "${edge.fromNode}"`
      ).toBe(true);
    }
  });

  it('test_cascade_graph_all_toNode_references_are_valid_node_ids', () => {
    // Arrange
    const validIds = new Set<string>(NODE_IDS);
    // Act + Assert
    for (const edge of CASCADA_FC_GRAPH) {
      expect(
        validIds.has(edge.toNode),
        `Edge ${edge.id} has unknown toNode: "${edge.toNode}"`
      ).toBe(true);
    }
  });
});

// ── AC #4: Delay values are 0, 1, or 2 ───────────────────────────────────────

describe('cascade graph — delay values', () => {
  it('test_cascade_graph_all_delay_values_are_0_1_or_2', () => {
    // Per CascadeEdgeDef type — delay: 0 | 1 | 2.
    // This test checks runtime values match the type annotation.
    const allowedDelays = new Set([0, 1, 2]);
    for (const edge of CASCADA_FC_GRAPH) {
      expect(
        allowedDelays.has(edge.delay),
        `Edge ${edge.id} has invalid delay: ${edge.delay}`
      ).toBe(true);
    }
  });

  it('test_cascade_graph_c15_is_the_only_delay2_edge', () => {
    // Per GDD §C15: ticket price loyalty erosion takes 2 weeks.
    // No other edge has delay:2 in the MVP graph.
    const delay2Edges = CASCADA_FC_GRAPH.filter((e) => e.delay === 2);
    expect(delay2Edges.length).toBe(1);
    expect(delay2Edges[0].id).toBe('C15');
  });

  it('test_cascade_graph_delay1_edges_are_correct', () => {
    // Per GDD §Catálogo de Cadenas: edges with delay:1 are
    // C1a, C2, C4, C5a, C5b, C9a, C12, C13, C17.
    const delay1Ids = new Set(
      CASCADA_FC_GRAPH.filter((e) => e.delay === 1).map((e) => e.id)
    );
    const expectedDelay1 = ['C1a', 'C2', 'C4', 'C5a', 'C5b', 'C9a', 'C12', 'C13', 'C17'];
    for (const id of expectedDelay1) {
      expect(delay1Ids.has(id), `Expected delay:1 for ${id}`).toBe(true);
    }
    expect(delay1Ids.size).toBe(expectedDelay1.length);
  });
});

// ── AC #5: Specific edge wiring (fromNode → toNode) ──────────────────────────

describe('cascade graph — edge wiring', () => {
  // Build a lookup map for concise assertions.
  const edgeMap = new Map<string, CascadeEdgeDef>(
    CASCADA_FC_GRAPH.map((e) => [e.id, e])
  );

  it('test_cascade_graph_c0_is_team_fitness_self_loop', () => {
    const e = edgeMap.get('C0')!;
    expect(e.fromNode).toBe('team_fitness');
    expect(e.toNode).toBe('team_fitness');
    expect(e.delay).toBe(0);
  });

  it('test_cascade_graph_c1a_groundskeeper_budget_to_field_quality', () => {
    const e = edgeMap.get('C1a')!;
    expect(e.fromNode).toBe('groundskeeper_budget');
    expect(e.toNode).toBe('field_quality');
    expect(e.delay).toBe(1);
  });

  it('test_cascade_graph_c1b_field_quality_to_injury_risk', () => {
    const e = edgeMap.get('C1b')!;
    expect(e.fromNode).toBe('field_quality');
    expect(e.toNode).toBe('injury_risk');
    expect(e.delay).toBe(0);
  });

  it('test_cascade_graph_c4_training_intensity_to_team_fitness', () => {
    const e = edgeMap.get('C4')!;
    expect(e.fromNode).toBe('training_intensity');
    expect(e.toNode).toBe('team_fitness');
    expect(e.delay).toBe(1);
  });

  it('test_cascade_graph_c8_fan_momentum_to_fan_attendance', () => {
    const e = edgeMap.get('C8')!;
    expect(e.fromNode).toBe('fan_momentum');
    expect(e.toNode).toBe('fan_attendance');
    expect(e.delay).toBe(0);
  });

  it('test_cascade_graph_c11_staff_morale_to_match_performance_index', () => {
    const e = edgeMap.get('C11')!;
    expect(e.fromNode).toBe('staff_morale');
    expect(e.toNode).toBe('match_performance_index');
    expect(e.delay).toBe(0);
  });

  it('test_cascade_graph_c14_field_quality_to_match_performance_index', () => {
    const e = edgeMap.get('C14')!;
    expect(e.fromNode).toBe('field_quality');
    expect(e.toNode).toBe('match_performance_index');
    expect(e.delay).toBe(0);
  });

  it('test_cascade_graph_c15_ticket_price_to_fan_momentum_delay2', () => {
    const e = edgeMap.get('C15')!;
    expect(e.fromNode).toBe('ticket_price_index');
    expect(e.toNode).toBe('fan_momentum');
    expect(e.delay).toBe(2);
  });

  it('test_cascade_graph_c18a_corruption_exposure_self_loop', () => {
    const e = edgeMap.get('C18a')!;
    expect(e.fromNode).toBe('corruption_exposure');
    expect(e.toNode).toBe('corruption_exposure');
    expect(e.delay).toBe(0);
  });

  it('test_cascade_graph_c12_consecutive_losses_to_team_fitness', () => {
    const e = edgeMap.get('C12')!;
    expect(e.fromNode).toBe('consecutive_losses');
    expect(e.toNode).toBe('team_fitness');
    expect(e.delay).toBe(1);
  });

  it('test_cascade_graph_c17_sponsor_quality_to_player_happiness', () => {
    const e = edgeMap.get('C17')!;
    expect(e.fromNode).toBe('sponsor_quality');
    expect(e.toNode).toBe('player_happiness');
    expect(e.delay).toBe(1);
  });
});

// ── AC #6: Counterintuitive flag — exactly 7 edges ───────────────────────────

describe('cascade graph — counterintuitive flag', () => {
  it('test_cascade_graph_exactly_7_counterintuitive_edges', () => {
    // Per GDD Core Rule 7: "7 counterintuitive chains".
    const ci = CASCADA_FC_GRAPH.filter((e) => e.counterintuitive);
    expect(ci.length).toBe(7);
  });

  it('test_cascade_graph_counterintuitive_edges_are_the_correct_7', () => {
    // Per GDD §Catálogo de Cadenas + Core Rule 7.
    const expected = new Set(['C1b', 'C4', 'C6', 'C8', 'C12', 'C15', 'C18a']);
    const actual = new Set(
      CASCADA_FC_GRAPH.filter((e) => e.counterintuitive).map((e) => e.id)
    );
    expect(actual).toEqual(expected);
  });

  it('test_cascade_graph_non_counterintuitive_edges_have_flag_false', () => {
    // Every edge not in the 7 must have counterintuitive: false.
    const ciIds = new Set(['C1b', 'C4', 'C6', 'C8', 'C12', 'C15', 'C18a']);
    for (const edge of CASCADA_FC_GRAPH) {
      if (!ciIds.has(edge.id)) {
        expect(
          edge.counterintuitive,
          `Edge ${edge.id} should NOT be counterintuitive`
        ).toBe(false);
      }
    }
  });
});

// ── AC #7: Match-week guards (C11, C14, C16b) ────────────────────────────────

describe('cascade graph — match-week guards', () => {
  it('test_cascade_graph_c11_has_guardFn', () => {
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C11')!;
    expect(e.guardFn).toBeDefined();
  });

  it('test_cascade_graph_c14_has_guardFn', () => {
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C14')!;
    expect(e.guardFn).toBeDefined();
  });

  it('test_cascade_graph_c16b_has_guardFn', () => {
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C16b')!;
    expect(e.guardFn).toBeDefined();
  });

  it('test_cascade_graph_c11_guard_returns_true_when_hasMatchThisWeek', () => {
    // Arrange: minimal SimContext with hasMatchThisWeek = true
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C11')!;
    const fakeCtx = { hasMatchThisWeek: true } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    const fakePrevState = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    // Act
    const result = e.guardFn!(fakePrevState, fakeCtx);
    // Assert
    expect(result).toBe(true);
  });

  it('test_cascade_graph_c11_guard_returns_false_when_no_match', () => {
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C11')!;
    const fakeCtx = { hasMatchThisWeek: false } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    const fakePrevState = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    expect(e.guardFn!(fakePrevState, fakeCtx)).toBe(false);
  });

  it('test_cascade_graph_c14_guard_returns_true_when_hasMatchThisWeek', () => {
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C14')!;
    const fakeCtx = { hasMatchThisWeek: true } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    const fakePrevState = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    expect(e.guardFn!(fakePrevState, fakeCtx)).toBe(true);
  });

  it('test_cascade_graph_c16b_guard_returns_false_when_no_match', () => {
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C16b')!;
    const fakeCtx = { hasMatchThisWeek: false } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    const fakePrevState = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    expect(e.guardFn!(fakePrevState, fakeCtx)).toBe(false);
  });

  it('test_cascade_graph_all_non_guarded_edges_have_undefined_guardFn', () => {
    // AC #5: ALL edges not in the guarded set must have guardFn === undefined.
    // Guarded: C11 (hasMatchThisWeek), C14 (hasMatchThisWeek), C16b (hasMatchThisWeek),
    // C18a (corruption decay guard). Every other edge must have no guard at all.
    const guardedIds = new Set(['C11', 'C14', 'C16b', 'C18a']);
    for (const edge of CASCADA_FC_GRAPH) {
      if (!guardedIds.has(edge.id)) {
        expect(
          edge.guardFn,
          `Edge ${edge.id} should have guardFn === undefined`
        ).toBeUndefined();
      }
    }
  });
});

// ── AC #8: C18a corruption guard ─────────────────────────────────────────────

describe('cascade graph — C18a corruption decay guard', () => {
  it('test_cascade_graph_c18a_has_guardFn', () => {
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C18a')!;
    expect(e.guardFn).toBeDefined();
  });

  it('test_cascade_graph_c18a_guard_allows_decay_below_80', () => {
    // Arrange: corruption_exposure = 79 → decay allowed
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C18a')!;
    const fakePrevState = { corruption_exposure: 79 } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    const fakeCtx = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    // Act + Assert
    expect(e.guardFn!(fakePrevState, fakeCtx)).toBe(true);
  });

  it('test_cascade_graph_c18a_guard_blocks_decay_at_80', () => {
    // Arrange: corruption_exposure = 80 → BLOCKING zone → decay skipped
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C18a')!;
    const fakePrevState = { corruption_exposure: 80 } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    const fakeCtx = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    expect(e.guardFn!(fakePrevState, fakeCtx)).toBe(false);
  });

  it('test_cascade_graph_c18a_guard_blocks_decay_above_80', () => {
    // Arrange: corruption_exposure = 95 (full scandal active)
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C18a')!;
    const fakePrevState = { corruption_exposure: 95 } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    const fakeCtx = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    expect(e.guardFn!(fakePrevState, fakeCtx)).toBe(false);
  });

  it('test_cascade_graph_c18a_guard_allows_decay_at_zero', () => {
    // Edge case: zero corruption — decay is a no-op but guard must allow it.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C18a')!;
    const fakePrevState = { corruption_exposure: 0 } as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[0];
    const fakeCtx = {} as Parameters<NonNullable<CascadeEdgeDef['guardFn']>>[1];
    expect(e.guardFn!(fakePrevState, fakeCtx)).toBe(true);
  });
});

// ── AC #9: getEdgesByTarget query helper ──────────────────────────────────────

describe('cascade graph — getEdgesByTarget()', () => {
  it('test_cascade_graph_get_edges_by_target_team_fitness_returns_exactly_7_edges', () => {
    // AC #7: team_fitness is written by exactly C0, C3, C4, C5a, C12, C13, C16a.
    // toBeGreaterThanOrEqual would miss a missing or spuriously added edge.
    const edges = getEdgesByTarget('team_fitness');
    expect(edges.length).toBe(7);
    const ids = new Set(edges.map((e) => e.id));
    expect(ids.has('C0')).toBe(true);    // self-loop (natural decay)
    expect(ids.has('C3')).toBe(true);    // poor field → fatigue
    expect(ids.has('C4')).toBe(true);    // training intensity
    expect(ids.has('C5a')).toBe(true);   // catering
    expect(ids.has('C12')).toBe(true);   // desperate overtraining
    expect(ids.has('C13')).toBe(true);   // squad availability
    expect(ids.has('C16a')).toBe(true);  // player happiness
  });

  it('test_cascade_graph_get_edges_by_target_fan_momentum_includes_c6_c7_c15', () => {
    const edges = getEdgesByTarget('fan_momentum');
    const ids = new Set(edges.map((e) => e.id));
    expect(ids.has('C6')).toBe(true);
    expect(ids.has('C7')).toBe(true);
    expect(ids.has('C15')).toBe(true);
  });

  it('test_cascade_graph_get_edges_by_target_match_performance_index_only_c11_c14_c16b', () => {
    // Per control-manifest allow-list: only C11, C14, C16b may write MPI.
    const edges = getEdgesByTarget('match_performance_index');
    const ids = new Set(edges.map((e) => e.id));
    expect(ids.has('C11')).toBe(true);
    expect(ids.has('C14')).toBe(true);
    expect(ids.has('C16b')).toBe(true);
    // Assert no other edge writes to match_performance_index
    expect(ids.size).toBe(3);
  });

  it('test_cascade_graph_get_edges_by_target_squad_available_pct_includes_c2_c9b', () => {
    const edges = getEdgesByTarget('squad_available_pct');
    const ids = new Set(edges.map((e) => e.id));
    expect(ids.has('C2')).toBe(true);
    expect(ids.has('C9b')).toBe(true);
  });

  it('test_cascade_graph_get_edges_by_target_returns_new_array_each_call', () => {
    // The returned array must be a new object (frozen source must not be modified).
    const a = getEdgesByTarget('team_fitness');
    const b = getEdgesByTarget('team_fitness');
    expect(a).not.toBe(b);
    // Mutating a must not affect b
    a.pop();
    expect(b.length).toBeGreaterThan(a.length);
  });

  it('test_cascade_graph_get_edges_by_target_returns_empty_for_input_nodes_with_no_incoming_edges', () => {
    // Input nodes (player-controlled) that no cascade edge writes to:
    // groundskeeper_budget, training_intensity, catering_budget,
    // ticket_price_index, scouting_budget.
    // These are set only via PlayerDecision — no cascade writes them.
    const inputNodes: NodeId[] = [
      'groundskeeper_budget',
      'training_intensity',
      'catering_budget',
      'ticket_price_index',
      'scouting_budget',
    ];
    for (const node of inputNodes) {
      const edges = getEdgesByTarget(node);
      expect(
        edges.length,
        `Input node "${node}" should have no incoming cascade edges`
      ).toBe(0);
    }
  });

  it('test_cascade_graph_get_edges_by_target_team_skill_returns_empty', () => {
    // team_skill is a static/sim-output node — never written by cascade edges.
    const edges = getEdgesByTarget('team_skill');
    expect(edges.length).toBe(0);
  });
});

// ── AC #10: transferFn throws for unimplemented stories ──────────────────────

describe('cascade graph — transferFn placeholder behaviour', () => {
  it('test_cascade_graph_c0_transferFn_implemented_by_story_006', () => {
    // C0 was implemented in CASCADE-ENGINE-006 (natural decay toward equilibrium 70).
    // It must no longer throw — calling it with a valid prevState returns a number.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C0')!;
    const prevState = { team_fitness: 90 } as Parameters<CascadeEdgeDef['transferFn']>[0];
    const ctx = {} as Parameters<CascadeEdgeDef['transferFn']>[1];
    expect(() => e.transferFn(prevState, ctx)).not.toThrow();
    expect(typeof e.transferFn(prevState, ctx)).toBe('number');
  });

  it('test_cascade_graph_c2_transferFn_implemented_by_story_007', () => {
    // C2 was implemented in CASCADE-ENGINE-007 (injury_risk → squad_available_pct).
    // It must no longer throw — calling it with a valid prevState + ctx returns a number.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C2')!;
    const prevState = { injury_risk: 50 } as Parameters<CascadeEdgeDef['transferFn']>[0];
    const ctx = { rng: () => 0.5 } as Parameters<CascadeEdgeDef['transferFn']>[1];
    expect(() => e.transferFn(prevState, ctx)).not.toThrow();
    expect(typeof e.transferFn(prevState, ctx)).toBe('number');
  });

  it('test_cascade_graph_c6_transferFn_implemented_by_story_010', () => {
    // C6 was implemented in CASCADE-ENGINE-010 (match_performance_index → fan_momentum).
    // It must no longer throw — calling it with a valid prevState returns a number.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C6')!;
    const prevState = { match_performance_index: 70 } as Parameters<CascadeEdgeDef['transferFn']>[0];
    const ctx = {} as Parameters<CascadeEdgeDef['transferFn']>[1];
    expect(() => e.transferFn(prevState, ctx)).not.toThrow();
    expect(typeof e.transferFn(prevState, ctx)).toBe('number');
  });

  it('test_cascade_graph_c9a_transferFn_implemented_by_story_012', () => {
    // C9a was implemented in CASCADE-ENGINE-012 (scouting_budget → scouting_points).
    // It must no longer throw — calling it with a valid prevState + rng returns a number.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C9a')!;
    const prevState = { scouting_budget: 30, scouting_points: 0 } as Parameters<CascadeEdgeDef['transferFn']>[0];
    const ctx = { rng: () => 0.5 } as Parameters<CascadeEdgeDef['transferFn']>[1];
    expect(() => e.transferFn(prevState, ctx)).not.toThrow();
    expect(typeof e.transferFn(prevState, ctx)).toBe('number');
  });

  it('test_cascade_graph_c11_transferFn_implemented_by_story_010', () => {
    // C11 was implemented in CASCADE-ENGINE-010 (staff_morale → match_performance_index).
    // It must no longer throw — calling it with a valid prevState returns a number.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C11')!;
    const prevState = { staff_morale: 20 } as Parameters<CascadeEdgeDef['transferFn']>[0];
    const ctx = {} as Parameters<CascadeEdgeDef['transferFn']>[1];
    expect(() => e.transferFn(prevState, ctx)).not.toThrow();
    expect(typeof e.transferFn(prevState, ctx)).toBe('number');
  });

  it('test_cascade_graph_c16a_transferFn_implemented_by_story_009', () => {
    // C16a was implemented in CASCADE-ENGINE-009 (player_happiness → team_fitness).
    // It must no longer throw — calling it with a valid prevState returns a number.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C16a')!;
    const prevState = { player_happiness: 80 } as Parameters<CascadeEdgeDef['transferFn']>[0];
    const ctx = {} as Parameters<CascadeEdgeDef['transferFn']>[1];
    expect(() => e.transferFn(prevState, ctx)).not.toThrow();
    expect(typeof e.transferFn(prevState, ctx)).toBe('number');
  });

  it('test_cascade_graph_c18a_transferFn_implemented_by_story_013', () => {
    // C18a was implemented in CASCADE-ENGINE-013 (corruption_exposure self-decay).
    // It must no longer throw — calling it with a valid prevState returns a number.
    const e = CASCADA_FC_GRAPH.find((x) => x.id === 'C18a')!;
    const prevState = { corruption_exposure: 75 } as Parameters<CascadeEdgeDef['transferFn']>[0];
    const ctx = {} as Parameters<CascadeEdgeDef['transferFn']>[1];
    expect(() => e.transferFn(prevState, ctx)).not.toThrow();
    expect(typeof e.transferFn(prevState, ctx)).toBe('number');
  });
});

// ── AC #11: Graph is frozen (immutable at runtime) ────────────────────────────

describe('cascade graph — immutability', () => {
  it('test_cascade_graph_array_is_frozen', () => {
    // Object.freeze applied at definition — attempting mutation throws in strict mode.
    expect(Object.isFrozen(CASCADA_FC_GRAPH)).toBe(true);
  });
});

// ── AC #12: Balance constants are exported with correct GDD values ────────────

describe('cascade graph — balance constants', () => {
  it('test_cascade_graph_K_fit_decay_equals_005', () => {
    expect(K_fit_decay).toBe(0.05);
  });

  it('test_cascade_graph_K_ground_equals_030', () => {
    expect(K_ground).toBe(0.30);
  });

  it('test_cascade_graph_thresholds_c1b_ordering_is_safe_low_lt_danger_peak_lt_safe_high', () => {
    // T_safe_low < T_danger_peak < T_safe_high is required for the
    // three-branch piecewise of C1b to make geometric sense.
    expect(T_safe_low).toBeLessThan(T_danger_peak);
    expect(T_danger_peak).toBeLessThan(T_safe_high);
  });

  it('test_cascade_graph_T_low_lt_T_high_for_training_sweet_spot', () => {
    // T_low < T_high defines the valid training intensity window.
    expect(T_low).toBeLessThan(T_high);
  });

  it('test_cascade_graph_MORALE_SCALE_MIN_is_between_0_and_1', () => {
    // Minimum morale multiplier must produce a positive training effect.
    expect(MORALE_SCALE_MIN).toBeGreaterThan(0);
    expect(MORALE_SCALE_MIN).toBeLessThanOrEqual(1);
  });

  it('test_cascade_graph_catering_moral_greater_than_catering_fit', () => {
    // GDD comment: "Staff morale is more catering-sensitive than players."
    expect(K_catering_moral).toBeGreaterThan(K_catering_fit);
  });

  it('test_cascade_graph_attend_min_base_gt_0_and_lt_attend_max_base', () => {
    // Unconditional supporters > 0; attendance ceiling makes sense.
    expect(ATTEND_MIN_BASE).toBeGreaterThan(0);
    expect(ATTEND_MIN_BASE).toBeLessThan(ATTEND_MAX_BASE);
  });

  it('test_cascade_graph_IR_base_equals_20', () => {
    // Per GDD: injury_risk default = 20 = IR_base (no penalty at default).
    expect(IR_base).toBe(20);
  });

  it('test_cascade_graph_T_scouting_active_equals_50', () => {
    // Per GDD §C9b: threshold gate at 50 scouting_points.
    expect(T_scouting_active).toBe(50);
  });

  it('test_cascade_graph_K_corruption_decay_equals_005', () => {
    // Per GDD §C18a: 5% weekly natural decay.
    expect(K_corruption_decay).toBe(0.05);
  });

  it('test_cascade_graph_T_price_danger_equals_65', () => {
    // Per GDD §C15: above 65 price starts eroding fan loyalty.
    expect(T_price_danger).toBe(65);
  });

  it('test_cascade_graph_K_happy_perf_greater_than_K_happy_fit', () => {
    // Match-day emotional impact > training impact per GDD §C16b comment.
    expect(K_happy_perf).toBeGreaterThan(K_happy_fit);
  });

  it('test_cascade_graph_DESPERATION_EXP_gt_1_making_damage_superlinear', () => {
    // Exponent > 1 makes losing streak damage grow faster than linearly.
    expect(DESPERATION_EXP).toBeGreaterThan(1);
  });

  it('test_cascade_graph_SQ_optimal_equals_75', () => {
    // Per GDD §C13: optimal squad availability = 75%.
    expect(SQ_optimal).toBe(75);
  });

  it('test_cascade_graph_all_balance_constants_are_positive_numbers', () => {
    // Regression: no constant must be accidentally set to 0 or NaN.
    const constants: Record<string, number> = {
      K_fit_decay, K_ground, T_safe_high, T_danger_peak, T_safe_low,
      K_safe_high, K_danger, K_safe_low,
      K_C4, T_low, T_high, MORALE_SCALE_MIN, K_catering_fit, K_catering_moral,
      K_win_base, K_loss_base, K_streak_base, ATTEND_MAX_BASE, ATTEND_MIN_BASE,
      MOMENTUM_TOLERANCE_DIVISOR, PRICE_BONUS_K,
      K_scouting, DECAY_scouting, T_scouting_active, K_scouting_roster,
      K_injury, IR_base, K_field_fatigue, T_field_poor, K_morale_perf,
      K_desperation, T_desperation_threshold, DESPERATION_EXP,
      K_squad_fit, SQ_optimal, K_home_advantage, K_price_erosion, T_price_danger,
      K_happy_fit, K_happy_perf, K_sponsor_happy, K_corruption_decay, SCANDAL_FAN_IMPACT,
      NOISE_C2_AMP, NOISE_C4_AMP, NOISE_C9a_AMP, NOISE_C14_AMP,
    };
    for (const [name, value] of Object.entries(constants)) {
      expect(isNaN(value), `${name} is NaN`).toBe(false);
      expect(isFinite(value), `${name} is not finite`).toBe(true);
      expect(value, `${name} must be > 0`).toBeGreaterThan(0);
    }
  });

  it('test_cascade_graph_all_balance_constants_match_gdd_exact_values', () => {
    // AC #9: each constant must match the GDD §Formulas verbatim.
    // A transcription error here propagates to every chain story (006–013).
    expect(T_safe_high).toBe(75);
    expect(T_danger_peak).toBe(45);
    expect(T_safe_low).toBe(20);
    expect(K_safe_high).toBe(6.0);
    expect(K_danger).toBe(0.25);
    expect(K_safe_low).toBe(3.0);
    expect(K_C4).toBe(8.0);
    expect(T_low).toBe(25);
    expect(T_high).toBe(75);
    expect(MORALE_SCALE_MIN).toBe(0.5);
    expect(K_catering_fit).toBe(3.0);
    expect(K_catering_moral).toBe(4.0);
    expect(K_win_base).toBe(8.0);
    expect(K_loss_base).toBe(8.0);
    expect(K_streak_base).toBe(2.0);
    expect(ATTEND_MAX_BASE).toBe(60);
    expect(ATTEND_MIN_BASE).toBe(5);
    expect(MOMENTUM_TOLERANCE_DIVISOR).toBe(120);
    expect(PRICE_BONUS_K).toBe(0.25);
    expect(K_scouting).toBe(15.0);
    expect(DECAY_scouting).toBe(0.08);
    expect(K_scouting_roster).toBe(5.0);
    expect(K_injury).toBe(0.30);
    expect(K_field_fatigue).toBe(0.10);
    expect(T_field_poor).toBe(40);
    expect(K_morale_perf).toBe(8.0);
    expect(K_desperation).toBe(10.0);
    expect(T_desperation_threshold).toBe(50);
    expect(DESPERATION_EXP).toBe(1.5);
    expect(K_squad_fit).toBe(5.0);
    expect(K_home_advantage).toBe(6.0);
    expect(K_price_erosion).toBe(0.12);
    expect(K_happy_fit).toBe(4.0);
    expect(K_happy_perf).toBe(7.0);
    expect(K_sponsor_happy).toBe(5.0);
    expect(SCANDAL_FAN_IMPACT).toBe(30);
    expect(NOISE_C2_AMP).toBe(2.0);
    expect(NOISE_C4_AMP).toBe(2.0);
    expect(NOISE_C9a_AMP).toBe(2.0);
    expect(NOISE_C14_AMP).toBe(2.0);
  });
});
