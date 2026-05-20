import type { LayoutServerLoad } from './$types';
import {
  db,
  playthroughs,
  clubs,
  calendarEvents,
  staffMessages,
  worldSnapshots,
  eq,
  and,
  desc,
  sql,
} from '@smt/db';
import { weekToDate } from '@smt/shared';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    return { user: null, activePlaythrough: null, badges: null };
  }

  const [active] = await db
    .select({
      id: playthroughs.id,
      clubId: playthroughs.clubId,
      currentWeek: playthroughs.currentWeek,
      clubName: clubs.name,
    })
    .from(playthroughs)
    .leftJoin(clubs, eq(clubs.id, playthroughs.clubId))
    .where(eq(playthroughs.userId, locals.user.id))
    .orderBy(desc(playthroughs.updatedAt))
    .limit(1);

  if (!active) {
    return { user: locals.user, activePlaythrough: null, badges: null };
  }

  const [pendingStops] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.playthroughId, active.id),
        eq(calendarEvents.status, 'pending'),
        eq(calendarEvents.priority, 'STOP'),
      ),
    );

  const [unreadUrgent] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(staffMessages)
    .where(
      and(
        eq(staffMessages.playthroughId, active.id),
        eq(staffMessages.priority, 'URGENT'),
        eq(staffMessages.isRead, false),
      ),
    );

  const [unreadTotal] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(staffMessages)
    .where(
      and(
        eq(staffMessages.playthroughId, active.id),
        eq(staffMessages.isRead, false),
      ),
    );

  const [latestSnapshot] = await db
    .select({ worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, active.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const worldState = (latestSnapshot?.worldState ?? null) as
    | Record<string, number>
    | null;
  const balanceEurK = worldState?.['financial_balance'] ?? null;

  return {
    user: locals.user,
    activePlaythrough: {
      ...active,
      date: weekToDate(active.currentWeek),
      balanceEurK,
    },
    badges: {
      pendingStops: Number(pendingStops?.count ?? 0),
      unreadUrgent: Number(unreadUrgent?.count ?? 0),
      inboxUnread: Number(unreadTotal?.count ?? 0),
    },
  };
};
