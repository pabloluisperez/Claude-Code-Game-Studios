<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Live match UI — Day 13 polish (P-02 fix: first-half events visible).
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    decideMatch,
    getState,
    startMatch,
    type MatchEventDto,
    type StateDto,
  } from "$lib/api";

  type SessionInfo = {
    sessionId: string;
    pausedAtTick: number;
    scoreSoFar: { home: number; away: number };
    eventsSoFar: number;
    firstHalfEvents: MatchEventDto[];
    homeClubName: string;
    awayClubName: string;
    playerClubSide: "home" | "away";
  };

  let pt: StateDto | null = $state(null);
  let session: SessionInfo | null = $state(null);
  let renderedEvents: MatchEventDto[] = $state([]);
  let currentMinute = $state(0);
  let homeGoals = $state(0);
  let awayGoals = $state(0);
  let phase: "idle" | "first_half" | "paused" | "second_half" | "complete" = $state("idle");
  let error = $state<string | null>(null);
  let pendingDecision = $state(false);

  const TICK_INTERVAL_MS = 100;

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
      renderedEvents = [];
      currentMinute = 0;
      homeGoals = 0;
      awayGoals = 0;
      phase = "first_half";
      await animateRange(1, 45, session.firstHalfEvents);
      phase = "paused";
    } catch (err) {
      error = `Start failed: ${(err as Error).message}`;
    }
  }

  async function animateRange(fromTick: number, toTick: number, events: MatchEventDto[]) {
    for (let t = fromTick; t <= toTick; t++) {
      currentMinute = t;
      const eventsThisTick = events.filter((e) => e.minute === t);
      for (const e of eventsThisTick) {
        renderedEvents = [...renderedEvents, e];
        if (e.type === "goal") {
          if (e.team === "home") homeGoals++;
          else if (e.team === "away") awayGoals++;
        }
      }
      await sleep(TICK_INTERVAL_MS);
    }
  }

  async function decideAndResume(useSub: boolean) {
    if (!session) return;
    pendingDecision = true;
    try {
      const decision = useSub
        ? {
            side: session.playerClubSide,
            playerOutId: `${session.playerClubSide === "home" ? session.homeClubName : session.awayClubName}-p10`,
            playerInStats: {
              id: "bench-sub-1",
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
      })) as { outcome: { homeScore: number; awayScore: number; events: MatchEventDto[] } };

      phase = "second_half";
      const secondHalfEvents = result.outcome.events.filter((e) => e.minute > 45);
      await animateRange(46, 90, secondHalfEvents);
      homeGoals = result.outcome.homeScore;
      awayGoals = result.outcome.awayScore;
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

  function formatEvent(e: MatchEventDto): string {
    if (e.type === "match_start") return "Comienza el partido.";
    if (e.type === "half_time") return "─── DESCANSO ───";
    if (e.type === "full_time") return "─── FINAL ───";
    if (e.type === "goal")
      return `⚽ ${e.minute}' GOL ${e.team === "home" ? "(local)" : "(visitante)"}${e.playerId ? ` — ${e.playerId}` : ""}`;
    if (e.type === "yellow_card")
      return `🟨 ${e.minute}' Amarilla ${e.team === "home" ? "(local)" : "(visitante)"}`;
    if (e.type === "injury")
      return `🏥 ${e.minute}' Lesión ${e.severity === "major" ? "grave" : "leve"}`;
    return `${e.minute}' ${e.type}`;
  }

  onMount(loadState);
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

{#if phase !== "idle" && session}
  <div class="panel scoreboard">
    <div class="score-line">
      <strong>{session.homeClubName.toUpperCase()}</strong>
      <span class="score">{homeGoals}-{awayGoals}</span>
      <strong>{session.awayClubName.toUpperCase()}</strong>
    </div>
    <div class="minute-line">
      {#if phase === "first_half"}
        ⏱ <strong>{currentMinute}'</strong> · Primera parte
      {:else if phase === "paused"}
        ⏸ <strong>45'</strong> · Descanso
      {:else if phase === "second_half"}
        ⏱ <strong>{currentMinute}'</strong> · Segunda parte
      {:else}
        ✅ <strong>FINAL</strong>
      {/if}
    </div>
  </div>
{/if}

{#if phase === "paused"}
  <div class="panel">
    <h2>Descanso</h2>
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

{#if phase === "complete"}
  <div class="panel" style="border-color: var(--accent);">
    <h2>Final · {homeGoals}-{awayGoals}</h2>
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
  .scoreboard { text-align: center; padding: var(--space-5); }
  .score-line { display: flex; justify-content: center; align-items: center; gap: var(--space-4); font-size: var(--text-lg); }
  .score-line .score { font-size: 40px; font-variant-numeric: tabular-nums; }
  .minute-line { color: var(--fg-dim); margin-top: var(--space-2); }
  .minute-line strong { color: var(--fg); font-variant-numeric: tabular-nums; }
  .actions { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-3); }
  .events ul { list-style: none; font-family: var(--font-mono); font-size: var(--text-sm); }
  .events ul li { padding: var(--space-1) 0; border-bottom: 1px solid var(--border); }
  .events ul li.goal { color: var(--accent); font-weight: 600; }
  .events ul li.yellow { color: var(--warn); }
  .events ul li.injury { color: var(--bad); }
  .button-link { display: inline-block; margin-top: var(--space-3); padding: var(--space-2) var(--space-4); border: 1px solid var(--border); border-radius: 6px; }
</style>
