<!--
  Staff hub — current staff list + per-role hire/upgrade cards.

  Tier 2 unlocks at reputation 3, tier 3 at reputation 4 (ADR-010 / P1↔P3).
  Tier 3 staff perceive more cascade signals (×3.0 vs ×1.0), so upgrading
  is the only way to surface more URGENT messages early.

  Story: Staff hiring follow-up (STAFF-SYSTEM-005)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import Avatar from '$lib/components/avatar.svelte';
  import ConfirmDialog from '$lib/components/confirm-dialog.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Confirmation state. We hold a "pending action" — a closure that
  // performs the actual submit when the user confirms.
  let confirmOpen = $state(false);
  let confirmTitle = $state('');
  let confirmMessage = $state('');
  let confirmLabel = $state('Confirmar');
  let confirmDangerous = $state(false);
  let pendingAction: (() => void) | null = $state(null);

  function askConfirm(
    title: string,
    message: string,
    label: string,
    dangerous: boolean,
    action: () => void,
  ) {
    confirmTitle = title;
    confirmMessage = message;
    confirmLabel = label;
    confirmDangerous = dangerous;
    pendingAction = action;
    confirmOpen = true;
  }
  function runPending() {
    pendingAction?.();
    pendingAction = null;
  }

  // Form refs so the confirm-on-confirm callback can submit them.
  let dismissForms: Record<string, HTMLFormElement | undefined> = $state({});
  let hireForms: Record<string, HTMLFormElement | undefined> = $state({});

  const ROLE_ICON: Readonly<Record<string, string>> = {
    groundskeeper: '🌱',
    fitness_coach: '💪',
    commercial_director: '💼',
    scouting_director: '🔍',
    finance_director: '💰',
    head_coach: '🎯',
  };

  /** Tier → human label. Internal codes (1/2/3) remain in the DB. */
  const EXPERIENCE_LABEL: Readonly<Record<number, string>> = {
    1: 'Novato',
    2: 'Experimentado',
    3: 'Élite',
  };
  function experienceLabel(tier: number): string {
    return EXPERIENCE_LABEL[tier] ?? `Tier ${tier}`;
  }

  const ROLE_TOOLTIP: Readonly<Record<string, string>> = {
    groundskeeper:
      'Cuida el césped y las instalaciones del estadio. Un buen jardinero reduce las lesiones y mejora el control de balón.',
    fitness_coach:
      'Gestiona la preparación física y la recuperación. Detecta cansancio acumulado y avisa de riesgo de lesión antes de que ocurra.',
    commercial_director:
      'Negocia patrocinios, gestiona la imagen del club ante marcas, mide el momentum de la afición.',
    scouting_director:
      'Lidera la red de ojeadores. Cuanto mejor el director, más nombres llegan al radar y más fiables los informes.',
    finance_director:
      'Vigila la salud financiera del club. Avisa de problemas de tesorería y recuerda decisiones clave (precio del abono).',
    head_coach:
      'Trabaja con la plantilla en la pizarra y en el vestuario. Detecta tensiones internas y propone ajustes tácticos.',
  };

  type RoleInfo = Extract<PageData, { hasPlaythrough: true }>['roles'][number];
  type StaffRow = Extract<PageData, { hasPlaythrough: true }>['activeStaff'][number];

  function staffForRole(role: string): StaffRow | undefined {
    if (!data.hasPlaythrough) return undefined;
    return data.activeStaff.find((s) => s.role === role);
  }

  function tierBadgeClass(tier: number, maxHirable: number): string {
    if (tier > maxHirable) return 'btn-disabled';
    if (tier === 3) return 'btn-warning';
    if (tier === 2) return 'btn-info';
    return 'btn-outline';
  }
