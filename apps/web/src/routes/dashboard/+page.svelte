<!--
  Dashboard — hero card + 4-up cascade-node grid + staff messages feed.
  Wired via +page.server.ts → @smt/db.

  Story: HUD-UI-002
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  interface NodeReading {
    label: string;
    value: number;
    nodeId: string;
  }

  const HEADLINE_NODE_IDS = [
    'financial_balance',
    'fan_momentum',
    'team_fitness',
    'squad_available_pct',
  ] as const;

  const NODE_LABELS: Readonly<Record<string, string>> = {
    financial_balance: 'Balance',
    fan_momentum: 'Fan momentum',
    team_fitness: 'Fitness equipo',
    squad_available_pct: 'Plantilla disp.',
  };

  const nodes = $derived.by<NodeReading[]>(() => {
    if (!data.hasPlaythrough || !data.worldState) return [];
    return HEADLINE_NODE_IDS.map((id) => ({
      nodeId: id,
      label: NODE_LABELS[id] ?? id,
      value: Math.round(data.worldState?.[id] ?? 0),
    }));
  });

  const messages = $derived(data.hasPlaythrough ? data.messages : []);

  function colorFor(value: number): string {
    if (value < 30) return 'progress-error';
    if (value < 70) return 'progress-warning';
    return 'progress-success';
  }
</script>

<div class="space-y-6">
  {#if !data.hasPlaythrough}
    <div class="hero bg-base-200 rounded-lg">
      <div class="hero-content text-center">
        <div class="max-w-md">
          <h1 class="text-3xl font-bold">¡Bienvenido a Cascada FC!</h1>
          <p class="py-4 opacity-70">
            Todavía no has comenzado una partida. Crea tu primera carrera para
            tomar las riendas de un club modesto y construir tu legado.
          </p>
          <a href="/game" class="btn btn-primary">Crear mi primera carrera</a>
        </div>
      </div>
    </div>
  {:else}
    <section class="card bg-base-200 shadow">
      <div class="card-body">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 class="card-title text-2xl">{data.activePlaythrough?.clubName ?? 'Mi club'}</h1>
            <p class="opacity-70">Semana actual: <span class="font-mono">{data.week}</span></p>
          </div>
          <form method="POST" action="/dashboard?/advance">
            <button class="btn btn-primary" type="submit">Avanzar semana</button>
          </form>
        </div>
      </div>
    </section>

    {#if nodes.length > 0}
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
    {:else}
      <div class="alert alert-info">
        <span>Esperando primer tick del simulador para mostrar nodos cascada.</span>
      </div>
    {/if}

    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Mensajes del staff</h2>
        {#if messages.length === 0}
          <p class="opacity-60 text-sm">No hay mensajes del staff todavía.</p>
        {:else}
          <div class="space-y-3">
            {#each messages as m}
              <div
                class="alert {m.priority === 'URGENT' ? 'alert-error' : 'alert-info'}
                       {m.tier === 3 ? 'border-l-4 border-l-warning' : ''}"
              >
                <div>
                  <div class="text-xs uppercase opacity-60">
                    {m.role.replace('_', ' ')} · tier {m.tier} · {m.priority} · sem {m.week}
                  </div>
                  <div class="text-sm">{m.content}</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>
