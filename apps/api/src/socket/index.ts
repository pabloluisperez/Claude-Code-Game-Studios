import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { Http2Server } from 'node:http2';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData
} from '@smt/shared/types/socket';
import { validateSessionToken } from '../auth/session.js';
import { logger } from '../lib/logger.js';
import { defaultNamespace } from './namespaces/default.js';
import { matchNamespace } from './namespaces/match.js';

/**
 * Accepts the union returned by @hono/node-server's `serve()` (Server | Http2Server).
 * Socket.IO 4.x natively supports both. TD-001 (resolved 2026-05-21) — widening
 * here removes the svelte-check error from apps/api/src/server.ts:47 without
 * a runtime cast at the call site.
 */
export function createSocketServer(httpServer: HttpServer | Http2Server) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: { origin: 'http://localhost:5173', credentials: true }
    }
  );

  io.use(async (socket, next) => {
    const cookie = socket.handshake.headers.cookie ?? '';
    const match = /session=([^;]+)/.exec(cookie);
    const token = match?.[1];
    if (!token) return next(new Error('Unauthorized'));

    const ctx = await validateSessionToken(token);
    if (!ctx) return next(new Error('Session expired'));

    socket.data.userId = ctx.user.id;
    logger.debug({ userId: ctx.user.id }, 'socket authenticated');
    next();
  });

  defaultNamespace(io);
  matchNamespace(io);
  return io;
}
