<!--
  VERTICAL SLICE - NOT FOR PRODUCTION
  Date: 2026-05-18
-->
<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";

  let { children } = $props();

  const tabs = [
    { href: "/", label: "📊 Inicio" },
    { href: "/calendar", label: "📅 Calendario" },
    { href: "/squad", label: "👥 Plantilla" },
    { href: "/staff", label: "💬 Staff" },
    { href: "/finance", label: "💰 Finanzas" },
    { href: "/manager", label: "👤 Manager" },
  ];

  // Status header pull: lightweight fetch for week + balance, refreshed on nav
  let weekLabel = $state("…");
  let positionLabel = $state("…");
  let fanLabel = $state("…");

  async function refreshStatus() {
    try {
      const [state, standings] = await Promise.all([
        fetch("/api/advance/state/playthrough-slice-001").then((r) => r.json()),
        fetch("/api/advance/standings/playthrough-slice-001").then((r) => r.json()),
      ]);
      const week = state?.playthrough?.currentWeek ?? "?";
      weekLabel = `S ${week}`;
      const player = standings?.find?.(
        (r: { clubId: string }) => r.clubId === state?.playthrough?.managerClubId,
      );
      positionLabel = player ? `${player.position}º` : "—";
      const fan = state?.snapshot?.state?.fan_momentum;
      // Quick domain label inline to avoid importing the full helper into the layout bundle
      if (fan == null) fanLabel = "Afición —";
      else if (fan < 20) fanLabel = "Afición en crisis";
      else if (fan < 35) fanLabel = "Afición desencantada";
      else if (fan < 50) fanLabel = "Afición inquieta";
      else if (fan < 65) fanLabel = "Afición neutra";
      else if (fan < 80) fanLabel = "Afición animada";
      else fanLabel = "Afición en llamas";
    } catch (err) {
      // API not running — keep placeholders
      weekLabel = "API ✗";
    }
  }

  $effect(() => {
    void $page.url.pathname;
    refreshStatus();
  });
</script>

<header class="status-header">
  <div class="title">Real Pueblo CF</div>
  <div class="metrics">
    <span>{weekLabel}</span>
    <span>{positionLabel}</span>
    <span>{fanLabel}</span>
  </div>
</header>

<main class="content">
  {@render children?.()}
</main>

<nav class="tab-bar">
  {#each tabs as tab}
    <a class:active={$page.url.pathname === tab.href} href={tab.href}>{tab.label}</a>
  {/each}
</nav>

<style>
  .status-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    padding: 0 var(--space-4);
    height: var(--status-header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .status-header .title {
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .status-header .metrics {
    display: flex;
    gap: var(--space-4);
    color: var(--fg-dim);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-sm);
  }
  .content {
    padding: var(--space-4);
    padding-bottom: calc(var(--tab-bar-height) + var(--space-5));
    min-height: calc(100vh - var(--status-header-height) - var(--tab-bar-height));
  }
  .tab-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--tab-bar-height);
    background: var(--bg-2);
    border-top: 1px solid var(--border);
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    z-index: 10;
  }
  .tab-bar a {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-dim);
    font-size: var(--text-xs);
    text-decoration: none;
    border-right: 1px solid var(--border);
  }
  .tab-bar a:last-child { border-right: none; }
  .tab-bar a.active { color: var(--accent); background: var(--bg-3); }
  .tab-bar a:hover { color: var(--fg); }
</style>
