# Real-time Module — Socket.IO

Scope: server-authoritative real-time state across `apps/api` ↔ `apps/web`.
WebSocket transport, room model, sync strategy.

> **Last verified:** 2026-05-15

## Why Socket.IO over Raw WebSockets

| Feature | Raw `ws` | Socket.IO |
|---------|----------|-----------|
| Reconnect with backoff | Manual | Built-in |
| Rooms (broadcast groups) | Manual | Built-in |
| Namespaces (logical channels) | Manual | Built-in |
| Auth middleware | Manual | Built-in |
| Binary + JSON serialization | Manual | Built-in |
| Acks (request/response over WS) | Manual | Built-in |
| Cluster adapter (Redis) | DIY | `@socket.io/redis-adapter` |

The cost is ~5 KB extra in the client bundle. Worth it for any game with
more than one shared room.

## When To Use HTTP vs Socket.IO

| Concern | Use |
|---------|-----|
| Commands (player action, form submit) | HTTP POST to Hono |
| Queries (load page, refresh) | HTTP GET to Hono (or RPC) |
| Notifications (someone joined club, market update) | Socket.IO event |
| Live state diffs (match ticker, chat, presence) | Socket.IO event |
| Initial state on page load | HTTP — then subscribe for diffs |

**Never** send commands over Socket.IO when an HTTP endpoint would do.
Reasons: easier observability, easier idempotency, easier rate-limiting.

## Room Model

Rooms are strings. Convention: `<entity>:<id>` or `<scope>:<entity>:<id>`.

| Room | Members | Emit when |
|------|---------|-----------|
| `user:<userId>` | One user's open tabs/devices | Personal notifications (transfer offer accepted, etc.) |
| `club:<clubId>` | All managers/staff of a club | Squad change, finance update |
| `league:<leagueId>` | All managers in a league | Standings update, fixture published |
| `match:<matchId>` | Spectators + the two clubs' managers | Minute-by-minute events |
| `chat:<channelId>` | Members of a chat channel | Messages |

Sockets join rooms **explicitly** via client request. Never auto-join based
on identity — the client tells the server what it's viewing.

```ts
// Server
io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`);  // always — own private channel

  socket.on('club:subscribe', (clubId: string) => {
    if (!userOwnsClub(socket.data.userId, clubId)) return;
    socket.join(`club:${clubId}`);
  });

  socket.on('club:unsubscribe', (clubId: string) => {
    socket.leave(`club:${clubId}`);
  });
});
```

## Authentication on Socket Handshake

Reuse the HTTP session cookie. Configure CORS + `withCredentials` on the
client so the cookie ships with the upgrade request.

```ts
// Server
io.use(async (socket, next) => {
  const token = parseCookie(socket.handshake.headers.cookie || '', 'session');
  if (!token) return next(new Error('unauth'));
  const ctx = await validateSessionToken(token);
  if (!ctx) return next(new Error('unauth'));
  socket.data.userId = ctx.user.id;
  next();
});
```

```ts
// Client
import { io } from 'socket.io-client';
export const socket = io({ withCredentials: true, autoConnect: false });
```

Connect lazily, after the user logs in. Disconnect on logout.

## Typed Events

Define event shapes in `packages/shared/types/socket.ts`:

```ts
export interface ServerToClient {
  'match:event':   (e: MatchEvent) => void;
  'club:updated':  (diff: ClubDiff) => void;
  'notification':  (n: Notification) => void;
}

export interface ClientToServer {
  'club:subscribe':   (clubId: string) => void;
  'club:unsubscribe': (clubId: string) => void;
  'chat:send':        (msg: { channelId: string; body: string }, ack: (ok: boolean) => void) => void;
}
```

Apply on both sides:

```ts
// Server
import { Server } from 'socket.io';
const io = new Server<ClientToServer, ServerToClient>(httpServer, { ... });

// Client
import { io as ioClient, type Socket } from 'socket.io-client';
export const socket: Socket<ServerToClient, ClientToServer> = ioClient({ ... });
```

## State Sync Strategies

| Strategy | When | Cost |
|----------|------|------|
| **Full snapshot on subscribe** | Small entities (club summary) | Simple, but bandwidth scales with size |
| **Snapshot + diff stream** | Large entities (squad, finances) | Best balance for medium state |
| **Event log replay** | Match simulation | Client recomputes from events; deterministic |
| **CRDT** | Collaborative editing | Overkill for most game state |

Default: **snapshot on subscribe, diffs on change.**

```ts
// On subscribe, server emits initial snapshot
socket.on('club:subscribe', async (clubId) => {
  if (!authorized) return;
  socket.join(`club:${clubId}`);
  const snapshot = await clubsService.getSummary(clubId);
  socket.emit('club:snapshot', snapshot);
});

// On change (from service layer), emit a diff
io.to(`club:${clubId}`).emit('club:updated', { type: 'transfer-in', player });
```

Clients merge diffs into a local cache. Periodic re-sync (every 60s or on
focus) re-requests a snapshot to recover from missed events.

## Reconnection

Socket.IO reconnects automatically. On reconnect, the client should:
1. Re-subscribe to rooms it cares about (the server forgot)
2. Request fresh snapshots — assume diffs were missed

```ts
socket.on('connect', () => {
  for (const clubId of subscribedClubIds) socket.emit('club:subscribe', clubId);
});
```

## Match Ticker Pattern

Server simulates a match in BullMQ worker. As events occur (one per minute,
typically), publish to the `match:<id>` room:

```ts
// In match worker
for (const event of simulateMatch(...)) {
  await persistEvent(matchId, event);
  io.to(`match:${matchId}`).emit('match:event', event);
  await sleep(realTimeDelayMs);  // optional pacing
}
```

Clients animate the event as it arrives. Late joiners get the event log
via HTTP (`GET /api/matches/:id/events`) then subscribe.

## Scaling — Redis Adapter

Single Node.js process is fine until ~5–10k concurrent sockets. Past that,
add `@socket.io/redis-adapter` to broadcast across processes:

```ts
import { createAdapter } from '@socket.io/redis-adapter';
io.adapter(createAdapter(pubClient, subClient));
```

Same Redis instance as BullMQ is fine for small deployments. Separate
clusters once the game has real load.

## Anti-Abuse

- Rate-limit `chat:send` and similar event types in middleware
- Validate every payload with Zod **on the server**
- Never trust client-sent room names — derive from authenticated identity or
  validate ownership before joining
- Drop sockets that exceed a misbehavior threshold (`socket.disconnect(true)`)

## Testing

- Server-side: spin up an in-process `Server` and connect with
  `socket.io-client` to `http://localhost:<random>`
- Assert event emission with `socket.once(eventName, callback)`
- For room logic, connect two clients and verify isolation

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Broadcasting to all (`io.emit(...)`) | Always scope to a room |
| Sending state on every change of any field | Coalesce diffs, send once per logical action |
| Auto-joining rooms based on identity | Require explicit `subscribe` from client |
| Trusting `socket.handshake.query` for auth | Use cookie + validated session |
| Polluting `socket.data` with mutable game state | Keep `socket.data` to identity only; state lives in DB/Redis |
