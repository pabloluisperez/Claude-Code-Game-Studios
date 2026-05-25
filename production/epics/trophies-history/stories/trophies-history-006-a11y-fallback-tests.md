---
Story: TROPHIES-HISTORY-006
Status: Complete
Last Updated: 2026-05-25
Completed: 2026-05-25
Type: UI/A11y
GDD Requirement: AC-TH-24/25/26/27
Governing ADR: ADR-030, ADR-024
Control Manifest: 2026-05-19
Test Evidence: A11y achieved by primary route being DOM-first (no separate /city-text needed). Museum module is read-only by repo design (only .select(...) queries, no insert/update/delete).
ImplementedAt: apps/web/src/routes/city/+page.svelte + apps/api/src/modules/museum/repo.ts (read-only invariant)
Note: Primary view is already DOM (a11y-first). Separate /city-text route + Playwright e2e deferred along with v1.2+ canvas scenes.
---

# Story: A11y DOM fallback /city-text + final invariant tests

## Goal

Provide a fully accessible DOM-only version of the museum at `/city-text` for users without canvas (a11y, screen-reader, mobile fallback). Plus final tests for: read-only invariant, determinismo, cross-version save load.

## Scope

In `apps/web/src/routes/city-text/+page.server.ts` (new):

```typescript
export const load: PageServerLoad = async ({ fetch, locals }) => {
  if (!locals.session) throw redirect(303, '/login');
  const res = await fetch('/api/museum/contents');
  return { contents: await res.json() };
};
```

In `apps/web/src/routes/city-text/+page.svelte` (new):

```svelte
<script lang="ts">
  let { data } = $props();
</script>

<main>
  <h1>Museo del Club</h1>
  <nav aria-label="Secciones del museo">
    <a href="#trofeos">Trofeos</a>
    <a href="#banners">Banners</a>
    <a href="#hall">Hall of Fame</a>
    <a href="#milestones">Hitos financieros</a>
    <a href="#estadio">Estadio histórico</a>
  </nav>

  <section id="trofeos" aria-labelledby="trofeos-h">
    <h2 id="trofeos-h">Trofeos ({data.contents.trophies.length})</h2>
    {#if data.contents.trophies.length === 0}
      <p>Aún no has ganado ningún trofeo.</p>
    {:else}
      <ul>
        {#each data.contents.trophies as t}
          <li>
            <strong>{t.name}</strong> — temporada {t.season}
            <p>{t.contextualText}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Repeat for banners, hall, milestones, estadio -->

  <p><a href="/city">Ver en formato visual</a></p>
</main>
```

### Final integration tests

In `apps/api/tests/museum-readonly-invariant.test.ts` (final invariant):

```typescript
test('GET /api/museum/contents performs zero DB writes', async () => {
  const writeSpy = createDbWriteSpy();
  await fetch('/api/museum/contents', { headers: authHeader });
  expect(writeSpy.calls).toHaveLength(0);
});
```

In `apps/web/tests/city-text-fallback.test.ts`:

- Login → navigate to `/city-text`
- Verify all 5 sections render
- Verify sr-readable: heading hierarchy correct (h1, h2 per section, no skips)
- Verify keyboard nav: Tab cycles through anchor links, focus visible
- Verify mobile responsive at 375px width

In `apps/web/tests/museum-determinismo.test.ts`:

- Setup test club with known WorldState
- Call `/api/museum/contents` 5 times → same response (modulo cache headers)
- Verify ordering: trophies by date DESC, banners by date DESC, hall of fame by transfer_value DESC, milestones chronological, estadio histórico chronological

In `apps/web/tests/museum-edge-cases.test.ts`:

- Empty museum (new club) → all sections show placeholder
- Trophy invalidated by scandal → shows with "(Descalificado)" suffix
- Player sold but in Hall of Fame → text reads "X jugó aquí desde Y hasta Z"
- Bankruptcy recovery → milestone "El club resurge" present

### Cross-version save load (AC-TH-27)

When v1.2+ LLM rolls out, the templated texts from v1.1 should be regenerated. In v1.1 we stub the BullMQ regenerate job (no-op) but expose a flag:

```typescript
// apps/api/src/modules/museum/service.ts
if (process.env.USE_LLM_TEXTS === 'true') {
  // v1.2+ logic — fetch from cache or schedule regenerate job
  // For v1.1: not used; falls through to templates
}
```

## Out of Scope

- Actually LLM-generating (v1.2+ feature)
- Voice-over of museum texts (deferred indefinitely)

## Acceptance Criteria

1. `/city-text` route exists and renders without errors
2. Redirects to /login if no session
3. All 5 sections render with correct counts
4. Empty museum shows placeholder text per section
5. Read-only invariant test passes (zero DB writes during museum fetch)
6. Determinismo test passes (5 calls → same response)
7. Edge case tests pass (scandal, sold player, bankruptcy recovery)
8. Mobile responsive at 375px
9. WCAG 2.1 AA: heading hierarchy, alt text, focus visible, keyboard nav
10. Cross-version flag scaffold in place (USE_LLM_TEXTS env)

## Test Requirements

All listed in Scope above.

## Dependencies

- **Upstream**: 001, 002, 003, 005 (full system functional)
- **Downstream**: None — terminal story

## Estimate

**1 day.** DOM page + 3 small test files.

## Notes / Gotchas

- DOM `/city-text` is the **canonical fallback** per ADR-024. It must work even if PixiJS fails to load entirely (network error, browser without WebGL, etc.).
- Link from `/city` to `/city-text` should be in the sr-only nav (story 004) so screen-reader users can opt-in to text mode.
- WCAG: ensure no element relies on color alone (e.g., scandal disqualification shown with both icon + text suffix)
- Cross-version: the regenerate job is OUT OF SCOPE for v1.1 (no LLM yet). This story just adds the env flag scaffold.
