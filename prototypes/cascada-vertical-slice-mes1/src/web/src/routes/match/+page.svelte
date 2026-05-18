<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Live match UI — Day 13 polish + dramatic event flow (modal + confetti + VAR theater).
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

  type DramaticModal =
    | { kind: "goal"; event: MatchEventDto; isPlayerTeam: boolean; varPhase: "none" | "reviewing" | "upheld" | "overturned" }
    | { kind: "injury"; event: MatchEventDto; isPlayerTeam: boolean }
    | { kind: "highlight"; event: MatchEventDto };

  let pt: StateDto | null = $state(null);
  let session: SessionInfo | null = $state(null);
  let renderedEvents: MatchEventDto[] = $state([]);
  let currentMinute = $state(0);
  let homeGoals = $state(0);
  let awayGoals = $state(0);
  let phase: "idle" | "first_half" | "paused" | "second_half" | "complete" = $state("idle");
  let error = $state<string | null>(null);
  let pendingDecision = $state(false);
  let modal: DramaticModal | null = $state(null);
  let confettiActive = $state(false);
  let teaser: { text: string; severity: "warn" | "good" | "bad" } | null = $state(null);

  const TICK_INTERVAL_MS = 100;
  const TEASER_HOLD_MS = 900;        // tension buildup before the reveal
  const MODAL_GOAL_HOLD_MS = 1800;
  const MODAL_VAR_REVIEW_MS = 2200;
  const MODAL_VAR_RESOLVE_MS = 1500;
  const MODAL_INJURY_HOLD_MS = 1500;
  const VAR_PROBABILITY = 0.30;
  const VAR_OVERTURN_PROBABILITY = 0.10; // 10% of VARs overturn — overturned goals stay scored for slice (visual only)

  // Teaser pools — neutral wording so they don't reveal the outcome
  const GOAL_TEASERS = [
    "⚡ ¡Algo está pasando!",
    "👀 Atento al área...",
    "🔥 Se calienta el partido",
    "💥 ¡Hay peligro!",
    "😱 ¡Ojo, ojo, ojo!",
    "⚠ Atento al ataque",
    "🎯 Llega con peligro",
  ];
  const INJURY_TEASERS = [
    "🩹 Un jugador en el suelo...",
    "😬 Espera, algo no va bien",
    "⚠ Pausa para asistencia",
    "🤕 Algo se ha torcido",
  ];

  function pickRandom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
  }

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

  function isDramatic(e: MatchEventDto): boolean {
    if (e.type === "goal") return true;
    if (e.type === "injury" && e.severity === "major") return true;
    return false;
  }

  async function animateRange(fromTick: number, toTick: number, events: MatchEventDto[]) {
    for (let t = fromTick; t <= toTick; t++) {
      currentMinute = t;
      const eventsThisTick = events.filter((e) => e.minute === t);
      const dramatic = eventsThisTick.filter(isDramatic);
      const normal = eventsThisTick.filter((e) => !isDramatic(e));

      // Add non-dramatic events immediately
      for (const e of normal) {
        renderedEvents = [...renderedEvents, e];
      }

      // Handle dramatic events with pause-and-reveal
      for (const e of dramatic) {
        await showDramaticEvent(e);
        renderedEvents = [...renderedEvents, e];
      }

      await sleep(TICK_INTERVAL_MS);
    }
  }

  async function showDramaticEvent(e: MatchEventDto): Promise<void> {
    const isPlayerTeam = e.team === session?.playerClubSide;

    if (e.type === "goal") {
      // 1. Teaser buildup — tension before reveal (neutral wording — doesn't telegraph the outcome)
      teaser = { text: pickRandom(GOAL_TEASERS), severity: "warn" };
      await sleep(TEASER_HOLD_MS);

      // 2. Update score + open the dramatic modal
      if (e.team === "home") homeGoals++;
      else if (e.team === "away") awayGoals++;

      const goesToVar = Math.random() < VAR_PROBABILITY;
      modal = {
        kind: "goal",
        event: e,
        isPlayerTeam,
        varPhase: "none",
      };
      if (isPlayerTeam) {
        confettiActive = true;
        // Confetti auto-clears after a few seconds
        setTimeout(() => (confettiActive = false), 3500);
      }
      teaser = null;
      await sleep(MODAL_GOAL_HOLD_MS);

      // 3. Optional VAR theater
      if (goesToVar) {
        modal = { ...modal, varPhase: "reviewing" } as DramaticModal;
        await sleep(MODAL_VAR_REVIEW_MS);
        const overturned = Math.random() < VAR_OVERTURN_PROBABILITY;
        modal = { ...modal, varPhase: overturned ? "overturned" : "upheld" } as DramaticModal;
        await sleep(MODAL_VAR_RESOLVE_MS);
      }
    } else if (e.type === "injury") {
      teaser = { text: pickRandom(INJURY_TEASERS), severity: "bad" };
      await sleep(TEASER_HOLD_MS);
      modal = { kind: "injury", event: e, isPlayerTeam };
      teaser = null;
      await sleep(MODAL_INJURY_HOLD_MS);
    }

    modal = null;
  }

  function dismissModal(): void {
    modal = null;
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
      // Final score from server (in case of edge cases)
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

  // Confetti: 60 emoji rain pieces with random delays/positions
  const confettiPieces = Array.from({ length: 60 }, (_, i) => ({
    emoji: ["⚽", "🎉", "🎊", "🟢", "✨"][i % 5],
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2.5 + Math.random() * 1.5,
    drift: (Math.random() - 0.5) * 80,
  }));

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

<!-- Tension teaser — appears briefly before the dramatic modal -->
{#if teaser}
  <div
    class="teaser-banner"
    class:teaser-warn={teaser.severity === "warn"}
    class:teaser-bad={teaser.severity === "bad"}
    class:teaser-good={teaser.severity === "good"}
    aria-live="polite"
  >
    {teaser.text}
  </div>
{/if}

<!-- Dramatic event modal -->
{#if modal}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Evento del partido"
    onclick={dismissModal}
    onkeydown={(e) => e.key === "Escape" && dismissModal()}
    tabindex="-1"
  >
    {#if modal.kind === "goal"}
      <div class="modal-card goal-card" class:player-goal={modal.isPlayerTeam} class:rival-goal={!modal.isPlayerTeam}>
        {#if modal.varPhase === "reviewing"}
          <div class="var-spinner">🎯</div>
          <h2>VAR REVISANDO</h2>
          <p class="dim">Revisión del gol del minuto {modal.event.minute}'…</p>
        {:else if modal.varPhase === "upheld"}
          <div class="goal-icon">⚽✅</div>
          <h2>GOL CONFIRMADO</h2>
          <p>La acción es legal — el gol sube al marcador.</p>
        {:else if modal.varPhase === "overturned"}
          <div class="goal-icon">⚽❌</div>
          <h2>VAR ANULA EL GOL</h2>
          <p>Fuera de juego milimétrico. (Visual del slice — el marcador no cambia.)</p>
        {:else}
          <div class="goal-icon mega">⚽</div>
          <h2 class="mega-title">¡GOOOOL!</h2>
          <p class="mega-sub">
            {modal.isPlayerTeam ? "Real Pueblo CF" : "Rival"} · minuto {modal.event.minute}'
          </p>
          <p class="score-flash">{homeGoals}-{awayGoals}</p>
        {/if}
      </div>
    {:else if modal.kind === "injury"}
      <div class="modal-card injury-card">
        <div class="goal-icon">🏥</div>
        <h2>LESIÓN</h2>
        <p>
          {modal.isPlayerTeam ? "Un jugador de Real Pueblo" : "El rival"} cae al
          césped · minuto {modal.event.minute}' ·
          <strong>{modal.event.severity === "major" ? "grave" : "leve"}</strong>
        </p>
      </div>
    {/if}
  </div>
{/if}

<!-- Confetti rain — own-team goals only -->
{#if confettiActive}
  <div class="confetti-container" aria-hidden="true">
    {#each confettiPieces as p}
      <span
        class="confetti-piece"
        style="left: {p.left}%; animation-delay: {p.delay}s; animation-duration: {p.duration}s; --drift: {p.drift}px;"
      >
        {p.emoji}
      </span>
    {/each}
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

  /* ── Tension teaser banner (drama buildup) ──────────────────── */
  .teaser-banner {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-2);
    border-radius: 999px;
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: 0.01em;
    z-index: 105;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
    animation: teaser-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    border: 2px solid var(--border);
    white-space: nowrap;
    max-width: calc(100vw - var(--space-4) * 2);
  }
  .teaser-banner.teaser-warn { border-color: var(--warn); color: var(--warn); }
  .teaser-banner.teaser-bad { border-color: var(--bad); color: var(--bad); }
  .teaser-banner.teaser-good { border-color: var(--accent); color: var(--accent); }

  /* ── Dramatic modal ──────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    /* No backdrop-filter — confetti must stay crisp on top */
    animation: fade-in 0.2s ease-out;
  }
  .modal-card {
    background: var(--bg-2);
    border: 2px solid var(--border);
    border-radius: 14px;
    padding: var(--space-6);
    text-align: center;
    max-width: 90vw;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    animation: pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    z-index: 120;     /* above confetti container (110) so the message reads clearly */
  }
  .goal-card.player-goal { border-color: var(--accent); box-shadow: 0 0 60px rgba(74, 222, 128, 0.4); }
  .goal-card.rival-goal { border-color: var(--bad); }
  .injury-card { border-color: var(--bad); }
  .goal-icon { font-size: 64px; line-height: 1; margin-bottom: var(--space-2); }
  .goal-icon.mega { font-size: 96px; animation: bounce 0.6s ease-out; }
  .mega-title { font-size: 48px; letter-spacing: -0.02em; margin-bottom: var(--space-2); }
  .player-goal .mega-title { color: var(--accent); }
  .rival-goal .mega-title { color: var(--bad); }
  .mega-sub { font-size: var(--text-lg); color: var(--fg-dim); margin-bottom: var(--space-3); }
  .score-flash {
    font-size: 56px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--fg);
    letter-spacing: 0.05em;
  }
  .var-spinner {
    font-size: 64px;
    line-height: 1;
    margin-bottom: var(--space-3);
    animation: spin 1.4s linear infinite;
  }

  /* ── Confetti rain ──────────────────────────────────────────── */
  /* z-index 110 = ABOVE the modal backdrop (100) so confetti is crisp,
     not dimmed/blurred. Modal card sits at 120 — confetti rains around it. */
  .confetti-container {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 110;
    overflow: hidden;
  }
  .confetti-piece {
    position: absolute;
    top: -40px;
    font-size: 28px;
    animation: confetti-fall linear forwards;
    animation-fill-mode: forwards;
  }

  /* ── Animations ──────────────────────────────────────────── */
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pop-in {
    0% { transform: scale(0.7); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes bounce {
    0% { transform: scale(0.3) rotate(-20deg); }
    60% { transform: scale(1.2) rotate(10deg); }
    100% { transform: scale(1) rotate(0); }
  }
  @keyframes spin {
    from { transform: rotate(0); }
    to { transform: rotate(360deg); }
  }
  @keyframes confetti-fall {
    0% {
      transform: translate(0, 0) rotate(0);
      opacity: 1;
    }
    100% {
      transform: translate(var(--drift, 0px), 110vh) rotate(720deg);
      opacity: 0;
    }
  }
  @keyframes teaser-pop {
    0% { transform: translate(-50%, -120%) scale(0.6); opacity: 0; }
    60% { transform: translate(-50%, 0) scale(1.05); opacity: 1; }
    100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
  }
</style>
