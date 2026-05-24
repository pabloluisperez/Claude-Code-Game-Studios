/**
 * Deterministic seed derivation from asset id.
 *
 * Per `docs/asset-pipeline/prompts.md` §8 seed strategy:
 *   seed(asset_id) = FNV-1a(asset_id) modulo 2^32
 *
 * Pure function. Same asset_id → same seed across machines & runs, so
 * regenerating an asset reproduces the same sprite (modulo model/LoRA
 * version changes).
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function assetIdToSeed(assetId: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < assetId.length; i++) {
    hash ^= assetId.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
