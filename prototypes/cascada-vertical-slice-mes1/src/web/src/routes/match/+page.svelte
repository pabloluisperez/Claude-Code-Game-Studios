<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Live match UI — Day 11. Client-side animated playback of server-simulated events.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { decideMatch, getState, startMatch, SLICE_PLAYTHROUGH_ID, type StateDto } from "$lib/api";

  type MatchEvent = {
    type: string;
    minute: number;
    team?: "home" | "away";
    playerId?: string;
    severity?: string;
  };
  type SessionInfo = {
    sessionId: string;
    pausedAtTick: number;
    scoreSoFar: { home: number; away: number };
    eventsSoFar: number;
  };

  let pt: StateDto | null = $state(null);
  let session: SessionInfo | null = $state(null);
  let firstHalfEvents: MatchEvent[] = $state([]);
  let renderedEvents: MatchEvent[] = $state([]);
  let secondHalfEvents: MatchEvent[] = $state([]);
  let phase: "idle" | "first_half" | "paused" | "second_half" | "complete" = $state("idle");
  let finalScore = $state({ home: 0, away: 0 });
  let error = $state<string | null>(null);
  let pendingDecision = $state(false);

  const TICK_INTERVAL_MS = 100; // visual playback speed

  async function loadState() {
    try {
      pt = await getState();
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  async function start() {
    error = null;
    try {
      session = await startMatch();
      // Pull the events accumulated so far from the session's first-half playback.
      // The slice doesn't expose them via API yet — we get them from the score
      // and reconstruct by hitting state. For now, just show the score.
      firstHalfEvents = [
        { type: "match_start", minute: 0 },
      ];
      // Synthetic events: the slice could expose snapshot.state.events via a
      // /api/matches/:id GET — for now we render a status line until pause.
      phase = "first_half";
      animateFirstHalf();
    } catch (err) {
      error = `Start failed: ${(err as Error).message}`;
    }
  }

  async function animateFirstHalf() {
    // Step through 45 ticks; this is purely visual since server already simulated.
    for (let t = 1; t <= 45; t++) {
      await sleep(TICK_INTERVAL_MS);
      // No-op tick — server has the truth; we just show ticking clock.
      void t;
    }
    if (session) {
      renderedEvents = [
        { type: "match_start", minute: 0 },
        { type: "half_time", minute: 45 },
      ];
    }
    phase = "paused";
  }

  async function decideAndResume(useSub: boolean) {
    if (!session) return;
    pendingDecision = true;
    try {
      // Slice simplification: the substitution decision payload is symbolic.
      // Production would let the player pick out + in from the bench.
      const decision = useSub
        ? {
            side: "home" as const,
            playerOutId: "rpc-p10", // hardcoded — slice
            playerInStats: {
              id: "rpc-bench-1",
              name: "Suplente",
              position: "FWD",
              skill: 60,
              fitness: 95,
              morale: 75,
              form: 65,
              stamina: 80,
              speed: 75,
              finishing: 65,
            },
          }
        : null;
      const result = (await decideMatch({
        sessionId: session.sessionId,
        decision,
        playerDecisionsForCascade: {
          training_intensity: 50,
          ticket_price_index: 50,
        },
      })) as { outcome: { homeScore: number; awayScore: number; events: MatchEvent[] } };

      phase = "second_half";
      // Animate second half ticks
      secondHalfEvents = result.outcome.events.filter((e) => e.minute > 45);
      const totalTicks = 45;
      for (let t = 46; t <= 90; t++) {
        await sleep(TICK_INTERVAL_MS);
        const eventsThisTick = secondHalfEvents.filter((e) => e.minute === t);
        if (eventsThisTick.length > 0) {
          renderedEvents = [...renderedEvents, ...eventsThisTick];
        }
        void totalTicks;
      }
      finalScore = { home: result.outcome.homeScore, away: result.outcome.awayScore };
      renderedEvents = [...renderedEvents, { type: "full_time", minute: 90 }];
      phase = "complete";
    } catch (err) {
      error = `Decision failed: ${(err as Error).message}`;
    } finally {
      pendingDecision = false;
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  function formatEvent(e: MatchEvent): string {
    if (e.type === "match_start") return "Comienza el partido.";
    if (e.type === "half_time") return "─── DESCANSO ───";
    if (e.type === "full_time") return "─── FINAL ───";
    if (e.type === "goal")
      return `⚽ ${e.minute}' GOL ${e.team === "home" ? "(local)" : "(visitante)"} — ${e.playerId ?? ""}`;
    if (e.type === "yellow_card")
      return `🟨 ${e.minute}' Amarilla ${e.team === "home" ? "(local)" : "(visitante)"}`;
    if (e.type === "injury")
      return `🏥 ${e.minute}' Lesión ${e.severity === "major" ? "grave" : "leve"}`;
    return `${e.minute}' ${e.type}`;
  }

  onMount(loadState);

  $effect(() => {
    untrack(() => {
      if (phase === "first_half") void 0;
    });
  });
</script>

<h1>Partido en directo</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad);">{error}</div>
{/if}

{#if phase === "idle"}
  <div class="panel">
    <h2>¿Empezar partido?</h2>
    <p class="dim">
      Pulsa "Iniciar" para jugar el partido de esta semana. Pausará en el
      descanso (minuto 45) para que decidas si haces una sustitución.
    </p>
    <button class="primary" onclick={start}>Iniciar partido</button>
  </div>
{/if}

{#if phase === "first_half"}
  <div class="panel scoreboard">
    <h2>Primera parte en juego…</h2>
    <p>⏱ Esperando datos del servidor (animación de 45s)…</p>
  </div>
{/if}

{#if phase === "paused"}
  <div class="panel">
    <h2>⏸ Descanso · {session?.scoreSoFar.home}-{session?.scoreSoFar.away}</h2>
    <p>El partido está en pausa. ¿Quieres meter un cambio para la segunda parte?</p>
    <div class="actions">
      <button class="primary" disabled={pendingDecision} onclick={() => decideAndResume(true)}>
        Meter delantero suplente
      </button>
      <button disabled={pendingDecision} onclick={() => decideAndResume(false)}>
        Seguir con el mismo XI
      </button>
    </div>
  </div>
{/if}

{#if phase === "second_half"}
  <div class="panel scoreboard">
    <h2>Segunda parte</h2>
  </div>
{/if}

{#if phase === "complete"}
  <div class="panel" style="border-color: var(--accent);">
    <h2>Final · {finalScore.home}-{finalScore.away}</h2>
    <p class="dim">El partido ha terminado. Vuelve a inicio para revisar las cascadas.</p>
    <a href="/" class="button-link">← Volver al panel</a>
  </div>
{/if}

{#if renderedEvents.length > 0}
  <div class="panel events">
    <h2>Eventos</h2>
    <ul>
      {#each renderedEvents as e}
        <li class:goal={e.type === "goal"} class:yellow={e.type === "yellow_card"} class:injury={e.type === "injury"}>
          {formatEvent(e)}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .scoreboard h2 { font-size: var(--text-xl); }
  .actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }
  .events ul { list-style: none; font-family: var(--font-mono); font-size: var(--text-sm); }
  .events ul li { padding: var(--space-1) 0; border-bottom: 1px solid var(--border); }
  .events ul li.goal { color: var(--accent); font-weight: 600; }
  .events ul li.yellow { color: var(--warn); }
  .events ul li.injury { color: var(--bad); }
  .button-link { display: inline-block; margin-top: var(--space-3); padding: var(--space-2) var(--space-4); border: 1px solid var(--border); border-radius: 6px; }
</style>
