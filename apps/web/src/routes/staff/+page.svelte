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

  let { data, form }: { data: PageData; form: ActionData } = $props();

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
        <span>Contratado tier {form.hired.tier} para {form.hired.role}.</span>
      </div>
    {/if}

    <section class="alert alert-info">
      <div>
        <div class="text-xs uppercase opacity-70">Tu reputación</div>
        <div class="text-lg font-bold">Nivel {data.reputationLevel} · staff máximo tier {data.maxHirableTier}</div>
        <div class="text-xs opacity-80">
          {#if data.maxHirableTier < 3}
            Sube tu reputación a 4+ para acceder a staff tier 3 (perciben ×3 las cascadas).
          {:else}
            Acceso completo al pool de staff.
          {/if}
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each data.roles as r (r.role)}
        {@const current = staffForRole(r.role)}
        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <div class="flex justify-between items-baseline">
              <div>
                <h3 class="font-bold text-lg">{r.label}</h3>
                <div class="text-xs opacity-60 font-mono">{r.role}</div>
              </div>
              {#if current}
                <span class="badge badge-success">Activo</span>
              {:else}
                <span class="badge badge-ghost">Vacante</span>
              {/if}
            </div>

            <div class="text-xs opacity-70 mt-1">
              Domina: <span class="font-mono">{r.domain.join(', ')}</span>
            </div>

            {#if current}
              <div class="mt-3 p-2 bg-base-200 rounded flex gap-3 items-center">
                <Avatar seed={`staff:${current.id}:${current.name}`} size={56} framed />
                <div class="flex-1">
                  <div class="font-semibold">{current.name}</div>
                  <div class="text-xs opacity-70">
                    Tier {current.qualityTier} · {current.weeklyEurK} €K/sem
                  </div>
                  <form
                    method="POST"
                    action="?/dismiss"
                    use:enhance
                    class="mt-1"
                  >
                    <input type="hidden" name="staffId" value={current.id} />
                    <button class="btn btn-ghost btn-xs" type="submit">
                      Despedir
                    </button>
                  </form>
                </div>
              </div>
              <div class="text-xs opacity-60 mt-2">¿Subir de tier?</div>
            {/if}

            <div class="flex gap-2 mt-2 flex-wrap">
              {#each [1, 2, 3] as tier}
                <form
                  method="POST"
                  action="?/hire"
                  use:enhance
                  class="flex-1 min-w-[6rem]"
                >
                  <input type="hidden" name="role" value={r.role} />
                  <input type="hidden" name="tier" value={tier} />
                  <button
                    class="btn btn-block btn-sm {tierBadgeClass(tier, data.maxHirableTier)}
                           {current?.qualityTier === tier ? 'btn-disabled' : ''}"
                    type="submit"
                    disabled={tier > data.maxHirableTier || current?.qualityTier === tier}
                  >
                    Tier {tier}
                    <span class="text-xs opacity-70 ml-1">
                      {data.wagesByTier[tier as 1 | 2 | 3]} €K
                    </span>
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
      una semana. Staff de tier 3 detecta cambios más sutiles que tier 1.
    </p>
  {/if}
</div>
