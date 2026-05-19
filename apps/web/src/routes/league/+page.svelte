<!--
  League table + fixture list — wired to /league/+page.server.ts.

  Story: HUD-UI-005
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const myClubId = $derived(data.hasPlaythrough ? data.myClubId : '');

  function zoneClass(idx: number, total: number): string {
    if (idx < 3) return 'bg-success/10';
    if (idx >= total - 3) return 'bg-error/10';
    return '';
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Liga</h1>
    <p class="opacity-60">Clasificación y calendario</p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para ver la liga.</span>
    </div>
  {:else}
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
                  <th class="text-right">PJ</th><th class="text-right">G</th><th class="text-right">E</th><th class="text-right">P</th>
                  <th class="text-right">GF</th><th class="text-right">GC</th>
                  <th class="text-right">PTS</th>
                </tr>
              </thead>
              <tbody>
                {#each data.standings as r, i}
                  <tr class="{zoneClass(i, data.standings.length)} {r.clubId === myClubId ? 'font-bold' : ''}">
                    <td class="font-mono">{i + 1}</td>
                    <td>{r.clubId === myClubId ? '★ Mi club' : r.clubId.slice(0, 8)}</td>
                    <td class="text-right font-mono">{r.played}</td>
                    <td class="text-right font-mono">{r.wins}</td>
                    <td class="text-right font-mono">{r.draws}</td>
                    <td class="text-right font-mono">{r.losses}</td>
                    <td class="text-right font-mono">{r.goalsFor}</td>
                    <td class="text-right font-mono">{r.goalsAgainst}</td>
                    <td class="text-right font-mono font-bold">{r.points}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </section>

    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Mis próximos partidos</h2>
        {#if data.fixtures.length === 0}
          <p class="opacity-60 text-sm">No hay partidos programados.</p>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {#each data.fixtures as f}
              {@const isHome = f.homeClubId === myClubId}
              <div class="flex items-center justify-between p-2 rounded bg-base-200">
                <div>
                  <div class="text-xs opacity-60">Semana {f.week} · {isHome ? 'Casa' : 'Fuera'}</div>
                  <div class="font-semibold">{(isHome ? f.awayClubId : f.homeClubId).slice(0, 8)}</div>
                </div>
                <div class="font-mono">
                  {#if f.status === 'played' && f.homeScore !== null}
                    {f.homeScore}-{f.awayScore}
                  {:else}
                    —
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>
