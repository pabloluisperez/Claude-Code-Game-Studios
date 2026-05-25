---
Story: STADIUM-UPGRADES-008
Status: Ready
Type: UI
GDD Requirement: AC-SU-33/34/37/38/40
Governing ADR: ADR-029 §D8, ADR-012 (UI architecture), ADR-024 (canvas a11y fallback)
Control Manifest: 2026-05-19
Test Evidence: apps/web/tests/stadium-page.e2e.ts (playwright, pending)
ImplementedAt: apps/web/src/routes/stadium/+page.svelte (refactor) + apps/web/src/routes/stadium/+page.server.ts (refactor)
---

# Story: /stadium SvelteKit UI — catalog + queue + Socket.IO realtime feedback

## Goal

Replace the placeholder `/stadium` UI (existing at `apps/web/src/routes/stadium/+page.svelte`) with full catalog + queue display, integrated with new `/api/stadium/*` endpoints. Subscribe to Socket.IO `stadium:item_complete` event for immediate visual feedback (no page reload).

## Scope

### Server load: `apps/web/src/routes/stadium/+page.server.ts`

Replace placeholder logic with:

```typescript
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  if (!locals.session) throw redirect(303, '/login');
  const catalogRes = await fetch('/api/stadium/catalog');
  const catalog = await catalogRes.json();
  return { catalog };
};

export const actions = {
  buy: async ({ request, fetch }) => {
    const data = await request.formData();
    const res = await fetch('/api/stadium/buy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemSlug: data.get('itemSlug'), acceptRisk: data.get('acceptRisk') === 'true' }),
    });
    return { result: await res.json(), status: res.status };
  },
  cancel: async ({ request, fetch }) => {
    const data = await request.formData();
    const res = await fetch('/api/stadium/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: data.get('itemId') }),
    });
    return { result: await res.json(), status: res.status };
  },
};
```

### Page: `apps/web/src/routes/stadium/+page.svelte`

Full rewrite (replacing placeholder). Use Svelte 5 runes. Sections:

1. **Stadium close-up** (top): preserve existing HD sprite display based on tier; UPDATE to use `stadium_visual_level` (0-9) from server, mapping to sprite filename.
2. **Active obra widget**: if `data.catalog.active`, display name + weeks remaining + cancel button (with confirm dialog)
3. **Catalog grid**: 5 tracks × 4 niveles grouped visually
4. **Each item card**: shows name, cost, duration, status, action button
   - `Available`: "Comprar" button (form action `?/buy`)
   - `Queued`: disabled "En cola"
   - `InProgress`: only the active widget shows
   - `Complete`: check mark + completion date
   - `Locked`: gray + tooltip with prereq
5. **Critical-balance warning dialog**: if buy returns 409 with `CRITICAL_BALANCE_WARNING`, open confirm modal; on confirm, re-POST with `acceptRisk: true`
6. **DOM fallback** (a11y): when no PixiJS, the sprite area shows text "[Estadio nivel visual: N]" — see AC-SU-38

### Socket.IO client subscription

```typescript
import { socket } from '$lib/socket-client';

onMount(() => {
  socket.on('stadium:item_complete', (payload) => {
    if (payload.clubId !== currentClubId) return;
    // Invalidate page data → SvelteKit refetches catalog
    invalidate('/api/stadium/catalog');
  });

  return () => socket.off('stadium:item_complete');
});
```

### Sprite mapping

```typescript
function getStadiumSprite(visualLevel: number): string {
  // 10 levels → 10 sprites
  return `/sprites/stadium/level-${visualLevel}.png`;
}
```

In v1.1, only 4 HD sprites exist (stadium-t0/t1/t2/t3). Map 10 levels to 4 sprites until full 10-level art ships:
- level 0-1 → t0-amateur
- level 2-3 → t1-local
- level 4-6 → t2-regional
- level 7-9 → t3-premier

Document this in a TODO comment and an art-asset story (separate from this story).

## Out of Scope

- Asset spec sheet for 10-level sprite series (separate art story, post-implementation)
- Animations/transitions (deferred to polish)
- A11y screen-reader optimizations beyond DOM fallback (ADR-024 covers)

## Acceptance Criteria

