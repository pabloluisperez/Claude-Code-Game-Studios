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
  import ClubShield from '$lib/components/club-shield.svelte';
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
  // Sprint 13 walkthrough fix (Pablo Part C): set of hovered clubs so a
  // single fixture hover can highlight BOTH home and away rows in the
  // standings table simultaneously. Previously only one club was tracked.
  let hoveredClubIds = $state<Set<string>>(new Set());

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

  // Pablo 2026-05-26: build tier→{groupCount, tierName} index for nav buttons.
  const tierMap = $derived.by(() => {
    const m = new Map<number, { groupCount: number; tierName: string }>();
    if (!data.hasPlaythrough) return m;
    for (const d of data.availableDivisions) {
      const existing = m.get(d.tier);
      if (!existing) {
        m.set(d.tier, { groupCount: 1, tierName: d.name.replace(/ Grupo \d+$/, '') });
      } else {
        existing.groupCount = Math.max(existing.groupCount, d.groupIndex + 1);
      }
    }
    return m;
  });
  const tierEntries = $derived([...tierMap.entries()].sort((a, b) => a[0] - b[0]));
  const viewingTierGroupCount = $derived(
    data.hasPlaythrough ? (tierMap.get(data.viewingTier)?.groupCount ?? 1) : 1,
  );

  // Pablo 2026-05-26: click on a played fixture → show goals/cards/injuries.
  type MatchEvent = {
    minute: number;
    type: 'goal' | 'yellow_card' | 'red_card' | 'injury';
    team: 'home' | 'away';
    playerName?: string;
    playerId?: string;
  };
  let openFixture = $state<FixtureRow | null>(null);
  const openFixtureEvents = $derived.by<MatchEvent[]>(() => {
    if (!openFixture) return [];
    const raw = (openFixture as { matchOutcomeData?: { events?: MatchEvent[] } }).matchOutcomeData;
    const evts = raw?.events ?? [];
    return [...evts].sort((a, b) => a.minute - b.minute);
  });
  function eventIcon(type: MatchEvent['type']): string {
    switch (type) {
      case 'goal': return '⚽';
      case 'yellow_card': return '🟨';
      case 'red_card': return '🟥';
      case 'injury': return '🤕';
    }
  }
  function eventLabel(type: MatchEvent['type']): string {
    switch (type) {
      case 'goal': return 'Gol';
      case 'yellow_card': return 'Amarilla';
      case 'red_card': return 'Roja';
      case 'injury': return 'Lesión';
    }
  }

  function zoneClass(idx: number, total: number): string {
    if (idx < 3) return 'bg-success/5';
    if (idx >= total - 3) return 'bg-error/5';
    return '';
  }

  function involvesClub(f: FixtureRow, clubId: string): boolean {
    return f.homeClubId === clubId || f.awayClubId === clubId;
  }

  // Sprint 13 walkthrough fix (Pablo Part C):
  //   - My team always gets a strong left-border + light bg (distinto del hover)
  //   - Hover ANY fixture → both clubs en la tabla muestran resaltado info
  //   - Hover sobre mi club mientras es además parte del hover → mantiene
  //     ambos estilos (primary background + info border)
  function rowHighlightClass(clubId: string): string {
    const isHovered = hoveredClubIds.has(clubId);
    const isMine = clubId === myClubId;
    if (isMine && isHovered) {
      // Both: my team AND part of hovered fixture → mix both signals
      return 'bg-primary/10 border-l-4 border-l-primary font-semibold ring-2 ring-info/40';
    }
    if (isMine) {
      return 'bg-primary/10 border-l-4 border-l-primary font-semibold';
    }
    if (isHovered) {
      return 'bg-info/15 border-l-4 border-l-info';
    }
    return '';
  }

  function fixtureHighlightClass(f: FixtureRow): string {
    const involvesHover =
      hoveredClubIds.has(f.homeClubId) || hoveredClubIds.has(f.awayClubId);
    const involvesMe = involvesClub(f, myClubId);
    if (involvesHover) return 'bg-info/15 border border-info/40';
    if (involvesMe) return 'bg-primary/10 border border-primary/30';
    return 'bg-base-200 border border-transparent';
  }

  function hoverFixture(f: FixtureRow): void {
    // Resalta AMBOS clubs cuando el ratón pasa por un fixture.
    hoveredClubIds = new Set([f.homeClubId, f.awayClubId]);
  }

  function hoverClub(clubId: string): void {
    hoveredClubIds = new Set([clubId]);
  }

  function clearHover() {
    hoveredClubIds = new Set();
  }
</script>

<div class="space-y-6">
  <header>
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold">
          {data.hasPlaythrough ? data.divisionName : 'Liga'}
          {#if data.hasPlaythrough && data.isMyDivision}
            <span class="badge badge-primary badge-sm align-middle ml-1">Tu liga</span>
          {/if}
        </h1>
        <p class="opacity-60">
          {#if data.hasPlaythrough}
            Temporada {data.seasonNumber} · Clasificación y calendario
          {:else}
            Clasificación y calendario completo
          {/if}
        </p>
      </div>
      {#if data.hasPlaythrough && !data.isMyDivision}
        <a href="/league" class="btn btn-sm btn-outline">← Volver a mi liga</a>
      {/if}
    </div>

    {#if data.hasPlaythrough && data.availableDivisions.length > 0}
      <div class="mt-3 space-y-2">
        <!-- Tier buttons -->
        <div class="flex flex-wrap gap-1">
          {#each tierEntries as [tier, info] (tier)}
            <a
              href={`/league?tier=${tier}&group=0`}
              class="btn btn-xs {data.viewingTier === tier ? 'btn-primary' : 'btn-ghost border border-base-300'}"
              title={info.tierName}
            >
              {info.tierName}
              {#if tier === data.myTier}
                <span class="text-xs opacity-70 ml-1">★</span>
              {/if}
            </a>
          {/each}
        </div>

        <!-- Group selector (only for tiers with > 1 group) -->
        {#if viewingTierGroupCount > 1}
          <div class="flex flex-wrap gap-1 items-center">
            <span class="text-xs opacity-60 mr-1">Grupo:</span>
            {#each Array.from({ length: viewingTierGroupCount }, (_, i) => i) as g (g)}
              <a
                href={`/league?tier=${data.viewingTier}&group=${g}`}
                class="btn btn-xs {data.viewingGroup === g ? 'btn-secondary' : 'btn-ghost border border-base-300'}"
              >
                {g + 1}
                {#if data.viewingTier === data.myTier && g === data.myGroup}
                  <span class="text-xs ml-0.5">★</span>
                {/if}
              </a>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
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
                      onmouseenter={() => hoverClub(r.clubId)}
                      onmouseleave={clearHover}
                    >
                      <td class="font-mono">{i + 1}</td>
                      <td>
                        <a href="/clubs/{r.clubId}" class="link link-hover flex items-center gap-2">
                          <ClubShield
                            name={r.clubName}
                            primaryColor={r.kitPrimaryColor ?? '#1e3a8a'}
                            secondaryColor={r.kitSecondaryColor ?? '#f8fafc'}
                            size={22}
                          />
                          <span>{r.clubId === myClubId ? '★ ' : ''}{r.clubName}</span>
                        </a>
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
                        onmouseenter={() => hoverFixture(f)}
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

    <!-- Calendario movido a /matches (Pablo 2026-05-26). -->
    <a href="/matches" class="btn btn-outline btn-sm w-fit">📅 Ver todos los partidos →</a>
  {/if}
</div>
