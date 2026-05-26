<!--
  /matches — Partidos. Calendario de fixtures de la división vista (Pablo
  2026-05-26: extraído de /league para no saturar Clasificación).
  Reutiliza loadLeagueView. Tabs Próximas/Todas/Pasadas + modal de detalle.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import ClubShield from '$lib/components/club-shield.svelte';
  let { data }: { data: PageData } = $props();

  let seenFixtures = $state<Set<string>>(new Set());
  onMount(() => {
    if (typeof sessionStorage === 'undefined') return;
    const out = new Set<string>();
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith('tsm-seen-fixture:') && sessionStorage.getItem(k) === '1') out.add(k.slice('tsm-seen-fixture:'.length));
    }
    seenFixtures = out;
  });
  function shouldHideScore(fx: { week: number; id: string; homeClubId: string; awayClubId: string }): boolean {
    if (!data.hasPlaythrough) return false;
    if (fx.week !== data.currentWeek) return false;
    // Pablo 2026-05-27: only hide the USER's own match (until watched). Rival
    // results of the same matchday show immediately.
    const isMine = fx.homeClubId === data.myClubId || fx.awayClubId === data.myClubId;
    if (!isMine) return false;
    return !seenFixtures.has(fx.id);
  }

  const myClubId = $derived(data.hasPlaythrough ? data.myClubId : '');
  type FixtureRow = Extract<PageData, { hasPlaythrough: true }>['pastFixtures'][number];

  function groupByMatchday(rows: readonly FixtureRow[]): Map<number, FixtureRow[]> {
    const m = new Map<number, FixtureRow[]>();
    for (const r of rows) {
      const list = m.get(r.matchday) ?? [];
      list.push(r);
      m.set(r.matchday, list);
    }
    return m;
  }
  const pastByMatchday = $derived(data.hasPlaythrough ? groupByMatchday(data.pastFixtures) : new Map());
  const upcomingByMatchday = $derived(data.hasPlaythrough ? groupByMatchday(data.upcomingFixtures) : new Map());

  let view = $state<'upcoming' | 'past'>('upcoming');

  // Division nav (mirror /league).
  const tierMap = $derived.by(() => {
    const m = new Map<number, { groupCount: number; tierName: string }>();
    if (!data.hasPlaythrough) return m;
    for (const d of data.availableDivisions) {
      const ex = m.get(d.tier);
      if (!ex) m.set(d.tier, { groupCount: 1, tierName: d.name.replace(/ Grupo \d+$/, '') });
      else ex.groupCount = Math.max(ex.groupCount, d.groupIndex + 1);
    }
    return m;
  });
  const tierEntries = $derived([...tierMap.entries()].sort((a, b) => a[0] - b[0]));
  const viewingTierGroupCount = $derived(data.hasPlaythrough ? (tierMap.get(data.viewingTier)?.groupCount ?? 1) : 1);

  // Match detail modal.
  type MatchEvent = { minute: number; type: 'goal' | 'yellow_card' | 'red_card' | 'injury'; team: 'home' | 'away'; playerName?: string; playerId?: string };
  let openFixture = $state<FixtureRow | null>(null);
  const openFixtureEvents = $derived.by<MatchEvent[]>(() => {
    if (!openFixture) return [];
    const raw = (openFixture as { matchOutcomeData?: { events?: MatchEvent[] } }).matchOutcomeData;
    return [...(raw?.events ?? [])].sort((a, b) => a.minute - b.minute);
  });
  function eventIcon(t: MatchEvent['type']): string {
    return t === 'goal' ? '⚽' : t === 'yellow_card' ? '🟨' : t === 'red_card' ? '🟥' : '🤕';
  }
  function eventLabel(t: MatchEvent['type']): string {
    return t === 'goal' ? 'Gol' : t === 'yellow_card' ? 'Amarilla' : t === 'red_card' ? 'Roja' : 'Lesión';
  }

  const groups = $derived(view === 'past' ? pastByMatchday : upcomingByMatchday);
</script>

