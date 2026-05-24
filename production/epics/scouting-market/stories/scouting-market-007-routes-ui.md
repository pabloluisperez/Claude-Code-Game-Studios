---
Story: SCOUTING-MARKET-007
Status: Ready
Type: UI
GDD Requirement: AC-SCM-24/25/26/27/28/29
Governing ADR: ADR-031 §D3, §D9
Control Manifest: 2026-05-19
Test Evidence: apps/web/tests/scouting-page.e2e.ts (playwright)
ImplementedAt: apps/api/src/modules/scouting-market/routes.ts + apps/web/src/routes/scouting/+page.svelte + +page.server.ts
---

# Story: Hono routes + SvelteKit /scouting UI + Socket.IO realtime

## Goal

Expose the scouting-market service via REST endpoints under `/api/scouting`. Build the SvelteKit `/scouting` route with pool browser, filters, saved searches, scout action buttons, offer modal, and counter-offer flow. Subscribe to Socket.IO events for live tier updates and rotation status.

## Scope

### Hono routes — `apps/api/src/modules/scouting-market/routes.ts`

10 endpoints per ADR-031 §D3:

```typescript
const app = new Hono();
app.use('*', requireSession);

// Block on rotation not complete
app.use('*', async (c, next) => {
  const windowId = await getCurrentWindowId();
  const status = await getWindowStatus(windowId);
  if (status && !status.rotationCompletedAt) {
    return c.json({ error: 'ROTATION_IN_PROGRESS' }, 503, { 'Retry-After': '5' });
  }
  await next();
});

app.get('/pool', async (c) => {
  const session = c.get('session');
  const filters = parseFiltersFromQuery(c.req.query());
  const pool = await service.getPool({ clubId: session.clubId, filters });
  return c.json({ pool });
});

app.get('/player/:id', async (c) => {
  const playerId = c.req.param('id');
  const session = c.get('session');
  const player = await service.getPlayerForManager({ clubId: session.clubId, playerId });
  if (!player) return c.json({ error: 'PLAYER_NOT_FOUND' }, 404);
  return c.json({ player });
});

const ScoutSchema = z.object({ playerId: z.string().uuid() });
app.post('/scout', zValidator('json', ScoutSchema), async (c) => {
  const { playerId } = c.req.valid('json');
  const session = c.get('session');
  const result = await service.initiateScout({ clubId: session.clubId, playerId, actionType: 'scout', windowId: await getCurrentWindowId() });
  return result.ok ? c.json(result.value) : errorResponse(c, result.error);
});

// Similar for /deep-scout, /offer, /offer/:id/accept-counter, /offer/:id/withdraw, /offers, /searches CRUD

function errorResponse(c, error: string) {
  const map: Record<string, number> = {
    'WINDOW_CLOSED': 400, 'INVALID_PREREQ': 400, 'INSUFFICIENT_BALANCE': 402,
    'INSUFFICIENT_STAFF': 403, 'PLAYER_NOT_FOUND': 404, 'MAX_BIDS_REACHED': 409,
    'PLAYER_GONE': 410, 'PLAYER_REJECTED_THIS_WINDOW': 409, 'NOT_FOUND': 404,
    'NOT_COUNTERED': 409,
  };
  return c.json({ error }, map[error] ?? 500);
}
```

### SvelteKit `/scouting` route

`apps/web/src/routes/scouting/+page.server.ts`:

```typescript
export const load: PageServerLoad = async ({ fetch, locals }) => {
  if (!locals.session) throw redirect(303, '/login');
  const poolRes = await fetch('/api/scouting/pool');
  if (poolRes.status === 503) {
    return { rotationInProgress: true };
  }
  const pool = await poolRes.json();
  const savedSearchesRes = await fetch('/api/scouting/searches');
  return { pool, savedSearches: await savedSearchesRes.json() };
};

export const actions = {
  scout: async ({ request, fetch }) => { /* POST to /api/scouting/scout */ },
  deepScout: async ({ request, fetch }) => { /* POST to /api/scouting/deep-scout */ },
  makeOffer: async ({ request, fetch }) => { /* POST /api/scouting/offer */ },
  acceptCounter: async ({ request, fetch }) => { /* POST /api/scouting/offer/:id/accept-counter */ },
  saveSearch: async ({ request, fetch }) => { /* POST /api/scouting/searches */ },
};
```

`apps/web/src/routes/scouting/+page.svelte`:

