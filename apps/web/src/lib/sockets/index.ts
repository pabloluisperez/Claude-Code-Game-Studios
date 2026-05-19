/**
 * Socket.IO client bootstrap.
 *
 * Two namespaces are exposed:
 *  - default namespace: typed via ServerToClientEvents / ClientToServerEvents
 *    from @smt/shared/types/socket. Used for `club:*` realtime channels.
 *  - `/match` namespace: untyped (kept loose because the live-match event
 *    shape mirrors MatchEvent and is documented in apps/api/src/socket/
 *    match-events.ts rather than the shared socket-types file).
 *
 * Pre-existing socket.io-client 4.x has a known generic typing wart on the
 * default `io()` overload — we cast to the typed Socket so call sites get
 * autocomplete without dragging the generic surface across the codebase.
 *
 * Story: Match-live wiring (HUD-UI-006 follow-up)
 * Control Manifest: 2026-05-19
 */

import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from '@smt/shared/types/socket';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let defaultSocket: TypedSocket | null = null;
let matchSocket: Socket | null = null;

export function getSocket(): TypedSocket {
  if (!defaultSocket) {
    defaultSocket = io({
      withCredentials: true,
      autoConnect: false,
    }) as unknown as TypedSocket;
  }
  return defaultSocket;
}

export function connectSocket(): void {
  getSocket().connect();
}

export function disconnectSocket(): void {
  defaultSocket?.disconnect();
  defaultSocket = null;
}

/**
 * Connect to the `/match` namespace and join the given match session room.
 * Returns the raw Socket so callers can register `match:event` listeners.
 */
export function getMatchSocket(): Socket {
  if (!matchSocket) {
    matchSocket = io('/match', {
      withCredentials: true,
      autoConnect: false,
    });
  }
  return matchSocket;
}

export function joinMatchRoom(matchSessionId: string): Socket {
  const s = getMatchSocket();
  if (!s.connected) s.connect();
  s.emit('match:join', matchSessionId);
  return s;
}

export function disconnectMatchSocket(): void {
  matchSocket?.disconnect();
  matchSocket = null;
}
