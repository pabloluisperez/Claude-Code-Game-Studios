/**
 * Manager XP grants on advance.
 *
 * Reads the user's match result + cashflow + sponsor activity for the week
 * and produces deterministic XP grants per ADR-010 (event-driven, no manual
 * allocation). Persists into managerProfiles + skillXpEvents.
 *
 * Story: MVP UX fix — manager XP wiring
 * Control Manifest: 2026-05-20
 */

import {
  db,
  managerProfiles,
  skillXpEvents,
  fixtures,
  sponsors,
  worldSnapshots,
  eq,
  and,
  or,
  desc,
} from '@smt/db';
import { applyXpGrants } from '@smt/shared';
import type { ManagerProfile, ManagerSkillId } from '@smt/shared';

interface Grant {
  skillId: ManagerSkillId;
  amount: number;
  reason: string;
}

export async function grantWeeklyManagerXp(args: {
  playthroughId: string;
  clubId: string;
  week: number;
}): Promise<{ grants: readonly Grant[] }> {
  const { playthroughId, clubId, week } = args;

  const [profile] = await db
    .select()
    .from(managerProfiles)
    .where(eq(managerProfiles.playthroughId, playthroughId))
    .limit(1);
  if (!profile) return { grants: [] };

  const grants: Grant[] = [];

  // 1. Match outcome this week → tactical_insight
  const [matchThisWeek] = await db
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.week, week),
        eq(fixtures.status, 'played'),
        or(eq(fixtures.homeClubId, clubId), eq(fixtures.awayClubId, clubId)),
      ),
    )
    .limit(1);

  if (matchThisWeek && matchThisWeek.homeScore !== null && matchThisWeek.awayScore !== null) {
    const isHome = matchThisWeek.homeClubId === clubId;
    const myScore = isHome ? matchThisWeek.homeScore : matchThisWeek.awayScore;
    const oppScore = isHome ? matchThisWeek.awayScore : matchThisWeek.homeScore;

    if (myScore > oppScore) {
      grants.push({ skillId: 'tactical_insight', amount: 12, reason: 'match_win' });
    } else if (myScore === oppScore) {
      grants.push({ skillId: 'tactical_insight', amount: 5, reason: 'match_draw' });
    } else {
      grants.push({ skillId: 'tactical_insight', amount: 2, reason: 'match_played' });
    }

    if (myScore > oppScore && !isHome) {
      // Bonus for away wins.
      grants.push({ skillId: 'reputation', amount: 4, reason: 'away_win' });
    }
  }

  // 2. Cashflow trend → financial_acumen
  const lastSnaps = await db
    .select({ state: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, playthroughId))
    .orderBy(desc(worldSnapshots.week))
    .limit(4);

  const positiveWeeks = lastSnaps.filter((s) => {
    const cf = (s.state as Record<string, number>)?.weekly_cashflow ?? 0;
    return cf >= 0;
  }).length;

  if (positiveWeeks >= 4) {
    grants.push({ skillId: 'financial_acumen', amount: 10, reason: 'positive_month' });
  } else if (positiveWeeks >= 2) {
    grants.push({ skillId: 'financial_acumen', amount: 3, reason: 'balanced_finances' });
  }

  // 3. Sponsor activity → reputation
  const activeSponsorsList = await db
    .select()
    .from(sponsors)
    .where(and(eq(sponsors.playthroughId, playthroughId), eq(sponsors.status, 'active')));

  // Only grant once per signing — check if any sponsor was started THIS week.
  const justSigned = activeSponsorsList.filter((s) => s.startedWeek === week);
  if (justSigned.length > 0) {
    grants.push({
      skillId: 'reputation',
      amount: 6,
      reason: 'sponsor_signed',
    });
  }

  // 4. Constant micro-grant for being active.
  grants.push({ skillId: 'man_management', amount: 1, reason: 'weekly_routine' });

  if (grants.length === 0) return { grants: [] };

  // Apply + persist.
  const result = applyXpGrants(profile as unknown as ManagerProfile, grants);

  await db
    .update(managerProfiles)
    .set({ skills: result.updatedProfile.skills, updatedAt: new Date() })
    .where(eq(managerProfiles.id, profile.id));

  await db.insert(skillXpEvents).values(
    grants.map((g) => ({
      playthroughId,
      week,
      season: 1, // Single-season MVP — refine on multi-season rollover.
      skillId: g.skillId,
      xpGranted: g.amount,
      reason: g.reason,
    })),
  );

  return { grants };
}
