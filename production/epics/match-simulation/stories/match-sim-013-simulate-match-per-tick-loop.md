---
Story: MATCH-SIM-013
Status: Pending
Type: Logic
GDD Requirement: AC-MATCH-01 (determinism default), AC-MATCH-03a (pause at tick 45 substitution_window), AC-MATCH-11 (mean goals 2.0-3.0 over 10,000 sims), AC-MATCH-19 (≤50ms per sim), AC-MATCH-21 (substitution_window at 45/60/75), AC-MATCH-30 (substitution_window excluded from MatchOutcome.events)
Governing ADR: ADR-007 (simulateMatch pure function — ONE-SHOT path), ADR-002 (one source of randomness)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/match-sim/simulate-match.test.ts
---

# Story: simulateMatch — Pure Function Per-Tick Loop (One-Shot Path)

## Goal

Implement `simulateMatch(input: MatchInput): MatchOutcome` — the **pure function path** (ADR-007 contract: no I/O, no side effects, no Socket.IO). This is the function the cascade-engine calls for batch / offline simulation. The interactive `MatchSession` path (story 014) builds on the same per-tick logic but adds re-enqueue / pause / Socket.IO.

This story orchestrates: F3 init → 90-tick loop (F4 momentum, F5 attack, F6 shot, F7 goal, VAR (story 010), card checks (story 008), injury checks (story 009)) → post-match F8/F9/F10 + substitution_window filter (AC-MATCH-30). Plus the forfeit short-circuit (already in story 011).

In this story, the "pause" decisions (substitution_window, injury_pause) take the **default conservative decision** ("no hacer nada") — no rng impact, no lineup mutations from manager. This is what AC-MATCH-01 exercises ("decisiones default").

## Scope

