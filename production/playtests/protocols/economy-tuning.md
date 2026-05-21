# Playtest Protocol: Economy Tuning (Mid-Game Stress)

> Authored Sprint 8 task 8-7 (2026-05-21). To be run after the fresh-player
> protocol validates the onboarding loop. This protocol supplies the 3rd of 3
> documented playtests required by the Production → Polish gate.

## Hypothesis Under Test

> The economy's F8 scandal cliff + F-TV3 corruption thresholds + bankruptcy
> protocol (ADR-014) produce **legible, recoverable** crises. A player who
> hits a financial crisis can either:
> (a) understand WHY it happened by reading the in-game UI alone, AND
> (b) take corrective action that visibly improves the situation within 3-4
>     in-game weeks.
>
> A player who does NOT understand the crisis OR cannot find a recovery path
> indicates a UX failure — not a design failure of the economy itself.

This is the canonical **mid-game systems** validation. Specifically targets:
- F8 corruption scandal cliff (`SCANDAL_FINE_BASE_EUR_K=30` at CE=80).
- F-TV3 corruption deltas (LOCAL -0.5/sem, REGIONAL +0.5/sem, NACIONAL +1.5/sem).
- F-TV2 mid-season TV cancellation and replacement.
- Bankruptcy protocol triggers (`balance_eur_k <= CRITICAL_THRESHOLD`).
- Sponsor cancellation on scandal.

## Recruitment Criteria

- **Profile**: someone who has played at least 1 hour of a manager-style game
  recently (FM, Football Manager Mobile, etc.) OR has done the fresh-player
  protocol from this project at least once.
- **NOT**: a fresh-fresh player — the crisis dynamics are too dense for a
  first session.
- Ideally same playtester runs both fresh-player + economy-tuning protocols
  in separate sessions a few days apart, so they have baseline familiarity.

## Build Under Test

- Production main branch (commit hash documented).
- DOM-only MVP.
- DB seeded with a **scripted crisis-prone starting state**:
  - `corruption_exposure = 65` (above F-TV3 threshold of 60 — TV cancellation
    will fire within ~1-2 ticks on REGIONAL/NACIONAL contracts).
  - `financial_balance = 80` €K (close to CRITICAL_BUFFER_WEEKS threshold).
  - Active REGIONAL TV contract (3yr) signed last season.
  - 2 active sponsor contracts (kit + boards).
  - Default squad — no transfers pending.
  - Currently W4 of season 1 (early enough that the player has runway to
    recover, late enough that there's already context to read from).

This seed is built specifically for this protocol — a fixture-loader to
populate the DB is part of the implementation prep (separate ticket).

## Session Structure (~90 min total)

### Pre-session (5 min)
- Brief: "You'll inherit a club in financial difficulty. Your job is to
  survive — keep the club from going bankrupt and ideally improve its
  situation. Think out loud about your strategy + what the UI tells you.
  I'll ask questions at the end."
- NO further guidance on game mechanics. The player must read the UI.

### Play session (60 min)
Tester plays from the seeded state forward as many in-game weeks as they
want, up to a max of 60 real minutes.

**Observer notes** (no interruption):
1. **First crisis recognition**: at what week does the player explicitly say
   "we have a problem"? What triggered the recognition? (Balance UI? Inbox?
   Calendar STOP event? Staff message?)
2. **Cause attribution**: when they describe the crisis, do they correctly
   identify root cause (TV scandal? Sponsor cancellation? Slow drain?)?
   If they misattribute, log what they said.
3. **Recovery actions taken**: log every action — slider adjustments,
   transfer decisions, staff hires, sponsor renegotiations, TV offer
   responses. Note the IN-GAME WEEK each action was taken.
4. **Visible improvement**: does the balance trajectory improve within 3-4
   weeks of their first recovery action? Log the delta.
5. **Death spiral signals**: does the player at any point conclude "I can't
   recover" before actual bankruptcy? Log the moment + what they read.
6. **Confusing UI moments**: every time the player can't find or interpret a
   piece of information they need.

### Debrief (25 min)

This protocol has MORE questions than fresh-player because crisis dynamics
need finer-grained dissection.

1. ¿En qué momento sentiste que tu club estaba en problemas?
2. ¿Qué te lo indicó? (UI específica)
3. ¿Pudiste identificar la causa raíz? ¿Qué creías que era?
4. ¿Qué acciones tomaste para recuperarte? ¿Por qué esas?
5. ¿Viste mejora? ¿Cuántas semanas tardó en notarse?
6. ¿En algún momento sentiste que el juego no te daba salida? Si sí, ¿cuándo?
7. ¿Hubo alguna mecánica que NO entendiste? (escándalo, TV cancelación, etc.)
8. ¿La gravedad de la crisis se sintió justa o injusta?
9. PROCEED / TUNING NEEDED / PIVOT — ¿la economía es jugable como está, o
   necesita rework?

## Success Metrics

- [ ] **First crisis recognition** within 8 in-game weeks of session start
      (the seeded state is week-4 + crisis-prone; recognition should fire
      before week-12).
- [ ] **Cause attribution correct in ≥1 of 3 dimensions**: TV scandal,
      sponsor cancellation, slow cashflow drain. (Player may not identify
      all 3, but at least 1 must be correct.)
- [ ] **Recovery action taken** within 5 in-game weeks of recognition.
- [ ] **Visible improvement** in balance trajectory within 4 weeks of
      recovery action OR clear feedback from staff explaining why the action
      isn't enough.
- [ ] **No "death spiral despair" before actual bankruptcy** — if the player
      gives up emotionally without the engine actually triggering bankruptcy,
      that's a UX failure of crisis legibility.

## Output

```
production/playtests/[YYYY-MM-DD]-economy-tuning-[playtester-tag].md
```

The session doc must include a **per-week timeline** of crisis state +
player actions, in addition to the 8-field template. Use a table:

```markdown
| Week | Balance | corruption_exposure | TV state | Sponsor state | Player action | Observable outcome |
```

## Out of Scope

- Long-term economy balance (season 5+ progression) — protocol does NOT
  validate that the economy stays interesting after season 1.
- Tuning value debates — the protocol VALIDATES legibility, not whether
  the numbers should be retuned. Tuning calls happen in `/balance-check`
  follow-ups after the playtest data is in.

## Action Items After Session

If the playtester gives PROCEED:
- Document the verdict + any specific friction surfaces as Sprint backlog items.

If TUNING NEEDED:
- Run `/balance-check` on the cascade-engine + economy with the playtest
  observations as input.
- Open balance tickets per system (cascade-engine.md, economy.md, tv-rights.md
  as appropriate) for Pablo's review.

If PIVOT:
- Escalate to Pablo + creative-director immediately. The economy is a
  Pillar-1 core mechanic; a PIVOT verdict is a major scope event.
