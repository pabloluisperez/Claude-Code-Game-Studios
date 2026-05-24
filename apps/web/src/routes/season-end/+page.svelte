<!--
  End-of-season recap with confetti on objective success.

  Story: MVP UX fixes — end-of-season screen
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  let { data }: { data: PageData } = $props();

  let confettiPieces = $state<Array<{ x: number; y: number; rot: number; color: string; delay: number }>>([]);

  const COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#a855f7', '#ec4899'];

  onMount(() => {
    if (data.objectiveMet === true) {
      confettiPieces = Array.from({ length: 80 }, () => ({
        x: 10 + Math.random() * 80,
        y: -10,
        rot: Math.random() * 360,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#22c55e',
        delay: Math.random() * 1.5,
      }));
    }
  });

  function positionTrophy(p: number | null): string {
    if (p === 1) return '🥇';
    if (p === 2) return '🥈';
    if (p === 3) return '🥉';
    return '🎯';
  }
</script>

<style>
  @keyframes confetti-fall {
    0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(110vh) rotate(720deg); opacity: 0.7; }
  }
  .confetti {
    position: fixed;
    width: 10px;
    height: 16px;
    pointer-events: none;
    z-index: 50;
    border-radius: 2px;
    animation: confetti-fall 3.5s linear forwards;
  }
</style>

{#if data.objectiveMet === true}
  {#each confettiPieces as c}
    <div
      class="confetti"
      style="left: {c.x}%; top: {c.y}%; background-color: {c.color}; transform: rotate({c.rot}deg); animation-delay: {c.delay}s"
    ></div>
  {/each}
{/if}

<div class="max-w-3xl mx-auto space-y-6">
  <header class="text-center">
    <div class="text-6xl">
      {positionTrophy(data.myPosition)}
    </div>
    <h1 class="text-3xl font-bold mt-2">
      Temporada {data.season.seasonNumber} finalizada
    </h1>
    <p class="opacity-70 mt-1">
      Terminamos en
      <span class="font-bold text-xl">
        {data.myPosition !== null ? `${data.myPosition}º` : '—'}
      </span>
      de {data.totalClubs}
      {#if data.myStanding}
        con <span class="font-mono">{data.myStanding.points}</span> puntos
      {/if}
    </p>
  </header>

  <!-- Verdict -->
  {#if data.objective}
    <section
      class="alert {data.objectiveMet === true ? 'alert-success' : data.objectiveMet === false ? 'alert-error' : 'alert-info'} shadow-lg"
    >
      <div>
        <div class="text-xs uppercase opacity-70">Objetivo de temporada</div>
        <div class="text-lg font-bold">{data.objective.targetLabel}</div>
        <div class="text-sm mt-1">
          {#if data.objectiveMet === true}
            🎉 ¡Objetivo cumplido! La afición está orgullosa de ti.
          {:else if data.objectiveMet === false}
            😞 Objetivo no cumplido. Hay que volver con más fuerza la próxima temporada.
          {:else}
            Resultado neutral — el board valorará tu trabajo.
          {/if}
        </div>
      </div>
    </section>
  {/if}

  <!-- Final standings -->
  <section class="card bg-base-100 shadow">
    <div class="card-body p-0">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>#</th><th>Club</th>
              <th class="text-right">PJ</th>
              <th class="text-right">G</th>
              <th class="text-right">E</th>
              <th class="text-right">P</th>
              <th class="text-right">+/-</th>
              <th class="text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {#each data.finalStandings as r, i}
              {@const gd = r.goalsFor - r.goalsAgainst}
              {@const isMine = data.myStanding && r.clubId === data.myStanding.clubId}
              <tr class="{isMine ? 'bg-primary/10 font-bold' : ''} {i < 3 ? 'border-l-4 border-l-success' : ''}">
                <td class="font-mono">{i + 1}</td>
                <td>{isMine ? '★ ' : ''}{r.clubName}</td>
                <td class="text-right font-mono">{r.played}</td>
                <td class="text-right font-mono">{r.wins}</td>
                <td class="text-right font-mono">{r.draws}</td>
                <td class="text-right font-mono">{r.losses}</td>
                <td class="text-right font-mono {gd >= 0 ? 'text-success' : 'text-error'}">
                  {gd > 0 ? '+' : ''}{gd}
                </td>
                <td class="text-right font-mono">{r.points}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <div class="text-center">
    <a href="/dashboard" class="btn btn-primary btn-lg">
      Comenzar próxima temporada →
    </a>
  </div>
</div>
