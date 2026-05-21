/**
 * Tests for presentation state derivation (ADR-022).
 *
 * Pure functions — no DB, no PIXI, no browser.
 */

import { describe, it, expect } from 'vitest';
import {
  derivePresentationState,
  timeToDayNightBucket,
  effectiveInfrastructureLevel,
  WEATHER_RAIN_PROBABILITY,
  MATCH_DAY_TIME_OF_DAY,
  RAIN_INFRASTRUCTURE_PENALTY,
} from '../src/sim/presentation-state';

const PLAYTHROUGH_A = 'p-test-aaaaaaaa-0000-0000-0000-000000000001';
const PLAYTHROUGH_B = 'p-test-bbbbbbbb-0000-0000-0000-000000000002';

describe('derivePresentationState — determinism (AC-AI-15-like)', () => {
  it('same triple → identical output across calls', () => {
    const a = derivePresentationState({
      playthroughId: PLAYTHROUGH_A,
      week: 5,
      dayOfSeason: 33,
    });
    const b = derivePresentationState({
      playthroughId: PLAYTHROUGH_A,
      week: 5,
      dayOfSeason: 33,
    });
    expect(a).toEqual(b);
  });

  it('different playthroughId can produce different weather', () => {
    // It's possible they coincide for one (week, day) — that's OK. We check
    // that the function takes playthroughId into account by sweeping a range.
    let differences = 0;
    for (let day = 0; day < 50; day++) {
      const a = derivePresentationState({
        playthroughId: PLAYTHROUGH_A,
        week: 1,
        dayOfSeason: day,
      });
      const b = derivePresentationState({
        playthroughId: PLAYTHROUGH_B,
        week: 1,
        dayOfSeason: day,
      });
      if (a.weather !== b.weather) differences++;
    }
    // Statistical: among 50 days, ~16 should differ (probability of mismatch
    // = 2 * p * (1-p) = 0.32). Allow generous range.
    expect(differences).toBeGreaterThan(3);
    expect(differences).toBeLessThan(40);
  });
});

describe('derivePresentationState — time of day', () => {
  it('day 0 → time 0', () => {
    const { currentTimeOfDay } = derivePresentationState({
      playthroughId: PLAYTHROUGH_A,
      week: 0,
      dayOfSeason: 0,
    });
    expect(currentTimeOfDay).toBe(0);
  });

  it('day 3 (mid-week) → time 3/7', () => {
    const { currentTimeOfDay } = derivePresentationState({
      playthroughId: PLAYTHROUGH_A,
      week: 1,
      dayOfSeason: 3,
    });
    expect(currentTimeOfDay).toBeCloseTo(3 / 7, 5);
  });

  it('day 6 → time 6/7', () => {
    const { currentTimeOfDay } = derivePresentationState({
      playthroughId: PLAYTHROUGH_A,
      week: 0,
      dayOfSeason: 6,
    });
    expect(currentTimeOfDay).toBeCloseTo(6 / 7, 5);
  });

  it('day 7 (start of next week) → time 0', () => {
    const { currentTimeOfDay } = derivePresentationState({
      playthroughId: PLAYTHROUGH_A,
      week: 1,
      dayOfSeason: 7,
    });
    expect(currentTimeOfDay).toBe(0);
  });

  it('isMatchDay override pins time to MATCH_DAY_TIME_OF_DAY', () => {
    const { currentTimeOfDay } = derivePresentationState({
      playthroughId: PLAYTHROUGH_A,
      week: 1,
      dayOfSeason: 4,
      isMatchDay: true,
    });
    expect(currentTimeOfDay).toBe(MATCH_DAY_TIME_OF_DAY);
  });
});

describe('derivePresentationState — weather distribution', () => {
  it('rain rate roughly matches WEATHER_RAIN_PROBABILITY across many days', () => {
    let rain = 0;
    const N = 2000;
    for (let day = 0; day < N; day++) {
      const ps = derivePresentationState({
        playthroughId: PLAYTHROUGH_A,
        week: Math.floor(day / 7),
        dayOfSeason: day,
      });
      if (ps.weather === 'rain') rain++;
    }
    const observed = rain / N;
    // Allow ±5 percentage points slack
    expect(observed).toBeGreaterThan(WEATHER_RAIN_PROBABILITY - 0.05);
    expect(observed).toBeLessThan(WEATHER_RAIN_PROBABILITY + 0.05);
  });
});

describe('timeToDayNightBucket', () => {
  it('midnight is night', () => {
    expect(timeToDayNightBucket(0)).toBe('night');
  });

  it('25% is dawn', () => {
    expect(timeToDayNightBucket(0.25)).toBe('dawn');
  });

  it('50% is day', () => {
    expect(timeToDayNightBucket(0.5)).toBe('day');
  });

  it('75% is dusk', () => {
    expect(timeToDayNightBucket(0.75)).toBe('dusk');
  });

  it('almost midnight is night again', () => {
    expect(timeToDayNightBucket(0.95)).toBe('night');
  });

  it('wraps past 1.0', () => {
    expect(timeToDayNightBucket(1.5)).toBe('day');
  });

  it('wraps negative', () => {
    expect(timeToDayNightBucket(-0.1)).toBe('night');
  });
});

describe('effectiveInfrastructureLevel (ADR-022 §D4)', () => {
  it('clear weather: no penalty', () => {
    expect(effectiveInfrastructureLevel(75, 'clear')).toBe(75);
  });

  it('rain weather: -RAIN_INFRASTRUCTURE_PENALTY', () => {
    expect(effectiveInfrastructureLevel(75, 'rain')).toBe(75 - RAIN_INFRASTRUCTURE_PENALTY);
  });

  it('does not go negative under rain', () => {
    expect(effectiveInfrastructureLevel(5, 'rain')).toBe(0);
  });

  it('0 stays 0 under rain', () => {
    expect(effectiveInfrastructureLevel(0, 'rain')).toBe(0);
  });
});
