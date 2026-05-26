<!--
  Sidebar nav — links to all hud-ui pages + per-link notification dots.

  Story: HUD-UI-001 + MVP UX fixes (badges)
  Control Manifest: 2026-05-19
-->
<script lang="ts">
  import { page } from '$app/stores';
  import ClubShield from './club-shield.svelte';

  interface Props {
    open: boolean;
    badges: { pendingStops: number; unreadUrgent: number } | null | undefined;
    clubInfo?: {
      name: string;
      division: string;
      position: number | null;
      record: { wins: number; draws: number; losses: number } | null;
      balanceEurK: number | null;
      currentWeek: number;
      seasonNumber: number;
      kitPrimaryColor?: string | null;
      kitSecondaryColor?: string | null;
    } | null;
  }
  let { open = $bindable(), badges, clubInfo = null }: Props = $props();

  function divisionLabel(d: string): string {
    return {
      fifth: 'Quinta',
      fourth: 'Cuarta',
      third: 'Tercera',
      second: 'Segunda',
      first: 'Primera',
    }[d] ?? d;
  }
  function balanceColor(balance: number | null): string {
    if (balance === null) return '';
    if (balance < 0) return 'text-error';
    if (balance < 50) return 'text-warning';
    return 'text-success';
  }

  // dotFor returns the count to display next to a nav link, or 0 for no badge.
  function dotFor(href: string): number {
    if (!badges) return 0;
    if (href === '/calendar') return badges.pendingStops;
    if (href === '/dashboard') return badges.unreadUrgent;
    return 0;
  }

  const links = [
    { href: '/dashboard',  icon: '📊', label: 'Dashboard' },
    { href: '/squad',      icon: '👥', label: 'Plantilla' },
    { href: '/lineup',     icon: '⚽', label: 'XI titular' },
    { href: '/staff',      icon: '🧑‍💼', label: 'Staff' },
    { href: '/scouting',   icon: '🔍', label: 'Scouting' },
    { href: '/finance',    icon: '💰', label: 'Finanzas' },
    { href: '/league',     icon: '🏆', label: 'Liga' },
    { href: '/calendar',   icon: '📅', label: 'Calendario' },
    { href: '/city',       icon: '🏛', label: 'Museo' },
    { href: '/stadium',    icon: '🏟', label: 'Estadio' },
    { href: '/manager',    icon: '🧠', label: 'Mánager' },
  ] as const;
</script>

<aside
  class="bg-base-200 w-64 h-screen sticky top-0 transition-transform duration-200 z-20
         md:translate-x-0 {open ? 'translate-x-0' : '-translate-x-full'}
         md:relative absolute"
>
  <div class="p-3 border-b border-base-300">
    {#if clubInfo}
      <div class="flex items-start gap-2">
        <ClubShield
          name={clubInfo.name}
          primaryColor={clubInfo.kitPrimaryColor ?? '#1e3a8a'}
          secondaryColor={clubInfo.kitSecondaryColor ?? '#f8fafc'}
          size={42}
        />
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm truncate" title={clubInfo.name}>{clubInfo.name}</div>
        </div>
      </div>
      <div class="text-xs opacity-70 mt-0.5">
        {divisionLabel(clubInfo.division)} División
        {#if clubInfo.position}
          · {clubInfo.position}º
        {/if}
      </div>
      {#if clubInfo.record}
        <div class="text-xs font-mono mt-1 flex items-center gap-1 opacity-80">
          <span class="text-success">{clubInfo.record.wins}V</span>
          <span class="opacity-50">·</span>
          <span class="opacity-80">{clubInfo.record.draws}E</span>
          <span class="opacity-50">·</span>
          <span class="text-error">{clubInfo.record.losses}D</span>
        </div>
      {/if}
      {#if clubInfo.balanceEurK !== null}
        <div class="text-xs font-mono mt-1 {balanceColor(clubInfo.balanceEurK)}">
          💰 {clubInfo.balanceEurK.toLocaleString('es-ES')} k€
        </div>
      {/if}
      <div class="text-xs opacity-50 mt-0.5">Año {clubInfo.seasonNumber} · Semana {clubInfo.currentWeek}</div>
    {:else}
      <div class="text-xs uppercase opacity-50 tracking-wide">Total Soccer Manager</div>
      <div class="text-sm font-semibold">Manager dashboard</div>
    {/if}
  </div>
  <ul class="menu p-2 gap-1">
    {#each links as link}
      {@const dot = dotFor(link.href)}
      <li>
        <a
          href={link.href}
          class:active={$page.url.pathname.startsWith(link.href)}
        >
          <span class="text-lg">{link.icon}</span>
          <span class="flex-1">{link.label}</span>
          {#if dot > 0}
            <span class="badge badge-error badge-sm animate-pulse">{dot}</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
</aside>
