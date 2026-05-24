/**
 * Socket.IO `match:event` emission per ADR-018.
 *
 * Namespace: `/match`. Rooms: `match:{matchSessionId}`.
 * Events: `match:paused`, `match:resumed`, `match:complete`, `match:event`.
 *
 * Idempotent at the emitter level — re-emitting the same event for the same
 * session is safe (clients dedupe via `(sessionId, currentTick, type)`).
 *
 * Story: MATCH-SIM-018
 * Control Manifest: 2026-05-19
 */

import type { Server } from 'socket.io';
import type { MatchOutcome, MatchSessionSnapshot } from '@smt/shared';
import type { MatchEventEmitter } from '../workers/match-worker.js';

export function createSocketEmitter(io: Server): MatchEventEmitter {
  const matchNamespace = io.of('/match');

  return (event) => {
    const room = `match:${event.sessionId}`;
    matchNamespace.to(room).emit(event.type, {
      sessionId: event.sessionId,
      ...((event.payload as object) ?? {}),
      timestamp: new Date().toISOString(),
    });
  };
}

/**
 * Subscribe a Socket.IO connection to a match room.
 * Called by `/match` namespace `connection` handler when client joins.
 */
export function joinMatchRoom(socket: { join: (room: string) => void }, sessionId: string): void {
  socket.join(`match:${sessionId}`);
}