1. `/stadium` renders catalog grid with all 40 items
2. Each item shows correct status (Locked/Available/Queued/InProgress/Complete)
3. `Available` button is clickable; click → opens form action `?/buy`
4. Buy success → page invalidates and updates UI
5. Buy returns `CRITICAL_BALANCE_WARNING` → modal shows with confirm/cancel; confirm re-POSTs with `acceptRisk: true`
6. Active obra widget shows when an item is `InProgress` — displays weeks remaining
7. Cancel button on active obra → confirm dialog → form action `?/cancel`
8. Socket.IO `stadium:item_complete` event → page invalidates → sprite updates without full reload
9. Sprite displayed matches `stadium_visual_level` (mapped to 4 HD tiers in v1.1)
10. DOM fallback: when canvas not available, sprite area shows text "[Estadio nivel visual: N]"
11. Page-load <500ms (AC-SU-37)
12. svelte-check passes with 0 errors
13. Keyboard navigation works: Tab through items, Enter to buy

## Test Requirements (UI/E2E)

`apps/web/tests/stadium-page.e2e.ts` (Playwright):

- Login as test user
- Navigate to `/stadium`
- Verify 40 items render
- Click "Comprar" on a T1 item → form action triggers → wait for refresh → item now InProgress
- Cancel the active obra → balance refund visible
- Verify Critical Balance Warning flow (login as broke user → try buying T2 → warning shown → confirm → buy proceeds)

Plus manual playwright recording for visual review (AC 9-10).

## QA Test Cases

Source: `production/qa/qa-plan-sprint-22-2026-05-25.md §22-8`.

**Test file**: `apps/web/tests/stadium-page.e2e.ts` (Playwright, ~10 e2e tests).

**E2E happy paths**:
1. Login + navigate `/stadium` → 40 catalog items rendered (count by selector)
2. Each item shows correct status badge (Locked/Available/Queued/InProgress/Complete)
3. Click "Comprar" on T1 Available → form action POSTs → refresh → item now InProgress + active widget visible
4. Cancel active obra → confirm dialog → form action POSTs → refund reflected in balance
5. **Critical-balance flow**: broke user tries T2 buy → 409 warning modal → click "Acepto riesgo" → re-POST with `acceptRisk: true` → buy succeeds
6. **Socket.IO realtime**: 2 tabs same user → complete item via API in tab A → tab B catalog auto-invalidates + updates
7. Sprite `src` matches `stadium-v{N}.png` for the current `stadium_visual_level`
8. DOM fallback: canvas-disabled context → text `[Estadio nivel visual: N]` rendered
9. Page-load < 500ms (AC-SU-37) — Playwright timing API
10. Keyboard-only: Tab through catalog cards, Enter to buy

**Edge cases**:
- Fresh club (0 completed): all T1 Available, T2+ Locked with prereq tooltip
- All 40 complete: no "Comprar" buttons available
- Active obra cancelled in another tab → Socket.IO syncs both tabs
- Rapid double-click "Comprar" → only 1 POST (form action debounce)

**Manual evidence** (BLOCKING — story is `Type: UI`):
- [ ] **10 screenshots** of the stadium hero at each `stadium_visual_level: 0..9` → `production/qa/evidence/22-8-visual-levels/*.png`
- [ ] Video: buy flow end-to-end (Available → InProgress → Complete with sprite swap) → `production/qa/evidence/22-8-buy-flow.mp4`
- [ ] Video: critical-balance warning flow (warning → confirm → buy) → `production/qa/evidence/22-8-critical-balance-flow.mp4`
- [ ] **Playtest** ~45 min, returning player + fresh player → `production/playtests/[date]-sprint-22-stadium.md`

## Dependencies

- **Upstream**: 006 (routes), 002 (catalog), 003 (visualLevel formula for sprite mapping)
- **Downstream**: None — terminal story for the epic
- **Sibling**: Backend Socket.IO emit on Complete (part of story 005's post-tx step)

## Estimate

**2 days.** UI is the largest single story — full page, form actions, Socket.IO subscribe, modal flow, sprite mapping.

## Notes / Gotchas

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) per technical-preferences.md. NO stores-first reactivity.
- Use `onclick={fn}` syntax, NOT `on:click` (Svelte 5 HTML-style per forbidden patterns).
- Catalog data has ~40 items — group visually by track (5 collapsible sections) to avoid overwhelming the screen.
- For mobile PWA, ensure the active obra widget is sticky at top so it's always visible on small screens.
- Confirm dialog for cancel uses existing dialog component (find via grep `apps/web/src/lib/components/`); reuse don't reinvent.
- Socket.IO subscription: ensure the existing socket-client lib has been set up (apps/web/src/lib/socket-client.ts). If not, this story needs a small auxiliary story for socket setup — flag during implementation.
