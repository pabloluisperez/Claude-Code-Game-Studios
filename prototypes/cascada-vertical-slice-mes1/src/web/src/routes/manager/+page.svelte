<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Manager profile — XP, skills, career events.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getState, type StateDto } from "$lib/api";

  interface ManagerSnapshot {
    level: number;
    xp: number;
    xpToNextLevel: number;
    skills: { tactics: number; finance: number };
    pendingSkillPoints: number;
    careerEvents: { id: string; title: string; body: string; week: number; acknowledged: boolean }[];
  }

  let pt: StateDto | null = $state(null);
  let error: string | null = $state(null);
  const mgr = $derived.by(() => {
    if (!pt?.snapshot?.managerState) return null;
    return pt.snapshot.managerState as ManagerSnapshot;
  });

  async function load() {
    try {
      pt = await getState();
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  function xpPct(m: ManagerSnapshot): number {
    const span = m.xpToNextLevel - prevLevelThreshold(m.level);
    if (span <= 0) return 100;
    return Math.min(100, ((m.xp - prevLevelThreshold(m.level)) / span) * 100);
  }
  function prevLevelThreshold(level: number): number {
    const t = [0, 0, 80, 240, 560];
    return t[level] ?? 0;
  }

  onMount(load);
</script>

<h1>Manager</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad);">{error}</div>
{:else if mgr}
  <div class="panel">
    <h2>Nivel {mgr.level}</h2>
    <div class="xp-bar">
      <div class="xp-fill" style="width: {xpPct(mgr)}%"></div>
    </div>
    <div class="dim" style="font-size: var(--text-sm);">
      {mgr.xp} / {mgr.xpToNextLevel} XP
      {#if mgr.pendingSkillPoints > 0}
        · <span class="good">+{mgr.pendingSkillPoints} punto(s) por asignar</span>
      {/if}
    </div>
  </div>

  <div class="panel" style="margin-top: var(--space-3);">
    <h2>Habilidades</h2>
    <ul class="skills">
      <li>
        <div class="skill-name">Tácticas</div>
        <div class="skill-pips">
          {#each Array(4) as _, i}
            <span class="pip" class:on={i < mgr.skills.tactics}></span>
          {/each}
        </div>
        <div class="skill-level">{mgr.skills.tactics}/4</div>
      </li>
      <li>
        <div class="skill-name">Finanzas</div>
        <div class="skill-pips">
          {#each Array(4) as _, i}
            <span class="pip" class:on={i < mgr.skills.finance}></span>
          {/each}
        </div>
        <div class="skill-level">{mgr.skills.finance}/4</div>
      </li>
    </ul>
  </div>

  {#if mgr.careerEvents.length > 0}
    <div class="panel" style="margin-top: var(--space-3);">
      <h2>Eventos de carrera</h2>
      <ul class="events">
        {#each mgr.careerEvents as e}
          <li>
            <div class="event-title">{e.title}</div>
            <div class="dim event-week">Semana {e.week}</div>
            <p class="event-body">"{e.body}"</p>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{:else}
  <p class="dim">Aún no has avanzado ninguna semana — el manager arranca al cerrar la semana 1.</p>
{/if}

<style>
  .xp-bar { width: 100%; height: 12px; background: var(--bg-3); border-radius: 6px; overflow: hidden; margin: var(--space-2) 0; }
  .xp-fill { height: 100%; background: var(--accent); transition: width 0.4s ease; }

  ul.skills { list-style: none; display: flex; flex-direction: column; gap: var(--space-3); }
  ul.skills li { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: var(--space-3); }
  .skill-pips { display: flex; gap: 4px; }
  .pip { width: 18px; height: 18px; border-radius: 4px; background: var(--bg-3); border: 1px solid var(--border); }
  .pip.on { background: var(--accent); border-color: var(--accent); }
  .skill-level { color: var(--fg-dim); font-variant-numeric: tabular-nums; }

  ul.events { list-style: none; display: flex; flex-direction: column; gap: var(--space-3); }
  .event-title { font-weight: 600; }
  .event-week { font-size: var(--text-xs); }
  .event-body { font-style: italic; padding-left: var(--space-3); border-left: 2px solid var(--border); margin-top: var(--space-1); }
</style>
