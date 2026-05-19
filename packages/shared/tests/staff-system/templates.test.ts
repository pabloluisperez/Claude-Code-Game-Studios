/**
 * Unit tests for template resolver.
 * Story: STAFF-SYSTEM-002
 */

import { describe, it, expect } from 'vitest';
import {
  resolveMessageTemplate,
  STAFF_MESSAGE_TEMPLATES,
  TEMPLATE_FALLBACK,
} from '../../src/sim/staff-system/templates.js';
import {
  DEFAULT_DOMAIN_BY_ROLE,
  STAFF_ROLES,
} from '../../src/sim/staff-system/types.js';

describe('resolveMessageTemplate', () => {
  it('test_known_key_returns_template', () => {
    const result = resolveMessageTemplate({
      role: 'groundskeeper',
      nodeId: 'field_quality',
      direction: 'below',
      tier: 1,
      priority: 'ROUTINE',
    });
    expect(result.templateKey).toBe('groundskeeper:field_quality:below:1');
    expect(result.content).toBe(STAFF_MESSAGE_TEMPLATES[result.templateKey]);
    expect(result.isFallback).toBe(false);
  });

  it('test_unknown_key_returns_fallback_routine', () => {
    const result = resolveMessageTemplate({
      role: 'head_coach',
      nodeId: 'nonexistent_node',
      direction: 'above',
      tier: 1,
      priority: 'ROUTINE',
    });
    expect(result.isFallback).toBe(true);
    expect(result.content).toBe(TEMPLATE_FALLBACK.ROUTINE);
  });

  it('test_unknown_key_returns_fallback_urgent', () => {
    const result = resolveMessageTemplate({
      role: 'head_coach',
      nodeId: 'nonexistent_node',
      direction: 'above',
      tier: 1,
      priority: 'URGENT',
    });
    expect(result.isFallback).toBe(true);
    expect(result.content).toBe(TEMPLATE_FALLBACK.URGENT);
  });

  it('test_tier_3_message_longer_than_tier_1', () => {
    const tier1 = resolveMessageTemplate({
      role: 'groundskeeper',
      nodeId: 'field_quality',
      direction: 'below',
      tier: 1,
      priority: 'ROUTINE',
    });
    const tier3 = resolveMessageTemplate({
      role: 'groundskeeper',
      nodeId: 'field_quality',
      direction: 'below',
      tier: 3,
      priority: 'ROUTINE',
    });
    expect(tier3.content.length).toBeGreaterThan(tier1.content.length * 2);
  });
});

describe('STAFF_MESSAGE_TEMPLATES — coverage', () => {
  it('test_every_role_x_node_x_direction_x_tier_present', () => {
    // For each role, every NodeId in DEFAULT_DOMAIN_BY_ROLE must have templates
    // for all 12 combinations (above/below × tier 1/2/3 = 6 → ×2 directions)
    let missing = 0;
    for (const role of STAFF_ROLES) {
      const nodes = DEFAULT_DOMAIN_BY_ROLE[role];
      for (const nodeId of nodes) {
        for (const direction of ['above', 'below'] as const) {
          for (const tier of [1, 2, 3] as const) {
            const key = `${role}:${nodeId}:${direction}:${tier}`;
            if (!(key in STAFF_MESSAGE_TEMPLATES)) {
              missing += 1;
            }
          }
        }
      }
    }
    expect(missing).toBe(0);
  });
});
