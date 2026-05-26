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

  // Pablo 2026-05-26: grouped navigation.
  type NavLink = { href: string; icon: string; label: string };
  type NavItem =
    | { kind: 'link'; href: string; icon: string; label: string }
    | { kind: 'group'; icon: string; label: string; children: NavLink[] };

  const nav: NavItem[] = [
    { kind: 'link', href: '/dashboard', icon: '📊', label: 'Dashboard' },
    {
      kind: 'group',
      icon: '⚽',
      label: 'Entrenador',
      children: [
        { href: '/lineup', icon: '📋', label: 'Alineación' },
        { href: '/squad', icon: '👥', label: 'Plantilla' },
      ],
    },
    {
      kind: 'group',
      icon: '🏆',
      label: 'Liga',
      children: [
        { href: '/league', icon: '📊', label: 'Clasificación' },
        { href: '/matches', icon: '🆚', label: 'Partidos' },
        { href: '/calendar', icon: '📅', label: 'Eventos' },
      ],
    },
    {
      kind: 'group',
      icon: '🏛',
      label: 'El club',
      children: [
        { href: '/scouting', icon: '🔍', label: 'Fichajes' },
        { href: '/staff', icon: '🧑‍💼', label: 'Empleados del club' },
        { href: '/finance', icon: '💰', label: 'Decisiones' },
        { href: '/stadium', icon: '🏟', label: 'Estadio' },
        { href: '/city', icon: '🏛', label: 'Museo' },
      ],
    },
    { kind: 'link', href: '/manager', icon: '🧠', label: 'Mánager' },
  ];

  function isActive(href: string): boolean {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  }
  // A group's badge = sum of its children's badges.
  function groupDot(children: NavLink[]): number {
    return children.reduce((sum, c) => sum + dotFor(c.href), 0);
  }
  // A group is open if any child route is active.
  function groupHasActive(children: NavLink[]): boolean {
    return children.some((c) => isActive(c.href));
  }
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
      <div class="text-xs opacity-50 mt-0.5">Año {clubInfo.seasonNumber} · Jornada {clubInfo.currentWeek}</div>
    {:else}
      <div class="text-xs uppercase opacity-50 tracking-wide">Total Soccer Manager</div>
      <div class="text-sm font-semibold">Manager dashboard</div>
    {/if}
  </div>
  <ul class="menu p-2 gap-1">
    {#each nav as item (item.label)}
      {#if item.kind === 'link'}
        {@const dot = dotFor(item.href)}
        <li>
          <a href={item.href} class:active={isActive(item.href)}>
            <span class="text-lg">{item.icon}</span>
            <span class="flex-1">{item.label}</span>
            {#if dot > 0}
              <span class="badge badge-error badge-sm animate-pulse">{dot}</span>
            {/if}
          </a>
        </li>
      {:else}
        {@const gDot = groupDot(item.children)}
        <li>
          <details open={groupHasActive(item.children)}>
            <summary>
              <span class="text-lg">{item.icon}</span>
              <span class="flex-1">{item.label}</span>
              {#if gDot > 0}
                <span class="badge badge-error badge-sm animate-pulse">{gDot}</span>
              {/if}
            </summary>
            <ul>
              {#each item.children as child (child.href)}
                {@const dot = dotFor(child.href)}
                <li>
                  <a href={child.href} class:active={isActive(child.href)}>
                    <span>{child.icon}</span>
                    <span class="flex-1">{child.label}</span>
                    {#if dot > 0}
                      <span class="badge badge-error badge-sm animate-pulse">{dot}</span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </details>
        </li>
      {/if}
    {/each}
  </ul>
</aside>
