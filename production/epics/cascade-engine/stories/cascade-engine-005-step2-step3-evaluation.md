---
Story: CASCADE-ENGINE-005
Status: Pending
Type: Logic
GDD Requirement: cascade-engine.md §States and Transitions Steps 2 & 3 + AC-PLD-01, AC-PLD-02, AC-PLD-03, AC-PLD-04, AC-PLD-05
Governing ADR: ADR-002 (determinism), ADR-003 (Rule 3 prevState-only, Rule 4 additive, Rule 5 delays), ADR-008 (PlayerDecisions are the post-edge application path)
Control Manifest: 2026-05-19
Test Evidence: tests/unit/cascade-engine/runtick-edges-decisions.test.ts
---

# Story: runTick() Step 2 (Edge Evaluation) + Step 3 (PlayerDecisions)

## Goal

Fill in the Step 2 and Step 3 stubs from story 004 with the canonical evaluation logic — the iteration over `graph` that calls each edge's `guardFn` and `transferFn`, routes `delay > 0` deltas to `newDelayedEffects`, and applies PlayerDecisions AFTER all edges have read `prevState`. This is the most invariant-rich part of the engine and the one most likely to harbor subtle bugs.

With this story done, the engine processes the full Step 1→2→3→4 pipeline; chain stories 006–013 only need to implement their `transferFn` bodies and add chain-specific tests.

## Scope

In `packages/shared/src/sim/cascade-engine.ts` — replace the Step 2 and Step 3 stubs:

**Step 2 — edge evaluation**:
```
for (const edge of graph) {
  if (edge.guardFn && !edge.guardFn(prevState, ctx)) {
    // log skip — { edgeId, status: 'guarded' } — useful for debugging
    continue;
  }
  const delta = edge.transferFn(prevState, ctx);
  log.push({ source: 'edge', edgeId: edge.id, fromNode: edge.fromNode, fromValue: prevState[edge.fromNode], toNode: edge.toNode, delta, delay: edge.delay });
  if (edge.delay === 0) {
    deltaMap.set(edge.toNode, (deltaMap.get(edge.toNode) ?? 0) + delta);
  } else {
    newDelayedEffects.push({ applyAt: ctx.currentWeek + edge.delay, toNode: edge.toNode, delta, edgeId: edge.id });
  }
}
```

**Step 3 — PlayerDecisions** (runs AFTER step 2 — AC-PLD-01 invariant):
```
for (const decision of decisions) {
  deltaMap.set(decision.nodeId, (deltaMap.get(decision.nodeId) ?? 0) + decision.delta);
  log.push({ source: 'decision', edgeId: decision.source, toNode: decision.nodeId, delta: decision.delta });
}
```

Crucial invariants encoded in the implementation:

1. Step 2 reads `prevState` for ALL edges — even if 17 edges write to `team_fitness`, the 18th edge reading `team_fitness` from `prevState` sees the ORIGINAL value, not the partial sum. This is ADR-003 Rule 3.
2. PlayerDecisions in Step 3 modify the same `deltaMap` — they compose additively with edges (Rule 4). A decision of `+5` on `groundskeeper_budget` after C1a fired with the prevState value of `groundskeeper_budget=50` does NOT change C1a's already-computed delta. AC-PLD-01 is exactly this scenario.
3. Step 3 does NOT cancel buffered effects whose delta was computed from a stale `ticket_price_index` (AC-PLD-02). The effect is already in `newDelayedEffects` with a `delta` captured at edge-evaluation time.

## Out of Scope

- Step 5 threshold detection (story 014).
- Individual chain formula bodies — `transferFn` placeholders still throw (stories 006–013).
- ConsecutiveWins/Losses reset semantics: PlayerDecisions deltas should reflect the AC-PLD-04/05 outcome (incrementing wins on a victory + resetting losses to 0). The chain implementation handles this — the cascade engine itself just applies decisions. Document explicitly that the match-sim or event-system is responsible for emitting `{nodeId:'consecutive_losses', delta: -prevState.consecutive_losses, source:'win-reset'}` to zero out the counter on a win, and likewise for losses.

## Acceptance Criteria

