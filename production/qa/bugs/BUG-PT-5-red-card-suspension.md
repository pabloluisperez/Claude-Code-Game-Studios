# BUG-PT-5 — Red-card suspension not enforced

**Severity**: S2 (gameplay rule gap — affects fairness/realism)
**Status**: ✅ **CLOSED** — Sprint 13 task 13-1 (commit b716043). Per-match
suspension counter + 5-yellow accumulation rule shipped. Suspended players
filtered from match-day roster. /squad badge + staff message.
**Reporter**: Pablo (playtest Sprint 12, 2026-05-21)
**Source**: `production/playtests/2026-05-21-polish-sprint-12.md`

---

## Description

When a player receives a red card during a match, they currently can
play in the next fixture as if nothing happened. Real-football rules:

- **Straight red (faults graves)**: 2-3 match suspension
- **Two yellows = red**: 1 match suspension
- **No suspension**: yellow cards never trigger one (could accumulate
  in a future expansion — 5-yellow-rule — but out of scope here)

---

## Reproduction

1. Start a match-live replay
2. Wait until a red-card event fires for one of your players
3. After the match ends, navigate to next fixture in calendar
4. Open /squad → that player is still listed as "available"
5. Set the lineup → player appears in starting XI

---

## Expected

After a red card:
- `players.suspended_until_week` (or similar) is set to `currentWeek + suspensionWeeks`
- /squad shows a "Suspended for N matches" badge on the player
- Lineup selector excludes suspended players from the starting XI
- Staff message: "El árbitro expulsó a [Player]. Se pierde N partido(s)."

---

## Source spec / references

GDD: `design/gdd/match-simulation.md` — should have a "Cards & Suspensions"
section (TBD if it exists — to verify in Sprint 13). The fault-gravity
mapping is currently undefined; needs a tuning pass.

Tentative formulas (proposed):
- F-CARD-1: `suspensionWeeks(redType) = redType === 'direct_red' ? 2 : 1`
- F-CARD-2: `severeFault(redType) = redType === 'violent_conduct' ? 3 : suspensionWeeks(redType)`

---

## Sprint sizing

- Schema: add `players.suspended_until_week INTEGER NULL DEFAULT NULL` — ~0.2d
- Match-sim: emit suspension on red-card event in `MatchOutcome` — ~0.5d
- Match-day runner: persist suspension into players table — ~0.3d
- /squad: show suspension badge + filter from lineup picker — ~0.5d
- Staff message: "El árbitro expulsó a X" — ~0.2d
- Tests: unit (suspensionWeeks formula) + integration (lineup excluded) — ~0.3d

**Total**: ~2.0 days. Fits a Sprint 13 Must-Have story.

---

## Priority justification

S2 because:
- Real-football realism issue — players being expelled and immediately
  available next match breaks immersion
- Affects every playthrough that includes a match (which is every one)
- Affects strategic depth: today, deliberately committing fouls has no
  long-term cost
- BUT: not blocking Sprint 12 sign-off; can ship to Polish→Release
  with a release-note caveat if it slips one more sprint

Strong candidate for Sprint 13 Must-Have alongside the soak test runner.
