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
      } | null;
    }
  }
}

export {};
