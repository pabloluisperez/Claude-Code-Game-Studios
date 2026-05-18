<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Calendar — fixtures + announced events.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getFixturesForWeek, getState, type FixtureDto, type StateDto } from "$lib/api";

  interface WeekRow {
    week: number;
    label: string;
    fixtures: FixtureDto[];
    isCurrent: boolean;
  }

  let weeks: WeekRow[] = $state([]);
  let pt: StateDto | null = $state(null);
  let error: string | null = $state(null);

  async function load() {
    try {
      pt = await getState();
      const current = pt.playthrough.currentWeek;
      const out: WeekRow[] = [];
      for (let w = Math.max(1, current - 1); w <= current + 3; w++) {
        const fixtures = await getFixturesForWeek(w);
        out.push({
          week: w,
          label: `Semana ${w}`,
          fixtures,
          isCurrent: w === current,
        });
      }
      weeks = out;
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  onMount(load);
</script>

<h1>Calendario</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad);">{error}</div>
{/if}

{#each weeks as week}
  <div class="panel week-row" class:current={week.isCurrent}>
    <h2>
      {week.label}
      {#if week.isCurrent}<span class="badge">actual</span>{/if}
    </h2>
    {#if week.fixtures.length === 0}
      <p class="dim">Sin partidos.</p>
    {:else}
      <ul class="fixtures">
        {#each week.fixtures.filter((f) => f.homeClubId === pt?.playthrough.managerClubId || f.awayClubId === pt?.playthrough.managerClubId) as f}
          <li>
            {f.homeClubId === pt?.playthrough.managerClubId ? "🏠 LOCAL" : "🛫 VISITANTE"}
            ·
            vs <strong>{f.homeClubId === pt?.playthrough.managerClubId ? f.awayClubId : f.homeClubId}</strong>
            {#if f.status === "played"}
              · <span class="good">{f.homeScore}-{f.awayScore}</span>
            {:else}
              · <span class="dim">pendiente</span>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="dim">+ {week.fixtures.length - 1} otros partidos de la liga.</p>
    {/if}
  </div>
{/each}

<style>
  .week-row { margin-bottom: var(--space-3); }
  .week-row.current { border-color: var(--accent); }
  .badge {
    display: inline-block;
    background: var(--accent);
    color: var(--bg);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: var(--text-xs);
    margin-left: var(--space-2);
    vertical-align: middle;
  }
  ul.fixtures { list-style: none; }
  ul.fixtures li { padding: var(--space-1) 0; font-size: var(--text-sm); }
</style>
