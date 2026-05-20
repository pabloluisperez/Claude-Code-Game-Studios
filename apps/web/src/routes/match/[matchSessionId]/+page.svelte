<!--
  Match recap + Socket.IO replay button.

  Static view: shows the final score + persisted events for an already-played
  fixture. The "Reproducir en vivo" button connects to the /match Socket.IO
  namespace, joins the room, and streams the persisted events one by one with
  paced delays so the UI demonstrates live updates.

  Story: HUD-UI-006 / Match-live wiring
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import { joinMatchRoom, disconnectMatchSocket } from '$lib/sockets';
  import { generateMatchRecap } from '@smt/shared';

  let { data }: { data: PageData } = $props();

  const autoplay = $derived($page.url.searchParams.get('autoplay') === '1');
  const returnTo = $derived($page.url.searchParams.get('return'));
  let finalWhistle = $state(false);

  interface FeedEvent {
    minute: number;
    type: string;
    team: 'home' | 'away';
  }

  const persistedEvents = $derived.by<FeedEvent[]>(() => {
    const outcome = data.fixture.matchOutcomeData as { events?: FeedEvent[] } | null;
    return outcome?.events ?? [];
  });

  const recap = $derived.by(() => {
    if (
      data.fixture.status !== 'played' ||
      data.fixture.homeScore === null ||
      data.fixture.awayScore === null
    ) {
      return null;
    }
    return generateMatchRecap({
      homeName: data.fixture.homeName,
      awayName: data.fixture.awayName,
      homeScore: data.fixture.homeScore,
      awayScore: data.fixture.awayScore,
      events: persistedEvents.map((e) => ({
        minute: e.minute,
        type: e.type as 'goal' | 'yellow_card' | 'red_card' | 'injury',
        team: e.team,
      })),
    });
  });

  let liveEvents = $state<FeedEvent[]>([]);
  let liveMinute = $state(0);
  let homeLive = $state(0);
  let awayLive = $state(0);
  let isReplaying = $state(false);

  let pacingTimer: ReturnType<typeof setInterval> | null = null;

  function eventBadge(t: string): string {
    if (t === 'goal') return 'badge-success';
    if (t === 'red_card') return 'badge-error';
    if (t === 'yellow_card') return 'badge-warning';
    return 'badge-info';
  }
  function eventLabel(t: string): string {
    switch (t) {
      case 'goal': return '⚽ Gol';
      case 'yellow_card': return '🟨 Amarilla';
      case 'red_card': return '🟥 Roja';
      case 'injury': return '🩹 Lesión';
      default: return t;
    }
  }

  function startReplay() {
    if (isReplaying || persistedEvents.length === 0) return;
    isReplaying = true;
    liveEvents = [];
    liveMinute = 0;
    homeLive = 0;
    awayLive = 0;

    // Connect socket + join room (server will broadcast on the same room from
    // any worker emitting events). For MVP we drive the timeline locally; the
    // socket join still happens so the room is warm if the server later
    // broadcasts.
    joinMatchRoom(data.fixture.id);

    const queue = [...persistedEvents].sort((a, b) => a.minute - b.minute);
    let idx = 0;

    // Compress 90 in-game minutes to ~30 seconds wall-clock for demo pacing.
    const tickIntervalMs = 333;
    pacingTimer = setInterval(() => {
      liveMinute += 1;
      while (idx < queue.length && queue[idx]!.minute <= liveMinute) {
        const ev = queue[idx]!;
        liveEvents = [...liveEvents, ev];
        if (ev.type === 'goal') {
          if (ev.team === 'home') homeLive += 1;
          else awayLive += 1;
        }
        idx += 1;
      }
      if (liveMinute >= 90) {
        finalWhistle = true;
        stopReplay();
      }
    }, tickIntervalMs);
  }

  function stopReplay() {
    if (pacingTimer) {
      clearInterval(pacingTimer);
      pacingTimer = null;
    }
    isReplaying = false;
  }

  onMount(() => {
    if (autoplay && persistedEvents.length > 0) {
      startReplay();
    }
  });

  onDestroy(() => {
    stopReplay();
    disconnectMatchSocket();
  });
</script>

