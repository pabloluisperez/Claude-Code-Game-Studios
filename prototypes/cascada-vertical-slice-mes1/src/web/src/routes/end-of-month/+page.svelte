<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  End-of-month resolution screen — shown when currentWeek > 4.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    getStandings,
    getStaffMessages,
    getState,
    type StandingsRow,
    type StateDto,
    type StaffMessageDto,
  } from "$lib/api";
  import {
    formatAttendance,
    formatFanMomentum,
    formatFitness,
    formatInjuryRisk,
    severityClass,
    STADIUM_CAPACITY_DEFAULT,
  } from "$lib/format";

  interface ManagerSnapshot {
    level: number;
    xp: number;
    xpToNextLevel: number;
    skills: { tactics: number; finance: number };
    pendingSkillPoints: number;
    careerEvents: { id: string; title: string; body: string; week: number; acknowledged: boolean }[];
  }

  let pt: StateDto | null = $state(null);
  let standings: StandingsRow[] = $state([]);
  let messages: StaffMessageDto[] = $state([]);
  let error: string | null = $state(null);

  async function load() {
    try {
      [pt, standings, messages] = await Promise.all([
        getState(),
        getStandings(),
        getStaffMessages(),
      ]);
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  onMount(load);

  const playerRow = $derived(
    standings.find((r) => r.clubId === pt?.playthrough.managerClubId),
  );
  const mgr = $derived.by(() => {
    if (!pt?.snapshot?.managerState) return null;
    return pt.snapshot.managerState as ManagerSnapshot;
  });
  const blockingCount = $derived(
    messages.filter((m) => m.priority === "BLOCKING").length,
  );
  const advisoryCount = $derived(
    messages.filter((m) => m.priority === "ADVISORY").length,
  );
</script>

<h1>📅 Cierre de mes</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad);">{error}</div>
{:else if !pt}
  <p class="dim">Cargando…</p>
{:else if pt.playthrough.currentWeek <= 4}
  <div class="panel" style="border-color: var(--warn);">
    <h2>El mes todavía no ha terminado</h2>
    <p class="dim">Vas por la semana {pt.playthrough.currentWeek}. Vuelve aquí cuando hayas avanzado más allá de la semana 4.</p>
    <a class="button-link" href="/">← Volver al panel</a>
  </div>
{:else}
  <!-- Big summary -->
  <div class="panel summary">
    <h2>Mes 1 cerrado</h2>
    <p class="dim">Real Pueblo CF · Segunda División</p>

    <div class="big-metrics">
      <div>
        <div class="metric-label">Posición final</div>
        <div class="metric-value" class:bad={(playerRow?.position ?? 20) >= 17}>
          {playerRow?.position ?? "—"}º <span class="dim">de 20</span>
        </div>
      </div>
      <div>
        <div class="metric-label">Puntos</div>
        <div class="metric-value">{playerRow?.points ?? 0}</div>
      </div>
      <div>
        <div class="metric-label">PJ-G-E-P</div>
        <div class="metric-value">
          {playerRow?.played ?? 0}-{playerRow?.wins ?? 0}-{playerRow?.draws ?? 0}-{playerRow?.losses ?? 0}
        </div>
      </div>
      <div>
        <div class="metric-label">Goles</div>
        <div class="metric-value">
          {playerRow?.goalsFor ?? 0}:{playerRow?.goalsAgainst ?? 0}
        </div>
      </div>
    </div>
  </div>

  <!-- WorldState pulse -->
  {@const eomFit = pt.snapshot?.state.team_fitness !== undefined ? formatFitness(pt.snapshot.state.team_fitness) : null}
  {@const eomFan = pt.snapshot?.state.fan_momentum !== undefined ? formatFanMomentum(pt.snapshot.state.fan_momentum) : null}
  {@const eomAtt = pt.snapshot?.state.fan_attendance !== undefined ? formatAttendance(pt.snapshot.state.fan_attendance, STADIUM_CAPACITY_DEFAULT) : null}
  {@const eomInj = pt.snapshot?.state.injury_risk !== undefined ? formatInjuryRisk(pt.snapshot.state.injury_risk) : null}

  <div class="panel">
    <h2>Pulso del club</h2>
    <table>
      <tbody>
        <tr>
          <td>Estado físico</td>
          <td class="value {eomFit ? severityClass(eomFit.severity) : 'dim'}">
            {eomFit?.text ?? "—"}
          </td>
        </tr>
        <tr>
          <td>Afición</td>
          <td class="value {eomFan ? severityClass(eomFan.severity) : 'dim'}">
            {eomFan?.text ?? "—"}
          </td>
        </tr>
        <tr>
          <td>Asistencia (último partido)</td>
          <td class="value {eomAtt ? severityClass(eomAtt.qualitative.severity) : 'dim'}">
            {#if eomAtt}
              {eomAtt.absolute.toLocaleString("es")} personas
              <span class="dim">· {eomAtt.qualitative.text} ({eomAtt.percent}%)</span>
            {:else}—{/if}
          </td>
        </tr>
        <tr>
          <td>Riesgo de lesiones</td>
          <td class="value {eomInj ? severityClass(eomInj.severity) : 'dim'}">
            {eomInj?.text ?? "—"}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Manager arc -->
  {#if mgr}
    <div class="panel">
      <h2>Tú, como manager</h2>
      <p>
        Nivel <strong>{mgr.level}</strong> · {mgr.xp} XP ·
        Tácticas <strong>{mgr.skills.tactics}/4</strong> ·
        Finanzas <strong>{mgr.skills.finance}/4</strong>
      </p>
      {#if mgr.pendingSkillPoints > 0}
        <p class="good">
          ⬆ Tienes {mgr.pendingSkillPoints} punto(s) de habilidad por asignar.
          <a href="/manager">→ Asignar en el perfil</a>
        </p>
      {/if}
      {#if mgr.careerEvents.length > 0}
        <h3 style="margin-top: var(--space-3);">Eventos del mes</h3>
        <ul class="events">
          {#each mgr.careerEvents as e}
            <li>
              <strong>{e.title}</strong>
              <p class="event-body">"{e.body}"</p>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <!-- Staff summary -->
  <div class="panel">
    <h2>Resumen del staff</h2>
    <p>
      <span class="bad">{blockingCount} mensajes urgentes</span>
      · <span class="warn">{advisoryCount} avisos</span>
      · <span class="dim">{messages.length - blockingCount - advisoryCount} observaciones rutinarias</span>
    </p>
    <a class="button-link" href="/staff">→ Ver la bandeja completa</a>
  </div>

  <!-- Next month hook -->
  <div class="panel" style="border-color: var(--accent);">
    <h2>Próximo mes</h2>
    <p>
      {#if (playerRow?.position ?? 20) >= 17}
        Estamos en zona de descenso. El presidente quiere verte. Si seguimos
        así en febrero, las cosas se complicarán.
      {:else}
        Mes complicado pero todavía no hundidos. Hay margen para reaccionar.
      {/if}
    </p>
    <p class="dim">
      El siguiente paso del slice termina aquí — la versión completa del juego
      extiende este loop a temporadas enteras + multi-temporada con cantera y
      ofertas externas.
    </p>
  </div>
{/if}

<style>
  table { width: 100%; border-collapse: collapse; }
  td { padding: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-sm); }
  td.value { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .big-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
  .summary .metric-value { font-size: 32px; }
  ul.events { list-style: none; display: flex; flex-direction: column; gap: var(--space-3); }
  .event-body { font-style: italic; padding-left: var(--space-3); border-left: 2px solid var(--border); margin-top: var(--space-1); }
  .button-link { display: inline-block; margin-top: var(--space-2); padding: var(--space-2) var(--space-4); border: 1px solid var(--border); border-radius: 6px; }
</style>