In `packages/shared/src/sim/sports/football/match-simulation.ts` (extending story 011's entry):

- The forfeit short-circuit is already in place from story 011.
- Otherwise:
  ```ts
  function simulateMatch(input: MatchInput): MatchOutcome {
    // Forfeit (story 011) — already returns early.

    const ctx = createMatchSimContext(input.seed, /* worldClock */ 0);  // story 002

    // Initial state
    let homeMomentum = homeMomentumInitial(input.preMatchSnapshot);  // F3
    let homeScore = 0, awayScore = 0;
    let currentLineupHome = input.homeLineup;
    let currentLineupAway = input.awayLineup;
    let substitutionsUsed = 0;
    let awaySubstitutionsUsed = 0;
    const yellowCardsByPlayerId: Record<string, number> = {};
    const eventsAccumulated: MatchEvent[] = [];
    const minutesPlayed: Record<string, number> = {};
    // initialize minutesPlayed[id] = 0 for every starter (bench starts at 0 too)

    for (let t = 1; t <= 90; t++) {
      // F4 momentum_delta (1 rng call)
      const delta = momentumDelta(ctx, getMids(currentLineupHome), getMids(currentLineupAway), input.homeFormation);
      homeMomentum = applyMomentumDelta(homeMomentum, delta);

      // F5 P_attack (per-team mods + COUNTER) (1 rng call)
      const pAttackHome = computePAttackHome({ formation: input.homeFormation, instruction: input.homeInstruction, avgFwdSpeed: avgFwdSpeed(currentLineupHome) }, homeMomentum);
      const pAttackAway = computePAttackAway({ formation: input.awayFormation, instruction: input.awayInstruction, avgFwdSpeed: avgFwdSpeed(currentLineupAway) }, homeMomentum);
      const attackResolution = resolveAttackRoll(ctx, pAttackHome, pAttackAway);

      let goalThisTick = false;
      let awayAttackedThisTick = (attackResolution === 'away');
      let homeAttackedThisTick = (attackResolution === 'home');

      if (attackResolution === 'home' || attackResolution === 'away') {
        // F6 P_shot (1 rng call)
        const attackingSide = attackResolution;
        const defendingSide = attackingSide === 'home' ? 'away' : 'home';
        const attacker = pickAttacker(attackingSide === 'home' ? currentLineupHome : currentLineupAway);
        const defender = pickDefender(defendingSide === 'home' ? currentLineupHome : currentLineupAway);
        const defenderFormation = defendingSide === 'home' ? input.homeFormation : input.awayFormation;
        const defenderHasHoldShape = (defendingSide === 'home' ? input.homeInstruction : input.awayInstruction) === 'HOLD_SHAPE';

        const shotProb = pShot({ attacker, attackingMids: getMids(...), defender, defenderFormation, defenderHasHoldShape, t });
        const shotRoll = ctx.rng();
        if (shotRoll < shotProb) {
          // F7 P_goal (1 rng call)
          const keeper = pickKeeper(defendingSide === 'home' ? currentLineupHome : currentLineupAway);
          const goalProb = pGoal(attacker, keeper, t);
          const goalRoll = ctx.rng();
          if (goalRoll < goalProb) {
            // Goal event
            const goalEvent: MatchEvent = { type: 'goal', minute: t, team: attackingSide, player_id: attacker.id, causal_node: null };
            // VAR (up to 3 rng calls — story 010)
            const varResult = resolveVarReview({ ctx, tick: t, trigger: 'goal', triggerEvent: goalEvent });
            eventsAccumulated.push(...varResult.resultingEvents);
            if (varResult.goalCounts) {
              if (attackingSide === 'home') homeScore++; else awayScore++;
              goalThisTick = true;
            }
          }
        }
      }

      // Card check (story 008) — up to 2 rng calls
      if (shouldRunCardCheck(t, awayAttackedThisTick)) {
        // home defender check
        const defender = pickDefender(currentLineupHome);
        const result = resolveCardCheck({ ctx, tick: t, defender, defenderTeam: 'home', yellowCardsByPlayerId });
        eventsAccumulated.push(...result.events);
        // mutate yellowCardsByPlayerId
      }
      if (shouldRunCardCheck(t, homeAttackedThisTick)) { /* symmetric for away */ }

      // Injury check (story 009) — up to 2 rng calls per check; max 2 checks (home/away)
      const cardThisTick = /* derived from events emitted this tick */;
      if (shouldRunInjuryCheck(t, goalThisTick, cardThisTick)) {
        // resolve for one randomly-selected starter from each team (the GDD doesn't specify;
        // slice convention: roll for each starter sequentially — too many rng calls.
        // BETTER: select ONE candidate per team (the player with lowest effective_fitness)
        // and roll P_injury for them. Stay close to slice; if slice rolls per starter, mirror.
        // For MVP: roll for ONE player per team — the lowest effective_fitness starter.
      }

      // Substitution windows at 45/60/75 (default decision: do nothing)
      if (t === 45 || t === 60 || t === 75) {
        // Emit substitution_window event (AC-MATCH-21)
        eventsAccumulated.push({ type: 'substitution_window', minute: t, causal_node: null });
        // Rival AI sub plan (story 012)
        const rivalSubs = rivalSubstitutionPlan({ tick: t, currentLineupAway, bench: ..., awaySubstitutionsUsed });
        for (const sub of rivalSubs) {
          // Apply sub: replace player in currentLineupAway, emit substitution event
          eventsAccumulated.push({ type: 'substitution', minute: t, team: 'away', player_out_id: sub.from.player.id, player_in_id: sub.to.player.id, causal_node: null });
          awaySubstitutionsUsed++;
          // minutesPlayed[sub.from.player.id] = t
        }
        // Default decision for player team: no sub.
      }

      // Update minutesPlayed for every still-active starter
      for (const slot of currentLineupHome) minutesPlayed[slot.player.id] = (minutesPlayed[slot.player.id] ?? 0) + 1;
      for (const slot of currentLineupAway) minutesPlayed[slot.player.id] = (minutesPlayed[slot.player.id] ?? 0) + 1;
    }

    // Post-match
    const mpiDelta = computeMpiDelta({ homeScore, awayScore, playerClubSide: input.playerClubSide });
    const eventsExternal = eventsAccumulated.filter(e => e.type !== 'substitution_window');  // AC-MATCH-30
    const injuryDelta = computeInjuryRiskDelta(eventsExternal);
    const playerLineup = input.playerClubSide === 'home' ? currentLineupHome /* + subs that played */ : currentLineupAway;
    const playerRatings = computePlayerRatings({ playerLineup: /* all players who played for player's club */, minutesPlayed, t: 90 });

    return {
      homeScore, awayScore,
      winner: homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw',
      events: eventsExternal,
      worldStateDeltas: { match_performance_index: mpiDelta, injury_risk: injuryDelta },
      playerRatings,
      finalLineupHome: currentLineupHome,
      finalLineupAway: currentLineupAway,
    };
  }
  ```

## Out of Scope

- Re-enqueue / pause-and-resume / Socket.IO emission (story 014 + 016 + 017).
- Manager decisions on injury_pause / substitution_window (story 014 — non-default decisions).
- The 10,000-sim AC-MATCH-11 statistical test (story 019).
- Performance benchmark (story 019).

## Acceptance Criteria

- [ ] **AC-MATCH-01 default decisions**: `simulateMatch(input)` called twice with identical input → returns identical MatchOutcome (deep equal). Test with 10 different seeds; all 10 produce identical-on-repeat results.
- [ ] **AC-MATCH-21 substitution_window ticks**: a match with no injuries, no voluntary subs → `MatchSessionSnapshot.eventsAccumulated` (the internal stream) contains exactly 3 `{type:'substitution_window'}` events at minutes 45, 60, 75 (and zero at other minutes). The external `MatchOutcome.events` array contains ZERO substitution_window events.
- [ ] **AC-MATCH-30 filter applies**: same setup; `MatchOutcome.events.some(e => e.type === 'substitution_window') === false`. Internal stream has them; external doesn't.
- [ ] **AC-MATCH-03a (logic-level)**: with the pure-function path, "pause at substitution_window" is realized as the `substitution_window` event being emitted at tick 45. The actual FSM transition to `paused_for_decision` is story 014's territory; for this story, the AC is "the event is emitted at exactly tick 45".
- [ ] **AC-MATCH-19 performance**: `performance.now()` measurement: a single full 90-tick sim with 11+7 starters/bench per team completes in < 50ms (slice baseline is 3-5ms). Test on Node 22 LTS.
- [ ] **AC-MATCH-05 worldStateDeltas keys**: exactly `['injury_risk', 'match_performance_index']`. Sorted.
- [ ] **F10 minutesPlayed populated**: every player who played any minute has an entry in `minutesPlayed`. The starting 11 of each team have `minutesPlayed >= 1`. A bench player who never came on is NOT in `minutesPlayed`.
- [ ] **Single-rng() invariant per attack roll**: spy on `ctx.rng`. Per tick: F4=1 call, F5=1 call, then conditional (F6 + F7 + VAR = up to 5 more), card check = up to 2 per side, injury check = up to 2 per side. Document the maximum rng() calls per tick (slice: ~15). Verify the SUM across a deterministic test matches an expected total per seed.
- [ ] **Rival subs fire automatically**: with rival starters at low fitness, `awaySubstitutionsUsed` increments inside windows. Player's `substitutionsUsed` stays at 0 (default decision = no sub).
- [ ] **Sent-off players removed**: if a red card fires at tick 30, player X is removed from `currentLineupHome` (or away). Subsequent ticks do NOT pick X as attacker/defender/keeper.

## Implementation Notes

*From GDD §Match Algorithm + Edge cases:*

- The order of operations per tick MUST be: F4 → F5 → (if attack: F6 → if shot: F7 → if goal: VAR) → card check → injury check → substitution_window (if t ∈ {45,60,75}).
- "Default decisions" for AC-MATCH-01 = the manager does NOTHING in any pause. Rival AI applies its rules. Default for injury_pause = continue with 10. Default for substitution_window = no sub.
- The injury check on RIVAL side uses the constant `RIVAL_INJURY_RISK_CONST = 50` (story 009).

*Slice reference*:
- slice's `match-simulation.ts` has the full per-tick loop pattern (~481 lines). Production rewrites from scratch using slice as design reference (per prototype-code.md), with the corrections from R6 (worldStateDeltas as Record, playerRatings as Record, AC-MATCH-28 causal_node).

*Performance budget*:
- 50ms per match (AC-MATCH-19). Slice runs at 3-5ms. Plenty of headroom. The most likely regression: a non-O(1) lookup inside the per-tick loop, or excessive object allocation. Keep hot paths allocation-free where reasonable.

## Test Requirements (Logic, BLOCKING)

`tests/unit/match-sim/simulate-match.test.ts`:

- AC-MATCH-01 determinism across 10 seeds × 2 runs.
- AC-MATCH-21 + AC-MATCH-30 (substitution_window in/out filter).
- AC-MATCH-19 performance < 50ms.
- AC-MATCH-05 worldStateDeltas keys.
- rng() call accounting (sum check across deterministic test).
- Rival sub triggers under low-fitness setup.
- Sent-off players removed.

## Dependencies

- **Upstream**: 001 (types), 002 (createMatchSimContext), 003 (effective stats), 004 (F3/F4), 005 (F5 P_attack), 006 (F6 P_shot), 007 (F7 P_goal), 008 (card check), 009 (injury check), 010 (VAR resolution), 011 (F8/F9/F10 + forfeit), 012 (rival AI subs).
- **Downstream blockers**: 014 (FSM/MatchSession uses this loop internally), 019 (integration test).

## Estimate

**2 days.** This is the BIG story — it wires everything from stories 001-012 into a working per-tick loop. Most of the time is in test design (the rng() accounting, the substitution_window filter, the perf test).

## Notes / Gotchas

- **Player selection (attacker / defender / keeper)**: the GDD doesn't precisely specify which FWD attacks. Slice convention: highest effective_rating among FWDs. Same for defender (highest among DEFs). Keeper is the player with `position==='GOALKEEPER' || assignedAs==='GOALKEEPER'`. Make these tiebreaker rules explicit; deterministic ordering (by `id` for ties) avoids drift.
- **Injury check player selection** (per tick): the GDD is silent. Slice convention: roll for the starter with lowest effective_fitness on each team. Document and stick to it.
- **MatchSessionSnapshot is NOT built by this story** (story 014 owns it). But the in-loop state (homeMomentum, currentLineupHome, ...) corresponds 1:1 to snapshot fields — story 014 just adds the snapshot capture+restore.
- **No Socket.IO emission** in this story — the per-tick loop is pure. Emission happens only in the interactive path (story 016 — match worker).
- **`MatchInput.decisionTimeoutMs` is ignored** in this story (no pauses ⇒ no timeouts).