```svelte
<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { socket } from '$lib/socket-client';
  import PlayerCard from '$lib/components/scouting/PlayerCard.svelte';
  import FilterBar from '$lib/components/scouting/FilterBar.svelte';
  import SavedSearchesSidebar from '$lib/components/scouting/SavedSearchesSidebar.svelte';
  import OfferModal from '$lib/components/scouting/OfferModal.svelte';
  import CounterOfferModal from '$lib/components/scouting/CounterOfferModal.svelte';

  let { data } = $props();
  let selectedPlayer: PoolPlayer | null = $state(null);
  let offerModalOpen: boolean = $state(false);
  let counterOfferModal: CounterOffer | null = $state(null);
  let activeFilters = $state(defaultFilters());

  onMount(() => {
    socket.on('scouting:scout_complete', () => invalidate('/api/scouting/pool'));
    socket.on('scouting:offer_resolved', (data) => {
      if (data.status === 'countered') counterOfferModal = data;
      else invalidate('/api/scouting/pool');
    });
    socket.on('scouting:window_rotation_complete', () => invalidate('/api/scouting/pool'));
    return () => { socket.off('scouting:scout_complete'); /* ... */ };
  });
</script>

{#if data.rotationInProgress}
  <div class="rotation-spinner">
    <h2>Generando mercado de fichajes...</h2>
    <p>Los clubs IA están moviéndose. Vuelve en unos segundos.</p>
  </div>
{:else}
  <div class="scouting-route">
    <aside class="filters">
      <FilterBar bind:activeFilters />
      <SavedSearchesSidebar searches={data.savedSearches} onApply={(s) => activeFilters = s.filters} />
    </aside>
    <main class="pool">
      <h1>Mercado de Fichajes</h1>
      <p class="window-info">Ventana actual: {data.currentWindowName}</p>
      <ul class="player-list">
        {#each filteredPool(data.pool, activeFilters) as player (player.id)}
          <PlayerCard {player} onSelect={() => selectedPlayer = player} />
        {/each}
      </ul>
    </main>
  </div>

  {#if selectedPlayer}
    <PlayerDetail player={selectedPlayer} onClose={() => selectedPlayer = null} onOffer={() => offerModalOpen = true} />
  {/if}

  {#if offerModalOpen && selectedPlayer}
    <OfferModal player={selectedPlayer} onClose={() => offerModalOpen = false} />
  {/if}

  {#if counterOfferModal}
    <CounterOfferModal counter={counterOfferModal} onAccept={...} onReject={...} />
  {/if}
{/if}
```

Component files (new):
- `apps/web/src/lib/components/scouting/PlayerCard.svelte` — list item showing T0/T1/T2/T3 info
- `apps/web/src/lib/components/scouting/FilterBar.svelte` — 7 filter controls per §3.6 of GDD
- `apps/web/src/lib/components/scouting/PlayerDetail.svelte` — full info pane + action buttons
- `apps/web/src/lib/components/scouting/OfferModal.svelte` — fee + wage + duration form
- `apps/web/src/lib/components/scouting/CounterOfferModal.svelte` — accept/reject counter
- `apps/web/src/lib/components/scouting/SavedSearchesSidebar.svelte` — save/load/delete

### Sidebar nav update

Edit `apps/web/src/routes/+layout.svelte` (or sidebar component) — add:

```svelte
<a href="/scouting" class:active={$page.url.pathname === '/scouting'}>🔍 Mercado</a>
```

## Out of Scope

- A11y screen-reader optimizations beyond keyboard nav + heading hierarchy
- Mobile-specific UX optimizations (basic responsive at 375px is required, full mobile UX deferred)
- Player portrait sprites (use generic silhouette in v1.1)

## Acceptance Criteria

1. GET `/api/scouting/pool` returns filtered pool with tier-stripped fields
2. POST `/api/scouting/scout` happy path → 200 with actionId
3. All endpoints return 503 with Retry-After during AI rotation
4. `/scouting` page renders pool list (40-100 items typical) within 800ms (AC-SCM-28)
5. Filter bar updates list reactively
6. Saved searches load + apply correctly
7. Click on player card → opens PlayerDetail
8. Click "Scout player" → form submit → balance debited → success modal
9. Click "Make offer" → opens OfferModal → submit → either accepted / countered / rejected
10. Counter-offer modal: accept → transfer executes; reject → return to pool
11. Socket.IO `scouting:scout_complete` event → pool invalidates and refreshes
12. Socket.IO `scouting:window_rotation_complete` event → page invalidates and shows live data
13. T0 player card shows: name, age, position, club, contract status (5 fields)
14. T1 player card adds: ovrBand, transferValueBand
15. T2 player card adds: ovrEstimate, transferValueEstimate, moraleBand
16. T3 player card adds: ovrExact, transferValueExact, moraleExact, fitnessExact, recent form
17. Keyboard nav: Tab through player list, Enter selects, Esc closes modals
18. Heading hierarchy correct: h1 page, h2 sections, h3 modals (WCAG 2.1 AA)
19. svelte-check 0 errors
20. Mobile responsive at 375px (sidebar collapses to top bar)

## Test Requirements (UI/E2E)

`apps/web/tests/scouting-page.e2e.ts` (Playwright):

- Login as test user with known scouting_network_level
- Navigate to `/scouting`
- Verify pool list renders with expected count (per F5)
- Apply position filter → list shrinks correctly
- Save a search → reload page → search appears in sidebar
- Click scout on player → success modal + balance decreases
- Click make offer → counter-offer scenario → accept → player.currentClub updated

`apps/api/tests/scouting-routes.test.ts`:

- All 10 endpoints respond correctly to valid + invalid input
- Tier stripping verified server-side
- 503 returned during rotation (mock window status)

## Dependencies

- **Upstream**: 004 (scout service), 005 (offer service), 006 (rotation worker)
- **Downstream**: None — terminal story

## Estimate

**2 days.** UI is the largest story — multiple components + Socket.IO + form actions.

## Notes / Gotchas

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) per technical-preferences.md. NO stores-first.
- Use `onclick={fn}` syntax — `on:click` is forbidden per Svelte 5 rules.
- For mobile: collapse sidebar filters to top bar, player list becomes single-column.
- Performance optimization: virtualize the player list if >50 items (use `svelte-virtual-list` or similar). Otherwise simple list is fine.
- Socket.IO subscription: reuse existing `$lib/socket-client.ts` setup from stadium-upgrades-008.
- Counter-offer modal blocks other actions — it's a hard interrupt. Show clearly.
- Filters in URL query: persist filters in `?position=DEF&age=21-25` etc. so back button + bookmark work.
- The 7 components are NEW (scouting/*) — flag for art-director if portraits are wanted (otherwise generic icon).
