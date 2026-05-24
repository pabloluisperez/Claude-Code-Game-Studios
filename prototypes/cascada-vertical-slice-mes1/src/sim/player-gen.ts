// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can we deterministically generate plausible 4-4-2 lineups from a seed + base skill?
// Date: 2026-05-18

import seedrandom from "seedrandom";
import type { Lineup, PlayerPosition, PlayerStats } from "./types.js";

/**
 * Procedurally generate one 4-4-2 lineup of 11 players.
 * Deterministic: given the same (seed, baseSkill, clubSlug), returns identical output.
 *
 * Production version will source players from packages/db/src/schema/players.ts.
 */
export function generateLineup(
  seed: string,
  baseSkill: number,
  clubSlug: string,
): Lineup {
  const rng = seedrandom(`${seed}:${clubSlug}`);
  const players: PlayerStats[] = [];

  // Formation positions
  const slots: { pos: PlayerPosition; count: number }[] = [
    { pos: "GK", count: 1 },
    { pos: "DEF", count: 4 },
    { pos: "MID", count: 4 },
    { pos: "FWD", count: 2 },
  ];

  let n = 1;
  for (const slot of slots) {
    for (let i = 0; i < slot.count; i++) {
      players.push(buildPlayer(rng, baseSkill, clubSlug, slot.pos, n));
      n++;
    }
  }

  return players;
}

function buildPlayer(
  rng: seedrandom.PRNG,
  baseSkill: number,
  clubSlug: string,
  position: PlayerPosition,
  num: number,
): PlayerStats {
  // Universal stats centered on baseSkill with ±10 random spread, clamped to GDD ranges
  const skill = clamp(baseSkill + (rng.double() - 0.5) * 20, 20, 95);
  const fitness = clamp(60 + (rng.double() - 0.5) * 30, 30, 100);
  const morale = clamp(55 + (rng.double() - 0.5) * 30, 0, 100);
  const form = clamp(55 + (rng.double() - 0.5) * 30, 30, 90);
  const stamina = clamp(70 + (rng.double() - 0.5) * 30, 40, 100);

  // Position-specific: 2 stats per position, biased to baseSkill ± 15
  const base: PlayerStats = {
    id: `${clubSlug}-p${num}`,
    name: `${clubSlug.toUpperCase()} #${num}`,
    position,
    skill,
    fitness,
    morale,
    form,
    stamina,
  };

  function posStat(): number {
    return clamp(baseSkill + (rng.double() - 0.5) * 25, 20, 95);
  }

  switch (position) {
    case "GK":
      base.reflexes = posStat();
      base.handling = posStat();
      break;
    case "DEF":
      base.strength = posStat();
      base.tackling = posStat();
      break;
    case "MID":
      base.passing = posStat();
      base.vision = posStat();
      break;
    case "FWD":
      base.speed = posStat();
      base.finishing = posStat();
      break;
  }
  return base;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ── Pre-baked club configs for the slice ─────────────────────────────────────

export interface ClubConfig {
  id: string;
  slug: string;
  name: string;
  baseSkill: number;
}

/** Real Pueblo CF — the player's club. Mediocre Segunda squad. */
export const REAL_PUEBLO: ClubConfig = {
  id: "club-real-pueblo",
  slug: "rpc",
  name: "Real Pueblo CF",
  baseSkill: 48,
};

/** 4 rival clubs covering the slice's 4 match weeks. */
export const RIVALS: readonly ClubConfig[] = [
  { id: "rival-cinta", slug: "cnt", name: "CD Cinta", baseSkill: 52 },
  { id: "rival-soria", slug: "sor", name: "Soria FC", baseSkill: 50 },
  { id: "rival-monte", slug: "mnt", name: "Monte Real (derbi)", baseSkill: 55 },
  { id: "rival-lider", slug: "lid", name: "Líder de la liga", baseSkill: 62 },
];

/** Whether the player plays home (true) or away (false) in each of the 4 weeks. */
export const SLICE_HOME_FLAGS: readonly boolean[] = [true, false, true, false];
