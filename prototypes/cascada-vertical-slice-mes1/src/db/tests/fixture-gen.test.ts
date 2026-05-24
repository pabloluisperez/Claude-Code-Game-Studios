// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { describe, expect, it } from "vitest";
import { forceTargetSchedule, generateRoundRobin } from "../fixture-gen.js";

describe("generateRoundRobin", () => {
  it("produces N×(N-1) fixtures for N even clubs", () => {
    for (const n of [4, 8, 16, 20]) {
      const clubs = Array.from({ length: n }, (_, i) => `c${i}`);
      const fixtures = generateRoundRobin(clubs);
      expect(fixtures.length).toBe(n * (n - 1));
    }
  });

  it("each pair of clubs plays exactly twice (home + away)", () => {
    const clubs = ["a", "b", "c", "d", "e", "f"];
    const fixtures = generateRoundRobin(clubs);
    const pairCounts = new Map<string, number>();
    for (const f of fixtures) {
      const key = [f.homeClubId, f.awayClubId].join(":");
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    // Every (home, away) ordered pair should appear exactly once
    expect(pairCounts.size).toBe(clubs.length * (clubs.length - 1));
    for (const count of pairCounts.values()) {
      expect(count).toBe(1);
    }
  });

  it("no club plays itself", () => {
    const clubs = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const fixtures = generateRoundRobin(clubs);
    for (const f of fixtures) {
      expect(f.homeClubId).not.toBe(f.awayClubId);
    }
  });

  it("for 20 clubs produces 38 matchdays × 10 fixtures = 380 fixtures", () => {
    const clubs = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const fixtures = generateRoundRobin(clubs);
    expect(fixtures.length).toBe(380);
    const matchdays = new Set(fixtures.map((f) => f.week));
    expect(matchdays.size).toBe(38);
    for (const w of matchdays) {
      const inWeek = fixtures.filter((f) => f.week === w);
      expect(inWeek.length).toBe(10);
      const involvedClubs = new Set<string>();
      for (const f of inWeek) {
        involvedClubs.add(f.homeClubId);
        involvedClubs.add(f.awayClubId);
      }
      // Every club plays exactly once per matchday
      expect(involvedClubs.size).toBe(20);
    }
  });

  it("is deterministic — same inputs → identical output", () => {
    const clubs = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const a = generateRoundRobin(clubs);
    const b = generateRoundRobin(clubs);
    expect(b).toEqual(a);
  });

  it("rejects odd club counts", () => {
    expect(() => generateRoundRobin(["a", "b", "c"])).toThrow();
  });
});

describe("forceTargetSchedule", () => {
  it("forces the target's first N matchdays to specific opponents in correct home/away", () => {
    const clubs = ["TARGET", "A", "B", "C", "D", "E", "F", "G"];
    const fixtures = generateRoundRobin(clubs);
    const forced = forceTargetSchedule(
      fixtures,
      "TARGET",
      ["A", "B", "C", "D"],
      [true, false, true, false],
    );

    for (let w = 1; w <= 4; w++) {
      const targetFix = forced.find(
        (f) =>
          f.week === w && (f.homeClubId === "TARGET" || f.awayClubId === "TARGET"),
      );
      expect(targetFix).toBeTruthy();
      const expectedOpp = ["A", "B", "C", "D"][w - 1]!;
      const expectedHome = [true, false, true, false][w - 1]!;
      if (expectedHome) {
        expect(targetFix?.homeClubId).toBe("TARGET");
        expect(targetFix?.awayClubId).toBe(expectedOpp);
      } else {
        expect(targetFix?.awayClubId).toBe("TARGET");
        expect(targetFix?.homeClubId).toBe(expectedOpp);
      }
    }
  });

  it("preserves matchday integrity after forcing", () => {
    const clubs = Array.from({ length: 20 }, (_, i) => (i === 0 ? "TARGET" : `c${i}`));
    const fixtures = generateRoundRobin(clubs);
    const forced = forceTargetSchedule(
      fixtures,
      "TARGET",
      ["c1", "c2", "c3", "c4"],
      [true, false, true, false],
    );
    // Total fixture count unchanged
    expect(forced.length).toBe(fixtures.length);
    // Every club still plays exactly once per matchday
    for (let w = 1; w <= 38; w++) {
      const inWeek = forced.filter((f) => f.week === w);
      const involved = new Set<string>();
      for (const f of inWeek) {
        involved.add(f.homeClubId);
        involved.add(f.awayClubId);
      }
      expect(involved.size).toBe(20);
    }
  });
});
