<!--
  Manager profile — 5 skills (level + XP) + max hirable staff tier + career log.

  Story: HUD-UI-008
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  interface ManagerSkill {
    level: number;
    xp: number;
    xpToNextLevel: number;
  }

  // Sample state — production loads via GET /manager-rpg/:playthroughId.
  const profile = {
    name: 'Manager Pablo',
    skills: {
      tactical_insight: { level: 2, xp: 40,  xpToNextLevel: 200 } as ManagerSkill,
      man_management:    { level: 1, xp: 80,  xpToNextLevel: 100 } as ManagerSkill,
      financial_acumen:  { level: 3, xp: 120, xpToNextLevel: 400 } as ManagerSkill,
      scouting_network:  { level: 1, xp: 50,  xpToNextLevel: 100 } as ManagerSkill,
      reputation:        { level: 2, xp: 90,  xpToNextLevel: 200 } as ManagerSkill,
    },
  };

  function maxHirable(rep: number): 1 | 2 | 3 {
    if (rep >= 4) return 3;
    if (rep >= 3) return 2;
    return 1;
  }

  const skillEntries = $derived(
    Object.entries(profile.skills).map(([id, skill]) => ({
      id: id as keyof typeof profile.skills,
      label: skillLabel(id),
      ...skill,
    })),
  );

  const reputationLevel = $derived(profile.skills.reputation.level);
  const maxStaffTier = $derived(maxHirable(reputationLevel));

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
    if (!isFinite(skill.xpToNextLevel)) return 100; // level 5 capped
    return Math.min(100, Math.round((skill.xp / skill.xpToNextLevel) * 100));
  }

  interface CareerEvent {
    week: number;
    skillId: string;
    xpGranted: number;
    reason: string;
  }
  const careerLog: CareerEvent[] = [
    { week: 8, skillId: 'tactical_insight', xpGranted: 10, reason: 'match_win' },
    { week: 7, skillId: 'tactical_insight', xpGranted: 5,  reason: 'match_draw' },
    { week: 6, skillId: 'financial_acumen', xpGranted: 10, reason: 'positive_month' },
    { week: 5, skillId: 'reputation',       xpGranted: 8,  reason: 'board_approval' },
  ];
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">{profile.name}</h1>
    <p class="opacity-60">Habilidades del mánager y registro de carrera</p>
  </header>

  <!-- Staff tier callout -->
  <section class="alert alert-info">
    <div>
      <div class="text-xs uppercase opacity-70">Staff máximo contratable</div>
      <div class="text-lg font-bold">Tier {maxStaffTier}</div>
      <div class="text-xs">
        Reputación nivel {reputationLevel}.
        {#if reputationLevel < 3}
          Sube a nivel 3 para acceder a staff Tier 2.
        {:else if reputationLevel < 4}
          Sube a nivel 4 para acceder a staff Tier 3 (expertos — perciben más cascadas).
        {:else}
          Acceso completo al pool de staff.
        {/if}
      </div>
    </div>
  </section>

  <!-- 5 skills -->
  <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each skillEntries as skill}
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="flex justify-between items-baseline">
            <div>
              <h3 class="font-semibold">{skill.label}</h3>
              <div class="text-xs opacity-60">{skill.id}</div>
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

  <!-- Career log -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Registro de XP reciente</h2>
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr><th>Semana</th><th>Skill</th><th class="text-right">XP</th><th>Razón</th></tr>
          </thead>
          <tbody>
            {#each careerLog as e}
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
    </div>
  </section>

  <p class="text-xs opacity-60">
    XP es event-driven (ADR-010) — se gana automáticamente por victorias, finanzas
    positivas, fichajes, ascensos. No hay asignación manual.
  </p>
</div>
