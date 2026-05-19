<!--
  Dashboard — hero card + 4-up cascade-node grid + staff messages feed.

  Story: HUD-UI-002
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  // MVP: state injected from server load when wired (out of scope here).
  // Placeholder values for the visual scaffold.
  const club = {
    name: 'Real Pueblo CF',
    leaguePosition: 11,
    nextOpponent: 'CD Calderón',
    nextMatchWeek: 7,
  };

  interface NodeReading {
    label: string;
    value: number;
    nodeId: string;
  }
  const nodes: NodeReading[] = [
    { label: 'Balance', value: 38, nodeId: 'financial_balance' },
    { label: 'Fan momentum', value: 62, nodeId: 'fan_momentum' },
    { label: 'Fitness equipo', value: 71, nodeId: 'team_fitness' },
    { label: 'Plantilla disp.', value: 84, nodeId: 'squad_available_pct' },
  ];

  interface StaffMessage {
    id: string;
    role: string;
    tier: 1 | 2 | 3;
    content: string;
    priority: 'URGENT' | 'ROUTINE';
  }
  const messages: StaffMessage[] = [
    { id: 'm1', role: 'fitness_coach',     tier: 3, priority: 'ROUTINE', content: 'El equipo está acumulando fatiga — varios jugadores no llegan al partido al 100%.' },
    { id: 'm2', role: 'commercial_director', tier: 2, priority: 'ROUTINE', content: 'El momentum de la afición es bueno — buena ola.' },
    { id: 'm3', role: 'finance_director',  tier: 3, priority: 'URGENT',  content: 'Balance en zona de riesgo. Si esto continúa 2-3 semanas más entraremos en Crisis financiera.' },
  ];

  function colorFor(value: number): string {
    if (value < 30) return 'progress-error';
    if (value < 70) return 'progress-warning';
    return 'progress-success';
  }
</script>

<div class="space-y-6">
  <!-- Hero -->
  <section class="card bg-base-200 shadow">
    <div class="card-body">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 class="card-title text-2xl">{club.name}</h1>
          <p class="opacity-70">Posición en liga: <span class="font-mono">{club.leaguePosition}º</span></p>
        </div>
        <div class="text-right">
          <div class="text-xs opacity-50">Próximo partido (sem {club.nextMatchWeek})</div>
          <div class="font-semibold">{club.nextOpponent}</div>
        </div>
        <button class="btn btn-primary" type="button">Avanzar semana</button>
      </div>
    </div>
  </section>

  <!-- 4-up nodes -->
  <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {#each nodes as n}
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-xs uppercase opacity-50 tracking-wide">{n.label}</div>
          <div class="text-3xl font-mono font-semibold">{n.value}</div>
          <progress class="progress {colorFor(n.value)}" value={n.value} max="100"></progress>
        </div>
      </div>
    {/each}
  </section>

  <!-- Staff messages -->
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Mensajes del staff</h2>
      <div class="space-y-3">
        {#each messages as m}
          <div
            class="alert {m.priority === 'URGENT' ? 'alert-error' : 'alert-info'}
                   {m.tier === 3 ? 'border-l-4 border-l-warning' : ''}"
          >
            <div>
              <div class="text-xs uppercase opacity-60">
                {m.role.replace('_', ' ')} · tier {m.tier} · {m.priority}
              </div>
              <div class="text-sm">{m.content}</div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>
</div>
