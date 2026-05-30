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
  import { matchLock } from '$lib/stores/match-lock';
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
    /** Set when a goal was overturned by VAR (Pablo 2026-05-30). */
    disallowed?: boolean;
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

  // BUG-PT-4 polish features (Sprint 13 task 13-5):
  // 1. Confeti burst on user-club goals (and a more subdued fade on opponent
  //    goals — currently same animation, future tuning).
  // 2. VAR check: ~8% of goals get a 2s "VAR checking..." overlay, then
  //    50/50 confirm vs disallow. Disallowed → score reverts.
  // 3. Pre-event pause: a 500ms "👀 algo va a pasar" badge before goals/
  //    reds/penalties (deferred to backlog — current flow ticks 1
  //    minute/333ms which is already fast enough that a short hint is
  //    distracting).
  let confettiKey = $state(0);
  let confettiSide = $state<'home' | 'away' | null>(null);
  let varOverlay = $state<
    | { phase: 'checking' | 'confirmed' | 'overturned'; team: 'home' | 'away'; minute: number }
    | null
  >(null);

  /**
   * Deterministic VAR roll seeded by match id + event minute. The same
   * match always produces the same VAR sequence. ~8% probability of a
   * VAR check on any goal; if it triggers, 50/50 confirm vs overturned.
   */
  function rollVar(minute: number): 'none' | 'confirmed' | 'overturned' {
    // Hash-based deterministic roll — no Math.random.
    const hash =
      [...`${data.fixture.id}:var:${minute}`].reduce(
        (acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0,
        0,
      ) >>> 0;
    const triggerRoll = (hash % 1000) / 1000; // 0..1
    // Pablo 2026-05-26: bumped 8% → 18% so VAR shows up more often (was rarely
    // seen across matches). ~18% per goal ≈ a VAR check most matches.
    if (triggerRoll >= 0.18) return 'none';
    const outcomeRoll = ((hash >> 8) % 1000) / 1000;
    return outcomeRoll < 0.5 ? 'overturned' : 'confirmed';
  }

  function triggerConfetti(side: 'home' | 'away'): void {
    // Pablo 2026-05-26: only celebrate the USER's goals, not the rival's.
    if (data.myClubSide && side !== data.myClubSide) return;
    confettiSide = side;
    confettiKey += 1;
    // Auto-clear after the animation (1.5s) so consecutive goals re-trigger
    // a fresh burst.
    setTimeout(() => {
      if (confettiKey > 0) confettiSide = null;
    }, 1500);
  }

  let pacingTimer: ReturnType<typeof setInterval> | null = null;

  function eventBadge(t: string): string {
    if (t === 'goal') return 'badge-success';
    if (t === 'red_card') return 'badge-error';
    if (t === 'yellow_card') return 'badge-warning';
    return 'badge-info';
  }

  // Pablo 2026-05-26 (#38): match commentary — Spanish narration per event.
  // Deterministic variant by minute so the same match reads the same way.
  const COMMENTARY: Record<string, string[]> = {
    goal: [
      '¡GOOOL! {p} la manda al fondo de la red.',
      '¡Lo marca {p}! Definición de crack.',
      '{p} no perdona y bate al portero.',
      '¡Qué golazo de {p}! El estadio estalla.',
      '{p} aparece en el área y la empuja a gol.',
    ],
    yellow_card: [
      'Amarilla para {p} tras una entrada dura.',
      'El árbitro saca tarjeta a {p}.',
      '{p} ve la amarilla por protestar.',
      'Falta táctica de {p} — amonestado.',
    ],
    red_card: [
      '¡Roja directa a {p}! Se queda con uno menos.',
      '{p} se va expulsado, jugada polémica.',
      '¡Expulsión! {p} abandona el campo.',
    ],
    injury: [
      '{p} cae lesionado, no puede continuar.',
      'Problema físico para {p}, pide el cambio.',
      '{p} se duele y necesita asistencia.',
    ],
  };
  function commentary(type: string, minute: number, player?: string): string {
    const lines = COMMENTARY[type];
    if (!lines) return '';
    const line = lines[minute % lines.length] ?? lines[0]!;
    return line.replace('{p}', player ?? 'un jugador');
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
          // BUG-PT-4 task 13-5: VAR check on ~18% of goals.
          const varOutcome = rollVar(ev.minute);
          if (varOutcome !== 'none') {
            // Show "VAR checking..." overlay, then confirm/disallow. The popup
            // lingers longer (Pablo 2026-05-30) so the review is readable.
            varOverlay = { phase: 'checking', team: ev.team, minute: ev.minute };
            // Provisionally add the goal to the score so the user sees it
            // before VAR reviews. If overturned, we revert later.
            if (ev.team === 'home') homeLive += 1;
            else awayLive += 1;
            const goalTeam = ev.team;
            const goalIdx = liveEvents.length - 1; // this goal's feed index
            setTimeout(() => {
              varOverlay = { phase: varOutcome, team: goalTeam, minute: ev.minute };
              if (varOutcome === 'overturned') {
                if (goalTeam === 'home') homeLive -= 1;
                else awayLive -= 1;
                // Annotate the feed event so the goal shows as disallowed (#4).
                liveEvents = liveEvents.map((le, i) =>
                  i === goalIdx ? { ...le, disallowed: true } : le,
                );
              } else {
                triggerConfetti(goalTeam);
              }
              // Clear overlay after the outcome card is shown (longer dwell).
              setTimeout(() => { varOverlay = null; }, 2500);
            }, 3500);
          } else {
            if (ev.team === 'home') homeLive += 1;
            else awayLive += 1;
            triggerConfetti(ev.team);
          }
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
    // Playtest PT-2 fix (Pablo Sprint 12 walkthrough): no auto-start on
    // mount. The user must click "Reproducir en vivo" explicitly so they
    // can read the pre-match context first. The autoplay query param now
    // only signals user INTENT (highlight the button) — not auto-trigger.
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

  // Lock the sidebar + topbar nav while a live replay is running (Pablo
  // 2026-05-30): the user must finish it or use the in-content "Saltar al final"
  // / "Volver al dashboard" controls. Released on whistle / skip / unmount.
  $effect(() => {
    matchLock.set(isReplaying && !finalWhistle);
  });

  onDestroy(() => {
    matchLock.set(false);
    stopReplay();
    disconnectMatchSocket();
  });
</script>

<!-- BUG-PT-4 13-5: confeti burst + VAR overlay layers (z-index above content). -->
{#if confettiSide !== null}
  {#key confettiKey}
    <div class="confetti-burst" aria-hidden="true">
      {#each Array.from({ length: 30 }) as _, i}
        <span
          class="confetti-piece"
          style="left:{(i * 31) % 100}%; animation-delay:{(i % 10) * 30}ms; background:hsl({(i * 137) % 360},80%,55%)"
        ></span>
      {/each}
    </div>
  {/key}
{/if}

{#if varOverlay !== null}
  <div class="var-overlay" role="dialog" aria-live="polite">
    <div class="var-card">
      {#if varOverlay.phase === 'checking'}
        <div class="text-3xl mb-1">📺</div>
        <div class="text-2xl font-bold">VAR checking...</div>
        <div class="text-sm opacity-70 mt-1">Revisando el gol del minuto {varOverlay.minute}'</div>
      {:else if varOverlay.phase === 'confirmed'}
        <div class="text-3xl mb-1">✅</div>
        <div class="text-2xl font-bold text-success">GOL VÁLIDO</div>
        <div class="text-sm opacity-70 mt-1">El árbitro confirma el gol</div>
      {:else}
        <div class="text-3xl mb-1">❌</div>
        <div class="text-2xl font-bold text-error">GOL ANULADO</div>
        <div class="text-sm opacity-70 mt-1">El VAR detecta infracción</div>
      {/if}
    </div>
  </div>
{/if}

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
      {#if isReplaying}
        <!-- Playtest PT-2 fix (Pablo Sprint 12): minuto en grande durante
             el replay — es la señal principal de "esto está en vivo". -->
        <div class="text-center mt-2">
          <div class="inline-flex items-center gap-2 bg-error/20 text-error border-2 border-error rounded-full px-4 py-1">
            <span class="animate-pulse">●</span>
            <span class="text-xs uppercase font-bold tracking-wider">EN VIVO</span>
            <span class="font-mono text-2xl md:text-3xl font-bold tabular-nums">{liveMinute}'</span>
          </div>
        </div>
      {:else}
        <div class="text-center text-sm opacity-60 mt-2">
          {#if resultHidden}
            <span class="badge badge-warning">Por jugar</span>
          {:else if data.fixture.status === 'played'}
            Estado <span class="badge badge-success">FINAL</span>
          {:else}
            <span class="badge badge-ghost">Programado</span>
          {/if}
        </div>
      {/if}

      <!-- Polish walkthrough fix #2 (Pablo, post-Sprint-12 12-4): recaudación
           compacta dentro del scoreboard para que sea visible nada más
           entrar (antes estaba debajo de la crónica, fuera del fold). -->
      {#if data.homeMatchEconomics && !resultHidden}
        {@const ec = data.homeMatchEconomics}
        {@const fmt = (n: number) => n.toLocaleString('es-ES')}
        {@const entradas = ec.lines[0]}
        {@const tienda = ec.lines.slice(1, 4)}
        {@const bar = ec.lines.slice(4, 8)}
        {@const tiendaUnits = tienda.reduce((s, l) => s + l.units, 0)}
        {@const tiendaTotal = tienda.reduce((s, l) => s + l.total, 0)}
        {@const barUnits = bar.reduce((s, l) => s + l.units, 0)}
        {@const barTotal = bar.reduce((s, l) => s + l.total, 0)}
        <!-- Pablo 2026-05-27: ingresos agrupados (Entradas/Tienda/Bar) desplegables. -->
        <div class="mt-3 border-t border-base-300 pt-3 space-y-2">
          <div class="text-sm font-semibold">💰 Ingresos del partido</div>

          <!-- Entradas — destacado grande -->
          <div class="flex items-center justify-between bg-base-200 rounded-lg p-3">
            <div>
              <div class="text-lg font-bold">{entradas.icon} Entradas</div>
              <div class="text-xs opacity-60">{fmt(entradas.units)} espectadores × {fmt(entradas.price)} €</div>
            </div>
            <div class="text-2xl font-mono font-bold text-success">+{fmt(entradas.total)} €</div>
          </div>

          <!-- Tienda — desplegable -->
          <details class="bg-base-200 rounded-lg">
            <summary class="flex items-center justify-between p-3 cursor-pointer list-none">
              <div>
                <span class="font-semibold">🛍 Tienda</span>
                <span class="text-xs opacity-60 ml-2">{fmt(tiendaUnits)} uds</span>
              </div>
              <span class="font-mono font-bold text-success">+{fmt(tiendaTotal)} €</span>
            </summary>
            <div class="px-3 pb-2">
              <table class="table table-xs">
                <tbody>
                  {#each tienda as l (l.label)}
                    <tr class={l.total === 0 ? 'opacity-40' : ''}>
                      <td>{l.icon} {l.label}</td>
                      <td class="text-right font-mono">{fmt(l.units)}</td>
                      <td class="text-right font-mono opacity-70">{fmt(l.price)} €</td>
                      <td class="text-right font-mono text-success">+{fmt(l.total)} €</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>

          <!-- Bar — desplegable -->
          <details class="bg-base-200 rounded-lg">
            <summary class="flex items-center justify-between p-3 cursor-pointer list-none">
              <div>
                <span class="font-semibold">🍺 Bar</span>
                <span class="text-xs opacity-60 ml-2">{fmt(barUnits)} consumiciones</span>
              </div>
              <span class="font-mono font-bold text-success">+{fmt(barTotal)} €</span>
            </summary>
            <div class="px-3 pb-2">
              <table class="table table-xs">
                <tbody>
                  {#each bar as l (l.label)}
                    <tr class={l.total === 0 ? 'opacity-40' : ''}>
                      <td>{l.icon} {l.label}</td>
                      <td class="text-right font-mono">{fmt(l.units)}</td>
                      <td class="text-right font-mono opacity-70">{fmt(l.price)} €</td>
                      <td class="text-right font-mono text-success">+{fmt(l.total)} €</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>

          <!-- Total — destacado grande -->
          <div class="flex items-center justify-between bg-success/15 border border-success/30 rounded-lg p-3">
            <div class="text-lg font-bold">Total del partido</div>
            <div class="text-2xl font-mono font-bold text-success">+{fmt(ec.totalEur)} €</div>
          </div>
        </div>
      {/if}

      {#if data.fixture.status === 'played' && persistedEvents.length > 0}
        <!-- Polish walkthrough fix (Pablo, post-Sprint-11): replay buttons
             only make sense when the result is hidden (today's match, not
             yet revealed). For past matches the user is reviewing a known
             result — collapse to a single "Volver al dashboard" CTA. -->
        <div class="card-actions justify-center mt-3 gap-2 flex-wrap">
          {#if resultHidden || isReplaying || finalWhistle}
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
              {:else if resultHidden}
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
          {:else}
            <!-- Past match, result already visible — single back-to-dashboard CTA. -->
            <a href="/dashboard" class="btn btn-primary">
              → Volver al dashboard
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
              <span class="badge {e.disallowed ? 'badge-error' : eventBadge(e.type)} flex-shrink-0">
                {e.disallowed ? '🚩 VAR' : eventLabel(e.type)}
              </span>
              <div class="flex-1 text-sm min-w-0">
                <span class="opacity-90 {e.disallowed ? 'line-through opacity-50' : ''}">
                  {commentary(e.type, e.minute, e.playerName)}
                </span>
                {#if e.disallowed}
                  <span class="text-error font-semibold"> · ❌ Gol anulado por el VAR</span>
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

  /* BUG-PT-4 task 13-5: confeti burst on user-club goals (CSS particles). */
  .confetti-burst {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 90;
    overflow: hidden;
  }
  .confetti-piece {
    position: absolute;
    top: 40%;
    width: 10px;
    height: 14px;
    border-radius: 2px;
    transform-origin: center;
    animation: confetti-fall 1.6s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
  }
  @keyframes confetti-fall {
    0%   { transform: translateY(-20vh) rotate(0deg) scale(0.6); opacity: 0; }
    15%  { opacity: 1; }
    100% { transform: translateY(80vh) rotate(720deg) scale(1.2); opacity: 0; }
  }

  /* BUG-PT-4 task 13-5: VAR overlay (full-screen frosted card). */
  .var-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 95;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    animation: var-fade-in 0.2s ease-out;
  }
  .var-card {
    background: hsl(var(--b1));
    color: hsl(var(--bc));
    padding: 1.5rem 2.5rem;
    border-radius: 1rem;
    text-align: center;
    box-shadow: 0 16px 64px rgba(0, 0, 0, 0.45);
    max-width: 24rem;
  }
  @keyframes var-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
