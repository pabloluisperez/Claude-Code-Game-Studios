/**
 * Unit tests for event FSM priority routing.
 * Story: EVENT-SYSTEM-002
 */

import { describe, it, expect } from 'vitest';
import {
  eventDefaultChoice,
  isAdvanceBlocked,
  pickAdvisoryEvents,
  pickNextStopEvent,
  type PendingEvent,
} from '../../src/sim/event-system/fsm.js';
import type { SponsorOfferPayload } from '../../src/sim/event-system/types.js';

function ev(
  id: string,
  week: number,
  priority: 'STOP' | 'ADVISORY' | 'NOTIFY',
  status: string = 'pending',
): PendingEvent {
  return { id, week, type: 'test', priority, status };
}

describe('pickNextStopEvent', () => {
  it('test_returns_pending_stop_at_current_week', () => {
    const events = [
      ev('a', 5, 'STOP'),
      ev('b', 10, 'STOP'),
      ev('c', 5, 'ADVISORY'),
    ];
    expect(pickNextStopEvent(events, 5)).toEqual(events[0]);
  });

  it('test_deterministic_lex_order_when_multiple', () => {
    const events = [ev('z', 5, 'STOP'), ev('a', 5, 'STOP'), ev('m', 5, 'STOP')];
    expect(pickNextStopEvent(events, 5)!.id).toBe('a');
  });

  it('test_ignores_resolved_stops', () => {
    const events = [ev('a', 5, 'STOP', 'resolved')];
    expect(pickNextStopEvent(events, 5)).toBeNull();
  });

  it('test_other_weeks_ignored', () => {
    const events = [ev('a', 5, 'STOP')];
    expect(pickNextStopEvent(events, 6)).toBeNull();
  });
});

describe('pickAdvisoryEvents', () => {
  it('test_returns_all_advisory_at_week', () => {
    const events = [
      ev('a', 5, 'ADVISORY'),
      ev('b', 5, 'STOP'),
      ev('c', 5, 'ADVISORY'),
    ];
    expect(pickAdvisoryEvents(events, 5).length).toBe(2);
  });
});

describe('isAdvanceBlocked', () => {
  it('test_blocked_when_stop_pending', () => {
    expect(isAdvanceBlocked([ev('a', 5, 'STOP')], 5)).toBe(true);
  });

  it('test_not_blocked_by_advisory', () => {
    expect(isAdvanceBlocked([ev('a', 5, 'ADVISORY')], 5)).toBe(false);
  });

  it('test_not_blocked_with_no_events', () => {
    expect(isAdvanceBlocked([], 5)).toBe(false);
  });
});

describe('eventDefaultChoice', () => {
  it('test_returns_payload_default', () => {
    const p: SponsorOfferPayload = {
      kind: 'sponsor_offer',
      brand: 'X',
      weeklyAmountEurK: 1,
      contractWeeks: 52,
      qualityDelta: 5,
      options: {
        accept: { label: '', description: '' },
        reject: { label: '', description: '' },
      },
      defaultOption: 'reject',
    };
    expect(eventDefaultChoice(p)).toBe('reject');
  });
});
