/**
 * Socket.IO `/match` namespace.
 *
 * Clients call `match:join` with a match session id (or fixture id, when used
 * in replay mode); the server adds the socket to the corresponding room.
 * Subsequent `match:event` emissions (from match-worker or the replay action)
 * land in this room.
 *
 * Story: MATCH-SIM-018 + Match-live wiring
 * Control Manifest: 2026-05-19
 */

import type { Server } from 'socket.io';
import { logger } from '../../lib/logger.js';

export function matchNamespace(io: Server): void {
  const ns = io.of('/match');

  ns.use(async (socket, next) => {
    // Re-use the parent (default) auth — `socket.handshake.headers.cookie` is
    // already validated by the top-level middleware, but namespaces don't
    // inherit it automatically. For MVP we accept any handshake; production
    // should validate the session here.
    next();
  });

  ns.on('connection', (socket) => {
    logger.debug({ socketId: socket.id, ns: '/match' }, 'match socket connected');

    socket.on('match:join', (matchSessionId: string) => {
      if (typeof matchSessionId !== 'string' || matchSessionId.length === 0) return;
      socket.join(`match:${matchSessionId}`);
      logger.debug(
        { socketId: socket.id, matchSessionId },
        'socket joined match room',
      );
      socket.emit('match:joined', { matchSessionId });
    });

    socket.on('match:leave', (matchSessionId: string) => {
      if (typeof matchSessionId !== 'string') return;
      socket.leave(`match:${matchSessionId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'match socket disconnected');
    });
  });
}
