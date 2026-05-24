<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Squad — read-only standings view (slice doesn't expose individual players in UI).
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getStandings, getState, type StandingsRow, type StateDto } from "$lib/api";

  let standings: StandingsRow[] = $state([]);
  let pt: StateDto | null = $state(null);
  let error: string | null = $state(null);

  async function load() {
    try {
      [standings, pt] = await Promise.all([getStandings(), getState()]);
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  onMount(load);
</script>

<h1>Tabla de la liga</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad);">{error}</div>
{:else}
  <div class="panel">
    <table class="standings">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Club</th>
          <th>PJ</th>
          <th>G</th>
          <th>E</th>
          <th>P</th>
          <th>GF</th>
          <th>GC</th>
          <th>DG</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {#each standings as row}
          <tr class:player={row.clubId === pt?.playthrough.managerClubId}>
            <td>{row.position}</td>
            <td>{row.clubName}</td>
            <td>{row.played}</td>
            <td>{row.wins}</td>
            <td>{row.draws}</td>
            <td>{row.losses}</td>
            <td>{row.goalsFor}</td>
            <td>{row.goalsAgainst}</td>
            <td>{row.goalDifference >= 0 ? "+" : ""}{row.goalDifference}</td>
            <td><strong>{row.points}</strong></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  table.standings { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: var(--text-sm); }
  table.standings th, table.standings td { padding: var(--space-1) var(--space-2); text-align: right; border-bottom: 1px solid var(--border); }
  table.standings th { color: var(--fg-dim); font-weight: normal; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; }
  table.standings th:nth-child(2), table.standings td:nth-child(2) { text-align: left; }
  table.standings tr.player { background: var(--bg-3); }
  table.standings tr.player td { color: var(--accent); font-weight: 600; }
</style>
