/**
 * Career milestone detection — runs at the tail end of /dashboard ?/advance.
 *
 * Each milestone has a `kind` (unique per playthrough); first time a condition
 * is met we insert it. `onConflictDoNothing` covers concurrent advance races.
 *
 * Pure-ish: takes a few aggregates and produces the inserts.
 *
 * Story: Alma Pass — career milestones
 * Control Manifest: 2026-05-20
 */

import {
  db,
  careerMilestones,
  fixtures,
  sponsors,
  worldSnapshots,
  eq,
  and,
  or,
  desc,
  sql,
} from '@smt/db';

interface MilestoneSpec {
  kind: string;
  label: string;
  description: string;
  icon: string;
}

const SPECS: Readonly<Record<string, MilestoneSpec>> = {
  first_match: {
    kind: 'first_match',
    label: 'Debut',
    description: 'Tu primer partido oficial como mánager.',
    icon: '🏁',
  },
  first_win: {
    kind: 'first_win',
    label: 'Primera victoria',
    description: 'El primer triunfo de tu carrera. Sabe a gloria.',
    icon: '🏆',
  },
  first_away_win: {
    kind: 'first_away_win',
    label: 'Conquistador',
    description: 'Primera victoria como visitante.',
    icon: '✈️',
  },
  first_clean_sheet: {
    kind: 'first_clean_sheet',
    label: 'Portería a cero',
    description: 'Primer partido sin encajar goles.',
    icon: '🥅',
  },
  first_sponsor: {
    kind: 'first_sponsor',
    label: 'Primer sponsor',
    description: 'Cerraste tu primer patrocinio comercial.',
    icon: '🤝',
  },
  positive_cashflow_month: {
    kind: 'positive_cashflow_month',
    label: 'Mes en verde',
    description: '4 semanas seguidas con balance positivo.',
    icon: '💚',
  },
  ten_matches: {
    kind: 'ten_matches',
    label: '10 partidos',
    description: 'Cumpliste 10 partidos al frente del club.',
    icon: '🔟',
  },
};

export async function detectAndPersistMilestones(args: {
  playthroughId: string;
  clubId: string;
}): Promise<readonly string[]> {
  const { playthroughId, clubId } = args;

  // Aggregates we need to evaluate every milestone.
  const playedFixtures = await db
    .select({
      id: fixtures.id,
      week: fixtures.week,
      homeClubId: fixtures.homeClubId,
      awayClubId: fixtures.awayClubId,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
    })
    .from(fixtures)
    .where(
      and(
        eq(fixtures.status, 'played'),
        or(eq(fixtures.homeClubId, clubId), eq(fixtures.awayClubId, clubId)),
      ),
    )
    .orderBy(fixtures.week);

  const wins = playedFixtures.filter((f) => {
    if (f.homeScore === null || f.awayScore === null) return false;
    const isHome = f.homeClubId === clubId;
    return isHome ? f.homeScore > f.awayScore : f.awayScore > f.homeScore;
  });

  const awayWins = wins.filter((f) => f.awayClubId === clubId);

  const cleanSheets = playedFixtures.filter((f) => {
    if (f.homeScore === null || f.awayScore === null) return false;
    const isHome = f.homeClubId === clubId;
    return isHome ? f.awayScore === 0 : f.homeScore === 0;
  });

  const [sponsorAgg] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(sponsors)
    .where(eq(sponsors.playthroughId, playthroughId));

  // 4 most recent worldSnapshots — for "month in green".
  const lastSnaps = await db
    .select({ cashflow: worldSnapshots.worldState })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.playthroughId, playthroughId))
    .orderBy(desc(worldSnapshots.week))
    .limit(4);

  const last4Positive = lastSnaps.length === 4 && lastSnaps.every((s) => {
    const cf = (s.cashflow as Record<string, number>)?.weekly_cashflow ?? 0;
    return cf >= 0;
  });

  // Compose the set of milestones currently met.
  const met: Array<{ spec: MilestoneSpec; week: number }> = [];
  if (playedFixtures.length >= 1) met.push({ spec: SPECS.first_match!, week: playedFixtures[0]!.week });
  if (wins.length >= 1) met.push({ spec: SPECS.first_win!, week: wins[0]!.week });
  if (awayWins.length >= 1) met.push({ spec: SPECS.first_away_win!, week: awayWins[0]!.week });
  if (cleanSheets.length >= 1) met.push({ spec: SPECS.first_clean_sheet!, week: cleanSheets[0]!.week });
  if (Number(sponsorAgg?.count ?? 0) >= 1) met.push({ spec: SPECS.first_sponsor!, week: 0 });
  if (last4Positive) met.push({ spec: SPECS.positive_cashflow_month!, week: playedFixtures.length });
  if (playedFixtures.length >= 10) {
    met.push({ spec: SPECS.ten_matches!, week: playedFixtures[9]!.week });
  }

  if (met.length === 0) return [];

  await db
    .insert(careerMilestones)
    .values(
      met.map((m) => ({
        playthroughId,
        kind: m.spec.kind,
        label: m.spec.label,
        description: m.spec.description,
        icon: m.spec.icon,
        week: m.week,
      })),
    )
    .onConflictDoNothing();

  return met.map((m) => m.spec.kind);
}