<svelte:head><title>Partidos — TSM</title></svelte:head>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Partidos · {data.hasPlaythrough ? data.divisionName : ''}</h1>
    <p class="opacity-60">Calendario y resultados de la división</p>

    {#if data.hasPlaythrough && data.availableDivisions.length > 0}
      <div class="mt-3 space-y-2">
        <div class="flex flex-wrap gap-1">
          {#each tierEntries as [tier, info] (tier)}
            <a
              href={`/matches?tier=${tier}&group=0`}
              class="btn btn-xs {data.viewingTier === tier ? 'btn-primary' : 'btn-ghost border border-base-300'}"
            >
              {info.tierName}{#if tier === data.myTier}<span class="text-xs opacity-70 ml-1">★</span>{/if}
            </a>
          {/each}
        </div>
        {#if viewingTierGroupCount > 1}
          <div class="flex flex-wrap gap-1 items-center">
            <span class="text-xs opacity-60 mr-1">Grupo:</span>
            {#each Array.from({ length: viewingTierGroupCount }, (_, i) => i) as g (g)}
              <a
                href={`/matches?tier=${data.viewingTier}&group=${g}`}
                class="btn btn-xs {data.viewingGroup === g ? 'btn-secondary' : 'btn-ghost border border-base-300'}"
              >
                {g + 1}{#if data.viewingTier === data.myTier && g === data.myGroup}<span class="text-xs ml-0.5">★</span>{/if}
              </a>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info"><span>Necesitas una carrera activa.</span></div>
  {:else}
    <div role="tablist" class="tabs tabs-boxed w-fit">
      <button role="tab" class="tab {view === 'upcoming' ? 'tab-active' : ''}" onclick={() => (view = 'upcoming')}>
        Próximas ({upcomingByMatchday.size})
      </button>
      <button role="tab" class="tab {view === 'past' ? 'tab-active' : ''}" onclick={() => (view = 'past')}>
        Pasadas ({pastByMatchday.size})
      </button>
    </div>

    <section class="card bg-base-100 shadow">
      <div class="card-body p-4 space-y-4">
        {#if groups.size === 0}
          <p class="text-sm opacity-60 italic">No hay partidos {view === 'past' ? 'jugados' : 'pendientes'}.</p>
        {:else}
          {#each [...groups.entries()].sort((a, b) => (view === 'past' ? b[0] - a[0] : a[0] - b[0])) as [matchday, group] (matchday)}
            <div>
              <h3 class="font-semibold text-sm opacity-70 mb-1">Jornada {matchday} · sem {group[0].week}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
                {#each group as f (f.id)}
                  <button
                    type="button"
                    class="flex items-center justify-between p-2 rounded text-left w-full {f.homeClubId === myClubId || f.awayClubId === myClubId ? 'bg-primary/5 border border-primary/20' : 'bg-base-200'} {f.status === 'played' ? 'hover:bg-base-300 cursor-pointer' : ''}"
                    onclick={() => { if (f.status === 'played') openFixture = f; }}
                    disabled={f.status !== 'played'}
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
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>

    {#if openFixture}
      <div class="modal modal-open">
        <div class="modal-box max-w-lg">
          <h3 class="font-bold text-lg flex items-center gap-2">
            <span class={openFixture.homeClubId === myClubId ? 'text-primary' : ''}>{openFixture.homeName}</span>
            <span class="badge badge-neutral text-base font-mono">{openFixture.homeScore}-{openFixture.awayScore}</span>
            <span class={openFixture.awayClubId === myClubId ? 'text-primary' : ''}>{openFixture.awayName}</span>
          </h3>
          <p class="text-xs opacity-60 mt-1">Jornada {openFixture.matchday} · semana {openFixture.week}</p>

          {#if openFixtureEvents.length === 0}
            {#if data.isMyDivision}
              <p class="mt-4 text-sm opacity-60 italic">Partido sin goles ni tarjetas.</p>
            {:else}
              <p class="mt-4 text-sm opacity-60 italic">No se dispone de información detallada de este partido (simulación rápida de otra división).</p>
            {/if}
          {:else}
            <div class="mt-4 space-y-1">
              {#each openFixtureEvents as e (e.minute + ':' + (e.playerName ?? '') + ':' + e.type)}
                <div class="flex items-center gap-3 p-2 rounded {e.team === 'home' ? 'bg-base-200' : 'bg-base-300'}">
                  <span class="font-mono text-xs opacity-60 w-8 text-right">{e.minute}'</span>
                  <span class="text-lg">{eventIcon(e.type)}</span>
                  <span class="text-sm flex-1">{(e.playerId && data.playerNameMap?.[e.playerId]) || e.playerName || '—'}</span>
                  <span class="text-xs opacity-50">{eventLabel(e.type)} · {e.team === 'home' ? openFixture.homeName : openFixture.awayName}</span>
                </div>
              {/each}
            </div>
          {/if}

          <div class="modal-action">
            <button class="btn" onclick={() => (openFixture = null)}>Cerrar</button>
          </div>
        </div>
        <div class="modal-backdrop" role="button" tabindex="-1" aria-label="Cerrar" onclick={() => (openFixture = null)} onkeydown={(e) => e.key === 'Escape' && (openFixture = null)}></div>
      </div>
    {/if}
  {/if}
</div>
