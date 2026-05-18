<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Calendar — fixtures + announced events.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getFixturesForWeek, getState, type FixtureDto, type StateDto } from "$lib/api";

  interface CalendarAnnouncement {
    week: number;
    title: string;
    body: string;
  }

  // Mirror of CALENDAR_EVENTS in src/sim/event-system.ts.
  // Slice trade-off: hardcoded here to avoid importing sim code into the web bundle.
  const CALENDAR_ANNOUNCEMENTS: readonly CalendarAnnouncement[] = [
    {
      week: 3,
      title: "Fiesta del barrio el domingo",
      body: "El director comercial avisa: la asistencia puede caer si el partido coincide.",
    },
    {
      week: 3,
      title: "Semana de derbi",
      body: "Monte Real es el rival histórico. Una victoria aquí pesa el doble en fan_momentum.",
    },
    {
      week: 4,
      title: "Visitamos al líder",
      body: "Equipo de Primera con presupuesto 3× el nuestro. El staff sugiere bajar la intensidad esta semana.",
    },
  ];

  interface WeekRow {
    week: number;
    label: string;
    fixtures: FixtureDto[];
    isCurrent: boolean;
    announcements: CalendarAnnouncement[];
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
          announcements: CALENDAR_ANNOUNCEMENTS.filter((a) => a.week === w),
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

    {#if week.announcements.length > 0}
      <div class="announcements">
        <h3>📌 Avisos para esta semana</h3>
        <ul>
          {#each week.announcements as a}
            <li>
              <strong>{a.title}</strong>
              <p class="dim">{a.body}</p>
            </li>
          {/each}
        </ul>
      </div>
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
  .announcements { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border); }
  .announcements h3 { font-size: var(--text-sm); color: var(--warn); margin-bottom: var(--space-2); }
  .announcements ul { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
  .announcements li strong { font-size: var(--text-sm); }
  .announcements .dim { font-size: var(--text-sm); margin-top: 2px; }
</style>
