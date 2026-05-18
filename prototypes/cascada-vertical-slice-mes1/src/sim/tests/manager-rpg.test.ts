// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { describe, expect, it } from "vitest";
import {
  allocateSkillPoint,
  applyXp,
  initialManagerState,
  maybeGenerateCareerEvent,
  weeklyXpGain,
} from "../manager-rpg.js";
import type { MatchOutcome, ThresholdCrossing } from "../types.js";

const winOutcome: MatchOutcome = {
  homeScore: 2,
  awayScore: 1,
  winner: "home",
  events: [],
  worldStateDeltas: { match_performance_index: 15, injury_risk: 0 },
  playerRatings: {},
};
const lossOutcome: MatchOutcome = {
  homeScore: 0,
  awayScore: 2,
  winner: "away",
  events: [],
  worldStateDeltas: { match_performance_index: -20, injury_risk: 0 },
  playerRatings: {},
};
const blockingCrossing: ThresholdCrossing = {
  nodeId: "fan_momentum",
  value: 18,
  threshold: 20,
  direction: "below",
  priority: "BLOCKING",
  reason: "fan_base_in_crisis",
};

describe("manager-rpg", () => {
  it("starts at level 1, both skills at 1, 0 XP", () => {
    const s = initialManagerState();
    expect(s.level).toBe(1);
    expect(s.skills.tactics).toBe(1);
    expect(s.skills.finance).toBe(1);
    expect(s.xp).toBe(0);
  });

  it("win gives more XP than a loss", () => {
    const winGains = weeklyXpGain({ matchOutcome: winOutcome, thresholdCrossings: [] });
    const lossGains = weeklyXpGain({
      matchOutcome: lossOutcome,
      thresholdCrossings: [],
    });
    const winTotal = winGains.reduce((s, g) => s + g.amount, 0);
    const lossTotal = lossGains.reduce((s, g) => s + g.amount, 0);
    expect(winTotal).toBeGreaterThan(lossTotal);
  });

  it("BLOCKING crossing gives more XP than ADVISORY", () => {
    const blockGains = weeklyXpGain({
      matchOutcome: null,
      thresholdCrossings: [blockingCrossing],
    });
    const advisoryGains = weeklyXpGain({
      matchOutcome: null,
      thresholdCrossings: [{ ...blockingCrossing, priority: "ADVISORY" }],
    });
    const block = blockGains.reduce((s, g) => s + g.amount, 0);
    const adv = advisoryGains.reduce((s, g) => s + g.amount, 0);
    expect(block).toBeGreaterThan(adv);
  });

  it("levels up at threshold 80 and grants a skill point", () => {
    let s = initialManagerState();
    const big = applyXp(s, [{ source: "test", amount: 100 }]);
    s = big.state;
    expect(s.level).toBe(2);
    expect(s.pendingSkillPoints).toBe(1);
    expect(big.leveledUp).toBe(true);
  });

  it("does NOT level past 4", () => {
    let s = initialManagerState();
    s = applyXp(s, [{ source: "test", amount: 10000 }]).state;
    expect(s.level).toBe(4);
    expect(s.pendingSkillPoints).toBe(3);
  });

  it("allocateSkillPoint moves 1 point from pending to a skill", () => {
    let s = initialManagerState();
    s = applyXp(s, [{ source: "boost", amount: 100 }]).state;
    expect(s.pendingSkillPoints).toBe(1);
    s = allocateSkillPoint(s, "tactics");
    expect(s.skills.tactics).toBe(2);
    expect(s.pendingSkillPoints).toBe(0);
  });

  it("career event fires at week 4 only once", () => {
    const s = initialManagerState();
    const e1 = maybeGenerateCareerEvent({ week: 4, state: s, currentPosition: 18 });
    expect(e1).not.toBeNull();
    expect(e1?.id).toBe("president_w4");
    const sWithEvent = { ...s, careerEvents: [e1!] };
    const e2 = maybeGenerateCareerEvent({
      week: 4,
      state: sWithEvent,
      currentPosition: 18,
    });
    expect(e2).toBeNull();
  });

  it("career event varies by position (descenso vs mid-table)", () => {
    const s = initialManagerState();
    const danger = maybeGenerateCareerEvent({
      week: 4,
      state: s,
      currentPosition: 18,
    });
    const safe = maybeGenerateCareerEvent({
      week: 4,
      state: s,
      currentPosition: 10,
    });
    expect(danger?.body).not.toBe(safe?.body);
  });
});
