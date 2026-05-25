/**
 * Stadium upgrades catalog loader.
 *
 * Per ADR-029 §D3: reads `design/data/stadium-upgrades-catalog.json`, validates
 * with Zod, enforces invariants (40 items, 8 per track, 2 per (track,tier),
 * unique slugs), and caches in memory. Boot fails fast on invariant violation.
 *
 * Story STADIUM-UPGRADES-002.
 *
 * Deviation from story spec: the story specifies YAML; we use JSON to avoid
 * adding a yaml parser dependency. The data shape and validation are identical.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const TRACKS = ['gradas', 'pitch', 'servicios', 'training', 'academy'] as const;
export type Track = (typeof TRACKS)[number];
export const TIERS = [1, 2, 3, 4] as const;
export type Tier = (typeof TIERS)[number];

const ItemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must match [a-z0-9-]+'),
  track: z.enum(TRACKS),
  tier: z.number().int().min(1).max(4),
  name: z.string().min(1),
  description: z.string().min(1),
});

const CatalogSchema = z.object({
  $comment: z.string().optional(),
  version: z.number(),
  items: z.array(ItemSchema),
});

export type CatalogItem = z.infer<typeof ItemSchema>;

const EXPECTED_ITEMS_PER_TRACK = 8;
const EXPECTED_ITEMS_PER_TRACK_TIER = 2;

let catalogCache: readonly CatalogItem[] | null = null;

function defaultCatalogPath(): string {
  return path.resolve(process.cwd(), 'design/data/stadium-upgrades-catalog.json');
}

export async function loadCatalog(filePath: string = defaultCatalogPath()): Promise<readonly CatalogItem[]> {
  // Idempotent: once loaded, subsequent calls return the cached array.
  // This keeps reference stability for downstream getCatalog() consumers
  // and avoids re-reading the disk on every server-side route handler.
  if (catalogCache) {
    return catalogCache;
  }
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  const validated = CatalogSchema.parse(parsed);
  validateInvariants(validated.items);
  catalogCache = Object.freeze(validated.items.map((i) => Object.freeze({ ...i }))) as readonly CatalogItem[];
  return catalogCache;
}

export function getCatalog(): readonly CatalogItem[] {
  if (!catalogCache) {
    throw new Error('Catalog not loaded — call loadCatalog() at server boot before requesting catalog data');
  }
  return catalogCache;
}

/** Test-only helper: clears the cache so subsequent loadCatalog() re-reads from disk. */
export function _resetCatalogCacheForTests(): void {
  catalogCache = null;
}

function validateInvariants(items: readonly CatalogItem[]): void {
  // Count items per track
  const trackCounts: Record<string, number> = {};
  for (const item of items) {
    trackCounts[item.track] = (trackCounts[item.track] ?? 0) + 1;
  }
  for (const track of TRACKS) {
    const count = trackCounts[track] ?? 0;
    if (count !== EXPECTED_ITEMS_PER_TRACK) {
      throw new Error(
        `Catalog invariant violation: track "${track}" has ${count} items, expected ${EXPECTED_ITEMS_PER_TRACK}`,
      );
    }
  }

  // Slug uniqueness
  const slugSeen = new Set<string>();
  for (const item of items) {
    if (slugSeen.has(item.slug)) {
      throw new Error(`Catalog invariant violation: duplicate slug "${item.slug}"`);
    }
    slugSeen.add(item.slug);
  }

  // 2 items per (track, tier)
  const trackTierCounts: Record<string, number> = {};
  for (const item of items) {
    const key = `${item.track}-${item.tier}`;
    trackTierCounts[key] = (trackTierCounts[key] ?? 0) + 1;
  }
  for (const track of TRACKS) {
    for (const tier of TIERS) {
      const key = `${track}-${tier}`;
      const count = trackTierCounts[key] ?? 0;
      if (count !== EXPECTED_ITEMS_PER_TRACK_TIER) {
        throw new Error(
          `Catalog invariant violation: (track="${track}", tier=${tier}) has ${count} items, expected ${EXPECTED_ITEMS_PER_TRACK_TIER}`,
        );
      }
    }
  }
}
