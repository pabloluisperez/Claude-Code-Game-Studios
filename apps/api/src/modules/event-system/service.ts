/**
 * Event-system service — resolve events + scheduling helpers.
 *
 * Per ADR-015:
 *   - resolveEventById(tx, eventId, choice): validates choice → dispatches
 *     to pure resolver → persists resolution (mutable update on calendar_events)
 *   - scheduleSeasonEvents: emit season_start / season_end / transfer-window
 *     events at season boundary
 *   - autoResolveDefault: timeout fallback applies payload.defaultOption
 *
 * Story: EVENT-SYSTEM-004/005
 * Control Manifest: 2026-05-19
 */

import { eq } from 'drizzle-orm';
import { calendarEvents } from '@smt/db';
import type { db as DBType } from '@smt/db';
import {
  resolveDefault,
  resolveEvent,
  type EventDecisionPayload,
  type EventResolveContext,
  type ResolutionResult,
} from '@smt/shared';
import * as Repo from './repo';

type Tx = Parameters<Parameters<typeof DBType.transaction>[0]>[0];

export type ResolveOutcome =
  | { ok: true; result: ResolutionResult }
  | { ok: false; reason: 'event_not_found' | 'already_resolved' | 'no_payload' | 'invalid_choice' };

/**
 * Resolve an event by ID with a user choice. Updates the calendar_events row
 * with status='resolved', resolvedAt=now, and audit metadata.
 */
export async function resolveEventById(
  tx: Tx,
  eventId: string,
  choice: string,
  ctx: Readonly<EventResolveContext>,
): Promise<ResolveOutcome> {
  const row = await Repo.findById(tx, eventId);
  if (!row) return { ok: false, reason: 'event_not_found' };
  if (row.status !== 'pending') return { ok: false, reason: 'already_resolved' };

  const metadata = (row.metadata as Record<string, unknown>) ?? {};
  const payload = metadata['decisionPayload'] as EventDecisionPayload | undefined;
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'no_payload' };
  }

  // Validate choice exists in payload.options
  const optionKeys = Object.keys((payload as { options: Record<string, unknown> }).options);
  if (!optionKeys.includes(choice)) {
    return { ok: false, reason: 'invalid_choice' };
  }

  const result = resolveEvent(payload, choice, ctx);

  await tx
    .update(calendarEvents)
    .set({
      status: 'resolved',
      consumed: true,
      resolvedAt: new Date(),
      metadata: {
        ...metadata,
        resolvedChoice: choice,
        resolvedDeltas: result.deltas,
      },
    })
    .where(eq(calendarEvents.id, eventId));

  return { ok: true, result };
}

/** Apply the default choice (used on timeout). */
export async function autoResolveDefault(
  tx: Tx,
  eventId: string,
  ctx: Readonly<EventResolveContext>,
): Promise<ResolveOutcome> {
  const row = await Repo.findById(tx, eventId);
  if (!row) return { ok: false, reason: 'event_not_found' };
  if (row.status !== 'pending') return { ok: false, reason: 'already_resolved' };
  const payload = ((row.metadata as Record<string, unknown>) ?? {})['decisionPayload'] as
    | EventDecisionPayload
    | undefined;
  if (!payload) return { ok: false, reason: 'no_payload' };
  return resolveEventById(tx, eventId, payload.defaultOption, ctx);
}

// ── Scheduler ────────────────────────────────────────────────────────────────

export interface SeasonScheduleArgs {
  readonly playthroughId: string;
  readonly season: number;
  readonly seasonStartWeek: number;
  readonly seasonEndWeek: number;
  /** Transfer windows: [openWeek, closeWeek] pairs (typically 2 per season). */
  readonly transferWindows?: ReadonlyArray<readonly [number, number]>;
}

/**
 * Schedule the base calendar events for a season:
 *   - season_start at startWeek
 *   - season_end at endWeek
 *   - transfer_window_open / close at the provided weeks
 *
 * Match events are scheduled separately by league-system Story 005.
 * STOP events (sponsor offers, scandals, board meetings) are spawned reactively.
 */
export async function scheduleSeasonEvents(
  tx: Tx,
  args: Readonly<SeasonScheduleArgs>,
): Promise<{ insertedCount: number }> {
  const rows: Array<Omit<Parameters<typeof Repo.createEvent>[1], 'id'>> = [];

  rows.push({
    playthroughId: args.playthroughId,
    week: args.seasonStartWeek,
    season: args.season,
    type: 'season_start',
    priority: 'NOTIFY',
    status: 'pending',
    metadata: { kind: 'season_start' },
    consumed: false,
  });

  rows.push({
    playthroughId: args.playthroughId,
    week: args.seasonEndWeek,
    season: args.season,
    type: 'season_end',
    priority: 'NOTIFY',
    status: 'pending',
    metadata: { kind: 'season_end' },
    consumed: false,
  });

  for (const [openWeek, closeWeek] of args.transferWindows ?? []) {
    rows.push({
      playthroughId: args.playthroughId,
      week: openWeek,
      season: args.season,
      type: 'transfer_window_open',
      priority: 'NOTIFY',
      status: 'pending',
      metadata: { kind: 'transfer_window_open' },
      consumed: false,
    });
    rows.push({
      playthroughId: args.playthroughId,
      week: closeWeek,
      season: args.season,
      type: 'transfer_window_close',
      priority: 'NOTIFY',
      status: 'pending',
      metadata: { kind: 'transfer_window_close' },
      consumed: false,
    });
  }

  let inserted = 0;
  for (const r of rows) {
    await Repo.createEvent(tx, r);
    inserted += 1;
  }
  return { insertedCount: inserted };
}

/**
 * Spawn a special event (board meeting, sponsor offer, scandal, etc.).
 * Caller passes the typed `EventDecisionPayload` — stored as JSON in metadata.
 */
export async function spawnSpecialEvent(
  tx: Tx,
  args: {
    readonly playthroughId: string;
    readonly week: number;
    readonly season: number;
    readonly type: string;
    readonly priority: 'STOP' | 'ADVISORY' | 'NOTIFY';
    readonly payload: EventDecisionPayload;
  },
): Promise<{ id: string }> {
  return Repo.createEvent(tx, {
    playthroughId: args.playthroughId,
    week: args.week,
    season: args.season,
    type: args.type,
    priority: args.priority,
    status: 'pending',
    metadata: { decisionPayload: args.payload },
    consumed: false,
  });
}
