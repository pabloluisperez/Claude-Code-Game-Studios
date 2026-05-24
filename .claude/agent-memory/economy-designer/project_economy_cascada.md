---
name: project-economy-cascada
description: Economy parameters and known design issues for Cascada FC player-management GDD as of 2026-05-18
metadata:
  type: project
---

Cascada FC is a D2 (Segunda España) web-based soccer manager. Economy parameters:
- Season budget: ~15,000 €K/season
- Weekly wage bill: typical D2 range 0.10-0.80 €K/player/week
- Transfer values: 0.5-250 €K (F6 formula, BASE_VALUE_K=5.0, SKILL_VALUE_EXP=1.8)
- TV rights D2: 20 €K/season (registry). D1: 270 €K/season.
- Staff wage floor (all tier 1): 2.75 €K/week

Known economic design issues flagged in adversarial review 2026-05-18:
1. BLOCKER: No wage floor/minimum ratio — F10 is advisory only, enabling sub-market exploitation
2. BLOCKER: Static AI squads (OQ-PM-04) + no player regeneration = pool depletion within 2-3 seasons
3. BLOCKER: Morale formula missing (OQ-PM-02) — morale consequence chain is undefined
4. HIGH: 90% acceptance threshold is exploitable at scale; no cooldown between windows
5. HIGH: Development curve creates 4x value amplification on top players; no squad value cap
6. MEDIUM: Age curve incentivizes buy-21/sell-25 strategy that trivializes transfer economics
7. MEDIUM: Loan mechanic enables perpetual wage avoidance for high-salary players

**Why:** Economy review performed before implementation epic to catch design-level blockers.
**How to apply:** Any future economy GDD work should address these 7 issues. Blockers 1-3 must be resolved before player-management epic begins.
