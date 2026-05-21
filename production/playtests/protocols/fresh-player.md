# Playtest Protocol: Fresh-Player Onboarding

> Authored Sprint 8 task 8-7 (2026-05-21). To be run when a non-Pablo
> playtester is available. This protocol supplies the 2nd of 3 documented
> playtests required by the Production → Polish gate.

## Hypothesis Under Test

> A player who has never seen Cascada FC can sign up, create a club, and
> reach a meaningful first decision **within 5 minutes** without dev guidance.
> They should articulate the central fantasy of "discover-cascades +
> grow-as-manager" unprompted by minute 15.

This is the canonical **new-player experience** validation. The slice playtest
(2026-05-18 with Pablo) confirmed the loop works for someone who knows the
game intimately; this protocol validates the loop for someone who doesn't.

## Recruitment Criteria

- **Profile**: a casual football fan (knows what a manager game is in concept,
  e.g. has heard of FM/PES Manager, but has never played one).
- **NOT**: another dev, another game designer, or anyone with prior exposure
  to Cascada FC.
- **Demographic spread**: ideally 2-3 sessions across different player profiles
  (e.g. one mobile-first user, one desktop-only, one PWA install).

## Build Under Test

- Production main branch (commit hash documented in session metadata).
- DOM-only MVP (per `design/gdd/scope-mvp.md`). No PixiJS, no AI narrative.
- Fresh DB seed — no prior playthrough.

## Session Structure (~60 min total)

### Pre-session (5 min)
- Brief: "You'll be playing a soccer management game prototype. I'd like you
  to play freely for about 45 minutes. I'll ask 6 questions at the end. Think
  out loud if you can — say what you're trying to do, what surprises you, what
  confuses you. I won't help unless you're stuck for more than 90 seconds."
- Confirm screen recording consent (optional — useful for debrief).

### Play session (45 min)
Tester signs up + plays through the first in-game month autonomously.

**Observer notes to capture** (no interruption):
1. **Time-to-first-meaningful-decision**: how many seconds from clicking "Sign up" until they make a decision that isn't just "click the obvious thing"?
2. **Time-to-fantasy-articulation**: at what minute do they say something like "I see, so the cascade works like..." or "ah, my decisions affect..."?
3. **Confusion loops**: any 90+ second period where the player is doing things without apparent direction. Log each one with what they last clicked.
4. **Misclicks / unexpected outcomes**: every time they click something and the result surprised them.
5. **Reach for documentation/tutorial**: do they at any point look for help text? Where?

### Debrief (10 min)

Six questions verbatim:

1. ¿Completaste el ciclo completo sin guía?
2. ¿Cuánto tardaste en sentir que estabas jugando?
3. ¿Sentiste la fantasía discover-cascades + grow-as-manager? Si sí, ¿en qué momento se hizo evidente?
4. ¿Qué te paró o confundió?
5. ¿Es achievable a esta calidad para el juego completo?
6. PROCEED / PIVOT / KILL — ¿lo recomendarías como base para construir un juego completo, o ves un problema fundamental?

## Success Metrics

Per the Production → Polish gate requirement "no confusion loops where >50% of playtesters got stuck without knowing why":

- [ ] **Time-to-first-meaningful-decision** < 5 minutes (90% threshold).
- [ ] **Time-to-fantasy-articulation** < 20 minutes (any unprompted articulation counts).
- [ ] **Confusion loops**: NONE longer than 3 minutes. (Sessions where a single loop exceeds 3 min must be flagged for design review.)
- [ ] At least 1 of the 6 questions answered with explicit positive feedback on the cascade-discovery fantasy ("ah, my decisions affect X").
- [ ] PROCEED verdict from the playtester.

## Output

The session result lives at:

```
production/playtests/[YYYY-MM-DD]-fresh-player-[playtester-tag].md
```

Use the `production/playtests/README.md` 8-field template + this protocol as
the source for the Hypothesis + Setup fields.

## Out of Scope

- Mid-game economy crisis testing (covered by `economy-tuning.md` protocol).
- Multi-season progression (separate protocol when Sprint 10+ enables it).
- Accessibility validation (separate axe-core automated pass).
- A/B variant testing (out of scope until the design is locked).

## Action Items After Session

Per playtest, generate:

1. **Specific bugs** → bugs/ directory, severity-tagged.
2. **Polish opportunities** → Sprint backlog, sized.
3. **Design questions** → OQ-* entries in the relevant GDD or new ADR drafts.
4. **Pivot/Kill signals** → escalate immediately to Pablo for next-sprint scope rethink.

The playtester is NOT a design source — interpretations of their feedback live
in the action items, not in the playtest doc itself.