</script>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-bold">Staff</h1>
    <p class="opacity-60">
      Contrata especialistas para percibir más señales en cada nodo cascada.
    </p>
  </header>

  {#if !data.hasPlaythrough}
    <div class="alert alert-info">
      <span>Necesitas iniciar una carrera para gestionar el staff.</span>
    </div>
  {:else}
    {#if form?.error}
      <div class="alert alert-error">
        <span>{form.error}</span>
      </div>
    {/if}
    {#if form?.ok && form.hired}
      <div class="alert alert-success">
        <span>Contratado {experienceLabel(form.hired.tier).toLowerCase()} para {form.hired.role}.</span>
      </div>
    {/if}

    <section class="alert alert-info">
      <div>
        <div class="text-xs uppercase opacity-70">Tu reputación</div>
        <div class="text-lg font-bold">
          Nivel {data.reputationLevel} · staff máximo: {experienceLabel(data.maxHirableTier)}
        </div>
        <div class="text-xs opacity-80">
          {#if data.maxHirableTier < 3}
            Sube tu reputación a 4+ para acceder a staff tier 3 (perciben ×3 las cascadas).
          {:else}
            Acceso completo al pool de staff.
          {/if}
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {#each data.roles as r (r.role)}
        {@const current = staffForRole(r.role)}
        <div
          class="card card-compact bg-base-100 shadow border-l-4
                 {current ? 'border-l-success' : 'border-l-base-300'}"
        >
          <div class="card-body p-3">
            <!-- Header: icon + label tooltip + status -->
            <div class="flex items-center gap-2">
              <span class="text-2xl flex-shrink-0">{ROLE_ICON[r.role] ?? '🧑'}</span>
              <div
                class="tooltip tooltip-right cursor-help flex-1"
                data-tip={ROLE_TOOLTIP[r.role] ?? ''}
              >
                <h3 class="font-bold text-sm leading-tight underline decoration-dotted text-left">
                  {r.label}
                </h3>
              </div>
              {#if current}
                <span class="badge badge-success badge-sm">Activo</span>
              {:else}
                <span class="badge badge-ghost badge-sm">Vacante</span>
              {/if}
            </div>

            <!-- Current staff: avatar + name + tier + dismiss inline -->
            {#if current}
              <div class="flex gap-2 items-center mt-2 p-2 bg-base-200 rounded">
                <Avatar seed={`staff:${current.id}:${current.name}`} size={40} />
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm truncate">{current.name}</div>
                  <div class="text-[10px] opacity-70 leading-tight">
                    {experienceLabel(current.qualityTier)} · {current.weeklyEurK} €K/sem
                  </div>
                </div>
                <form
                  method="POST"
                  action="?/dismiss"
                  use:enhance
                  bind:this={dismissForms[r.role]}
                >
                  <input type="hidden" name="staffId" value={current.id} />
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs"
                    title="Despedir"
                    onclick={() =>
                      askConfirm(
                        `Despedir a ${current.name}`,
                        `Su contrato se cancelará esta semana. La plaza quedará vacante hasta que contrates un sustituto.`,
                        'Despedir',
                        true,
                        () => dismissForms[r.role]?.requestSubmit(),
                      )}
                  >
                    ✕
                  </button>
                </form>
              </div>
            {/if}

            <!-- Hire / upgrade buttons -->
            <div class="flex gap-1 mt-2">
              {#each [1, 2, 3] as tier}
                <form
                  method="POST"
                  action="?/hire"
                  use:enhance
                  class="flex-1"
                  bind:this={hireForms[`${r.role}:${tier}`]}
                >
                  <input type="hidden" name="role" value={r.role} />
                  <input type="hidden" name="tier" value={tier} />
                  <button
                    class="btn btn-block btn-xs {tierBadgeClass(tier, data.maxHirableTier)}
                           {current?.qualityTier === tier ? 'btn-disabled' : ''}"
                    type="button"
                    disabled={tier > data.maxHirableTier || current?.qualityTier === tier}
                    onclick={() =>
                      askConfirm(
                        current
                          ? `Cambiar a ${experienceLabel(tier)}`
                          : `Contratar ${experienceLabel(tier)} de ${r.label.toLowerCase()}`,
                        current
                          ? `Reemplazarás a ${current.name} por un nuevo ${experienceLabel(tier).toLowerCase()}. El salario semanal será ${data.wagesByTier[tier as 1 | 2 | 3]} €K.`
                          : `Fichas un nuevo ${experienceLabel(tier).toLowerCase()} de ${r.label.toLowerCase()}. Salario semanal: ${data.wagesByTier[tier as 1 | 2 | 3]} €K.`,
                        current ? 'Cambiar' : 'Contratar',
                        false,
                        () => hireForms[`${r.role}:${tier}`]?.requestSubmit(),
                      )}
                  >
                    {experienceLabel(tier).slice(0, 4)} · {data.wagesByTier[tier as 1 | 2 | 3]}€
                  </button>
                </form>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </section>

    <p class="text-xs opacity-60">
      Los mensajes que envía el staff aparecen en el dashboard cada vez que avanzas
      una semana. Staff Élite detecta cambios más sutiles que un Novato.
    </p>
  {/if}
</div>

<ConfirmDialog
  bind:open={confirmOpen}
  title={confirmTitle}
  message={confirmMessage}
  confirmLabel={confirmLabel}
  dangerous={confirmDangerous}
  onConfirm={runPending}
/>
