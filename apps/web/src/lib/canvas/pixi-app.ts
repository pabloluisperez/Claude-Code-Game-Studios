/**
 * PixiJS Application factory + lifecycle.
 *
 * v1.1 per ADR-021. Isolated from the Svelte component so it's testable
 * (via mocks) and reusable.
 *
 * NOTE: The actual `Application.init()` is async in PixiJS 8. Callers
 * must `await` before using the returned app.
 */

import { Application, Container } from 'pixi.js';
import type { CanvasWorldView, TileCoord } from './types.js';
import { depthSortKey, tileToScreen, GRID_SIZE } from './tile-projection.js';
import { tileGraphics, type TileVisual } from './tile-graphics.js';

export type SceneLayers = {
  background: Container;
  terrain: Container;
  buildings: Container;
  props: Container;
  actors: Container;
  crowd: Container;
  weather: Container;
  lighting: Container;
  uiOverlay: Container;
};

export type PixiBundle = {
  app: Application;
  layers: SceneLayers;
};

/**
 * Initialize a fresh PIXI.Application bound to a DOM canvas element.
 *
 * Per ADR-021 §D5: scene graph has 9 ordered layers. They are stored as
 * `app.stage`'s children in this order.
 */
export async function createPixiApp(canvas: HTMLCanvasElement): Promise<PixiBundle> {
  const app = new Application();
  await app.init({
    canvas,
    width: canvas.clientWidth || 800,
    height: canvas.clientHeight || 600,
    background: 0x10142c, // deep night blue baseline
    antialias: false, // pixel art — no smoothing
    resolution: globalThis.devicePixelRatio ?? 1,
    autoDensity: true,
  });

  // Build scene graph layers in order. Each is a Container.
  const layers: SceneLayers = {
    background: new Container({ label: 'background' }),
    terrain: new Container({ label: 'terrain', sortableChildren: true }),
    buildings: new Container({ label: 'buildings', sortableChildren: true }),
    props: new Container({ label: 'props', sortableChildren: true }),
    actors: new Container({ label: 'actors', sortableChildren: true }),
    crowd: new Container({ label: 'crowd' }),
    weather: new Container({ label: 'weather' }),
    lighting: new Container({ label: 'lighting' }),
    uiOverlay: new Container({ label: 'uiOverlay' }),
  };

  for (const layer of Object.values(layers)) {
    app.stage.addChild(layer);
  }

  return { app, layers };
}

/**
 * Destroy a PIXI.Application and free its WebGL resources.
 * Safe to call multiple times.
 */
export function destroyPixiApp(bundle: PixiBundle | null): void {
  if (!bundle) return;
  try {
    bundle.app.destroy(true, { children: true, texture: true });
  } catch {
    // PIXI may throw if already destroyed; swallow.
  }
}

/**
 * Render city tier 1 baseline tiles onto the terrain layer.
 *
 * v1.1 Sprint 22 starter: simple grass field 8x8 centered on the grid.
 * Sprint 23+ adds the full city + tier-specific assets.
 */
export function renderTier1Baseline(bundle: PixiBundle, view: CanvasWorldView): void {
  const { layers } = bundle;
  layers.terrain.removeChildren();
  layers.buildings.removeChildren();

  // Center camera on the stadium tile (32, 32).
  const centerTile: TileCoord = { tileX: 32, tileY: 32 };
  const center = tileToScreen(centerTile);
  layers.terrain.position.set(
    bundle.app.screen.width / 2 - center.screenX,
    bundle.app.screen.height / 2 - center.screenY,
  );
  layers.buildings.position.set(
    bundle.app.screen.width / 2 - center.screenX,
    bundle.app.screen.height / 2 - center.screenY,
  );

  // 8x8 grass field around the stadium
  for (let dx = -4; dx < 4; dx++) {
    for (let dy = -4; dy < 4; dy++) {
      const coord: TileCoord = { tileX: 32 + dx, tileY: 32 + dy };
      const visual: TileVisual = tileGraphics.terrainTile(coord, 'dry');
      visual.sprite.zIndex = depthSortKey(coord, 'terrain');
      layers.terrain.addChild(visual.sprite);
    }
  }

  // Stadium core: a few "building base" tiles at the center
  for (let dx = -2; dx < 2; dx++) {
    for (let dy = -2; dy < 2; dy++) {
      const coord: TileCoord = { tileX: 32 + dx, tileY: 32 + dy };
      const visual = tileGraphics.stadiumTile(coord, view.tier);
      visual.sprite.zIndex = depthSortKey(coord, 'buildingBase');
      layers.buildings.addChild(visual.sprite);
    }
  }
}

/**
 * Apply day-night tint to the lighting overlay layer.
 *
 * Simple sin-based interpolation per ADR-022 §D5 referencing
 * isometric-world.md §4.5.
 */
export function applyDayNightTint(bundle: PixiBundle, view: CanvasWorldView): void {
  const { layers } = bundle;
  const t = view.currentTimeOfDay;
  // [0..1] → R,G,B tint between night (0.4, 0.5, 0.8) and day (1, 1, 1).
  const dayness = Math.max(0, Math.sin(t * Math.PI * 2));
  const r = 0.4 + 0.6 * dayness;
  const g = 0.5 + 0.5 * dayness;
  const b = 0.8 + 0.2 * dayness;
  // Tint applied to all upstream layers via a multiplicative blend.
  const tintColor = Math.round(r * 255) << 16 | Math.round(g * 255) << 8 | Math.round(b * 255);
  layers.terrain.tint = tintColor;
  layers.buildings.tint = tintColor;
}

/** Default grid size export for callers. */
export { GRID_SIZE };
