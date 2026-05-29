/**
 * Unit tests for transfer window event resolution.
 *
 * Tests:
 *   - resolveTransferWindow returns correct transferWindowOpen flag
 *   - resolveEvent dispatches transfer_window_open/close to resolveTransferWindow
 *   - ResolutionResult has no numeric deltas (window state is boolean-only)
 *   - Side effects array is empty (no side effects for window toggles)
 *
 * Story: 25-3
 */

import { describe, it, expect } from 'vitest';
import { resolveEvent, resolveDefault } from '../../src/sim/event-system/resolver.js';

describe('resolveEvent — transfer_window_open', () => {
  it('test_open_sets_transferWindowOpen_true', () => {
    const r = resolveEvent(
      { kind: 'transfer_window_open', defaultOption: 'open' },
      'open',
      { rng: () => 0, currentWeek: 1, playerClubId: 'club-1' },
    );
    expect(r.transferWindowOpen).toBe(true);
  });

  it('test_open_has_no_numeric_deltas', () => {
    const r = resolveEvent(
      { kind: 'transfer_window_open', defaultOption: 'open' },
      'open',
      { rng: () => 0, currentWeek: 1, playerClubId: 'club-1' },
    );
    expect(Object.keys(r.deltas).length).toBe(0);
  });

  it('test_open_has_no_side_effects', () => {
    const r = resolveEvent(
      { kind: 'transfer_window_open', defaultOption: 'open' },
      'open',
      { rng: () => 0, currentWeek: 1, playerClubId: 'club-1' },
    );
    expect(r.sideEffects).toEqual([]);
  });

  it('test_open_default_resolves_to_open', () => {
    const r = resolveDefault(
      { kind: 'transfer_window_open', defaultOption: 'open' },
      { rng: () => 0, currentWeek: 1, playerClubId: 'club-1' },
    );
    expect(r.transferWindowOpen).toBe(true);
  });
});

describe('resolveEvent — transfer_window_close', () => {
  it('test_close_sets_transferWindowOpen_false', () => {
    const r = resolveEvent(
      { kind: 'transfer_window_close', defaultOption: 'close' },
      'close',
      { rng: () => 0, currentWeek: 30, playerClubId: 'club-1' },
    );
    expect(r.transferWindowOpen).toBe(false);
  });

  it('test_close_has_no_numeric_deltas', () => {
    const r = resolveEvent(
      { kind: 'transfer_window_close', defaultOption: 'close' },
      'close',
      { rng: () => 0, currentWeek: 30, playerClubId: 'club-1' },
    );
    expect(Object.keys(r.deltas).length).toBe(0);
  });

  it('test_close_has_no_side_effects', () => {
    const r = resolveEvent(
      { kind: 'transfer_window_close', defaultOption: 'close' },
      'close',
      { rng: () => 0, currentWeek: 30, playerClubId: 'club-1' },
    );
    expect(r.sideEffects).toEqual([]);
  });

  it('test_close_default_resolves_to_close', () => {
    const r = resolveDefault(
      { kind: 'transfer_window_close', defaultOption: 'close' },
      { rng: () => 0, currentWeek: 30, playerClubId: 'club-1' },
    );
    expect(r.transferWindowOpen).toBe(false);
  });
});

describe('resolveEvent — transfer window round-trip', () => {
  it('test_open_then_close_toggles_state', () => {
    const open = resolveEvent(
      { kind: 'transfer_window_open', defaultOption: 'open' },
      'open',
      { rng: () => 0, currentWeek: 1, playerClubId: 'club-1' },
    );
    const close = resolveEvent(
      { kind: 'transfer_window_close', defaultOption: 'close' },
      'close',
      { rng: () => 0, currentWeek: 20, playerClubId: 'club-1' },
    );
    expect(open.transferWindowOpen).toBe(true);
    expect(close.transferWindowOpen).toBe(false);
  });
});
