<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Staff inbox — observations grouped by week.
  Date: 2026-05-18
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getStaffMessages, type StaffMessageDto } from "$lib/api";

  let messages: StaffMessageDto[] = $state([]);
  let error: string | null = $state(null);

  async function load() {
    try {
      messages = await getStaffMessages();
    } catch (err) {
      error = `API: ${(err as Error).message}`;
    }
  }

  function groupByWeek(msgs: StaffMessageDto[]): { week: number; items: StaffMessageDto[] }[] {
    const map = new Map<number, StaffMessageDto[]>();
    for (const m of msgs) {
      const list = map.get(m.week) ?? [];
      list.push(m);
      map.set(m.week, list);
    }
    return Array.from(map.entries())
      .map(([week, items]) => ({ week, items }))
      .sort((a, b) => b.week - a.week);
  }

  function roleName(role: string): string {
    if (role === "head_coach") return "Mateo · Entrenador";
    if (role === "fitness_coach") return "Iñaki · Preparador físico";
    if (role === "finance_director") return "Carmen · Directora financiera";
    return role;
  }

  function priorityClass(p: string): string {
    return p === "BLOCKING" ? "bad" : p === "ADVISORY" ? "warn" : "dim";
  }

  onMount(load);
</script>

<h1>Bandeja del staff</h1>

{#if error}
  <div class="panel" style="border-color: var(--bad); color: var(--bad);">{error}</div>
{:else if messages.length === 0}
  <p class="dim">Sin mensajes todavía. Avanza una semana para empezar a recibir observaciones del staff.</p>
{:else}
  {#each groupByWeek(messages) as group}
    <div class="panel" style="margin-bottom: var(--space-3);">
      <h2>Semana {group.week}</h2>
      <ul class="msg-list">
        {#each group.items as msg}
          <li>
            <div class="msg-meta">
              <span class="role">{roleName(msg.staffRole)}</span>
              <span class="badge {priorityClass(msg.priority)}">{msg.priority}</span>
              {#if msg.causalNodeId}<span class="node">{msg.causalNodeId}</span>{/if}
            </div>
            <div class="msg-body">"{msg.body}"</div>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
{/if}

<style>
  ul.msg-list { list-style: none; display: flex; flex-direction: column; gap: var(--space-3); }
  .msg-meta { display: flex; gap: var(--space-3); align-items: center; font-size: var(--text-xs); }
  .role { color: var(--fg-dim); }
  .badge { padding: 1px 6px; border-radius: 4px; background: var(--bg-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .badge.bad { background: var(--bad); color: var(--bg); }
  .badge.warn { background: var(--warn); color: var(--bg); }
  .node { color: var(--link); font-family: var(--font-mono); }
  .msg-body { font-style: italic; padding-left: var(--space-3); border-left: 2px solid var(--border); margin-top: var(--space-1); }
</style>
