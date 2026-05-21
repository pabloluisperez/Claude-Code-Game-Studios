# Playtest Reports

> Initialized 2026-05-21 (Sprint 7, task 7-3) after the Pre-Production gate-check
> rerun flagged the absence of a formal playtests directory.

This directory holds documented playtest sessions for Cascada FC. The `/playtest-report`
skill is the canonical authoring tool. The first migrated session is `2026-05-18-slice-pablo.md`,
sourced from `prototypes/cascada-vertical-slice-mes1/REPORT.md` §"Playtest Findings".

## Directory Convention

Each playtest gets its own file:

```
production/playtests/[YYYY-MM-DD]-[short-tag].md
```

Examples:
- `2026-05-18-slice-pablo.md` — initial slice validation (this dir's first entry)
- `2026-07-15-new-player-experience.md` — focused first-15-min onboarding playtest
- `2026-08-04-economy-tuning.md` — economy/F8/F-TV4 balance check session

## Required Fields per Playtest Doc

1. **Session metadata**: date, playtester name/profile (solo dev, fresh player, etc.),
   game build (commit hash or sprint number), duration, environment (browser, OS).
2. **Hypothesis being tested**: what design assumption is on trial?
3. **Setup**: scenario / save state used (or "fresh signup").
4. **Findings**: per-question or per-flow observations. Quote the playtester verbatim
   when possible.
5. **Failures**: bugs, confusion loops, friction points. Tagged with severity (S1-S3).
6. **Strengths corroborated**: what's actually working that you suspected might be fragile.
7. **Verdict**: per the session's hypothesis — PROCEED / PIVOT / KILL / REVISIT.
8. **Action items**: tickets opened (story IDs, OQ-* IDs, tech-debt entries).

## What NOT to Include

- Subjective developer commentary about whether the feedback is "valid" — the playtest is
  what the player experienced; design re-interpretation goes in the action items + story
  files, not in the playtest doc.
- Raw screenshot dumps without captions — pair every screenshot with a one-sentence claim.
- Test results from automated suites — those live in `production/qa/`, not here.

## Gate Requirements

Per `/gate-check`:

- **Pre-Production → Production**: at least 1 playtest with PROCEED verdict (slice validation).
- **Production → Polish**: at least 3 distinct playtest sessions documented in
  `production/playtests/` — covering: new player experience, mid-game systems, difficulty curve.

## Migration Note (2026-05-21)

The slice playtest content was duplicated, not moved, from `prototypes/cascada-vertical-slice-mes1/REPORT.md`. Per `.claude/rules/prototype-code.md`, prototype code is preserved as a reference; this directory carries forward the validated playtest findings into the production audit trail without touching the prototype tree.
