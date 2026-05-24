# BUG-PT-4 — Match live polish features missing from vertical slice

**Severity**: S3 (feature gap — UX polish, not blocking)
**Status**: ✅ **CLOSED (parcial)** — Sprint 13 task 13-5 (commit 802482f).
Confeti burst + VAR overlay shipped en match-live. Pre-event pause descoped
(335ms/min tick es ya rápido, una pausa de 500ms se siente jarring — backlog
v1.1+ si playtest lo pide).
**Reporter**: Pablo (playtest Sprint 12, 2026-05-21)
**Source**: `production/playtests/2026-05-21-polish-sprint-12.md`

---

## Description

Pablo's playtest surfaced 3 match-live features that existed in the
vertical slice prototype but did NOT migrate to the production
implementation. Each adds a layer of "feel" / agency to the live-match
moment.

### PT-4a — Parada antes de evento importante

The vertical slice paused the live-match playback before "important"
events (goal, red card, penalty, VAR check) and surfaced a brief
"algo va a pasar" hint. This gives the player a moment of anticipation
+ optional intervention before the result resolves.

Currently the production match-live runs straight through every event
at the same pace.

### PT-4b — Confeti de gol

Goal events should trigger a brief confetti particle burst when the
user's team scores (and a more subdued visual when conceding). Adds
emotional pay-off to a moment that is currently a one-line text event.

### PT-4c — Posible intervención del VAR

Some goals should trigger a VAR check (rare, e.g. 5-10% of goals)
that briefly displays "VAR checking..." before either confirming or
disallowing the goal. Adds drama + variance.

---

## Reproduction

1. Start a playthrough with a fixture this week
2. Navigate to /match/[id]
3. Click "Reproducir en vivo"
4. Observe: events tick through linearly with no pause, no confetti,
   no VAR check

---

## Expected (from vertical slice memory)

- Goal event → confetti particle burst (1-2s)
- "Important" event (goal/red/penalty) → brief pre-event pause (~1s)
  with a small visual hint
- ~5-10% of goals → VAR sequence ("VAR checking..." → confirm/disallow)

---

## Source spec / references

Vertical slice prototype: `prototypes/[slice-id]/match-live-impl/`
(not currently in MVP but the patterns are documented). Need to:
- Re-locate the prototype implementation
- Port the confetti generator
- Port the pre-event pause logic
- Design VAR variance per F-formula in `match-simulation.md`

---

## Sprint sizing

- **PT-4a (parada antes evento)**: ~0.5 days (timeline hook in replay tick)
- **PT-4b (confeti)**: ~0.3 days (CSS particles + trigger hook)
- **PT-4c (VAR)**: ~1 day (random check + display state + variance test)

**Total**: ~1.8 days. Fits a Sprint 13 Should-Have story.

---

## Priority justification

S3 because:
- Game is playable without these
- Mid-week pause (Sprint 12 main feature) already addresses the "no
  agency" finding from playtest 2026-05-21
- Polish→Release gate does not require these per the Polish-phase
  carry-forward conditions

But should land before Release because the match moment is the
emotional peak of a season and currently feels flat compared to the
slice.
