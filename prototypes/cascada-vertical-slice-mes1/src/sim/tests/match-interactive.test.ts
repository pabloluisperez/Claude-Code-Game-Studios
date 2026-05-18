// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Does pause-at-45 + resume produce the EXACT same outcome as one-shot? (ADR-013 Option B)
// Date: 2026-05-18

import { describe, expect, it } from "vitest";
import {
  resumeInteractiveMatch,
  simulateMatch,
  startInteractiveMatch,
} from "../match-simulation.js";
import { generateLineup, REAL_PUEBLO, RIVALS } from "../player-gen.js";
import { REAL_PUEBLO_INITIAL } from "../seed-data.js";
import type { MatchInput } from "../types.js";

function buildInput(seed: string): MatchInput {
  const home = REAL_PUEBLO;
  const away = RIVALS[2]!; // Monte Real — the derby in slice
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

describe("interactive match determinism (ADR-013 Option B)", () => {
  it("pause at 45 + resume with no sub === one-shot (identical scoreline + MPI)", () => {
    const input = buildInput("interactive-determinism-1");

    // One-shot baseline
    const oneShot = simulateMatch(input);

    // Pause + resume with no decision
    const snapshot = startInteractiveMatch(input);
    expect(snapshot.currentTick).toBe(45);
    const resumed = resumeInteractiveMatch({
      snapshot,
      decision: null,
      input,
    });

    expect(resumed.homeScore).toBe(oneShot.homeScore);
    expect(resumed.awayScore).toBe(oneShot.awayScore);
    expect(resumed.worldStateDeltas.match_performance_index).toBe(
      oneShot.worldStateDeltas.match_performance_index,
    );
    // Events after tick 45 should match (note: resumed events also include
    // a half_time event from start, then events 46-90)
    const oneShotPost45 = oneShot.events.filter(
      (e) => e.minute >= 45 && e.type !== "half_time",
    );
    const resumedPost45 = resumed.events.filter(
      (e) => e.minute >= 45 && e.type !== "half_time",
    );
    expect(resumedPost45.map(eventKey)).toEqual(oneShotPost45.map(eventKey));
  });

  it("snapshot is JSON-serializable (round-trip preserves rng + score)", () => {
    const input = buildInput("interactive-serialize");
    const snapshot = startInteractiveMatch(input);

    // Round-trip
    const round = JSON.parse(JSON.stringify(snapshot));

    const resumedFromOriginal = resumeInteractiveMatch({
      snapshot,
      decision: null,
      input,
    });
    const resumedFromRoundtrip = resumeInteractiveMatch({
      snapshot: round,
      decision: null,
      input,
    });

    expect(resumedFromRoundtrip.homeScore).toBe(resumedFromOriginal.homeScore);
    expect(resumedFromRoundtrip.awayScore).toBe(resumedFromOriginal.awayScore);
    expect(resumedFromRoundtrip.worldStateDeltas).toEqual(
      resumedFromOriginal.worldStateDeltas,
    );
  });

  it("substitution decision changes lineup but preserves rng stream", () => {
    const input = buildInput("interactive-with-sub");
    const snapshot = startInteractiveMatch(input);

    // Sub the home FWD2 for a synthetic super-finisher
    const replacement = {
      ...input.homeLineup.find((p) => p.position === "FWD")!,
      id: "sub-super-fwd",
      finishing: 95,
      speed: 90,
    };
    const decision = {
      side: "home" as const,
      playerOutId: input.homeLineup.find((p) => p.position === "FWD")!.id,
      playerInStats: replacement,
    };

    const noSub = resumeInteractiveMatch({ snapshot, decision: null, input });
    const withSub = resumeInteractiveMatch({ snapshot, decision, input });

    // The rng stream is the same; lineup changed → outcomes may differ
    // We don't assert equality here; just that the function ran without error
    // and the sub player's id appears in the lineup post-sub.
    expect(withSub.playerRatings[replacement.id]).toBeDefined();
    expect(noSub).toBeDefined();
  });
});

function eventKey(e: { type: string; minute: number; playerId?: string }): string {
  return `${e.type}@${e.minute}:${e.playerId ?? ""}`;
}
