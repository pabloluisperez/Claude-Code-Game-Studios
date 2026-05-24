/**
 * Camera state + actions.
 *
 * v1.1 Sprint 21 per isometric-world.md §3.2, §4.4 + ADR-023 §D3.
 *
 * Pure state machine — no PIXI dependency here, so tests cover the logic
 * exhaustively without a browser. The PixiCanvas component applies the
 * resolved camera state to its layer positions.
 */

import { clampCamera, GRID_SIZE } from './tile-projection.js';

/** Zoom levels available, per isometric-world.md §3.2. */
export const ZOOM_LEVELS = [0.5, 1.0, 1.5, 2.0] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export const DEFAULT_ZOOM: ZoomLevel = 1.0;

/** Pixels per keyboard pan tick. */
export const CAMERA_PAN_SPEED = 24;

export type CameraState = {
  offsetX: number;
  offsetY: number;
  zoom: ZoomLevel;
};

export const INITIAL_CAMERA: CameraState = {
  offsetX: 0,
  offsetY: 0,
  zoom: DEFAULT_ZOOM,
};

export type ViewportSize = {
  width: number;
  height: number;
};

/**
 * Pan the camera by a delta. Result is clamped to grid bounds.
 */
export function panCamera(
  state: CameraState,
  dx: number,
  dy: number,
  viewport: ViewportSize,
  gridSize: number = GRID_SIZE,
): CameraState {
  const clamped = clampCamera({
    cameraOffsetX: state.offsetX + dx,
    cameraOffsetY: state.offsetY + dy,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    gridSize,
  });
  return { ...state, offsetX: clamped.x, offsetY: clamped.y };
}

/**
 * Cycle zoom levels. `direction === +1` zooms in, `-1` zooms out.
 * Clamps to the available ZOOM_LEVELS array.
 */
export function zoomCamera(state: CameraState, direction: 1 | -1): CameraState {
  const idx = ZOOM_LEVELS.indexOf(state.zoom);
  const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + direction));
  return { ...state, zoom: ZOOM_LEVELS[next]! };
}

/**
 * Reset camera to default position (centered, default zoom).
 * Per isometric-world.md §3.2 keyboard `F` shortcut.
 */
export function focusCamera(): CameraState {
  return { ...INITIAL_CAMERA };
}

/**
 * Map a keyboard event to a camera state transition. Returns the new
 * state, or `null` if the key wasn't a camera shortcut (the caller
 * should let the event propagate normally).
 *
 * Per isometric-world.md §3.7:
 *   - ArrowUp/Down/Left/Right pan
 *   - +/= zoom in, -/_ zoom out
 *   - f/F focus stadium
 *   - Escape blur (caller handles, returns null)
 */
export function handleCameraKeydown(
  state: CameraState,
  ev: KeyboardEvent,
  viewport: ViewportSize,
): CameraState | null {
  switch (ev.key) {
    case 'ArrowUp':
      return panCamera(state, 0, -CAMERA_PAN_SPEED, viewport);
    case 'ArrowDown':
      return panCamera(state, 0, CAMERA_PAN_SPEED, viewport);
    case 'ArrowLeft':
      return panCamera(state, -CAMERA_PAN_SPEED, 0, viewport);
    case 'ArrowRight':
      return panCamera(state, CAMERA_PAN_SPEED, 0, viewport);
    case '+':
    case '=':
      return zoomCamera(state, +1);
    case '-':
    case '_':
      return zoomCamera(state, -1);
    case 'f':
    case 'F':
      return focusCamera();
    default:
      return null;
  }
}
