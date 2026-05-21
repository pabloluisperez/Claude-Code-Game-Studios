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
  import { flip } from 'svelte/animate';
  import { page } from '$app/stores';
  import { joinMatchRoom, disconnectMatchSocket } from '$lib/sockets';
  import { generateMatchRecap } from '@smt/shared';

  let { data }: { data: PageData } = $props();

  const autoplay = $derived($page.url.searchParams.get('autoplay') === '1');
  const skipToEnd = $derived($page.url.searchParams.get('skipToEnd') === '1');
  const returnTo = $derived($page.url.searchParams.get('return'));
  let finalWhistle = $state(false);
  // Tracks whether the user has already seen the result of THIS fixture.
  // Stored client-side per session so that walking away mid-game doesn't
  // accidentally spoil the result on /calendar or /league.
  let seenInSession = $state(false);
  const SEEN_KEY = `tsm-seen-fixture:${data.fixture.id}`;

  // "Today's" match = same week as the playthrough's current week.
  const isToday = $derived(data.fixture.week === data.currentWeek);
  // Hide the result until the user has watched (or expanded) it.
  const resultHidden = $derived(isToday && !seenInSession && !finalWhistle);

  interface FeedEvent {
    minute: number;
    type: string;
    team: 'home' | 'away';
    playerName?: string;
    playerId?: string;
  }

  const persistedEvents = $derived.by<FeedEvent[]>(() => {
    const outcome = data.fixture.matchOutcomeData as { events?: FeedEvent[] } | null;
    return outcome?.events ?? [];
  });

  // ── Other fixtures: parallel live tick ───────────────────────────────────
  interface OtherFixtureLive {
    id: string;
    homeName: string;
    awayName: string;
    homeClubId: string;
    awayClubId: string;
    finalHomeScore: number | null;
    finalAwayScore: number | null;
    events: FeedEvent[];
    /** Score visible right now (advances as liveMinute advances). */
    liveHome: number;
    liveAway: number;
    /** Latest event emitted this tick (for the ticker). */
    lastEvent: FeedEvent | null;
  }

  let otherFixturesLive = $state<OtherFixtureLive[]>([]);

  $effect(() => {
    // Initialise once from page data.
    otherFixturesLive = data.otherFixtures.map((f) => {
      const outcome = f.matchOutcomeData as { events?: FeedEvent[] } | null;
      return {
        id: f.id,
        homeName: f.homeName,
        awayName: f.awayName,
        homeClubId: f.homeClubId,
        awayClubId: f.awayClubId,
        finalHomeScore: f.homeScore,
        finalAwayScore: f.awayScore,
        events: (outcome?.events ?? []).slice().sort((a, b) => a.minute - b.minute),
        liveHome: 0,
        liveAway: 0,
        lastEvent: null,
      };
    });
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

  // Live standings — recompute from the base standings + score deltas of the
  // matches that have advanced so far. Sort by points then GF, animate row
  // reorder via animate:flip in the markup.
  interface LiveStandingRow {
    clubId: string;
    clubName: string;
    played: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
  }

  /** Apply a (final → live) swap on the given rows for one fixture. PJ
   * stays at the post-week count for visual stability; we only adjust
   * points and goals. */
  function applyLiveDelta(
    rows: LiveStandingRow[],
    finalH: number,
    finalA: number,
    liveH: number,
    liveA: number,
    homeClubId: string,
    awayClubId: string,
  ): void {
    const homeR = rows.find((r) => r.clubId === homeClubId);
    const awayR = rows.find((r) => r.clubId === awayClubId);
    if (!homeR || !awayR) return;
    const finalWinner: 'home' | 'away' | 'draw' =
      finalH > finalA ? 'home' : finalH < finalA ? 'away' : 'draw';
    const liveWinner: 'home' | 'away' | 'draw' =
      liveH > liveA ? 'home' : liveH < liveA ? 'away' : 'draw';
    homeR.points -= finalWinner === 'home' ? 3 : finalWinner === 'draw' ? 1 : 0;
    awayR.points -= finalWinner === 'away' ? 3 : finalWinner === 'draw' ? 1 : 0;
    homeR.goalsFor -= finalH;
    homeR.goalsAgainst -= finalA;
    awayR.goalsFor -= finalA;
    awayR.goalsAgainst -= finalH;
    homeR.points += liveWinner === 'home' ? 3 : liveWinner === 'draw' ? 1 : 0;
    awayR.points += liveWinner === 'away' ? 3 : liveWinner === 'draw' ? 1 : 0;
    homeR.goalsFor += liveH;
    homeR.goalsAgainst += liveA;
    awayR.goalsFor += liveA;
    awayR.goalsAgainst += liveH;
  }

  const liveStandings = $derived.by<LiveStandingRow[]>(() => {
    const rows: LiveStandingRow[] = data.liveStandings.map((s) => ({
      clubId: s.clubId,
      clubName: s.clubName,
      played: s.played,
      points: s.points,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
    }));
    if (isReplaying) {
      // 1) User's own match
      const userFinalH = data.fixture.homeScore ?? 0;
      const userFinalA = data.fixture.awayScore ?? 0;
      applyLiveDelta(
        rows,
        userFinalH,
        userFinalA,
        homeLive,
        awayLive,
        data.fixture.homeClubId,
        data.fixture.awayClubId,
      );
      // 2) Every other matchday fixture
      for (const f of otherFixturesLive) {
        applyLiveDelta(
          rows,
          f.finalHomeScore ?? 0,
          f.finalAwayScore ?? 0,
          f.liveHome,
          f.liveAway,
          f.homeClubId,
          f.awayClubId,
        );
      }
    }
    rows.sort((a, b) => b.points - a.points || b.goalsFor - a.goalsFor);
    return rows;
  });

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
    // Per-other-fixture index into its event queue.
    const otherIdx = new Map<string, number>();
    otherFixturesLive.forEach((f) => otherIdx.set(f.id, 0));

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

      // Advance every other fixture's clock in parallel.
      otherFixturesLive = otherFixturesLive.map((f) => {
        let cursor = otherIdx.get(f.id) ?? 0;
        let h = f.liveHome;
        let a = f.liveAway;
        let lastEv: FeedEvent | null = f.lastEvent;
        while (cursor < f.events.length && f.events[cursor]!.minute <= liveMinute) {
          const ev = f.events[cursor]!;
          if (ev.type === 'goal') {
            if (ev.team === 'home') h += 1;
            else a += 1;
          }
          lastEv = ev;
          cursor += 1;
        }
        otherIdx.set(f.id, cursor);
        return { ...f, liveHome: h, liveAway: a, lastEvent: lastEv };
      });

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
    // Restore "seen" flag from sessionStorage so revisits don't re-hide
    // results the user already watched in this session.
    if (typeof sessionStorage !== 'undefined') {
      seenInSession = sessionStorage.getItem(SEEN_KEY) === '1';
    }

    if (skipToEnd) {
      // Bug M3 fix (playtest 2026-05-21 Pablo): previously `skipToEnd`
      // only applied to PAST matches (`!isToday`). For today's match it
      // was ignored, leaving the page in idle state with no events shown.
      // Pablo's complaint: 'Si el día de partido le doy a solo resultado
      // me sale el match pero sin goles ni eventos, debería verse todo
      // automáticamente.'
      //
      // Now: regardless of `isToday`, skipToEnd shows score + recap + all
      // events upfront. Today's match still requires the user to have
      // navigated here explicitly (via 'Solo resultado' button), so the
      // "must be watched" gate is preserved at the navigation layer, not
      // here.
      finalWhistle = true;
      seenInSession = true;
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SEEN_KEY, '1');
      return;
    }
    if (autoplay && persistedEvents.length > 0) {
      startReplay();
    }
  });

  // When the replay reaches the final whistle, mark this fixture as seen.
  $effect(() => {
    if (finalWhistle) {
      seenInSession = true;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SEEN_KEY, '1');
      }
    }
  });

  onDestroy(() => {
    stopReplay();
    disconnectMatchSocket();
  });