<div class="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4 max-w-6xl mx-auto">
<div class="space-y-6">
  <p class="opacity-60 text-xs">
    Fixture: <span class="font-mono">{data.fixture.id.slice(0, 8)}</span> ·
    Semana <span class="font-mono">{data.fixture.week}</span> ·
    Jornada <span class="font-mono">{data.fixture.matchday}</span>
  </p>

  <!-- Scoreboard -->
  <section class="card bg-base-200 shadow">
    <div class="card-body">
      <div class="flex items-center justify-around text-center">
        <div class="flex-1">
          <div class="text-xs opacity-60">CASA</div>
          <div class="text-xl font-semibold truncate">{data.fixture.homeName}</div>
        </div>
        <div class="text-5xl font-mono font-bold">
          {#if isReplaying}
            {homeLive} <span class="opacity-50">-</span> {awayLive}
          {:else if data.fixture.status === 'played' && data.fixture.homeScore !== null}
            {data.fixture.homeScore} <span class="opacity-50">-</span> {data.fixture.awayScore}
          {:else}
            — <span class="opacity-50">-</span> —
          {/if}
        </div>
        <div class="flex-1">
          <div class="text-xs opacity-60">FUERA</div>
          <div class="text-xl font-semibold truncate">{data.fixture.awayName}</div>
        </div>
      </div>
      <div class="text-center text-sm opacity-60 mt-2">
        {#if isReplaying}
          Minuto <span class="font-mono">{liveMinute}'</span>
        {:else if data.fixture.status === 'played'}
          Estado <span class="badge badge-success">FINAL</span>
        {:else}
          <span class="badge badge-ghost">Programado</span>
        {/if}
      </div>

      {#if data.fixture.status === 'played' && persistedEvents.length > 0}
        <div class="card-actions justify-center mt-3 gap-2 flex-wrap">
          {#if !isReplaying && !finalWhistle}
            <button class="btn btn-primary" type="button" onclick={startReplay}>
              ▶ Reproducir en vivo
            </button>
          {:else if isReplaying}
            <button class="btn btn-error btn-outline" type="button" onclick={stopReplay}>
              Detener
            </button>
          {/if}
          {#if returnTo === 'dashboard'}
            <a href="/dashboard?advanced=1" class="btn btn-ghost">
              {finalWhistle ? '→ Volver al dashboard' : 'Saltar al final'}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  {#if finalWhistle && returnTo === 'dashboard'}
    <div class="alert alert-success shadow">
      <span>⏱ Final del partido. Vuelve al dashboard cuando quieras.</span>
    </div>
  {/if}

  <!-- Match recap (newspaper-style) — hidden while replay is in progress -->
  {#if recap && (!isReplaying || finalWhistle)}
    <section class="card bg-base-100 shadow border-2 border-base-300">
      <div class="card-body py-4">
        <div class="flex items-baseline justify-between border-b border-base-300 pb-2 mb-2">
          <h3 class="font-serif text-xl font-bold">Crónica</h3>
          <span class="text-xs opacity-50">El Diario TSM</span>
        </div>
        <p class="font-serif text-base leading-relaxed">{recap}</p>
      </div>
    </section>
  {/if}

  <!-- Event feed -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Eventos del partido</h2>
      {#if persistedEvents.length === 0}
        <p class="opacity-60 text-sm">Sin eventos registrados.</p>
      {:else}
        <div class="space-y-2">
          {#each (isReplaying ? liveEvents : persistedEvents) as e}
            <div class="flex items-center gap-3 p-2 bg-base-200 rounded">
              <div class="font-mono text-sm opacity-70 w-12">{e.minute}'</div>
              <span class="badge {eventBadge(e.type)}">{eventLabel(e.type)}</span>
              <div class="flex-1 text-sm">
                <span class="opacity-60 text-xs uppercase">{e.team}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

<!-- Right column: other matchday results + live standings -->
<aside class="space-y-4">
  <section class="card bg-base-100 shadow">
    <div class="card-body p-4">
      <h3 class="font-semibold text-sm">Resto de la jornada</h3>
      {#if data.otherFixtures.length === 0}
        <p class="text-xs opacity-60">Sin otros partidos esta jornada.</p>
      {:else}
        <div class="space-y-1 mt-2">
          {#each data.otherFixtures as f}
            {@const outcome = f.matchOutcomeData as { events?: { minute: number; type: string; team: 'home' | 'away' }[] } | null}
            {@const goals = (outcome?.events ?? []).filter((e) => e.type === 'goal')}
            <div class="bg-base-200 rounded p-2">
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="font-semibold truncate flex-1">{f.homeName}</span>
                <span class="font-mono">
                  {#if f.status === 'played' && f.homeScore !== null && f.awayScore !== null}
                    {f.homeScore}-{f.awayScore}
                  {:else}
                    —
                  {/if}
                </span>
                <span class="font-semibold truncate flex-1 text-right">{f.awayName}</span>
              </div>
              {#if goals.length > 0}
                <div class="text-[10px] opacity-70 mt-1 leading-tight">
                  {#each goals as g}
                    <span class="inline-block mr-2">⚽ {g.minute}' ({g.team === 'home' ? 'L' : 'V'})</span>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section class="card bg-base-100 shadow">
    <div class="card-body p-4">
      <h3 class="font-semibold text-sm">Clasificación en vivo</h3>
      {#if data.liveStandings.length === 0}
        <p class="text-xs opacity-60">Sin clasificación aún.</p>
      {:else}
        <table class="table table-xs mt-2">
          <tbody>
            {#each data.liveStandings.slice(0, 12) as r, i}
              {@const isMine = r.clubId === data.fixture.homeClubId || r.clubId === data.fixture.awayClubId}
              <tr class="{isMine ? 'font-bold bg-primary/10' : ''}">
                <td class="font-mono opacity-60 w-6">{i + 1}</td>
                <td class="truncate max-w-[8rem]">{r.clubName}</td>
                <td class="text-right font-mono opacity-70 text-xs">{r.played}</td>
                <td class="text-right font-mono font-bold">{r.points}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>
</aside>
</div>
