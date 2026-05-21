<!--
  League — clasificación + jornadas pasadas y próximas con resultados reales.

  Story: HUD-UI-005 / League follow-up
  2026-05-21 polish from playtest #1:
    P3 2-column layout (standings left, próximas right)
    P4 hover cross-highlighting (team in fixture → highlight in standings)
    P5 stronger my-team highlight (border + bg, not just ★)
    P6 'Todas las jornadas' tab with proper matchday numbering
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  let { data }: { data: PageData } = $props();

  // Fixtures the user has already watched this session.
  let seenFixtures = $state<Set<string>>(new Set());
  onMount(() => {
    if (typeof sessionStorage === 'undefined') return;
    const out = new Set<string>();
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith('tsm-seen-fixture:') && sessionStorage.getItem(k) === '1') {
        out.add(k.slice('tsm-seen-fixture:'.length));
      }
    }
    seenFixtures = out;
  });

  function shouldHideScore(fx: { week: number; id: string }): boolean {
    if (!data.hasPlaythrough) return false;
    if (fx.week !== data.currentWeek) return false;
    return !seenFixtures.has(fx.id);
  }

  const myClubId = $derived(data.hasPlaythrough ? data.myClubId : '');

  // P4 hover cross-highlighting: tracks the clubId currently being hovered
  // (in either standings or fixture cards). Cross-component highlighting
  // is applied to ALL rows/fixtures involving that clubId. null = no hover
  // → fall back to highlighting only my own club.
  let hoveredClubId = $state<string | null>(null);

  type FixtureRow = Extract<PageData, { hasPlaythrough: true }>['pastFixtures'][number];

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

  // Próximas 3 jornadas para la columna derecha (compact view).
  const next3MatchdayKeys = $derived(
    [...upcomingByMatchday.keys()].sort((a, b) => a - b).slice(0, 3),
  );

  // P6 view tabs: Próximas 3 / Todas / Pasadas. 'Todas' lista TODAS las jornadas
  // de la temporada (pasadas y futuras) con numeración correcta de jornada,
  // no de partidos.
  let view = $state<'upcoming3' | 'all' | 'past'>('upcoming3');

  function zoneClass(idx: number, total: number): string {
    if (idx < 3) return 'bg-success/5';
    if (idx >= total - 3) return 'bg-error/5';
    return '';
  }

  function involvesClub(f: FixtureRow, clubId: string): boolean {
    return f.homeClubId === clubId || f.awayClubId === clubId;
  }

  // P5 + P4 highlight: my team always gets a strong left-border + light bg;
  // hover (any club) gets the medium primary highlight applied across both
  // standings rows AND fixture cards.
  function rowHighlightClass(clubId: string): string {
    if (hoveredClubId && hoveredClubId === clubId) {
      return 'bg-info/15 border-l-4 border-l-info';
    }
    if (clubId === myClubId) {
      return 'bg-primary/10 border-l-4 border-l-primary font-semibold';
    }
    return '';
  }

  function fixtureHighlightClass(f: FixtureRow): string {
    const involvesHover = hoveredClubId && involvesClub(f, hoveredClubId);
    const involvesMe = involvesClub(f, myClubId);
    if (involvesHover) return 'bg-info/15 border border-info/40';
    if (involvesMe) return 'bg-primary/10 border border-primary/30';
    return 'bg-base-200 border border-transparent';
  }

  function clearHover() {
    hoveredClubId = null;
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
    <!-- P3: 2-column layout — clasificación a la izquierda (más compacta),
         próximas 3 jornadas a la derecha (compacto). En móvil colapsa a 1 col. -->
    <div class="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
      <!-- Clasificación -->
      <section class="card bg-base-100 shadow">
        <div class="card-body p-0">
          {#if data.standings.length === 0}
            <p class="p-6 opacity-60 text-sm">Aún no hay clasificación. Esperando primera jornada.</p>
          {:else}
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Club</th>
                    <th class="text-right">PJ</th>
                    <th class="text-right">G</th>
                    <th class="text-right">E</th>
                    <th class="text-right">P</th>
                    <th class="text-right">+/-</th>
                    <th class="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.standings as r, i}
                    {@const gd = r.goalsFor - r.goalsAgainst}
                    <tr
                      class="{zoneClass(i, data.standings.length)} {rowHighlightClass(r.clubId)}"
                      onmouseenter={() => (hoveredClubId = r.clubId)}
                      onmouseleave={clearHover}
                    >
                      <td class="font-mono">{i + 1}</td>
                      <td>
                        {r.clubId === myClubId ? '★ ' : ''}{r.clubName}
                      </td>
                      <td class="text-right font-mono">{r.played}</td>
                      <td class="text-right font-mono">{r.wins}</td>
                      <td class="text-right font-mono">{r.draws}</td>
                      <td class="text-right font-mono">{r.losses}</td>
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

      <!-- Próximas 3 jornadas compacto -->
      <aside class="card bg-base-100 shadow">
        <div class="card-body p-4">
          <h2 class="card-title text-sm">Próximas 3 jornadas</h2>
          {#if next3MatchdayKeys.length === 0}
            <p class="text-xs opacity-60">No quedan jornadas.</p>
          {:else}
            <div class="space-y-3">
              {#each next3MatchdayKeys as md}
                {@const group = upcomingByMatchday.get(md) ?? []}
                <div>
                  <div class="text-xs opacity-60 mb-1 font-semibold">
                    Jornada {md} · sem {group[0]?.week ?? '–'}
                  </div>
                  <div class="space-y-0.5">
                    {#each group as f}
                      <div
                        class="flex items-center justify-between p-1.5 text-xs rounded {fixtureHighlightClass(f)}"
                        onmouseenter={() => {
                          if (involvesClub(f, myClubId)) hoveredClubId = myClubId;
                          else hoveredClubId = f.homeClubId;
                        }}
                        onmouseleave={clearHover}
                      >
                        <div class="flex-1 truncate">
                          <span class="{f.homeClubId === myClubId ? 'font-bold' : ''}">{f.homeName}</span>
                          <span class="opacity-50 mx-1">vs</span>
                          <span class="{f.awayClubId === myClubId ? 'font-bold' : ''}">{f.awayName}</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    </div>

    <div class="text-xs opacity-60 flex gap-4">
      <span><span class="inline-block w-3 h-3 bg-success/40 align-middle mr-1"></span>Zona ascenso (top 3)</span>
      <span><span class="inline-block w-3 h-3 bg-error/40 align-middle mr-1"></span>Zona descenso (bottom 3)</span>
      <span><span class="inline-block w-3 h-3 bg-primary/30 align-middle mr-1"></span>Tu equipo</span>
    </div>

    <!-- Calendario completo (debajo, full width) -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="card-title">Calendario</h2>
          <!-- a11y P1-4 (Sprint 11 task 11-3): aria-selected + aria-controls. -->
          <div role="tablist" class="tabs tabs-boxed w-fit" aria-label="Vista del calendario">
            <button
              role="tab"
              id="tab-league-upcoming3"
              aria-selected={view === 'upcoming3'}
              aria-controls="tabpanel-league-fixtures"
              class="tab {view === 'upcoming3' ? 'tab-active' : ''}"
              onclick={() => (view = 'upcoming3')}
            >
              Próximas 3
            </button>
            <button
              role="tab"
              id="tab-league-all"
              aria-selected={view === 'all'}
              aria-controls="tabpanel-league-fixtures"
              class="tab {view === 'all' ? 'tab-active' : ''}"
              onclick={() => (view = 'all')}
            >
              Todas las jornadas
            </button>
            <button
              role="tab"
              id="tab-league-past"
              aria-selected={view === 'past'}
              aria-controls="tabpanel-league-fixtures"
              class="tab {view === 'past' ? 'tab-active' : ''}"
              onclick={() => (view = 'past')}
            >
              Pasadas ({data.pastFixtures.length > 0 ? pastByMatchday.size : 0})
            </button>
          </div>
        </div>

        <div
          role="tabpanel"
          id="tabpanel-league-fixtures"
          aria-labelledby={view === 'past' ? 'tab-league-past' : view === 'all' ? 'tab-league-all' : 'tab-league-upcoming3'}
        >
        {#if view === 'past' && pastByMatchday.size === 0}
          <p class="opacity-60 text-sm mt-3">Todavía no se ha jugado ninguna jornada.</p>
        {:else if view === 'upcoming3' && next3MatchdayKeys.length === 0}
          <p class="opacity-60 text-sm mt-3">No quedan jornadas por jugar.</p>
        {:else}
          {@const groups =
            view === 'past' ? pastByMatchday
            : view === 'upcoming3' ? new Map(next3MatchdayKeys.map((md) => [md, upcomingByMatchday.get(md) ?? []]))
            : new Map(
                [...pastByMatchday.entries(), ...upcomingByMatchday.entries()]
                  .sort((a, b) => a[0] - b[0])
              )}
          <div class="space-y-4 mt-3">
            {#each [...groups.entries()].sort((a, b) => (view === 'past' ? b[0] - a[0] : a[0] - b[0])) as [matchday, group]}
              <div>
                <h3 class="font-semibold text-sm opacity-70 mb-1">
                  Jornada {matchday} · sem {group[0].week}
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
                  {#each group as f}
                    <div
                      class="flex items-center justify-between p-2 rounded {fixtureHighlightClass(f)}"
                      onmouseenter={() => {
                        if (involvesClub(f, myClubId)) hoveredClubId = myClubId;
                        else hoveredClubId = f.homeClubId;
                      }}
                      onmouseleave={clearHover}
                    >
                      <div class="flex-1 truncate">
                        <span class="{f.homeClubId === myClubId ? 'font-bold' : ''}">{f.homeName}</span>
                        <span class="opacity-50 mx-2">vs</span>
                        <span class="{f.awayClubId === myClubId ? 'font-bold' : ''}">{f.awayName}</span>
                      </div>
                      <div class="font-mono ml-2">
                        {#if f.status === 'played' && f.homeScore !== null && f.awayScore !== null && !shouldHideScore(f)}
                          <span class="badge badge-neutral">{f.homeScore}-{f.awayScore}</span>
                        {:else if shouldHideScore(f)}
                          <span class="badge badge-warning badge-sm">por jugar</span>
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
      </div>
    </section>
  {/if}
</div>
