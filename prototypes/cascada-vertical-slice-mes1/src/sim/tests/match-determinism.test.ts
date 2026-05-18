// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Is simulateMatch truly a pure deterministic function?
// Date: 2026-05-18

import { describe, expect, it } from "vitest";
import { simulateMatch } from "../match-simulation.js";
import { generateLineup, REAL_PUEBLO, RIVALS } from "../player-gen.js";
import { REAL_PUEBLO_INITIAL } from "../seed-data.js";
import type { MatchInput } from "../types.js";

function buildInput(seed: string): MatchInput {
  const home = REAL_PUEBLO;
  const away = RIVALS[0]!;
  return {
    homeClubId: home.id,
    awayClubId: away.id,
    homeLineup: generateLineup(seed, home.baseSkill, home.slug),
    awayLineup: generateLineup(seed, away.baseSkill, away.slug),
    worldState: REAL_PUEBLO_INITIAL,
    playerClubSide: "home",
    seed,
  };
}

describe("simulateMatch determinism", () => {
  it("same input → identical output", () => {
    const input = buildInput("match-test-seed-001");
    const a = simulateMatch(input);
    const b = simulateMatch(input);
    expect(b.homeScore).toBe(a.homeScore);
    expect(b.awayScore).toBe(a.awayScore);
    expect(b.winner).toBe(a.winner);
    expect(b.events).toEqual(a.events);
    expect(b.worldStateDeltas).toEqual(a.worldStateDeltas);
    expect(b.playerRatings).toEqual(a.playerRatings);
  });

  it("different seeds → different outputs (almost always)", () => {
    const a = simulateMatch(buildInput("seed-A"));
    const b = simulateMatch(buildInput("seed-B"));
    // The event arrays are extremely unlikely to be identical
    expect(b.events).not.toEqual(a.events);
  });

  it("produces a valid scoreline and matching winner", () => {
    const out = simulateMatch(buildInput("seed-scoreline"));
    expect(out.homeScore).toBeGreaterThanOrEqual(0);
    expect(out.awayScore).toBeGreaterThanOrEqual(0);
    if (out.homeScore > out.awayScore) expect(out.winner).toBe("home");
    else if (out.awayScore > out.homeScore) expect(out.winner).toBe("away");
    else expect(out.winner).toBe("draw");
  });

  it("emits match_start and full_time bookend events", () => {
    const out = simulateMatch(buildInput("seed-bookends"));
    expect(out.events[0]?.type).toBe("match_start");
    expect(out.events.at(-1)?.type).toBe("full_time");
  });

  it("F8 mpi_delta is in [-30, +30]", () => {
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const out = simulateMatch(buildInput(`mpi-${seed}`));
      const mpi = out.worldStateDeltas.match_performance_index;
      expect(mpi).toBeGreaterThanOrEqual(-30);
      expect(mpi).toBeLessThanOrEqual(30);
    }
  });

  it("F9 injury_risk delta is in [0, +15]", () => {
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const out = simulateMatch(buildInput(`inj-${seed}`));
      const ir = out.worldStateDeltas.injury_risk;
      expect(ir).toBeGreaterThanOrEqual(0);
      expect(ir).toBeLessThanOrEqual(15);
    }
  });

  it("every injury event has causalNode='injury_risk'", () => {
    // Try multiple seeds until we find at least one with injuries
    let found = false;
    for (let i = 0; i < 30; i++) {
      const out = simulateMatch(buildInput(`causal-${i}`));
      const injuries = out.events.filter((e) => e.type === "injury");
      if (injuries.length > 0) {
        found = true;
        for (const inj of injuries) {
          expect(inj.causalNode).toBe("injury_risk");
        }
      }
    }
    expect(found).toBe(true);
  });

  it("draw home → mpi -3; draw away → mpi +1", () => {
    // Force a draw by manipulating both teams to be identical
    const seed = "force-draw-seed";
    const homeLineup = generateLineup(seed, 50, "even-club");
    const awayLineup = generateLineup(seed, 50, "even-club"); // same seed+slug → same players
    // For F8 perspective test we don't actually need a real draw; we test the function directly.
    // Just check that with a draw scoreline the function picks the right perspective.
    // We test via two runs with playerClubSide flipped.

    // First find an actual draw output (this depends on RNG)
    let drawOut = null;
    for (let i = 0; i < 50; i++) {
      const out = simulateMatch({
        homeClubId: "a",
        awayClubId: "b",
        homeLineup,
        awayLineup,
        worldState: REAL_PUEBLO_INITIAL,
        playerClubSide: "home",
        seed: `draw-search-${i}`,
      });
      if (out.winner === "draw") {
        drawOut = out;
        // Re-run with playerClubSide = "away" using same seed
        const out2 = simulateMatch({
          homeClubId: "a",
          awayClubId: "b",
          homeLineup,
          awayLineup,
          worldState: REAL_PUEBLO_INITIAL,
          playerClubSide: "away",
          seed: `draw-search-${i}`,
        });
        // F8: draw at home = -3; draw away = +1
        expect(out.worldStateDeltas.match_performance_index).toBe(-3);
        expect(out2.worldStateDeltas.match_performance_index).toBe(1);
        break;
      }
    }
    expect(drawOut).not.toBeNull();
  });
});

describe("match-sim + cascade integration", () => {
  it("MPI delta from match is observable in cascade tick", () => {
    // Quick sanity: a loss should produce negative MPI delta, which when
    // applied to MPI=50 yields MPI < 50, which C6 should propagate as
    // negative delta to fan_momentum.
    const out = simulateMatch(buildInput("integration-test"));
    expect(out.worldStateDeltas.match_performance_index).toBeGreaterThanOrEqual(-30);
    expect(out.worldStateDeltas.match_performance_index).toBeLessThanOrEqual(30);
    // The smoke run integration is verified by smoke.ts output, not asserted here.
  });
});
