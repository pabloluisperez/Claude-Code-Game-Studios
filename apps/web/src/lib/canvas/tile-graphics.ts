/**
 * Procedural tile graphics — placeholder visuals for v1.1 Sprint 22.
 *
 * Real pixel-art sprites (per Art Bible §3) are produced by a human artist
 * post-Sprint 22. Until then, these procedural shapes give Pablo a working
 * isometric world to interact with — verifying coordinate math, camera,
 * tier transitions, and a11y fallback before sinking time into art.
 *
 * Each `tileGraphics.*` returns a `TileVisual` with a PIXI sprite that the
 * scene graph can manipulate (zIndex, tint, alpha).
 */

import { Graphics, Sprite, Texture } from 'pixi.js';
import { TILE_WIDTH, TILE_HEIGHT, tileToScreen } from './tile-projection.js';
import type { CityTier, PitchSurface, TileCoord } from './types.js';

export type TileVisual = {
  sprite: Sprite;
};

/**
 * Stub for future texture-atlas migration. Currently returns Texture.WHITE
 * because we apply per-sprite tint to fake colored diamonds — perfectly
 * adequate for v1.1 Sprint 22 placeholder visuals.
 *
 * Real PIXI Graphics → Texture conversion (via `renderer.generateTexture`)
 * arrives with the asset-atlas pipeline in Sprint 23.
 */
function diamondTexture(_color: number, _outline: number = 0x000000): Texture {
  return Texture.WHITE;
}
// keep Graphics import alive for future use
void Graphics;

/** Tier-1 color palette per Art Bible §1.2 "Paleta que Respira". */
const TIER_COLOR = {
  1: 0x5a4c3a, // marrón-ceniza dominante
  2: 0x6e5b40, // marrón con manchas
  3: 0x82724a, // colores del club empiezan a teñir
  4: 0xaa9555, // máxima saturación
} as const satisfies Record<CityTier, number>;

const PITCH_COLOR = {
  dry: 0x8c6f3a,
  patchy: 0x7d8a3c,
  healthy: 0x4a7e3c,
  pristine: 0x356b2a,
} as const satisfies Record<PitchSurface, number>;

function makeDiamond(color: number, alpha = 1): Sprite {
  const sprite = new Sprite(Texture.WHITE);
  sprite.width = TILE_WIDTH;
  sprite.height = TILE_HEIGHT;
  sprite.anchor.set(0, 0);
  sprite.tint = color;
  sprite.alpha = alpha;
  return sprite;
}

export const tileGraphics = {
  terrainTile(coord: TileCoord, pitchState: PitchSurface): TileVisual {
    const sprite = makeDiamond(PITCH_COLOR[pitchState], 0.9);
    const pos = tileToScreen(coord);
    sprite.position.set(pos.screenX, pos.screenY);
    return { sprite };
  },

  stadiumTile(coord: TileCoord, tier: CityTier): TileVisual {
    const sprite = makeDiamond(TIER_COLOR[tier], 1.0);
    const pos = tileToScreen(coord);
    sprite.position.set(pos.screenX, pos.screenY - 6); // building rises above terrain
    return { sprite };
  },

  buildingTile(coord: TileCoord, color: number, height = 12): TileVisual {
    const sprite = makeDiamond(color, 1.0);
    const pos = tileToScreen(coord);
    sprite.position.set(pos.screenX, pos.screenY - height);
    sprite.height = TILE_HEIGHT + height;
    return { sprite };
  },
};

// Silence unused export warning for diamondTexture (kept for future use when
// we move to texture atlases).
export { diamondTexture as _diamondTextureForFutureUse };
