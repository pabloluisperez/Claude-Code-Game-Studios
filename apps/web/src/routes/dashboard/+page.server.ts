import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import {
  db,
  worldSnapshots,
  staffMessages,
  staff,
  playthroughs,
  eq,
  and,
  desc,
} from '@smt/db';
import {
  CASCADA_FC_GRAPH,
  createSeededRng,
  defaultWorldState,
  generateStaffMessages,
  runTick,
  type DelayedEffectsBuffer,
  type StaffRole,
  type StaffQualityTier,
  type WorldState,
} from '@smt/shared';
import { popEffectsDueAt } from '@smt/shared/sim/delayed-effects';
import { runMatchDay } from '$lib/server/match-day-runner';

export const load: PageServerLoad = async ({ parent }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');

  if (!activePlaythrough) {
    return { hasPlaythrough: false } as const;
  }

  const [latestSnapshot] = await db
    .select({ week: worldSnapshots.week, worldState: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, activePlaythrough.id))
    .orderBy(desc(worldSnapshots.week))
    .limit(1);

  const recentMessages = await db
    .select({
      id: staffMessages.id,
      role: staff.role,
      tier: staff.qualityTier,
      priority: staffMessages.priority,
      content: staffMessages.content,
      week: staffMessages.week,
      isRead: staffMessages.isRead,
    })
    .from(staffMessages)
    .innerJoin(staff, eq(staff.id, staffMessages.staffId))
    .where(eq(staffMessages.playthroughId, activePlaythrough.id))
    .orderBy(desc(staffMessages.createdAt))
    .limit(10);

  return {
    hasPlaythrough: true as const,
    worldState: (latestSnapshot?.worldState ?? null) as Record<string, number> | null,
    week: latestSnapshot?.week ?? activePlaythrough.currentWeek,
    messages: recentMessages,
  };
};

export const actions: Actions = {
  /**
   * Advance one in-game week: run the cascade tick using the latest
   * worldSnapshot as prevState, persist the new snapshot, bump
   * playthroughs.currentWeek.
   *
   * MVP scope: no decisions, no match resolution, no staff message
   * generation, no event scheduling. Those compose later — for now the
   * button proves the simulation loop is wired end-to-end.
   */
  advance: async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const [active] = await db
      .select()
      .from(playthroughs)
      .where(eq(playthroughs.userId, locals.user.id))
      .orderBy(desc(playthroughs.updatedAt))
      .limit(1);

    if (!active) return fail(400, { error: 'No hay carrera activa.' });

    const [latest] = await db
      .select()
      .from(worldSnapshots)
      .where(eq(worldSnapshots.playthroughId, active.id))
      .orderBy(desc(worldSnapshots.week))
      .limit(1);

    const prevState: Readonly<WorldState> =
      (latest?.worldState as WorldState) ?? defaultWorldState();
    const prevBuffer: DelayedEffectsBuffer = (latest?.delayedEffectsBuffer ??
      []) as DelayedEffectsBuffer;

    const nextWeek = (latest?.week ?? -1) + 1;

    const result = runTick(
      {
        rng: createSeededRng(`${active.id}:${nextWeek}`),
        currentWeek: nextWeek,
        hasMatchThisWeek: false,
        prevState,
      },
      CASCADA_FC_GRAPH,
      prevState,
      [],
      prevBuffer,
    );

    // Combine remaining (not-yet-due) effects with newly produced ones to
    // form the next buffer.
    const { remaining } = popEffectsDueAt(prevBuffer, nextWeek);
    const nextBuffer: DelayedEffectsBuffer = [...remaining, ...result.newDelayedEffects];

    await db.transaction(async (tx) => {
      await tx.insert(worldSnapshots).values({
        playthroughId: active.id,
        week: nextWeek,
        worldState: result.nextState,
        delayedEffectsBuffer: nextBuffer,
      });
      await tx
        .update(playthroughs)
        .set({ currentWeek: nextWeek, updatedAt: new Date() })
        .where(eq(playthroughs.id, active.id));
    });

    // Simulate every fixture scheduled for `nextWeek` (user-vs-AI and
    // AI-vs-AI alike) and update standings. Runs in its own transaction.
    const matchDay = await runMatchDay({ playthroughId: active.id, week: nextWeek });

    // Generate staff messages from the world-state diff + threshold crossings.
    // The active staff perceive cascades in their domain (with the tier-1/2/3
    // QUALITY_FACTOR sensitivity). Persists into staff_messages.
    const activeStaff = await db
      .select({
        id: staff.id,
        role: staff.role,
        qualityTier: staff.qualityTier,
      })
      .from(staff)
      .where(and(eq(staff.playthroughId, active.id), eq(staff.status, 'active')));

    if (activeStaff.length > 0) {
      const worldStateDiff: Record<string, { prev: number; next: number }> = {};
      for (const key of Object.keys(result.nextState)) {
        const prev = prevState[key as keyof WorldState] ?? 0;
        const next = result.nextState[key as keyof WorldState] ?? 0;
        if (prev !== next) worldStateDiff[key] = { prev, next };
      }

      const generated = generateStaffMessages({
        staff: activeStaff.map((s) => ({
          id: s.id,
          role: s.role as StaffRole,
          qualityTier: s.qualityTier as StaffQualityTier,
        })),
        worldStateDiff,
        thresholdCrossings: result.thresholdCrossings,
      });

      if (generated.length > 0) {
        await db.insert(staffMessages).values(
          generated.map((m) => ({
            playthroughId: active.id,
            staffId: m.staffId,
            week: nextWeek,
            season: 1,
            priority: m.priority,
            templateKey: m.templateKey,
            content: m.content,
            isRead: false,
          })),
        );
      }
    }

    return { ok: true, matchesPlayed: matchDay.played };
  },
};
