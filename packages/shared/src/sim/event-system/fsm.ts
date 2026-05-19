/**
 * Event FSM — priority routing for the advance() loop.
 *
 * Per ADR-008 + ADR-015:
 *   STOP     → halts advance() processing of week N until resolved
 *   ADVISORY → accumulated in sidebar; doesn't block
 *   NOTIFY   → toast, fire-and-forget
 *
 * Pure functions: no DB. Caller (event-system service) does the persistence.
 *
 * Story: EVENT-SYSTEM-002 (TR-EVT-002)
 * Control Manifest: 2026-05-19
 */

import type { EventDecisionPayload, EventPriority } from './types.js';

export interface PendingEvent {
  readonly id: string;
  readonly week: number;
  readonly type: string;
  readonly priority: EventPriority;
  readonly status: string; // 'pending' | 'resolved' | 'expired'
  readonly payload?: EventDecisionPayload | null;
}

/**
 * Pick the next STOP event for the current week. If multiple exist, returns
 * the earliest by ID (deterministic). Returns null when no STOP pending.
 *
 * advance() must halt processing of `currentWeek` while a STOP event is
 * pending — UI shows the decision modal, server stays at currentWeek.
 */
export function pickNextStopEvent(
  events: readonly PendingEvent[],
  currentWeek: number,
): PendingEvent | null {
  const candidates = events
    .filter(
      (e) =>
        e.week === currentWeek &&
        e.priority === 'STOP' &&
        e.status === 'pending',
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}

/** All ADVISORY events for a week (sidebar feed). */
export function pickAdvisoryEvents(
  events: readonly PendingEvent[],
  currentWeek: number,
): readonly PendingEvent[] {
  return events.filter(
    (e) =>
      e.week === currentWeek &&
      e.priority === 'ADVISORY' &&
      e.status === 'pending',
  );
}

/** True when ANY STOP event blocks the current week. */
export function isAdvanceBlocked(
  events: readonly PendingEvent[],
  currentWeek: number,
): boolean {
  return pickNextStopEvent(events, currentWeek) !== null;
}

/** Compute the default choice for a pending event on timeout. */
export function eventDefaultChoice(payload: EventDecisionPayload): string {
  return payload.defaultOption;
}
