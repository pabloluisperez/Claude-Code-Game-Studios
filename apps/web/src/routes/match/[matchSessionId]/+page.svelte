<!--
  Match-live view — scoreboard + event feed + pause modal.
  Wired to Socket.IO `/match` namespace (real-time updates).

  Story: HUD-UI-006
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import { page } from '$app/stores';

  const sessionId = $derived($page.params.matchSessionId);

  // Placeholder state — production load via $lib/sockets + page load.
  let homeScore = $state(1);
  let awayScore = $state(0);
  let currentMinute = $state(45);
  let isPaused = $state(true);
  let pauseType = $state<'substitution_window' | 'injury_pause' | null>('substitution_window');
  let countdownSeconds = $state(60);

  interface FeedEvent {
    minute: number;
    type: 'goal' | 'yellow_card' | 'red_card' | 'injury' | 'var_review' | 'goal_disallowed';
    team: 'home' | 'away';
    playerName?: string;
    reason?: string;
  }

  // AC-MATCH-30: substitution_window events filtered OUT of the visible feed.
  const events: FeedEvent[] = [
    { minute: 12, type: 'yellow_card', team: 'home', playerName: 'C. Marín' },
    { minute: 23, type: 'goal',        team: 'home', playerName: 'P. Jiménez' },
    { minute: 28, type: 'var_review',  team: 'home', reason: 'confirmed' },
    { minute: 36, type: 'injury',      team: 'away', playerName: 'A. Defensor' },
  ];

  function eventBadge(t: FeedEvent['type']): string {
    switch (t) {
      case 'goal':            return 'badge-success';
      case 'goal_disallowed': return 'badge-warning';
      case 'yellow_card':     return 'badge-warning';
      case 'red_card':        return 'badge-error';
      case 'injury':          return 'badge-error';
      case 'var_review':      return 'badge-info';
    }
  }

  function eventLabel(t: FeedEvent['type']): string {
    switch (t) {
      case 'goal':            return '⚽ Gol';
      case 'goal_disallowed': return '🚫 Gol anulado';
      case 'yellow_card':     return '🟨 Amarilla';
      case 'red_card':        return '🟥 Roja';
      case 'injury':          return '🩹 Lesión';
      case 'var_review':      return '📺 VAR';
    }
  }

  function continueDefault() {
    isPaused = false;
    pauseType = null;
  }
</script>

<div class="space-y-6 max-w-4xl mx-auto">
  <p class="opacity-60 text-xs">Sesión: <span class="font-mono">{sessionId}</span></p>

  <!-- Scoreboard -->
  <section class="card bg-base-200 shadow">
    <div class="card-body">
      <div class="flex items-center justify-around text-center">
        <div>
          <div class="text-xs opacity-60">CASA</div>
          <div class="text-xl font-semibold">Real Pueblo</div>
        </div>
        <div class="text-5xl font-mono font-bold">
          {homeScore} <span class="opacity-50">-</span> {awayScore}
        </div>
        <div>
          <div class="text-xs opacity-60">FUERA</div>
          <div class="text-xl font-semibold">CD Calderón</div>
        </div>
      </div>
      <div class="text-center text-sm opacity-60 mt-2">
        Minuto <span class="font-mono">{currentMinute}'</span>
      </div>
    </div>
  </section>

  <!-- Event feed -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Eventos del partido</h2>
      <div class="space-y-2">
        {#each events as e}
          <div class="flex items-center gap-3 p-2 bg-base-200 rounded">
            <div class="font-mono text-sm opacity-70 w-12">{e.minute}'</div>
            <span class="badge {eventBadge(e.type)}">{eventLabel(e.type)}</span>
            <div class="flex-1 text-sm">
              <span class="opacity-60 text-xs uppercase">{e.team}</span>
              {#if e.playerName}<span class="font-semibold ml-2">{e.playerName}</span>{/if}
              {#if e.reason}<span class="opacity-60 ml-2 text-xs">{e.reason}</span>{/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Pause modal -->
  {#if isPaused && pauseType}
    <div class="modal modal-open">
      <div class="modal-box">
        <h3 class="font-bold text-lg">
          {pauseType === 'substitution_window' ? 'Ventana de sustitución' : 'Pausa por lesión'}
        </h3>
        <p class="text-sm opacity-70 mt-2">
          {pauseType === 'substitution_window'
            ? 'Decide si quieres realizar sustituciones antes de continuar.'
            : 'Un jugador del equipo está lesionado. ¿Sustituir o jugar con 10?'}
        </p>

        <div class="flex flex-col gap-2 mt-4">
          <button class="btn btn-outline" type="button">Realizar sustitución</button>
          {#if pauseType === 'injury_pause'}
            <button class="btn btn-outline" type="button">Jugar con 10</button>
          {/if}
          <button class="btn btn-primary" type="button" onclick={continueDefault}>
            Continuar (por defecto) · {countdownSeconds}s
          </button>
        </div>

        <p class="text-xs opacity-60 mt-3">
          Si no decides, se aplicará la opción por defecto pasados 24h (timeout).
        </p>
      </div>
    </div>
  {/if}
</div>
