<!--
  Dev viewer: cascade-log + threshold-crossings for one world_snapshots row.

  Sprint 9 task 9-7. Read-only minimal table view for debugging.
-->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  function sourceColor(source: unknown): string {
    if (source === 'edge') return 'badge-primary';
    if (source === 'delayed') return 'badge-warning';
    if (source === 'decision') return 'badge-info';
    if (source === 'guarded') return 'badge-ghost';
    return 'badge-neutral';
  }
</script>

<svelte:head>
  <title>Cascade Log — playthrough {data.playthroughId} W{data.week}</title>
</svelte:head>

<div class="container mx-auto px-4 py-6 max-w-5xl">
  <header class="mb-4">
    <h1 class="text-2xl font-bold font-mono">Dev — Cascade Log</h1>
    <p class="text-sm opacity-70 mt-1">
      Playthrough <span class="font-mono">{data.playthroughId}</span> ·
      Week <span class="font-mono">{data.week}</span> ·
      Persisted <span class="font-mono">{new Date(data.createdAt).toISOString()}</span>
    </p>
  </header>

  <!-- WorldState -->
  <section class="card bg-base-200 shadow mb-4">
    <div class="card-body">
      <h2 class="card-title text-base">WorldState (Record&lt;NodeId, number&gt;)</h2>
      <table class="table table-sm font-mono text-xs">
        <thead>
          <tr><th>NodeId</th><th class="text-right">Value</th></tr>
        </thead>
        <tbody>
          {#each Object.entries(data.worldState) as [k, v]}
            <tr><td>{k}</td><td class="text-right">{v}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Cascade Log -->
  <section class="card bg-base-200 shadow mb-4">
    <div class="card-body">
      <h2 class="card-title text-base">
        cascade_log
        <span class="badge badge-sm">{data.cascadeLog.length} entries</span>
      </h2>
      {#if data.cascadeLog.length === 0}
        <p class="text-xs opacity-50 italic">
          No cascade_log persisted on this row. Either the snapshot pre-dates Sprint 8 task 8-1
          (when the column was added) or pre-dates Sprint 8 task 8-8 (when the dashboard advance
          form action began writing it).
        </p>
      {:else}
        <table class="table table-sm table-zebra font-mono text-xs">
          <thead>
            <tr>
              <th>source</th>
              <th>edgeId</th>
              <th>nodeId</th>
              <th class="text-right">delta</th>
              <th>fromNode</th>
              <th class="text-right">fromValue</th>
              <th class="text-right">delay</th>
            </tr>
          </thead>
          <tbody>
            {#each data.cascadeLog as entry}
              <tr>
                <td><span class="badge {sourceColor(entry.source)} badge-xs">{entry.source}</span></td>
                <td>{entry.edgeId ?? '—'}</td>
                <td>{entry.nodeId ?? '—'}</td>
                <td class="text-right">{(entry.delta as number)?.toFixed(3) ?? '—'}</td>
                <td>{entry.fromNode ?? '—'}</td>
                <td class="text-right">{(entry.fromValue as number)?.toFixed(2) ?? '—'}</td>
                <td class="text-right">{entry.delay ?? '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>

  <!-- Threshold Crossings -->
  <section class="card bg-base-200 shadow mb-4">
    <div class="card-body">
      <h2 class="card-title text-base">
        threshold_crossings
        <span class="badge badge-sm">{data.thresholdCrossings.length} entries</span>
      </h2>
      {#if data.thresholdCrossings.length === 0}
        <p class="text-xs opacity-50 italic">No threshold crossings fired this tick.</p>
      {:else}
        <pre class="text-xs bg-base-300 p-3 rounded overflow-auto">{JSON.stringify(
          data.thresholdCrossings,
          null,
          2,
        )}</pre>
      {/if}
    </div>
  </section>

  <!-- Delayed Effects Buffer -->
  <section class="card bg-base-200 shadow mb-4">
    <div class="card-body">
      <h2 class="card-title text-base">
        delayed_effects_buffer (next-week pending)
        <span class="badge badge-sm">{data.delayedEffectsBuffer.length} effects</span>
      </h2>
      {#if data.delayedEffectsBuffer.length === 0}
        <p class="text-xs opacity-50 italic">No pending delayed effects.</p>
      {:else}
        <table class="table table-sm font-mono text-xs">
          <thead>
            <tr><th>applyAt</th><th>toNode</th><th class="text-right">delta</th><th>edgeId</th></tr>
          </thead>
          <tbody>
            {#each data.delayedEffectsBuffer as eff}
              <tr>
                <td>W{eff.applyAt}</td>
                <td>{eff.toNode}</td>
                <td class="text-right">{(eff.delta as number)?.toFixed(3)}</td>
                <td>{eff.edgeId}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>

  <!-- Seed State -->
  {#if data.seedState}
    <section class="card bg-base-200 shadow mb-4">
      <div class="card-body">
        <h2 class="card-title text-base">seed_state (match-week PRNG snapshot)</h2>
        <pre class="text-xs bg-base-300 p-3 rounded overflow-auto break-all">{data.seedState}</pre>
      </div>
    </section>
  {/if}

  <footer class="text-xs opacity-50 mt-6">
    Sprint 9 task 9-7. Dev tool — disable /dev/* in production deploys.
  </footer>
</div>
