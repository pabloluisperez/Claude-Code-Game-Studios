/**
 * Post-match effects that depend on the USER's result: the press crónica + derby
 * press (narrative engine) and the fan_momentum reaction. Extracted from the
 * advance orchestrator Phase 6c (Phase 2B, ADR-033) so it can be invoked from
 * BOTH the weekly advance AND the on-demand /match path once the user's fixture
 * stops being simulated at advance time. Context-independent: re-queries
 * everything it needs from (playthroughId, clubId, week, season).
 *
 * Best-effort + idempotent: it no-ops if the user's fixture for `week` isn't
 * played yet, and de-dupes the press/derby messages so a second call (advance
 * skipped the fixture, /match then played it) can't double-emit.
 *
 * Pablo 2026-05-30.
 */

import {
  db,
  fixtures,
  clubs,
  staff,
  staffMessages,
  worldSnapshots,
  seasons,
  leagues,
  eq,
  and,
  or,
  desc,
} from '@smt/db';

export async function emitUserMatchResultEffects(args: {
  playthroughId: string;
  clubId: string;
  week: number;
}): Promise<void> {
  const { playthroughId, clubId, week } = args;

  // Active season number (for staffMessages.season). Loosely used downstream.
  const [seasonRow] = await db
    .select({ n: seasons.seasonNumber })
    .from(seasons)
    .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
    .where(and(eq(leagues.playthroughId, playthroughId), eq(seasons.status, 'active')))
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);
  const season = seasonRow?.n ?? 1;

  const [thisFixture] = await db
    .select({
      id: fixtures.id,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      matchday: fixtures.matchday,
    })
    .from(fixtures)
    .where(
      and(
        eq(fixtures.week, week),
        or(eq(fixtures.homeClubId, clubId), eq(fixtures.awayClubId, clubId)),
        eq(fixtures.status, 'played'),
      ),
    )
    .limit(1);

  if (!thisFixture || thisFixture.homeScore === null || thisFixture.awayScore === null) return;

  const isHome = thisFixture.homeClubId === clubId;
  const myScore = isHome ? thisFixture.homeScore : thisFixture.awayScore;
  const theirScore = isHome ? thisFixture.awayScore : thisFixture.homeScore;
  const goalDiff = myScore - theirScore;
  const isNotable = Math.abs(goalDiff) >= 3 || (myScore === 0 && theirScore === 0);

  const [club] = await db
    .select({ name: clubs.name, city: clubs.city })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  const opponentId = isHome ? thisFixture.awayClubId : thisFixture.homeClubId;
  const [opponentClub] = await db
    .select({ name: clubs.name, city: clubs.city })
    .from(clubs)
    .where(eq(clubs.id, opponentId))
    .limit(1);

  const isDerby = Boolean(club?.city) && club?.city === opponentClub?.city;

  // ── Afición reacts to the result (fan_momentum), persisted on the latest
  // snapshot so it drives next week's attendance/gate + the dashboard.
  try {
    const [snap] = await db
      .select({ week: worldSnapshots.week, worldState: worldSnapshots.worldState })
      .from(worldSnapshots)
      .where(eq(worldSnapshots.playthroughId, playthroughId))
      .orderBy(desc(worldSnapshots.week))
      .limit(1);
    if (snap) {
      const ws = { ...(snap.worldState as Record<string, number>) };
      const prevFan = ws['fan_momentum'] ?? 60;
      let fanDelta =
        goalDiff > 0
          ? Math.min(10, 3 + goalDiff * 1.5)
          : goalDiff === 0
            ? -1
            : -Math.min(10, 3 + Math.abs(goalDiff) * 1.5);
      if (isDerby) fanDelta *= 1.5;
      const newFan = Math.max(0, Math.min(100, Math.round(prevFan + fanDelta)));
      if (newFan !== prevFan) {
        ws['fan_momentum'] = newFan;
        await db
          .update(worldSnapshots)
          .set({ worldState: ws })
          .where(and(eq(worldSnapshots.playthroughId, playthroughId), eq(worldSnapshots.week, snap.week)));
      }
    }
  } catch {
    // best-effort — never block.
  }

  // ── Press crónica + derby press (narrative engine). Derby is always news.
  const shouldEmitPress = isNotable || isDerby;
  if (!shouldEmitPress) return;

  const [headCoach] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.playthroughId, playthroughId), eq(staff.role, 'head_coach'), eq(staff.status, 'active')))
    .limit(1);
  if (!headCoach) return;

  // De-dupe: don't re-emit if a press article for this week already exists
  // (advance + /match could both call this).
  const existing = await db
    .select({ id: staffMessages.id })
    .from(staffMessages)
    .where(
      and(
        eq(staffMessages.playthroughId, playthroughId),
        eq(staffMessages.week, week),
        eq(staffMessages.templateKey, 'press:match_outcome'),
      ),
    )
    .limit(1);
  if (existing[0]) return;

  const { renderNarrative, matchOutcomeTemplates, pressDerbyTemplates } = await import('@smt/shared');
  const seed = week * 1000 + (thisFixture.matchday ?? 0);
  const sharedVars = {
    homeScore: myScore,
    awayScore: theirScore,
    goalDiff,
    clubName: club?.name ?? 'el club',
    opponent: opponentClub?.name ?? 'el rival',
  };
  const pressBody = renderNarrative(matchOutcomeTemplates, { seed, variables: sharedVars });
  const derbyBody = isDerby
    ? renderNarrative(pressDerbyTemplates, { seed: seed + 31, variables: sharedVars })
    : '';

  if (pressBody) {
    await db.insert(staffMessages).values({
      playthroughId,
      staffId: headCoach.id,
      week,
      season,
      priority: 'ROUTINE',
      templateKey: 'press:match_outcome',
      content: `📰 Crónica de prensa — ${pressBody}`,
      isRead: false,
    });
  }
  if (derbyBody) {
    await db.insert(staffMessages).values({
      playthroughId,
      staffId: headCoach.id,
      week,
      season,
      priority: 'ROUTINE',
      templateKey: 'press:derby',
      content: `🔥 Derbi — ${derbyBody}`,
      isRead: false,
    });
  }
}
