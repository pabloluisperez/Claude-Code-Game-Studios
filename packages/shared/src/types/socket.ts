import type { Club } from './clubs.js';

export interface ServerToClientEvents {
  'club:updated': (data: Partial<Club> & { id: string }) => void;
  'match:started': (data: { matchId: string; homeId: string; awayId: string }) => void;
  'match:ended': (data: { matchId: string; homeGoals: number; awayGoals: number }) => void;
  'narrative:event': (data: { text: string; type: 'news' | 'rumor' | 'offer' }) => void;
}

export interface ClientToServerEvents {
  'club:subscribe': (clubId: string) => void;
  'club:unsubscribe': (clubId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
}
