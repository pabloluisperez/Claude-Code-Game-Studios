/**
 * Canvas-layer types — shared between projection, tier derivation, and the
 * <PixiCanvas> component.
 *
 * v1.1 foundation per ADR-021 + isometric-world.md.
 * Pure TypeScript types, no PIXI imports here so this layer is fully
 * testable without a browser.
 */

/** Integer tile coordinate in world space. */
export type TileCoord = { tileX: number; tileY: number };

/** Screen-space pixel position relative to canvas origin. */
export type ScreenPos = { screenX: number; screenY: number };

/** City progression tier per design/gdd/city-progression.md §3.1. */
export type CityTier = 1 | 2 | 3 | 4;

/** Weather state per ADR-022. */
export type Weather = 'clear' | 'rain';

/** Day-night bucket per isometric-world.md §3.5. */
export type DayNightBucket = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Subset of WorldState the canvas needs. Derived server-side and passed
 * to <PixiCanvas> as a read-only prop. Renderer NEVER mutates it.
 */
export type CanvasWorldView = {
  /** Current city progression tier (post-derivation). */
  tier: CityTier;
  /** WorldState.currentTimeOfDay (0..1, see ADR-022). */
  currentTimeOfDay: number;
  /** WorldState.weather. */
  weather: Weather;
  /** Infrastructure level 0..100, drives pitch surface state. */
  infrastructureLevel: number;
  /** Optional: ongoing match in stadium; if present, render match overlay. */
  liveFixture?: {
    /** 0..1, attendance / capacity. */
    crowdDensity: number;
  };
};

/**
 * Sub-element states derived from WorldState. Pure functions that
 * city-progression service exposes.
 */
export type PitchSurface = 'dry' | 'patchy' | 'healthy' | 'pristine';
export type CrowdSpriteLevel = 'empty' | 'sparse' | 'packed' | 'overflowing';

/**
 * Tier history for anti-yo-yo (city-progression.md §3.2).
 * Persisted server-side in playthroughs row (NEW column for v1.1).
 */
export type TierHistory = {
  /** Highest tier ever reached for this playthrough. */
  everReachedTier: CityTier;
  /** Per-tier: consecutive weeks below its threshold. */
  weeksBelow: { 2: number; 3: number; 4: number };
};

/** Default empty history for a brand new playthrough. */
export const EMPTY_TIER_HISTORY: TierHistory = {
  everReachedTier: 1,
  weeksBelow: { 2: 0, 3: 0, 4: 0 },
};

/** Performance mode per isometric-world.md §3.8. */
export type CanvasPerfMode = 'high' | 'medium' | 'low' | 'dom-fallback';
