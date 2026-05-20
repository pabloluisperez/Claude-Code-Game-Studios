import type { User, Session } from '@smt/db';

declare global {
  namespace App {
    interface Locals {
      user: User | null;
      session: Session | null;
    }
    interface PageData {
      user?: User | null;
      activePlaythrough?: {
        id: string;
        clubId: string;
        currentWeek: number;
        clubName: string | null;
        date?: {
          iso: string;
          display: string;
          year: number;
          month: number;
          day: number;
        };
      } | null;
      badges?: {
        pendingStops: number;
        unreadUrgent: number;
        inboxUnread: number;
      } | null;
    }
  }
}

export {};
