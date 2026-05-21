/**
 * Tier transition animation state machine.
 *
 * v1.1 Sprint 24 per city-progression.md §3.4.
 *
 * When the resolved tier changes, the renderer plays a 1.5s cross-fade.
 * Multi-tier jumps (T1 → T3) chain: T1→T2 (1.5s) → pause (0.5s) → T2→T3 (1.5s).
 *
 * This module is pure FP. The component drives a ticker that calls
 * `advanceTransition(state, elapsedMs)` each frame and reads the resulting
 * alpha values from the descriptor.
 */

import type { CityTier } from './types.js';

/** Duration of a single tier fade per city-progression.md §3.4. */
export const TRANSITION_DURATION_MS = 1500;

/** Pause between chained transitions for double tier jumps. */
export const DOUBLE_TIER_PAUSE_MS = 500;

/** Animation steps generated for a tier transition. */
export type TransitionStep = {
  /** The tier rendered DURING this step. */
  visibleTier: CityTier;
  /** The tier fading IN at the end of this step. Null = no fade (steady). */
  fadingInTier: CityTier | null;
  startMs: number;
  endMs: number;
  /** Whether this is a "pause" segment (no fade, just hold). */
  isPause: boolean;
};

export type TierTransitionAnim =
  | { kind: 'idle'; tier: CityTier }
  | {
      kind: 'animating';
      from: CityTier;
      to: CityTier;
      startedAt: number;
      steps: readonly TransitionStep[];
    };

/**
 * Build the step schedule from `prev` to `next`.
 *
 * For a single-step transition (e.g., T1 → T2), 1 step of TRANSITION_DURATION_MS.
 * For a double (T1 → T3), 2 steps with DOUBLE_TIER_PAUSE_MS in between.
 */
export function buildTransitionSteps(
  from: CityTier,
  to: CityTier,
): TransitionStep[] {
  if (from === to) return [];
  const direction = to > from ? +1 : -1;
  const intermediates: CityTier[] = [];
  for (let t = from + direction; t !== to + direction; t += direction) {
    intermediates.push(t as CityTier);
  }

  const steps: TransitionStep[] = [];
  let cursor = 0;
  for (let i = 0; i < intermediates.length; i++) {
    const visible = i === 0 ? from : intermediates[i - 1]!;
    const fadingIn = intermediates[i]!;
    const startMs = cursor;
    const endMs = cursor + TRANSITION_DURATION_MS;
    steps.push({ visibleTier: visible, fadingInTier: fadingIn, startMs, endMs, isPause: false });
    cursor = endMs;
    if (i < intermediates.length - 1) {
      // Insert a pause between steps
      steps.push({
        visibleTier: fadingIn,
        fadingInTier: null,
        startMs: cursor,
        endMs: cursor + DOUBLE_TIER_PAUSE_MS,
        isPause: true,
      });
      cursor += DOUBLE_TIER_PAUSE_MS;
    }
  }
  return steps;
}

/**
 * Start a new transition animation from `from` to `to`.
 */
export function startTransition(
  from: CityTier,
  to: CityTier,
  nowMs: number,
): TierTransitionAnim {
  if (from === to) return { kind: 'idle', tier: from };
  return {
    kind: 'animating',
    from,
    to,
    startedAt: nowMs,
    steps: buildTransitionSteps(from, to),
  };
}

/**
 * Sample the current animation state at `nowMs`. Returns:
 *   - `bgTier`: the tier rendered behind (steady)
 *   - `fgTier`: tier rendered on top fading in (null if no fade)
 *   - `fgAlpha`: 0..1 fade-in alpha of the fg tier
 *   - `complete`: true once the animation has finished
 *
 * Pure: same input → same output. Easy to test without a clock.
 */
export type TransitionSample = {
  bgTier: CityTier;
  fgTier: CityTier | null;
  fgAlpha: number;
  complete: boolean;
};

export function sampleTransition(
  anim: TierTransitionAnim,
  nowMs: number,
): TransitionSample {
  if (anim.kind === 'idle') {
    return { bgTier: anim.tier, fgTier: null, fgAlpha: 0, complete: true };
  }
  const elapsed = nowMs - anim.startedAt;
  if (elapsed < 0) {
    return { bgTier: anim.from, fgTier: null, fgAlpha: 0, complete: false };
  }
  const step = anim.steps.find((s) => elapsed >= s.startMs && elapsed < s.endMs);
  if (!step) {
    // Past the end
    return { bgTier: anim.to, fgTier: null, fgAlpha: 0, complete: true };
  }
  if (step.isPause || step.fadingInTier === null) {
    return { bgTier: step.visibleTier, fgTier: null, fgAlpha: 0, complete: false };
  }
  const stepElapsed = elapsed - step.startMs;
  const stepDuration = step.endMs - step.startMs;
  const fgAlpha = stepDuration > 0 ? clamp01(stepElapsed / stepDuration) : 1;
  return {
    bgTier: step.visibleTier,
    fgTier: step.fadingInTier,
    fgAlpha,
    complete: false,
  };
}

/** Total transition duration in ms (useful for tests + audio sync). */
export function totalTransitionDurationMs(from: CityTier, to: CityTier): number {
  if (from === to) return 0;
  const steps = buildTransitionSteps(from, to);
  return steps.length === 0 ? 0 : steps[steps.length - 1]!.endMs;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
