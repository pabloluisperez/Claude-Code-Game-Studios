<!--
  Manager profile — explains the 5 skills in plain Spanish + shows level/XP.

  Story: MVP UX fixes — manager page clarity
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
        man_management:   { level: 1, xp: 0, xpToNextLevel: 100 },
        financial_acumen: { level: 1, xp: 0, xpToNextLevel: 100 },
        scouting_network: { level: 1, xp: 0, xpToNextLevel: 100 },
        reputation:       { level: 1, xp: 0, xpToNextLevel: 100 },
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

  interface SkillCard {
    id: string;
    label: string;
    description: string;
    howToLevel: string;
    icon: string;
  }

  const skillCards: SkillCard[] = [
    {
      id: 'tactical_insight',
      label: 'Visión táctica',
      description: 'Mide tu lectura del juego. A más nivel, mejor afinas formaciones e instrucciones.',
      howToLevel: 'Ganas XP por victorias, especialmente contra rivales mejores.',
      icon: '🎯',
    },
    {
      id: 'man_management',
      label: 'Gestión humana',
      description: 'Mantiene la moral del vestuario y reduce conflictos entre jugadores.',
      howToLevel: 'XP cuando renuevas contratos o resuelves crisis de vestuario.',
      icon: '🤝',
    },
    {
      id: 'financial_acumen',
      label: 'Olfato financiero',
      description: 'Te permite leer el balance, negociar mejor con sponsors y evitar quiebras.',
      howToLevel: 'XP cuando cierras meses con cashflow positivo o firmas un buen sponsor.',
      icon: '💼',
    },
    {
      id: 'scouting_network',
      label: 'Red de ojeadores',
      description: 'Encuentra mejores jugadores en el mercado y revela el potencial real de la cantera.',
      howToLevel: 'XP cuando promocionas juveniles o fichas con éxito.',
      icon: '🕵️',
    },
    {
      id: 'reputation',
      label: 'Reputación',
      description: 'La habilidad clave: tu nivel desbloquea el staff que puedes contratar.',
      howToLevel: 'XP cuando cumples objetivos de temporada, ganas trofeos o asciendes.',
      icon: '⭐',
    },
  ];

  function progressPct(skill: ManagerSkill): number {
    if (!isFinite(skill.xpToNextLevel)) return 100;
    return Math.min(100, Math.round((skill.xp / skill.xpToNextLevel) * 100));
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">
      {data.hasPlaythrough && data.profile ? data.profile.name : 'Mánager'}
    </h1>
    <p class="opacity-60">
      Tu perfil como entrenador-director. Sube nivel cumpliendo objetivos —
      <strong>no hay asignación manual de puntos</strong>.
    </p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para ver tu perfil de mánager.</span>
    </div>
  {:else if !data.profile}
    <div class="alert alert-warning">
      <span>Perfil no inicializado. Inicia una nueva carrera desde /game.</span>
    </div>
  {:else}
    <!-- Reputation impact card -->
    <section class="alert alert-info">
      <div>
        <div class="text-xs uppercase opacity-70">¿Qué afecta hoy mi reputación?</div>
        <div class="text-lg font-bold">
          Nivel {reputationLevel} ⇒ staff máximo contratable: {maxStaffTier === 1 ? 'Novato' : maxStaffTier === 2 ? 'Experimentado' : 'Élite'}
        </div>
        <div class="text-xs opacity-80 mt-1">
          {#if reputationLevel < 3}
            Con más reputación llamarías la atención de staff Experimentado, que lee el vestuario con más finura que un Novato.
          {:else if reputationLevel < 4}
            Un escalón más arriba y podrás fichar staff Élite — los que mejor leen los problemas antes de que estallen.
          {:else}
            Tu reputación abre las puertas a todo el mercado. Hasta el staff Élite acepta trabajar contigo.
          {/if}
        </div>
      </div>
    </section>

    <!-- 5 skill cards with explanations -->
    <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each skillCards as card}
        {@const skill = skills[card.id] ?? { level: 1, xp: 0, xpToNextLevel: 100 }}
        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <div class="flex justify-between items-start gap-2">
              <div class="flex-1">
                <h3 class="font-bold text-lg">
                  <span class="text-2xl mr-1">{card.icon}</span>
                  {card.label}
                </h3>
                <p class="text-sm opacity-70 mt-1">{card.description}</p>
              </div>
              <div class="text-3xl font-mono">L{skill.level}</div>
            </div>
            <progress class="progress progress-primary mt-3" value={progressPct(skill)} max="100"></progress>
            <div class="text-xs opacity-60 text-right font-mono">
              {skill.xp} / {isFinite(skill.xpToNextLevel) ? skill.xpToNextLevel : '∞'} XP
            </div>
            <div class="text-xs opacity-60 mt-2">
              <strong>Cómo subir:</strong> {card.howToLevel}
            </div>
          </div>
        </div>
      {/each}
    </section>

    <!-- Trophies / milestones -->
    {#if data.milestones.length > 0}
      <section class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">Hitos de carrera</h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2">
            {#each data.milestones as m}
              <div
                class="card bg-base-200 shadow-sm hover:shadow-md transition-shadow"
                title={m.description}
              >
                <div class="card-body p-3 text-center">
                  <div class="text-4xl">{m.icon}</div>
                  <div class="font-bold text-sm mt-1">{m.label}</div>
                  <div class="text-xs opacity-60">Sem {m.week}</div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    <!-- Career log -->
    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Historial reciente de XP</h2>
        {#if data.log.length === 0}
          <p class="opacity-60 text-sm">
            Aún no has ganado XP. Cumple objetivos, gana partidos, mejora tus finanzas.
          </p>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr><th>Semana</th><th>Habilidad</th><th class="text-right">XP</th><th>Razón</th></tr>
              </thead>
              <tbody>
                {#each data.log as e}
                  <tr>
                    <td class="font-mono">S{e.week}</td>
                    <td>
                      {skillCards.find((c) => c.id === e.skillId)?.label ?? e.skillId}
                    </td>
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
  {/if}
</div>
