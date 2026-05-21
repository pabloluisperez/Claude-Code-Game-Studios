/**
 * Shared types for the asset pipeline.
 */

import type { RGB } from './palette.js';

export type AssetCategory =
  | 'tile-ground'
  | 'tile-prop'
  | 'building'
  | 'character'
  | 'crowd'
  | 'world-life'
  | 'portrait'
  | 'icon';

export type AssetSpec = {
  /** Kebab-case id per Art Bible §8.4. */
  id: string;
  category: AssetCategory;
  /** Target pixel dimensions after downscale. */
  targetWidth: number;
  targetHeight: number;
  /** Maximum tier this asset will appear in (palette enforcement). */
  maxTier: 0 | 1 | 2 | 3;
  /** Whether ComfyUI generation is allowed (Art Bible §8.6). */
  aiGenerationAllowed: boolean;
  /** Whether this asset is loaded eagerly (T1) or lazy (T2+). */
  lazyLoad: boolean;
};

export type PaletteValidationResult = {
  assetId: string;
  passed: boolean;
  invalidPixels: Array<{ x: number; y: number; rgb: RGB; nearest: string }>;
  totalPixels: number;
  ratio: number;  // % of pixels in palette
};

export type DownscaleResult = {
  assetId: string;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  outputPath: string;
};

export type GenerationRequest = {
  assetId: string;
  promptId: string;        // key in prompts.md catalog
  variables: Record<string, string>;
  seed: number;            // deterministic per assetId
  steps?: number;
  cfg?: number;
};

export type GenerationResult = {
  assetId: string;
  rawPngPath: string;
  generationTimeMs: number;
  modelUsed: string;
  loraStack: ReadonlyArray<{ name: string; weight: number }>;
  seed: number;
};
