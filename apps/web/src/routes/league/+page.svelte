<!--
  League table + fixture list (next 5 + last 5).

  Story: HUD-UI-005
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  let tier = $state<1 | 2>(2);
  const myClubId = 'c-pueblo';

  interface StandingsRow {
    clubId: string;
    clubName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
  }

  const d2: StandingsRow[] = [
    { clubId: 'c-1', clubName: 'CD Calderón',   played: 8, won: 5, drawn: 2, lost: 1, goalsFor: 14, goalsAgainst: 6,  points: 17 },
    { clubId: 'c-2', clubName: 'Real Pinares',  played: 8, won: 4, drawn: 3, lost: 1, goalsFor: 12, goalsAgainst: 7,  points: 15 },
    { clubId: 'c-3', clubName: 'CF Antiguo',    played: 8, won: 4, drawn: 2, lost: 2, goalsFor: 11, goalsAgainst: 9,  points: 14 },
    { clubId: 'c-pueblo', clubName: 'Real Pueblo CF', played: 8, won: 2, drawn: 3, lost: 3, goalsFor: 8, goalsAgainst: 11, points: 9 },
    { clubId: 'c-4', clubName: 'Club Bara',     played: 8, won: 2, drawn: 1, lost: 5, goalsFor: 6,  goalsAgainst: 14, points: 7 },
  ];
  const d1: StandingsRow[] = [
    { clubId: 'd1-1', clubName: 'Primera Top',  played: 8, won: 6, drawn: 1, lost: 1, goalsFor: 19, goalsAgainst: 5,  points: 19 },
    { clubId: 'd1-2', clubName: 'Otro Primera', played: 8, won: 5, drawn: 2, lost: 1, goalsFor: 15, goalsAgainst: 7,  points: 17 },
  ];

  const standings = $derived(tier === 1 ? d1 : d2);

  function gd(r: StandingsRow) {
    return r.goalsFor - r.goalsAgainst;
  }

  function zoneClass(idx: number, total: number): string {
    if (idx < 3) return 'bg-success/10';   // Promotion zone
    if (idx >= total - 3) return 'bg-error/10'; // Relegation zone
    return '';
  }

  interface Fixture {
    week: number;
    isHome: boolean;
    opponent: string;
    played: boolean;
    score?: { home: number; away: number };
    isDerby?: boolean;
  }
  const fixtures: Fixture[] = [
    { week: 3, isHome: false, opponent: 'Real Pinares', played: true, score: { home: 1, away: 1 } },
    { week: 4, isHome: true,  opponent: 'CF Antiguo',   played: true, score: { home: 2, away: 0 } },
    { week: 5, isHome: false, opponent: 'CD Calderón',  played: true, score: { home: 1, away: 3 } },
    { week: 6, isHome: true,  opponent: 'Club Bara',    played: true, score: { home: 0, away: 0 }, isDerby: true },
    { week: 7, isHome: false, opponent: 'CF Antiguo',   played: true, score: { home: 2, away: 2 } },
    { week: 8, isHome: true,  opponent: 'CD Calderón',  played: false },
    { week: 9, isHome: false, opponent: 'Real Pinares', played: false },
    { week: 10, isHome: true, opponent: 'Club Bara',    played: false, isDerby: true },
  ];
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Liga</h1>
    <p class="opacity-60">Clasificación y calendario</p>
  </header>

  <!-- Division tabs -->
  <div role="tablist" class="tabs tabs-boxed w-fit">
    <button role="tab" class="tab {tier === 2 ? 'tab-active' : ''}" onclick={() => (tier = 2)}>D2</button>
    <button role="tab" class="tab {tier === 1 ? 'tab-active' : ''}" onclick={() => (tier = 1)}>D1</button>
  </div>

  <!-- Standings -->
  <section class="card bg-base-100 shadow">
    <div class="card-body p-0">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>#</th><th>Club</th>
              <th class="text-right">PJ</th><th class="text-right">G</th><th class="text-right">E</th><th class="text-right">P</th>
              <th class="text-right">GF</th><th class="text-right">GC</th><th class="text-right">+/-</th>
              <th class="text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {#each standings as r, i}
              <tr class="{zoneClass(i, standings.length)} {r.clubId === myClubId ? 'font-bold' : ''}">
                <td class="font-mono">{i + 1}</td>
                <td>{r.clubName} {r.clubId === myClubId ? '★' : ''}</td>
                <td class="text-right font-mono">{r.played}</td>
                <td class="text-right font-mono">{r.won}</td>
                <td class="text-right font-mono">{r.drawn}</td>
                <td class="text-right font-mono">{r.lost}</td>
                <td class="text-right font-mono">{r.goalsFor}</td>
                <td class="text-right font-mono">{r.goalsAgainst}</td>
                <td class="text-right font-mono {gd(r) >= 0 ? 'text-success' : 'text-error'}">{gd(r) > 0 ? '+' : ''}{gd(r)}</td>
                <td class="text-right font-mono font-bold">{r.points}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <div class="text-xs opacity-60 flex gap-4">
    <span><span class="inline-block w-3 h-3 bg-success/40 align-middle mr-1"></span>Zona ascenso (top 3)</span>
    <span><span class="inline-block w-3 h-3 bg-error/40 align-middle mr-1"></span>Zona descenso (bottom 3)</span>
  </div>

  <!-- Fixtures -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Calendario reciente y próximo</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        {#each fixtures as f}
          <div
            class="flex items-center justify-between p-2 rounded
                   {f.played ? 'bg-base-200' : 'bg-base-100 border border-base-300'}
                   {f.isDerby ? 'border-l-4 border-l-warning' : ''}"
          >
            <div>
              <div class="text-xs opacity-60">Semana {f.week} · {f.isHome ? 'Casa' : 'Fuera'}</div>
              <div class="font-semibold">{f.opponent}</div>
              {#if f.isDerby}
                <div class="text-xs text-warning">⚔ Derbi</div>
              {/if}
            </div>
            <div class="font-mono">
              {#if f.played && f.score}
                {f.isHome ? `${f.score.home}-${f.score.away}` : `${f.score.away}-${f.score.home}`}
              {:else}
                —
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>
</div>