</script>

<div class="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4 max-w-6xl mx-auto">
<div class="space-y-6">
  <header class="flex items-baseline gap-3 flex-wrap">
    <h1 class="text-3xl font-bold">Jornada {data.fixture.matchday}</h1>
    <span class="opacity-60 text-sm">· Semana {data.fixture.week}</span>
  </header>

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
          {:else if resultHidden}
            — <span class="opacity-50">-</span> —
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
        {:else if resultHidden}
          <span class="badge badge-warning">Por jugar</span>
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
            {#if finalWhistle}
              <a href="/dashboard?advanced=1" class="btn btn-ghost">
                → Volver al dashboard
              </a>
            {:else}
              <!-- Bug M1 fix (playtest 2026-05-21 Pablo): 'Saltar al final'
                   previously navigated to /dashboard, leaving the player
                   without seeing the result. Now it stops the replay
                   in-place and reveals the recap + all events upfront. -->
              <button
                type="button"
                class="btn btn-ghost"
                onclick={() => {
                  stopReplay();
                  finalWhistle = true;
                }}
              >
                Saltar al final
              </button>
            {/if}
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

  <!-- Match recap (newspaper-style) — hidden while replay is in progress
       AND hidden if the result hasn't been "seen" yet (today's match). -->
  {#if recap && !resultHidden && (!isReplaying || finalWhistle)}
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

  <!-- Event feed — home events left, away events right -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Eventos del partido</h2>
      <div class="grid grid-cols-2 text-xs opacity-60 uppercase tracking-wide mt-1 mb-2">
        <div class="text-left">🏠 {data.fixture.homeName}</div>
        <div class="text-right">✈️ {data.fixture.awayName}</div>
      </div>
      {#if resultHidden && !isReplaying}
        <p class="opacity-60 text-sm">
          Pulsa "Reproducir en vivo" para vivir el partido — los eventos se revelan minuto a minuto.
        </p>
      {:else if persistedEvents.length === 0}
        <p class="opacity-60 text-sm">Sin eventos registrados.</p>
      {:else}
        <!-- a11y P1-5 (Sprint 11 task 11-3): aria-live="polite" announces
             goals/cards/subs as they appear during live replay. aria-atomic
             ="false" so the screen reader only reads the new event, not the
             entire feed each tick. -->
        <div
          class="space-y-1"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Eventos del partido en directo"
        >
          {#each (isReplaying ? liveEvents : persistedEvents) as e}
            {@const isHome = e.team === 'home'}
            <div
              class="flex items-center gap-3 p-2 bg-base-200 rounded
                     {isHome ? '' : 'flex-row-reverse text-right'}"
            >
              <div class="font-mono text-sm opacity-70 w-10 flex-shrink-0
                          {isHome ? '' : 'text-right'}">
                {e.minute}'
              </div>
              <span class="badge {eventBadge(e.type)} flex-shrink-0">{eventLabel(e.type)}</span>
              <div class="flex-1 text-sm min-w-0">
                {#if e.playerName}
                  <span class="font-semibold">{e.playerName}</span>
                {/if}
              </div>
              <!-- Spacer column on opposite side so events visually stick to their half -->
              <div class="flex-1"></div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

<!-- Right sidebar: other matchday + live standings -->
<aside class="space-y-4">
  <section class="card bg-base-100 shadow">
    <div class="card-body p-4">
      <h3 class="font-semibold text-sm">Resto de la jornada</h3>
      {#if otherFixturesLive.length === 0}
        <p class="text-xs opacity-60">Sin otros partidos esta jornada.</p>
      {:else}
        <div class="space-y-1 mt-2">
          {#each otherFixturesLive as f (f.id)}
            <div class="bg-base-200 rounded p-2">
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="font-semibold truncate flex-1">{f.homeName}</span>
                <span class="font-mono">
                  {#if isReplaying}
                    {f.liveHome}-{f.liveAway}
                  {:else if f.finalHomeScore !== null && f.finalAwayScore !== null}
                    {f.finalHomeScore}-{f.finalAwayScore}
                  {:else}
                    —
                  {/if}
                </span>
                <span class="font-semibold truncate flex-1 text-right">{f.awayName}</span>
              </div>
              {#if isReplaying && f.lastEvent}
                <div class="text-[10px] opacity-70 mt-1 leading-tight">
                  {#if f.lastEvent.type === 'goal'}⚽{:else if f.lastEvent.type === 'red_card'}🟥{:else if f.lastEvent.type === 'yellow_card'}🟨{:else}🩹{/if}
                  {f.lastEvent.minute}' {f.lastEvent.playerName ?? ''}
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
      <h3 class="font-semibold text-sm">
        Clasificación {#if isReplaying}<span class="badge badge-error badge-xs ml-1">EN VIVO</span>{/if}
      </h3>
      {#if liveStandings.length === 0}
        <p class="text-xs opacity-60">Sin clasificación aún.</p>
      {:else}
        <table class="table table-xs mt-2">
          <tbody>
            {#each liveStandings.slice(0, 12) as r, i (r.clubId)}
              {@const isMine = r.clubId === data.fixture.homeClubId || r.clubId === data.fixture.awayClubId}
              <tr
                animate:flip={{ duration: 800 }}
                class="standings-row {isMine ? 'font-bold bg-primary/10' : ''}"
              >
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

<style>
  .standings-row { transition: background 0.3s ease; }
</style>
