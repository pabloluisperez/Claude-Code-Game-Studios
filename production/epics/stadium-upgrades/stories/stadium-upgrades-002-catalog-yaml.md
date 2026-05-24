---
Story: STADIUM-UPGRADES-002
Status: Ready
Type: Logic
GDD Requirement: AC-SU-01/02/03 (catalog structure)
Governing ADR: ADR-029 §D3
Control Manifest: 2026-05-19
Test Evidence: apps/api/tests/stadium-upgrades-catalog.test.ts (pending)
ImplementedAt: design/data/stadium-upgrades-catalog.yaml + apps/api/src/modules/stadium-upgrades/catalog.ts
---

# Story: Catalog YAML + Zod loader + boot validation

## Goal

Define the canonical catalog of ~40 items as a YAML file and a Zod-validated loader that runs at server boot. Fail-fast if the catalog count doesn't match the constants used in formulas.

## Scope

In `design/data/stadium-upgrades-catalog.yaml` (new file):

```yaml
version: 1
items:
  # Track: gradas (8 items)
  - slug: gradas-n1-norte
    track: gradas
    tier: 1
    name: "Grada Norte hormigón"
    description: "Construye la tribuna lateral norte con hormigón básico."
  - slug: gradas-n1-sur
    track: gradas
    tier: 1
    name: "Grada Sur hormigón"
    description: "Construye la tribuna lateral sur con hormigón básico."
  # ... N2, N3, N4 gradas (6 more)
  # Track: pitch (8 items)
  # Track: servicios (8 items)
  # Track: training (8 items)
  # Track: academy (8 items)
```

Use the items listed in `design/gdd/stadium-upgrades.md §3.1.2` as the canonical 40-item list. Each track must have exactly 8 items distributed across 4 tiers (2 per tier).

In `apps/api/src/modules/stadium-upgrades/catalog.ts` (new file):

```typescript
import { z } from 'zod';
import yaml from 'js-yaml';
import fs from 'fs/promises';

const ItemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  track: z.enum(['gradas', 'pitch', 'servicios', 'training', 'academy']),
  tier: z.number().int().min(1).max(4),
  name: z.string().min(1),
  description: z.string().min(1),
});

const CatalogSchema = z.object({
  version: z.number(),
  items: z.array(ItemSchema),
});

export type CatalogItem = z.infer<typeof ItemSchema>;

let catalogCache: CatalogItem[] | null = null;

export async function loadCatalog(path = 'design/data/stadium-upgrades-catalog.yaml'): Promise<CatalogItem[]> {
  const raw = await fs.readFile(path, 'utf-8');
  const parsed = yaml.load(raw);
  const validated = CatalogSchema.parse(parsed);
  validateInvariants(validated.items);
  catalogCache = validated.items;
  return catalogCache;
}

export function getCatalog(): CatalogItem[] {
  if (!catalogCache) throw new Error('Catalog not loaded — call loadCatalog() at boot');
  return catalogCache;
}

function validateInvariants(items: CatalogItem[]) {
  // Count per track
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.track] = (counts[item.track] ?? 0) + 1;
  for (const track of ['gradas', 'pitch', 'servicios', 'training', 'academy']) {
    if (counts[track] !== 8) {
      throw new Error(`Catalog invariant violation: track ${track} has ${counts[track]} items, expected 8`);
    }
  }
  // Slug uniqueness
  const slugs = new Set();
  for (const item of items) {
    if (slugs.has(item.slug)) throw new Error(`Duplicate slug: ${item.slug}`);
    slugs.add(item.slug);
  }
  // 2 items per (track, tier)
  const trackTierCounts: Record<string, number> = {};
  for (const item of items) {
    const key = `${item.track}-${item.tier}`;
    trackTierCounts[key] = (trackTierCounts[key] ?? 0) + 1;
  }
  for (const key in trackTierCounts) {
    if (trackTierCounts[key] !== 2) {
      throw new Error(`Catalog invariant: ${key} has ${trackTierCounts[key]} items, expected 2`);
    }
  }
}
```

Invoke `loadCatalog()` from the Hono server boot sequence (in `apps/api/src/index.ts` or equivalent) before listening on port.

## Out of Scope

- Cost / duration values (those are computed via F4 / F2 from constants, not from catalog)
- Tier-up gate logic (story 005)
- Web frontend catalog display (story 008)

## Acceptance Criteria

1. YAML file has exactly 40 items: 8 per track × 5 tracks
2. Each (track, tier) pair has exactly 2 items
3. All slugs are unique
4. Slugs match regex `^[a-z0-9-]+$`
5. Boot fails with descriptive error if any invariant violates
6. `getCatalog()` throws if called before `loadCatalog()`
7. Cached call returns same reference (no re-read)
8. Items per `§3.1.2` of GDD are present (spot-check: `gradas-n3-norte-cubierta`, `pitch-n4-cesped-premium`, `academy-n4-residencial`)

## Test Requirements (Logic, BLOCKING)

`apps/api/tests/stadium-upgrades-catalog.test.ts`:

- Load real YAML, expect 40 items
- Mock YAML with 39 items in gradas track → expect invariant error
- Mock YAML with duplicate slug → expect error
- Mock YAML with invalid track enum → expect Zod error
- `getCatalog()` before load → throws
- Repeated `loadCatalog()` returns same data (cached)

## Dependencies

- **Upstream**: 001 (schema for track / tier values)
- **Downstream**: 003 (formulas use catalog), 005 (service queries catalog), 008 (UI displays catalog)

## Estimate

**1 day.** YAML drafting + Zod schema + invariant validator + tests.

## Notes / Gotchas

- Use `js-yaml` (already in dev deps presumably; verify in package.json)
- The catalog file lives in `design/data/`, NOT in `apps/api/src/` — it's content, not code
- Future i18n: when localization arrives, add `name_en` / `description_en` etc. — but v1.1 is ES-only
- Story 008 (UI) needs catalog endpoint — story 006 exposes `GET /api/stadium/catalog`
