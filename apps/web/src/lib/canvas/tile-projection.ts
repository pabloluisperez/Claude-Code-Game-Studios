/**
 * Pure isometric projection math.
 *
 * v1.1 foundation per isometric-world.md §4.1, §4.2, §4.3, §4.4.
 *
 * Diamond isometric (NOT staggered) with tile size 32×16 locked by Art Bible §3.
 *
 * All functions are pure and deterministic — same input → same output. No PIXI
 * imports here; tests run in vitest without a browser.
 */

import type { ScreenPos, TileCoord } from './types.js';

/** Tile size in pixels, locked by Art Bible §3. */
export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;
export const TILE_WIDTH_HALF = 16;
export const TILE_HEIGHT_HALF = 8;

/** Default grid size — 64×64 tiles per isometric-world.md §3.1. */
export const GRID_SIZE = 64;

/**
 * Convert a tile coordinate to screen pixel position.
 *
 * Per isometric-world.md §4.1:
 *   screenX = (tileX - tileY) * TILE_WIDTH_HALF
 *   screenY = (tileX + tileY) * TILE_HEIGHT_HALF
 *
 * `cameraOffset` is added afterward by the camera; this function returns
 * the canonical world-relative screen position so it can be cached.
 */
export function tileToScreen(coord: TileCoord): ScreenPos {
  return {
    screenX: (coord.tileX - coord.tileY) * TILE_WIDTH_HALF,
    screenY: (coord.tileX + coord.tileY) * TILE_HEIGHT_HALF,
  };
}

/**
 * Convert a screen-space position (already adjusted for camera) back into
 * the underlying tile coordinate.
 *
 * Per isometric-world.md §4.2 — the inverse of tileToScreen.
 *
 * Use `floor` semantics so points inside a tile's diamond all map back to
 * the same integer tile coord.
 */
export function screenToTile(pos: ScreenPos): TileCoord {
  const rx = pos.screenX / TILE_WIDTH_HALF;
  const ry = pos.screenY / TILE_HEIGHT_HALF;
  return {
    tileX: Math.floor((ry + rx) / 2),
    tileY: Math.floor((ry - rx) / 2),
  };
}

/**
 * Depth-sort key for stable z-order within a single render layer.
 *
 * Per isometric-world.md §4.3:
 *   sortKey = (tileX + tileY) * 1000 + zSubOffset
 *
 * Sub-offset reserves layers within a tile (terrain < building base <
 * building roof < actor).
 */
export const Z_SUB_OFFSET = {
  terrain: 0,
  buildingBase: 100,
  buildingRoof: 200,
  actor: 300,
} as const;

export type ZSubOffsetKey = keyof typeof Z_SUB_OFFSET;

export function depthSortKey(coord: TileCoord, sub: ZSubOffsetKey): number {
  return (coord.tileX + coord.tileY) * 1000 + Z_SUB_OFFSET[sub];
}

/**
 * Camera bounds clamping (isometric-world.md §4.4).
 *
 * Prevents the camera from panning beyond the populated grid.
 */
export type CameraBoundsArgs = {
  cameraOffsetX: number;
  cameraOffsetY: number;
  viewportWidth: number;
  viewportHeight: number;
  gridSize?: number;
};

export function clampCamera(args: CameraBoundsArgs): { x: number; y: number } {
  const gridSize = args.gridSize ?? GRID_SIZE;
  const maxOffsetX = gridSize * TILE_WIDTH_HALF + args.viewportWidth / 2;
  const minOffsetX = -gridSize * TILE_WIDTH_HALF - args.viewportWidth / 2;
  const maxOffsetY = gridSize * TILE_HEIGHT_HALF + args.viewportHeight / 2;
  const minOffsetY = -gridSize * TILE_HEIGHT_HALF - args.viewportHeight / 2;
  return {
    x: clamp(args.cameraOffsetX, minOffsetX, maxOffsetX),
    y: clamp(args.cameraOffsetY, minOffsetY, maxOffsetY),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** True if a tile coordinate is inside the grid bounds (default 64×64). */
export function isTileInBounds(
  coord: TileCoord,
  gridSize: number = GRID_SIZE,
): boolean {
  return (
    coord.tileX >= 0 &&
    coord.tileY >= 0 &&
    coord.tileX < gridSize &&
    coord.tileY < gridSize
  );
}
