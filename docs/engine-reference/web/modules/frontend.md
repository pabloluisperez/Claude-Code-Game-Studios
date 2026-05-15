# Frontend Module — SvelteKit 2 + Svelte 5

Scope: `apps/web/` — the SvelteKit application. UI components, routing, client
state, form handling, Socket.IO client wiring.

> **Last verified:** 2026-05-15

## Routing

File-based, in `src/routes/`. Key conventions:

| File | Runs where | Purpose |
|------|-----------|---------|
| `+page.svelte` | Client (+ optional SSR) | The page UI |
| `+page.ts` | Both | Universal load (safe data) |
| `+page.server.ts` | Server only | Server-only load, form actions, db access |
| `+layout.svelte` | As children | Wraps nested routes |
| `+layout.server.ts` | Server only | Layout data (e.g. current user) |
| `+server.ts` | Server only | REST endpoints (rare — use Hono in `apps/api` instead) |
| `+error.svelte` | Client | Error boundary |

**Rule**: data that touches the database goes in `+*.server.ts`. Game state
mutations must call `apps/api`, never query the DB directly from `apps/web`.

## Component Structure

```
src/lib/
├── components/        # Reusable presentational components
│   ├── ui/            # Generic (Button, Modal, Tabs)
│   └── domain/        # Domain-specific (PlayerCard, MatchTicker, LeagueTable)
├── stores/            # Cross-route reactive stores (sparingly)
├── api.ts             # Hono RPC client
├── sockets/           # Socket.IO client wiring + typed event helpers
└── utils/             # Pure helpers (formatters, date math)
```

## State Strategy

| Scope | Tool |
|-------|------|
| Component-local | `$state(...)` |
| Derived | `$derived(...)` or `$derived.by(() => ...)` |
| Cross-component within page | Pass via props or context (`setContext`/`getContext`) |
| Cross-route | Svelte stores (`writable`/`derived` from `svelte/store`) |
| Server state cache | Direct fetch on load; revalidate via `invalidate()` |
| Real-time updates | Socket.IO event handlers that call `invalidate(...)` or update stores |

Never store derived data — recompute with `$derived`.

## Forms

Always use SvelteKit form actions with `use:enhance`. Validate with Zod
schemas imported from `packages/shared/schemas/`.

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
  let submitting = $state(false);
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      submitting = false;
      await update();
    };
  }}
>
  <input name="name" required>
  {#if form?.errors?.name}<span class="error">{form.errors.name}</span>{/if}
  <button disabled={submitting}>Crear</button>
</form>
```

For complex multi-step or live-validated forms, use `superforms` (allowed
library — see `PLUGINS.md`).

## Tables (TanStack Table)

Default for any sortable/filterable list (squad, market, transfers, calendar):

```svelte
<script lang="ts" generics="T">
  import { createSvelteTable, getCoreRowModel } from '@tanstack/svelte-table';

  let { data, columns }: { data: T[]; columns: ColumnDef<T>[] } = $props();

  const table = createSvelteTable({
    get data() { return data; },
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
</script>
```

Reactive `get data()` keeps the table in sync with rune state.

## Canvas / PixiJS

PixiJS Application instances are **not** reactive — wrap them in
`$state.raw(...)` to avoid Svelte's deep proxy:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { Application } from 'pixi.js';

  let canvas: HTMLCanvasElement;
  let app = $state.raw<Application | null>(null);

  onMount(() => {
    const a = new Application();
    a.init({ canvas, resizeTo: canvas.parentElement! }).then(() => (app = a));
    return () => a.destroy(true);
  });
</script>

<canvas bind:this={canvas}></canvas>
```

Game render loops run inside `app.ticker.add(...)`, not Svelte's
reactivity system. Push state in via `app.stage.children` mutations.

## Theming

DaisyUI themes are switched via `data-theme="<name>"` on `<html>`. Store
the preference in a cookie + `localStorage`. Read in `+layout.server.ts`
so SSR matches client.

## Accessibility

- All interactive elements must be keyboard-accessible (Svelte will warn
  if `onclick` exists without `onkeydown` on a non-button)
- Use semantic HTML (`<button>`, `<nav>`, `<dialog>`) before reaching for ARIA
- `aria-live="polite"` for match ticker / score updates
- Focus management: trap focus in modals; restore on close
- Honor `prefers-reduced-motion` for any animation > 200ms

## Performance

- Code-split routes are automatic — don't `import` whole page modules from layouts
- Lazy-load PixiJS only on routes that use it: `const { Application } = await import('pixi.js')`
- Avoid `$effect` for derivations — use `$derived`
- Use `{#key}` blocks only when a full DOM remount is intentional

## Testing

| Type | Tool | Location |
|------|------|----------|
| Component logic | Vitest + `@testing-library/svelte` | `apps/web/src/**/*.test.ts` |
| Visual regression | Playwright screenshots | `tests/e2e/visual/` |
| E2E flows | Playwright | `tests/e2e/` |

Render components with `render()`, query via roles (`getByRole('button')`),
not by classes or test IDs unless unavoidable.

## File Naming

- Routes: `+page.svelte`, `+page.server.ts` (SvelteKit-mandated)
- Components: `PascalCase.svelte` (e.g. `PlayerCard.svelte`)
- Stores: `camelCase.ts` (e.g. `userPreferences.ts`)
- Types: re-exported from `packages/shared/types/`, never duplicated locally
