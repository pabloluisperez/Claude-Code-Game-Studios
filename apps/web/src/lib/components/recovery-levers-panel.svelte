<!--
  Recovery Levers Panel — coaching panel that surfaces concrete actions per
  crisis tier so the player never feels "no agency".

  Story: Sprint 10 task 10-3
  Playtest source: production/playtests/2026-05-21-economy-tuning-pablo.md
    (finding "no agency / no salida actualmente" — Pablo couldn't find any
     levers despite the game having multiple visible options).
  Design source: design/difficulty-curve.md "Recovery Windows" table.
  Control Manifest: 2026-05-21

  Behavior:
    - financialStatus drives which lever set surfaces:
        0 (Sano)     → no panel (the player isn't in crisis)
        1 (En Riesgo) → 'Fast' lever set
        2 (Crisis)    → 'Fast' + 'Medium' lever set
        3 (Quiebra)   → all levers + bankruptcy warning
    - pretemporada gates the ticket-price lever (only available pre-kickoff).
    - pendingSponsorOffersCount drives the sponsor lever's call-to-action.
    - activeStaff.someAtTier3 / someAtTier2 drives the staff downgrade lever.
    - Every lever is a LINK to the page where the action is actually taken —
      this component never duplicates the underlying UI's logic.
-->
<script lang="ts">
  import { formatEurK } from '$lib/format';

  interface Lever {
    icon: string;
    label: string;
    href: string;
    impact: string;        // human-readable estimate, e.g. '+€2-6 K/sem'
    speed: 'fast' | 'medium' | 'slow';
    available: boolean;
    disabledReason?: string;
  }

  interface Props {
    /** 0=Sano · 1=En Riesgo · 2=Crisis · 3=Quiebra. */
    financialStatus: number;
    /** Pre-kickoff or in-season? Gates the ticket-price lever. */
    pretemporada: boolean;
    /** Number of pending sponsor offers (drives the sponsor lever CTA). */
    pendingSponsorOffersCount: number;
    /** Active staff roster — used to know if downgrade levers exist. */
    activeStaff: Array<{ role: string; qualityTier: number; weeklyEurK: number; name: string }>;
    /** Current player wages weekly (€K). */
    playerWagesEurK: number;
    /** Current staff wages weekly (€K). */
    staffCostEurK: number;
  }

  let {
    financialStatus,
    pretemporada,
    pendingSponsorOffersCount,
    activeStaff,
    playerWagesEurK,
    staffCostEurK,
  }: Props = $props();

  // The maximum potential savings if we downgraded every tier-3 + tier-2 staff
  // to tier 1. Used to give the player a realistic 'this is how much you can save'.
  const staffSavingsIfAllTier1 = $derived(
    activeStaff.reduce((acc, s) => {
      if (s.qualityTier === 3) return acc + (s.weeklyEurK - Math.round(s.weeklyEurK / 3)); // tier 3 ≈ 3× tier 1
      if (s.qualityTier === 2) return acc + (s.weeklyEurK - Math.round(s.weeklyEurK / 2)); // tier 2 ≈ 2× tier 1
      return acc;
    }, 0),
  );

  const someAtTier3 = $derived(activeStaff.some((s) => s.qualityTier === 3));
  const someAtTier2 = $derived(activeStaff.some((s) => s.qualityTier === 2));

  // Estimated player-wage savings if you sold the top earner. ~10% of total
  // wages is a reasonable upper bound for one transfer.
  const estimatedTopEarnerSaving = $derived(Math.round(playerWagesEurK * 0.1));

  const fastLevers: Lever[] = $derived([
    {
      icon: '🤝',
      label:
        pendingSponsorOffersCount > 0
          ? `Aceptar oferta de patrocinador (${pendingSponsorOffersCount} pendiente${pendingSponsorOffersCount === 1 ? '' : 's'})`
          : 'Patrocinadores activos: revisar',
      href: '/finance?tab=patrocinadores',
      impact: pendingSponsorOffersCount > 0 ? '+€2-6 K/sem desde el siguiente tick' : 'sin ofertas ahora',
      speed: 'fast',
      available: true,
      disabledReason: pendingSponsorOffersCount === 0 ? 'No hay ofertas pendientes esta semana.' : undefined,
    },
    {
      icon: '🎟',
      label: pretemporada ? 'Ajustar precio de abono (pretemporada)' : 'Precio de abono — bloqueado',
      href: '/finance?tab=abonos',
      impact: pretemporada ? '+€10-20 K/temporada según precio' : 'solo modificable en pretemporada',
      speed: 'fast',
      available: pretemporada,
      disabledReason: !pretemporada ? 'La temporada ya está en marcha; el precio queda bloqueado hasta la siguiente pretemporada.' : undefined,
    },
  ]);

  const mediumLevers: Lever[] = $derived([
    {
      icon: '👥',
      label: someAtTier3
        ? 'Despedir staff de nivel 3 (ahorra sueldo)'
        : someAtTier2
        ? 'Despedir staff de nivel 2 (ahorra sueldo)'
        : 'Staff actual ya está en el nivel mínimo',
      href: '/staff',
      impact: staffSavingsIfAllTier1 > 0
        ? `−${formatEurK(staffSavingsIfAllTier1)} /sem si bajas todo el staff a nivel 1`
        : 'sin margen',
      speed: 'medium',
      available: someAtTier3 || someAtTier2,
      disabledReason: !someAtTier3 && !someAtTier2 ? 'Todo el staff ya está en nivel 1 — no hay ahorro disponible aquí.' : undefined,
    },
    {
      icon: '⚙️',
      label: 'Reducir intensidad de entrenamiento (corta C12 desperation)',
      href: '/manager',
      impact: 'evita el drenaje de fitness; no es ahorro directo',
      speed: 'medium',
      available: true,
    },
  ]);

  const slowLevers: Lever[] = $derived([
    {
      icon: '🔁',
      label: 'Vender un jugador (mercado de fichajes)',
      href: '/squad',
      impact:
        estimatedTopEarnerSaving > 0
          ? `−${formatEurK(estimatedTopEarnerSaving)} /sem (estimación: top earner ≈10% de la masa salarial)`
          : 'sin estimación',
      speed: 'slow',
      available: playerWagesEurK > 0,
    },
    {
      icon: '📺',
      label: 'Firmar TV LOCAL en próxima subasta (−0.5 corrupción/sem)',
      href: '/finance/tv-rights',
      impact: 'solo aplica al inicio de la próxima temporada',
      speed: 'slow',
      available: true,
    },
  ]);

  function severityHeader(status: number): { label: string; tone: string } {
    if (status >= 3) return { label: '🆘 Quiebra inminente — actúa AHORA', tone: 'alert-error' };
    if (status === 2) return { label: '⚠️ Crisis — usa las palancas siguientes', tone: 'alert-error' };
    if (status === 1) return { label: '⚠ En Riesgo — anticípate antes de que sea crisis', tone: 'alert-warning' };
    return { label: '', tone: '' };
  }

  const header = $derived(severityHeader(financialStatus));

  // Render only when in some risk tier.
  const visible = $derived(financialStatus >= 1);
</script>

{#if visible}
  <section class="card bg-base-100 shadow border-2 border-warning/40">
    <div class="card-body">
      <div class="alert {header.tone} py-2">
        <span class="font-semibold">{header.label}</span>
      </div>

      <h2 class="card-title text-base mt-1">🩹 Cómo recuperarte</h2>
      <p class="text-xs opacity-70 -mt-2">
        Lista de palancas concretas. Cada una te lleva a la pantalla donde se toma
        la decisión.
      </p>

      <!-- FAST levers -->
      <div class="mt-2">
        <div class="text-xs uppercase opacity-60 mb-1">⚡ Inmediatas</div>
        <ul class="space-y-1">
          {#each fastLevers as l}
            <li>
              {#if l.available}
                <a
                  href={l.href}
                  class="flex items-center gap-2 p-2 rounded bg-base-200 hover:bg-base-300 transition-colors"
                  aria-label="{l.label} — {l.impact}"
                >
                  <span class="text-lg">{l.icon}</span>
                  <span class="flex-1 text-sm">{l.label}</span>
                  <span class="text-xs font-mono text-success">{l.impact}</span>
                </a>
              {:else}
                <div
                  class="flex items-center gap-2 p-2 rounded bg-base-200/40 opacity-60"
                  title={l.disabledReason ?? ''}
                >
                  <span class="text-lg">{l.icon}</span>
                  <span class="flex-1 text-sm">{l.label}</span>
                  <span class="text-xs opacity-70">{l.impact}</span>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </div>

      <!-- MEDIUM levers — only surface when Crisis or worse, OR when the
           player has explicit headroom (tier 2/3 staff) to act -->
      {#if financialStatus >= 2 || someAtTier3 || someAtTier2}
        <div class="mt-3">
          <div class="text-xs uppercase opacity-60 mb-1">🕐 De medio plazo</div>
          <ul class="space-y-1">
            {#each mediumLevers as l}
              <li>
                {#if l.available}
                  <a
                    href={l.href}
                    class="flex items-center gap-2 p-2 rounded bg-base-200 hover:bg-base-300 transition-colors"
                    aria-label="{l.label} — {l.impact}"
                  >
                    <span class="text-lg">{l.icon}</span>
                    <span class="flex-1 text-sm">{l.label}</span>
                    <span class="text-xs font-mono">{l.impact}</span>
                  </a>
                {:else}
                  <div
                    class="flex items-center gap-2 p-2 rounded bg-base-200/40 opacity-60"
                    title={l.disabledReason ?? ''}
                  >
                    <span class="text-lg">{l.icon}</span>
                    <span class="flex-1 text-sm">{l.label}</span>
                    <span class="text-xs opacity-70">{l.impact}</span>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- SLOW levers — only surface in Crisis or Quiebra -->
      {#if financialStatus >= 2}
        <div class="mt-3">
          <div class="text-xs uppercase opacity-60 mb-1">🐢 Estructurales</div>
          <ul class="space-y-1">
            {#each slowLevers as l}
              <li>
                <a
                  href={l.href}
                  class="flex items-center gap-2 p-2 rounded bg-base-200 hover:bg-base-300 transition-colors"
                  aria-label="{l.label} — {l.impact}"
                >
                  <span class="text-lg">{l.icon}</span>
                  <span class="flex-1 text-sm">{l.label}</span>
                  <span class="text-xs font-mono opacity-70">{l.impact}</span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Bankruptcy emergency message -->
      {#if financialStatus >= 3}
        <div class="alert alert-error mt-3 py-2">
          <div class="text-sm">
            <strong>Quiebra inminente:</strong> sin caja para pagar próxima nómina.
            La directiva considerará rescindir tu contrato si no hay recuperación
            visible en 2-3 semanas. Combina varias palancas a la vez — una sola no
            suele bastar en este punto.
          </div>
        </div>
      {/if}

      <!-- Reference to the design doc — players who want to understand the
           system get one explicit signpost. Keeps the panel focused on actions. -->
      <div class="text-xs opacity-50 mt-2">
        Para una visión más amplia de qué crisis pueden venir y cuándo, ver
        <span class="italic">design/difficulty-curve.md</span>.
      </div>
    </div>
  </section>
{/if}
