import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData
} from '@smt/shared/types/socket';
import { logger } from '../../lib/logger.js';

export function defaultNamespace(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
): void {
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id, userId: socket.data.userId }, 'socket connected');

    socket.on('club:subscribe', (clubId) => {
      socket.join(`club:${clubId}`);
      logger.debug({ userId: socket.data.userId, clubId }, 'subscribed to club room');
    });

    socket.on('club:unsubscribe', (clubId) => {
      socket.leave(`club:${clubId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });
}
