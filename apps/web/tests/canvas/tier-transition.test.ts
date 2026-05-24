/**
 * Tests for the tier transition animation state machine.
 *
 * Covers city-progression.md §3.4 + AC-CITY-08, AC-CITY-09.
 *
 * Pure FP — no clock, no PIXI. Tests pass any time value explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTransitionSteps,
  startTransition,
  sampleTransition,
  totalTransitionDurationMs,
  TRANSITION_DURATION_MS,
  DOUBLE_TIER_PAUSE_MS,
} from '../../src/lib/canvas/tier-transition';

describe('buildTransitionSteps', () => {
  it('returns empty array when from === to', () => {
    expect(buildTransitionSteps(2, 2)).toEqual([]);
  });

  it('single-step upgrade T1→T2 has 1 step', () => {
    const steps = buildTransitionSteps(1, 2);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      visibleTier: 1,
      fadingInTier: 2,
      startMs: 0,
      endMs: TRANSITION_DURATION_MS,
      isPause: false,
    });
  });

  it('double upgrade T1→T3 has 2 steps + 1 pause', () => {
    const steps = buildTransitionSteps(1, 3);
    expect(steps).toHaveLength(3); // step + pause + step
    expect(steps[0]).toMatchObject({ visibleTier: 1, fadingInTier: 2, isPause: false });
    expect(steps[1]).toMatchObject({ visibleTier: 2, fadingInTier: null, isPause: true });
    expect(steps[2]).toMatchObject({ visibleTier: 2, fadingInTier: 3, isPause: false });
  });

  it('triple upgrade T1→T4 has 3 steps + 2 pauses', () => {
    const steps = buildTransitionSteps(1, 4);
    expect(steps).toHaveLength(5);
    expect(steps.filter((s) => s.isPause)).toHaveLength(2);
  });

  it('downgrade T4→T1 builds in reverse', () => {
    const steps = buildTransitionSteps(4, 1);
    expect(steps).toHaveLength(5);
    expect(steps[0]).toMatchObject({ visibleTier: 4, fadingInTier: 3 });
    expect(steps[4]).toMatchObject({ visibleTier: 2, fadingInTier: 1 });
  });

  it('steps are contiguous (no gaps)', () => {
    const steps = buildTransitionSteps(1, 4);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.startMs).toBe(steps[i - 1]!.endMs);
    }
  });
});

describe('startTransition', () => {
  it('returns idle when from === to', () => {
    const anim = startTransition(2, 2, 1000);
    expect(anim.kind).toBe('idle');
  });

  it('returns animating with the right schedule', () => {
    const anim = startTransition(1, 3, 5000);
    expect(anim.kind).toBe('animating');
    if (anim.kind !== 'animating') throw new Error('expected animating');
    expect(anim.from).toBe(1);
    expect(anim.to).toBe(3);
    expect(anim.startedAt).toBe(5000);
    expect(anim.steps).toHaveLength(3);
  });
});

describe('sampleTransition — single-step T1→T2', () => {
  const anim = startTransition(1, 2, 0);

  it('at t=0, bgTier=1, fgTier=2, alpha=0', () => {
    const sample = sampleTransition(anim, 0);
    expect(sample.bgTier).toBe(1);
    expect(sample.fgTier).toBe(2);
    expect(sample.fgAlpha).toBe(0);
    expect(sample.complete).toBe(false);
  });

  it('at half-duration, alpha=0.5', () => {
    const sample = sampleTransition(anim, TRANSITION_DURATION_MS / 2);
    expect(sample.fgAlpha).toBeCloseTo(0.5, 5);
  });

  it('at end-duration, complete=true', () => {
    const sample = sampleTransition(anim, TRANSITION_DURATION_MS);
    expect(sample.complete).toBe(true);
    expect(sample.bgTier).toBe(2);
  });

  it('after end, complete=true and bgTier=destination', () => {
    const sample = sampleTransition(anim, TRANSITION_DURATION_MS * 2);
    expect(sample.complete).toBe(true);
    expect(sample.bgTier).toBe(2);
  });
});

describe('sampleTransition — double-step T1→T3 (AC-CITY-09)', () => {
  const anim = startTransition(1, 3, 0);

  it('during first fade: bg=1, fg=2', () => {
    const sample = sampleTransition(anim, TRANSITION_DURATION_MS / 2);
    expect(sample.bgTier).toBe(1);
    expect(sample.fgTier).toBe(2);
  });

  it('during pause: bg=2, fg=null', () => {
    const sample = sampleTransition(anim, TRANSITION_DURATION_MS + DOUBLE_TIER_PAUSE_MS / 2);
    expect(sample.bgTier).toBe(2);
    expect(sample.fgTier).toBeNull();
  });

  it('during second fade: bg=2, fg=3', () => {
    const sample = sampleTransition(
      anim,
      TRANSITION_DURATION_MS + DOUBLE_TIER_PAUSE_MS + TRANSITION_DURATION_MS / 2,
    );
    expect(sample.bgTier).toBe(2);
    expect(sample.fgTier).toBe(3);
  });

  it('after total duration: complete + bgTier=3', () => {
    const total =
      TRANSITION_DURATION_MS + DOUBLE_TIER_PAUSE_MS + TRANSITION_DURATION_MS;
    const sample = sampleTransition(anim, total);
    expect(sample.complete).toBe(true);
    expect(sample.bgTier).toBe(3);
  });
});

describe('totalTransitionDurationMs', () => {
  it('T2→T2 = 0', () => {
    expect(totalTransitionDurationMs(2, 2)).toBe(0);
  });

  it('T1→T2 = TRANSITION_DURATION_MS (AC-CITY-08)', () => {
    expect(totalTransitionDurationMs(1, 2)).toBe(TRANSITION_DURATION_MS);
  });

  it('T1→T3 = 2*TRANSITION + DOUBLE_TIER_PAUSE', () => {
    expect(totalTransitionDurationMs(1, 3)).toBe(2 * TRANSITION_DURATION_MS + DOUBLE_TIER_PAUSE_MS);
  });

  it('T1→T4 = 3*TRANSITION + 2*PAUSE', () => {
    expect(totalTransitionDurationMs(1, 4)).toBe(
      3 * TRANSITION_DURATION_MS + 2 * DOUBLE_TIER_PAUSE_MS,
    );
  });
});

describe('sampleTransition — idle', () => {
  it('idle returns bg=tier, fg=null, complete=true', () => {
    const sample = sampleTransition({ kind: 'idle', tier: 3 }, 1000);
    expect(sample).toEqual({ bgTier: 3, fgTier: null, fgAlpha: 0, complete: true });
  });
});

describe('sampleTransition — t < startedAt (clock skew)', () => {
  it('returns from-tier with complete=false', () => {
    const anim = startTransition(1, 2, 1000);
    const sample = sampleTransition(anim, 500); // before startedAt
    expect(sample.bgTier).toBe(1);
    expect(sample.complete).toBe(false);
  });
});
