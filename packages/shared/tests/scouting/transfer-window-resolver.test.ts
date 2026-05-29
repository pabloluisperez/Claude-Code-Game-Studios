/**
 * Transfer window event resolver tests. Story 25-3.
 */

import { describe, it, expect } from 'vitest';
import { resolveEvent, resolveDefault, resolveTransferWindow } from '../../src/sim/event-system/resolver';
import type { TransferWindowOpenPayload, TransferWindowClosePayload } from '../../src/sim/event-system/types';

describe('resolveTransferWindow', () => {
  it('sets transferWindowOpen to true for open event', () => {
    const payload: TransferWindowOpenPayload = { kind: 'transfer_window_open', defaultOption: 'open' };
    const result = resolveTransferWindow(payload, 'open');
    expect(result.transferWindowOpen).toBe(true);
    expect(result.deltas).toEqual({});
    expect(result.sideEffects).toEqual([]);
  });

  it('sets transferWindowOpen to false for close event', () => {
    const payload: TransferWindowClosePayload = { kind: 'transfer_window_close', defaultOption: 'close' };
    const result = resolveTransferWindow(payload, 'close');
    expect(result.transferWindowOpen).toBe(false);
    expect(result.deltas).toEqual({});
    expect(result.sideEffects).toEqual([]);
  });
});

describe('resolveEvent dispatch for transfer window events', () => {
  it('dispatches transfer_window_open', () => {
    const payload: TransferWindowOpenPayload = { kind: 'transfer_window_open', defaultOption: 'open' };
    const result = resolveEvent(
      payload,
      'open',
      { rng: () => 0.5, currentWeek: 1, playerClubId: 'abc' },
    );
    expect(result.transferWindowOpen).toBe(true);
  });

  it('dispatches transfer_window_close', () => {
    const payload: TransferWindowClosePayload = { kind: 'transfer_window_close', defaultOption: 'close' };
    const result = resolveEvent(
      payload,
      'close',
      { rng: () => 0.5, currentWeek: 1, playerClubId: 'abc' },
    );
    expect(result.transferWindowOpen).toBe(false);
  });
});

describe('resolveDefault for transfer window events', () => {
  it('applies open as default for transfer_window_open', () => {
    const payload: TransferWindowOpenPayload = { kind: 'transfer_window_open', defaultOption: 'open' };
    const result = resolveDefault(
      payload,
      { rng: () => 0.5, currentWeek: 1, playerClubId: 'abc' },
    );
    expect(result.transferWindowOpen).toBe(true);
  });

  it('applies close as default for transfer_window_close', () => {
    const payload: TransferWindowClosePayload = { kind: 'transfer_window_close', defaultOption: 'close' };
    const result = resolveDefault(
      payload,
      { rng: () => 0.5, currentWeek: 1, playerClubId: 'abc' },
    );
    expect(result.transferWindowOpen).toBe(false);
  });
});
