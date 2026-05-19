<!--
  League — clasificación + jornadas pasadas y próximas con resultados reales.

  Story: HUD-UI-005 / League follow-up
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const myClubId = $derived(data.hasPlaythrough ? data.myClubId : '');

  type FixtureRow = Extract<PageData, { hasPlaythrough: true }>['pastFixtures'][number];

  // Group fixtures by matchday for display.
  function groupByMatchday(rows: readonly FixtureRow[]): Map<number, FixtureRow[]> {
    const map = new Map<number, FixtureRow[]>();
    for (const r of rows) {
      const list = map.get(r.matchday) ?? [];
      list.push(r);
      map.set(r.matchday, list);
    }
    return map;
  }

  const pastByMatchday = $derived(
    data.hasPlaythrough ? groupByMatchday(data.pastFixtures) : new Map(),
  );
  const upcomingByMatchday = $derived(
    data.hasPlaythrough ? groupByMatchday(data.upcomingFixtures) : new Map(),
  );

  let view = $state<'past' | 'upcoming'>('upcoming');

  function zoneClass(idx: number, total: number): string {
    if (idx < 3) return 'bg-success/10';
    if (idx >= total - 3) return 'bg-error/10';
    return '';
  }

  function involvesMyClub(f: FixtureRow): boolean {
    return f.homeClubId === myClubId || f.awayClubId === myClubId;
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Liga</h1>
    <p class="opacity-60">Clasificación y calendario completo</p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para ver la liga.</span>
    </div>
  {:else}
    <!-- Clasificación -->
    <section class="card bg-base-100 shadow">
      <div class="card-body p-0">
        {#if data.standings.length === 0}
          <p class="p-6 opacity-60 text-sm">Aún no hay clasificación. Esperando primera jornada.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th>#</th><th>Club</th>
                  <th class="text-right">PJ</th>
                  <th class="text-right">G</th>
                  <th class="text-right">E</th>
                  <th class="text-right">P</th>
                  <th class="text-right">GF</th>
                  <th class="text-right">GC</th>
                  <th class="text-right">+/-</th>
                  <th class="text-right">PTS</th>
                </tr>
              </thead>
              <tbody>
                {#each data.standings as r, i}
                  {@const gd = r.goalsFor - r.goalsAgainst}
                  <tr class="{zoneClass(i, data.standings.length)} {r.clubId === myClubId ? 'font-bold' : ''}">
                    <td class="font-mono">{i + 1}</td>
                    <td>
                      {r.clubId === myClubId ? '★ ' : ''}{r.clubName}
                      <span class="text-xs opacity-50 ml-1">({r.city})</span>
                    </td>
                    <td class="text-right font-mono">{r.played}</td>
                    <td class="text-right font-mono">{r.wins}</td>
                    <td class="text-right font-mono">{r.draws}</td>
                    <td class="text-right font-mono">{r.losses}</td>
                    <td class="text-right font-mono">{r.goalsFor}</td>
                    <td class="text-right font-mono">{r.goalsAgainst}</td>
                    <td class="text-right font-mono {gd >= 0 ? 'text-success' : 'text-error'}">
                      {gd > 0 ? '+' : ''}{gd}
                    </td>
                    <td class="text-right font-mono font-bold">{r.points}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </section>

    <div class="text-xs opacity-60 flex gap-4">
      <span><span class="inline-block w-3 h-3 bg-success/40 align-middle mr-1"></span>Zona ascenso (top 3)</span>
      <span><span class="inline-block w-3 h-3 bg-error/40 align-middle mr-1"></span>Zona descenso (bottom 3)</span>
    </div>

    <!-- Calendario -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="card-title">Calendario</h2>
          <div role="tablist" class="tabs tabs-boxed w-fit">
            <button
              role="tab"
              class="tab {view === 'upcoming' ? 'tab-active' : ''}"
              onclick={() => (view = 'upcoming')}
            >
              Próximas ({data.upcomingFixtures.length})
            </button>
            <button
              role="tab"
              class="tab {view === 'past' ? 'tab-active' : ''}"
              onclick={() => (view = 'past')}
            >
              Pasadas ({data.pastFixtures.length})
            </button>
          </div>
        </div>

        {#if (view === 'past' ? pastByMatchday : upcomingByMatchday).size === 0}
          <p class="opacity-60 text-sm mt-3">
            {view === 'past' ? 'Todavía no se ha jugado ninguna jornada.' : 'No quedan jornadas por jugar.'}
          </p>
        {:else}
          {@const groups = view === 'past' ? pastByMatchday : upcomingByMatchday}
          <div class="space-y-4 mt-3">
            {#each [...groups.entries()].sort((a, b) => (view === 'past' ? b[0] - a[0] : a[0] - b[0])) as [matchday, group]}
              <div>
                <h3 class="font-semibold text-sm opacity-70 mb-1">
                  Jornada {matchday} · sem {group[0].week}
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
                  {#each group as f}
                    <div
                      class="flex items-center justify-between p-2 rounded
                             {involvesMyClub(f) ? 'bg-primary/10 border border-primary/30' : 'bg-base-200'}"
                    >
                      <div class="flex-1 truncate">
                        <span class="{f.homeClubId === myClubId ? 'font-bold' : ''}">{f.homeName}</span>
                        <span class="opacity-50 mx-2">vs</span>
                        <span class="{f.awayClubId === myClubId ? 'font-bold' : ''}">{f.awayName}</span>
                      </div>
                      <div class="font-mono ml-2">
                        {#if f.status === 'played' && f.homeScore !== null && f.awayScore !== null}
                          <span class="badge badge-neutral">{f.homeScore}-{f.awayScore}</span>
                        {:else}
                          <span class="opacity-30 text-xs">—</span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>
