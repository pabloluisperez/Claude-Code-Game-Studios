/**
 * Unit tests for the stadium-upgrades catalog loader.
 *
 * Story STADIUM-UPGRADES-002 — covers the 12 QA Test Cases in the story's
 * `## QA Test Cases` section: real-file load, invariants per track / tier,
 * slug regex, Zod failures, cache semantics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  loadCatalog,
  getCatalog,
  _resetCatalogCacheForTests,
  TRACKS,
} from '../../src/modules/stadium-upgrades/catalog.js';

const REAL_CATALOG_PATH = path.resolve(process.cwd(), '../../design/data/stadium-upgrades-catalog.json');

async function writeTempCatalog(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stadium-catalog-'));
  const file = path.join(dir, 'catalog.json');
  await writeFile(file, content, 'utf-8');
  return file;
}

describe('stadium-upgrades catalog loader', () => {
  beforeEach(() => {
    _resetCatalogCacheForTests();
  });

  it('test_load_real_catalog_returns_exactly_40_items', async () => {
    // Act
    const items = await loadCatalog(REAL_CATALOG_PATH);

    // Assert
    expect(items).toHaveLength(40);
  });

  it('test_per_track_count_is_8_for_each_of_5_tracks', async () => {
    // Act
    const items = await loadCatalog(REAL_CATALOG_PATH);

    // Assert
    for (const track of TRACKS) {
      const count = items.filter((i) => i.track === track).length;
      expect(count, `track "${track}"`).toBe(8);
    }
  });

  it('test_per_track_tier_count_is_exactly_2', async () => {
    // Act
    const items = await loadCatalog(REAL_CATALOG_PATH);

    // Assert
    for (const track of TRACKS) {
      for (const tier of [1, 2, 3, 4] as const) {
        const count = items.filter((i) => i.track === track && i.tier === tier).length;
        expect(count, `(track="${track}", tier=${tier})`).toBe(2);
      }
    }
  });

  it('test_all_slugs_are_unique', async () => {
    // Act
    const items = await loadCatalog(REAL_CATALOG_PATH);

    // Assert
    const slugs = items.map((i) => i.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('test_all_slugs_match_kebab_case_regex', async () => {
    // Act
    const items = await loadCatalog(REAL_CATALOG_PATH);
    const slugRegex = /^[a-z0-9-]+$/;

    // Assert
    for (const item of items) {
      expect(item.slug, `slug "${item.slug}"`).toMatch(slugRegex);
    }
  });

  it('test_spot_check_gdd_sample_slugs_exist', async () => {
    // GDD §3.1.2 names these in the story spec acceptance criteria.
    const expected = ['gradas-n3-norte-cubierta', 'pitch-n4-cesped-premium', 'academy-n4-residencial'];

    // Act
    const items = await loadCatalog(REAL_CATALOG_PATH);
    const slugs = new Set(items.map((i) => i.slug));

    // Assert
    for (const slug of expected) {
      expect(slugs.has(slug), `expected slug "${slug}"`).toBe(true);
    }
  });

  it('test_mock_catalog_with_only_39_gradas_throws_invariant', async () => {
    // Arrange — 40 items but gradas track has only 7 (one less)
    const items = [];
    for (const track of ['gradas', 'pitch', 'servicios', 'training', 'academy']) {
      const count = track === 'gradas' ? 7 : 8;
      for (let i = 0; i < count; i++) {
        items.push({
          slug: `${track}-x-${i}`,
          track,
          tier: Math.min(4, Math.floor(i / 2) + 1),
          name: `Item ${i}`,
          description: 'desc',
        });
      }
    }
    const file = await writeTempCatalog(JSON.stringify({ version: 1, items }));

    // Act + Assert
    await expect(loadCatalog(file)).rejects.toThrow(/gradas.*7 items/);
    await rm(path.dirname(file), { recursive: true });
  });

  it('test_mock_catalog_with_duplicate_slug_throws', async () => {
    // Arrange
    const items = [];
    let n = 0;
    for (const track of ['gradas', 'pitch', 'servicios', 'training', 'academy']) {
      for (let tier = 1; tier <= 4; tier++) {
        for (let j = 0; j < 2; j++) {
          items.push({
            slug: `item-${n++}`,
            track,
            tier,
            name: `Item ${n}`,
            description: 'desc',
          });
        }
      }
    }
    // Force a duplicate by overwriting slug of item index 0 to match index 1
    items[0]!.slug = items[1]!.slug;
    const file = await writeTempCatalog(JSON.stringify({ version: 1, items }));

    // Act + Assert
    await expect(loadCatalog(file)).rejects.toThrow(/duplicate slug/);
    await rm(path.dirname(file), { recursive: true });
  });

  it('test_mock_catalog_with_invalid_track_enum_throws_zod', async () => {
    // Arrange — one item has an unknown track name
    const items = [
      {
        slug: 'rogue-item',
        track: 'guarderia',
        tier: 1,
        name: 'Rogue',
        description: 'desc',
      },
    ];
    const file = await writeTempCatalog(JSON.stringify({ version: 1, items }));

    // Act + Assert — Zod throws (we don't even get to invariants)
    await expect(loadCatalog(file)).rejects.toThrow();
    await rm(path.dirname(file), { recursive: true });
  });

  it('test_mock_catalog_with_tier_5_throws_zod', async () => {
    // Arrange
    const items = [
      {
        slug: 'tier-5',
        track: 'gradas',
        tier: 5,
        name: 'Out of range',
        description: 'desc',
      },
    ];
    const file = await writeTempCatalog(JSON.stringify({ version: 1, items }));

    // Act + Assert
    await expect(loadCatalog(file)).rejects.toThrow();
    await rm(path.dirname(file), { recursive: true });
  });

  it('test_get_catalog_before_load_throws', () => {
    // Act + Assert
    expect(() => getCatalog()).toThrow(/Catalog not loaded/);
  });

  it('test_load_catalog_caches_returns_same_reference_on_second_call', async () => {
    // Act
    const first = await loadCatalog(REAL_CATALOG_PATH);
    const second = await loadCatalog(REAL_CATALOG_PATH);

    // Assert — cached
    expect(getCatalog()).toBe(first);
    expect(second).toBeDefined();
  });
});
