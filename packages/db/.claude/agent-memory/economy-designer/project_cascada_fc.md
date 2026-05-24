---
name: project-cascada-fc
description: Cascada FC — web soccer manager with emergent cascade mechanics, isometric pixel art, Manager-RPG, MMO trajectory. Core economy model and prototype learnings.
metadata:
  type: project
---

Cascada FC is the active project being designed on branch project/SoccerManagerTotal.

**Why:** The game concept combines a cascade-emergent match engine with web-based manager RPG and eventual MMO layer.

**Core Economy (as reviewed 2026-05-16):**
- Revenue: ticket sales, sponsorship base, match bonuses
- Costs: groundskeeper, catering, scouting, player salaries, training costs
- Progression: city tiers (4 tiers in MVP), club divisions (quinta → primera)
- Currency: weekly/monthly balance
- Manager RPG: 5 skills × 4-5 levels, reputation → offers from other clubs

**MVP Scope:** 1 liga, 16 clubs, 3-5 seasons, ~10-15 cascades

**Prototype Learnings (HTML prototype validated):**
- Ticket price → attendance → atmosphere → team performance tradeoff is engaging
- Fan momentum accumulation (wins + fair prices → fans "hook" → tolerate later price increases; losses make any increase hurt more) — NOT documented in current GDD
- City tier income relationship (more commerce = more sponsorship?) — NOT defined

**How to apply:** Any economy work must account for the fan_momentum second-order cycle and the city-tier income linkage, both of which are blocking gaps in the current design doc.