1. **AC-PLD-01**: Edge C1a (placeholder transferFn: `(prev) => (prev.groundskeeper_budget - 50) * 0.30`) evaluates using `prevState.groundskeeper_budget=50` even though the same tick has a decision setting `groundskeeper_budget=80`. The decision applies AFTER the edge. Implementation: install a one-off transferFn just for this test that reads `prevState.groundskeeper_budget` and asserts it equals 50.
2. **AC-PLD-02**: Edge C15 (placeholder: enqueues delayed effect with delta based on `prevState.ticket_price_index=80`) is followed by a decision setting `ticket_price_index=40`. THEN: `newDelayedEffects` contains the C15 effect with its delta computed from 80 (the old price), AND `nextState.ticket_price_index === 40`.
3. **AC-PLD-04**: prevState `consecutive_wins=3, consecutive_losses=0` + decisions `[{nodeId:'consecutive_wins',delta:+1,source:'win'},{nodeId:'consecutive_losses',delta:0,source:'win-reset'}]` → `nextState.consecutive_wins===4, nextState.consecutive_losses===0`. (Edge case if prevState.losses > 0: the decision delta should be `-prevState.consecutive_losses` — documented but tested in match-sim integration, not here.)
4. **AC-PLD-05**: prevState `consecutive_wins=2, consecutive_losses=0` + decisions `[{nodeId:'consecutive_wins',delta:-2,source:'loss-reset'},{nodeId:'consecutive_losses',delta:+1,source:'loss'}]` → `nextState.consecutive_wins===0, nextState.consecutive_losses===1`.
5. **Guard skip**: An edge with `guardFn: () => false` does NOT call its `transferFn` (verify via spy/stub). The `log` contains a `'guarded'` entry referencing the edge id.
6. **Delay routing**: An edge with `delay: 2` evaluated at `ctx.currentWeek=3` produces an entry in `newDelayedEffects` with `applyAt: 5` (AC-DEL-04 invariant).
7. **Edge ordering independence**: The order of edges in `CASCADA_FC_GRAPH` does NOT affect `nextState`. Verify by running with a shuffled copy of the graph (deterministic shuffle via test seed) and asserting identical `nextState`. This proves Rule 3 holds — no edge reads partial-tick state.
8. **CascadeLog completeness**: After a tick with N non-guarded edges + M decisions + K consumed delayed effects, `log.length === N + M + K + (# of guarded edges)`.

## Test Requirements (Logic, BLOCKING)

`tests/unit/cascade-engine/runtick-edges-decisions.test.ts`:

- AC-PLD-01 with custom edge (one-off transferFn) — AC #1.
- AC-PLD-02 — AC #2.
- AC-PLD-04/05 — AC #3, #4.
- Guard skip with spy — AC #5.
- Delay routing — AC #6.
- Edge ordering independence — AC #7. CRITICAL test — if this fails, Rule 3 is violated somewhere in the implementation (likely accidentally reading `deltaMap` instead of `prevState`).
- Log completeness — AC #8.

## Dependencies

- **Upstream blockers**: 004 (runTick skeleton).
- **Downstream blockers**: 006–013 chain stories all rely on this.

## Estimate

**2 days.** The implementation is short but the ordering-independence test (AC #7) flushes out a category of bugs that's hard to catch any other way; the test harness is the bulk of the work.

## Notes / Gotchas

- Per control-manifest Foundation Forbidden: ❌ Mutating `prevState` inside an edge's transferFn. The Readonly typing surfaces it at compile time, but a malicious cast (`prevState as WorldState`) compiles. The ordering-independence test catches this at runtime.
- Per ADR-003 Rule 4 (additive composition): if two edges write to the same node, deltas SUM. Never overwrite. The `(deltaMap.get(node) ?? 0) + delta` pattern is the canonical idiom.
- The CascadeLog source field distinguishes `'edge' | 'decision' | 'delayed' | 'guarded'`. Story 014 (thresholds) reads the log to surface "what fired" in dev tooling; staff-system (Core layer, separate epic) reads it for message templates.
- Do NOT shortcut Step 3 by adding decision deltas directly to `nextState` after Step 4 clamp — that would re-introduce a clamp-twice bug. Decisions ALWAYS go into `deltaMap` so Step 4 clamps the combined value once. AC #3 (AC-PLD-04 with start at `consecutive_wins=3`) protects against this.
