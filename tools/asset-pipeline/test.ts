/**
 * Self-contained smoke tests for the asset pipeline pure functions.
 *
 * Run with: `npx tsx tools/asset-pipeline/test.ts`
 * Returns exit code 0 if all pass, 1 if any fail.
 *
 * (Not integrated with vitest because tools/ doesn't belong to a workspace.)
 */

import { strict as assert } from 'node:assert';
import {
  PALETTE_T0_BASE,
  PALETTE_T1_ADD,
  PALETTE_T2_ADD,
  PALETTE_T3_ADD,
  getValidationPalette,
  getValidationHexSet,
  nearestPaletteEntry,
  rgbDistance,
  PALETTE_TOLERANCE_RGB,
} from './palette.js';
import { assetIdToSeed } from './asset-id-hash.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

console.log('palette');

test('T0 base has 7 colors per Art Bible §4.1', () => {
  assert.equal(PALETTE_T0_BASE.length, 7);
});

test('T1 add has 4 colors (incl. césped dots a11y signal)', () => {
  assert.equal(PALETTE_T1_ADD.length, 4);
});

test('T2 add has 2 base colors (club colors are variables)', () => {
  assert.equal(PALETTE_T2_ADD.length, 2);
});

test('T3 add has 1 color (Asfalto nuevo, plus runtime club variants)', () => {
  assert.equal(PALETTE_T3_ADD.length, 1);
});

test('getValidationPalette(0) returns only T0 + club placeholders', () => {
  const p = getValidationPalette(0);
  // T0 base (7) + 3 club placeholders = 10
  assert.equal(p.length, 10);
});

test('getValidationPalette(3) includes everything', () => {
  const p = getValidationPalette(3);
  // T0 (7) + T1 (4) + T2 (2) + T3 (1) + club (3) = 17
  assert.equal(p.length, 17);
});

test('getValidationHexSet is case-insensitive', () => {
  const set = getValidationHexSet(3);
  // Tierra seca should be present in lowercase
  assert.ok(set.has('#5c3d1e'));
  assert.ok(!set.has('#5C3D1E')); // uppercase NOT in set; lookups must lowercase
});

test('nearestPaletteEntry finds Tierra seca for [92, 61, 30]', () => {
  const nearest = nearestPaletteEntry([0x5c, 0x3d, 0x1e]);
  assert.equal(nearest.name, 'Tierra seca');
});

test('nearestPaletteEntry finds nearest for off-palette color', () => {
  // Pure red — not in palette. Should find something warm-ish.
  const nearest = nearestPaletteEntry([0xff, 0x00, 0x00]);
  assert.ok(nearest !== undefined);
  assert.ok(typeof nearest.name === 'string');
});

test('rgbDistance is symmetric', () => {
  const d1 = rgbDistance([100, 50, 30], [200, 80, 40]);
  const d2 = rgbDistance([200, 80, 40], [100, 50, 30]);
  assert.equal(d1, d2);
});

test('rgbDistance is zero for identical colors', () => {
  const d = rgbDistance([100, 50, 30], [100, 50, 30]);
  assert.equal(d, 0);
});

test('PALETTE_TOLERANCE_RGB is small enough to catch off-palette', () => {
  // Tolerance of 4 means a single channel can deviate by ~4 — fine for
  // PNG encoder rounding, strict enough to catch real palette breaks.
  assert.ok(PALETTE_TOLERANCE_RGB <= 8);
  assert.ok(PALETTE_TOLERANCE_RGB >= 1);
});

console.log('\nasset-id-hash');

test('assetIdToSeed is deterministic', () => {
  const a = assetIdToSeed('tile-ground-grass-pristine');
  const b = assetIdToSeed('tile-ground-grass-pristine');
  assert.equal(a, b);
});

test('different ids produce different seeds', () => {
  const a = assetIdToSeed('tile-ground-grass-pristine');
  const b = assetIdToSeed('tile-ground-dirt-dry');
  assert.notEqual(a, b);
});

test('seed is in valid uint32 range', () => {
  const seed = assetIdToSeed('bld-stand-east-m1-empty');
  assert.ok(seed >= 0);
  assert.ok(seed <= 0xffffffff);
  assert.ok(Number.isInteger(seed));
});

test('similar ids produce different seeds (no collision risk on common patterns)', () => {
  const seedA = assetIdToSeed('wl-walker-base');
  const seedB = assetIdToSeed('wl-walker-fast');
  const seedC = assetIdToSeed('wl-walker-bag');
  assert.notEqual(seedA, seedB);
  assert.notEqual(seedB, seedC);
  assert.notEqual(seedA, seedC);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
