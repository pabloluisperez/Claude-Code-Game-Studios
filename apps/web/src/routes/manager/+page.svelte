<!--
  Manager profile — wired to /manager/+page.server.ts.

  Story: HUD-UI-008
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  interface ManagerSkill {
    level: number;
    xp: number;
    xpToNextLevel: number;
  }

  function xpToNextLevel(level: number): number {
    if (level >= 5) return Infinity;
    return [100, 200, 400, 800][level - 1] ?? Infinity;
  }

  const skills = $derived.by<Record<string, ManagerSkill>>(() => {
    if (!data.hasPlaythrough || !data.profile) {
      return {
        tactical_insight: { level: 1, xp: 0, xpToNextLevel: 100 },
        man_management:    { level: 1, xp: 0, xpToNextLevel: 100 },
        financial_acumen:  { level: 1, xp: 0, xpToNextLevel: 100 },
        scouting_network:  { level: 1, xp: 0, xpToNextLevel: 100 },
        reputation:        { level: 1, xp: 0, xpToNextLevel: 100 },
      };
    }
    const dbSkills = data.profile.skills as Record<string, { level: number; xp: number }>;
    return Object.fromEntries(
      Object.entries(dbSkills).map(([id, s]) => [
        id,
        { ...s, xpToNextLevel: xpToNextLevel(s.level) },
      ]),
    );
  });

  const reputationLevel = $derived(skills.reputation?.level ?? 1);
  const maxStaffTier = $derived(
    reputationLevel >= 4 ? 3 : reputationLevel >= 3 ? 2 : 1,
  );

  function skillLabel(id: string): string {
    switch (id) {
      case 'tactical_insight': return 'Tactical Insight';
      case 'man_management':   return 'Man Management';
      case 'financial_acumen': return 'Financial Acumen';
      case 'scouting_network': return 'Scouting Network';
      case 'reputation':       return 'Reputation';
      default: return id;
    }
  }

  function progressPct(skill: ManagerSkill): number {
    if (!isFinite(skill.xpToNextLevel)) return 100;
    return Math.min(100, Math.round((skill.xp / skill.xpToNextLevel) * 100));
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Mánager</h1>
    <p class="opacity-60">Habilidades del mánager y registro de carrera</p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para ver tu perfil de mánager.</span>
    </div>
  {:else if !data.profile}
    <div class="alert alert-warning">
      <span>Perfil de mánager no inicializado. Inicialízalo desde la API.</span>
    </div>
  {:else}
    <section class="alert alert-info">
      <div>
        <div class="text-xs uppercase opacity-70">Staff máximo contratable</div>
        <div class="text-lg font-bold">Tier {maxStaffTier}</div>
        <div class="text-xs">
          Reputación nivel {reputationLevel}.
          {#if reputationLevel < 3}
            Sube a nivel 3 para acceder a staff Tier 2.
          {:else if reputationLevel < 4}
            Sube a nivel 4 para acceder a staff Tier 3.
          {:else}
            Acceso completo al pool de staff.
          {/if}
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each Object.entries(skills) as [id, skill]}
        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <div class="flex justify-between items-baseline">
              <div>
                <h3 class="font-semibold">{skillLabel(id)}</h3>
                <div class="text-xs opacity-60">{id}</div>
              </div>
              <div class="text-3xl font-mono">L{skill.level}</div>
            </div>
            <progress class="progress progress-primary" value={progressPct(skill)} max="100"></progress>
            <div class="text-xs opacity-60 text-right font-mono">
              {skill.xp} / {isFinite(skill.xpToNextLevel) ? skill.xpToNextLevel : '∞'} XP
            </div>
          </div>
        </div>
      {/each}
    </section>

    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Registro de XP reciente</h2>
        {#if data.log.length === 0}
          <p class="opacity-60 text-sm">Aún no has ganado XP.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr><th>Semana</th><th>Skill</th><th class="text-right">XP</th><th>Razón</th></tr>
              </thead>
              <tbody>
                {#each data.log as e}
                  <tr>
                    <td class="font-mono">S{e.week}</td>
                    <td>{skillLabel(e.skillId)}</td>
                    <td class="text-right font-mono text-success">+{e.xpGranted}</td>
                    <td class="text-xs opacity-70">{e.reason}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </section>

    <p class="text-xs opacity-60">
      XP es event-driven (ADR-010) — se gana automáticamente por victorias, finanzas
      positivas, fichajes, ascensos. No hay asignación manual.
    </p>
  {/if}
</div>
