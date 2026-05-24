/**
 * Tests for pure isometric projection math.
 *
 * Covers isometric-world.md §4.1, §4.2, §4.3, §4.4 — and the property
 * test AC-ISO-01 (round-trip tileToScreen ↔ screenToTile).
 */

import { describe, it, expect } from 'vitest';
import {
  tileToScreen,
  screenToTile,
  depthSortKey,
  clampCamera,
  isTileInBounds,
  TILE_WIDTH,
  TILE_HEIGHT,
  GRID_SIZE,
} from '../../src/lib/canvas/tile-projection';

describe('tileToScreen', () => {
  it('origin tile maps to origin screen', () => {
    expect(tileToScreen({ tileX: 0, tileY: 0 })).toEqual({ screenX: 0, screenY: 0 });
  });

  it('(1,0) is offset +TILE_WIDTH_HALF in x, +TILE_HEIGHT_HALF in y (diamond down-right)', () => {
    expect(tileToScreen({ tileX: 1, tileY: 0 })).toEqual({
      screenX: TILE_WIDTH / 2,
      screenY: TILE_HEIGHT / 2,
    });
  });

  it('(0,1) is offset -TILE_WIDTH_HALF in x, +TILE_HEIGHT_HALF in y (diamond down-left)', () => {
    expect(tileToScreen({ tileX: 0, tileY: 1 })).toEqual({
      screenX: -TILE_WIDTH / 2,
      screenY: TILE_HEIGHT / 2,
    });
  });

  it('(2,2) is offset 0 in x, +2*TILE_HEIGHT in y', () => {
    expect(tileToScreen({ tileX: 2, tileY: 2 })).toEqual({
      screenX: 0,
      screenY: 2 * TILE_HEIGHT,
    });
  });
});

describe('screenToTile inverse property (AC-ISO-01)', () => {
  it('round-trip: tileToScreen → screenToTile recovers the original tile', () => {
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const tile = { tileX: x, tileY: y };
        const screen = tileToScreen(tile);
        const recovered = screenToTile(screen);
        expect(recovered).toEqual(tile);
      }
    }
  });

  it('points slightly inside a tile still round-trip', () => {
    // Move 2px to the right of the tile origin — should still map to same tile
    const tile = { tileX: 3, tileY: 4 };
    const screen = tileToScreen(tile);
    const slightly = { screenX: screen.screenX + 2, screenY: screen.screenY + 1 };
    const recovered = screenToTile(slightly);
    expect(recovered).toEqual(tile);
  });

  it('screenToTile handles negative coords', () => {
    const result = screenToTile({ screenX: -TILE_WIDTH, screenY: 0 });
    expect(result.tileX).toBeLessThanOrEqual(0);
    expect(result.tileY).toBeGreaterThanOrEqual(0);
  });
});

describe('depthSortKey', () => {
  it('ascending tiles have ascending sort keys (within same z-layer)', () => {
    const a = depthSortKey({ tileX: 0, tileY: 0 }, 'terrain');
    const b = depthSortKey({ tileX: 1, tileY: 0 }, 'terrain');
    const c = depthSortKey({ tileX: 0, tileY: 1 }, 'terrain');
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(a);
  });

  it('higher z-layer sorts after lower z-layer for the same tile', () => {
    const tile = { tileX: 5, tileY: 5 };
    const terrain = depthSortKey(tile, 'terrain');
    const buildingBase = depthSortKey(tile, 'buildingBase');
    const buildingRoof = depthSortKey(tile, 'buildingRoof');
    const actor = depthSortKey(tile, 'actor');
    expect(buildingBase).toBeGreaterThan(terrain);
    expect(buildingRoof).toBeGreaterThan(buildingBase);
    expect(actor).toBeGreaterThan(buildingRoof);
  });

  it('a tile further down-screen always sorts after one higher, regardless of z-layer', () => {
    // (10, 10) actor → sortKey 20*1000 + 300 = 20300
    // (15, 15) terrain → sortKey 30*1000 + 0 = 30000
    // The downstream tile (15,15) terrain should still draw on top of the upstream
    // (10,10) actor since the iso projection has it lower on screen.
    const upstreamActor = depthSortKey({ tileX: 10, tileY: 10 }, 'actor');
    const downstreamTerrain = depthSortKey({ tileX: 15, tileY: 15 }, 'terrain');
    expect(downstreamTerrain).toBeGreaterThan(upstreamActor);
  });
});

describe('clampCamera (AC-ISO-02)', () => {
  const VIEWPORT = { viewportWidth: 800, viewportHeight: 600 };

  it('keeps in-range offsets unchanged', () => {
    const clamped = clampCamera({
      cameraOffsetX: 100,
      cameraOffsetY: 50,
      ...VIEWPORT,
    });
    expect(clamped.x).toBe(100);
    expect(clamped.y).toBe(50);
  });

  it('clamps positive offset that exceeds max', () => {
    const huge = GRID_SIZE * 100;
    const clamped = clampCamera({
      cameraOffsetX: huge,
      cameraOffsetY: huge,
      ...VIEWPORT,
    });
    expect(clamped.x).toBeLessThan(huge);
    expect(clamped.y).toBeLessThan(huge);
  });

  it('clamps negative offset that exceeds min', () => {
    const negHuge = -GRID_SIZE * 100;
    const clamped = clampCamera({
      cameraOffsetX: negHuge,
      cameraOffsetY: negHuge,
      ...VIEWPORT,
    });
    expect(clamped.x).toBeGreaterThan(negHuge);
    expect(clamped.y).toBeGreaterThan(negHuge);
  });
});

describe('isTileInBounds', () => {
  it('origin is in bounds', () => {
    expect(isTileInBounds({ tileX: 0, tileY: 0 })).toBe(true);
  });

  it('max coord is in bounds', () => {
    expect(isTileInBounds({ tileX: GRID_SIZE - 1, tileY: GRID_SIZE - 1 })).toBe(true);
  });

  it('negative coords are out of bounds', () => {
    expect(isTileInBounds({ tileX: -1, tileY: 0 })).toBe(false);
    expect(isTileInBounds({ tileX: 0, tileY: -1 })).toBe(false);
  });

  it('coords past GRID_SIZE are out of bounds', () => {
    expect(isTileInBounds({ tileX: GRID_SIZE, tileY: 0 })).toBe(false);
    expect(isTileInBounds({ tileX: 0, tileY: GRID_SIZE })).toBe(false);
  });

  it('AC-ISO-03: out-of-bounds coords are detectable without crash', () => {
    expect(() => isTileInBounds({ tileX: -1000, tileY: -1000 })).not.toThrow();
  });
});
