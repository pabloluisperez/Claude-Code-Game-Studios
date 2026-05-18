import { io } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@smt/shared/types/socket';

let socket: ReturnType<
  typeof io<ServerToClientEvents, ClientToServerEvents>
> | null = null;

export function getSocket() {
  if (!socket) {
    socket = io<ServerToClientEvents, ClientToServerEvents>({
      withCredentials: true,
      autoConnect: false
    });
  }
  return socket;
}

export function connectSocket() {
  getSocket().connect();
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
