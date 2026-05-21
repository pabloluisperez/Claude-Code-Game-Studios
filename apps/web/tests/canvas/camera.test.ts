/**
 * Tests for the pure camera state machine.
 *
 * Covers isometric-world.md §3.2, §3.7 ACs:
 *   AC-ISO-02 (clamp bounds), AC-ISO-11 (keyboard pan).
 */

import { describe, it, expect } from 'vitest';
import {
  panCamera,
  zoomCamera,
  focusCamera,
  handleCameraKeydown,
  INITIAL_CAMERA,
  ZOOM_LEVELS,
  CAMERA_PAN_SPEED,
} from '../../src/lib/canvas/camera';

const VIEWPORT = { width: 800, height: 600 };

describe('panCamera', () => {
  it('moves the offset by exactly dx, dy when within bounds', () => {
    const out = panCamera(INITIAL_CAMERA, 100, -50, VIEWPORT);
    expect(out.offsetX).toBe(100);
    expect(out.offsetY).toBe(-50);
  });

  it('keeps zoom unchanged', () => {
    const out = panCamera({ ...INITIAL_CAMERA, zoom: 1.5 }, 10, 10, VIEWPORT);
    expect(out.zoom).toBe(1.5);
  });

  it('AC-ISO-02: pan beyond bounds is clamped', () => {
    const huge = 1_000_000;
    const out = panCamera(INITIAL_CAMERA, huge, huge, VIEWPORT);
    expect(out.offsetX).toBeLessThan(huge);
    expect(out.offsetY).toBeLessThan(huge);
  });

  it('AC-ISO-02: negative pan beyond bounds is clamped', () => {
    const out = panCamera(INITIAL_CAMERA, -1_000_000, -1_000_000, VIEWPORT);
    expect(out.offsetX).toBeGreaterThan(-1_000_000);
    expect(out.offsetY).toBeGreaterThan(-1_000_000);
  });

  it('does not mutate the input state', () => {
    const input = { ...INITIAL_CAMERA };
    const before = JSON.stringify(input);
    panCamera(input, 50, 50, VIEWPORT);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('zoomCamera', () => {
  it('zooms in one step from 1.0 → 1.5', () => {
    const out = zoomCamera({ ...INITIAL_CAMERA, zoom: 1.0 }, +1);
    expect(out.zoom).toBe(1.5);
  });

  it('zooms out one step from 1.0 → 0.5', () => {
    const out = zoomCamera({ ...INITIAL_CAMERA, zoom: 1.0 }, -1);
    expect(out.zoom).toBe(0.5);
  });

  it('clamps at max zoom 2.0', () => {
    const at2 = zoomCamera({ ...INITIAL_CAMERA, zoom: 2.0 }, +1);
    expect(at2.zoom).toBe(2.0);
  });

  it('clamps at min zoom 0.5', () => {
    const at05 = zoomCamera({ ...INITIAL_CAMERA, zoom: 0.5 }, -1);
    expect(at05.zoom).toBe(0.5);
  });

  it('ZOOM_LEVELS contains the four expected values', () => {
    expect(ZOOM_LEVELS).toEqual([0.5, 1.0, 1.5, 2.0]);
  });

  it('preserves offset', () => {
    const out = zoomCamera({ offsetX: 100, offsetY: 50, zoom: 1.0 }, +1);
    expect(out.offsetX).toBe(100);
    expect(out.offsetY).toBe(50);
  });
});

describe('focusCamera', () => {
  it('returns INITIAL_CAMERA values', () => {
    expect(focusCamera()).toEqual(INITIAL_CAMERA);
  });

  it('returns a fresh object (no aliasing)', () => {
    const a = focusCamera();
    const b = focusCamera();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('handleCameraKeydown (AC-ISO-11)', () => {
  // Vitest doesn't have a DOM globally, so synthesize a minimal stub.
  function evt(key: string): KeyboardEvent {
    return { key } as KeyboardEvent;
  }

  it('ArrowUp pans -CAMERA_PAN_SPEED in y', () => {
    const out = handleCameraKeydown(INITIAL_CAMERA, evt('ArrowUp'), VIEWPORT);
    expect(out?.offsetY).toBe(-CAMERA_PAN_SPEED);
  });

  it('ArrowDown pans +CAMERA_PAN_SPEED in y', () => {
    const out = handleCameraKeydown(INITIAL_CAMERA, evt('ArrowDown'), VIEWPORT);
    expect(out?.offsetY).toBe(CAMERA_PAN_SPEED);
  });

  it('ArrowLeft pans -CAMERA_PAN_SPEED in x', () => {
    const out = handleCameraKeydown(INITIAL_CAMERA, evt('ArrowLeft'), VIEWPORT);
    expect(out?.offsetX).toBe(-CAMERA_PAN_SPEED);
  });

  it('ArrowRight pans +CAMERA_PAN_SPEED in x', () => {
    const out = handleCameraKeydown(INITIAL_CAMERA, evt('ArrowRight'), VIEWPORT);
    expect(out?.offsetX).toBe(CAMERA_PAN_SPEED);
  });

  it('"+" zooms in', () => {
    const out = handleCameraKeydown(INITIAL_CAMERA, evt('+'), VIEWPORT);
    expect(out?.zoom).toBe(1.5);
  });

  it('"=" also zooms in (no shift required)', () => {
    const out = handleCameraKeydown(INITIAL_CAMERA, evt('='), VIEWPORT);
    expect(out?.zoom).toBe(1.5);
  });

  it('"-" zooms out', () => {
    const out = handleCameraKeydown(INITIAL_CAMERA, evt('-'), VIEWPORT);
    expect(out?.zoom).toBe(0.5);
  });

  it('"f" focuses', () => {
    const moved = { offsetX: 999, offsetY: 999, zoom: 2.0 } as const;
    const out = handleCameraKeydown(moved, evt('f'), VIEWPORT);
    expect(out).toEqual(INITIAL_CAMERA);
  });

  it('"F" (uppercase) also focuses', () => {
    const moved = { offsetX: 999, offsetY: 999, zoom: 2.0 } as const;
    const out = handleCameraKeydown(moved, evt('F'), VIEWPORT);
    expect(out).toEqual(INITIAL_CAMERA);
  });

  it('unrelated keys return null (caller lets them propagate)', () => {
    expect(handleCameraKeydown(INITIAL_CAMERA, evt('Tab'), VIEWPORT)).toBeNull();
    expect(handleCameraKeydown(INITIAL_CAMERA, evt('Escape'), VIEWPORT)).toBeNull();
    expect(handleCameraKeydown(INITIAL_CAMERA, evt('a'), VIEWPORT)).toBeNull();
  });
});
