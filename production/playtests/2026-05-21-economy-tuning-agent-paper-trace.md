# Playtest 2026-05-21 — Economy-Tuning Agent Paper-Trace (NOT a human playtest)

> **⚠️ This is an agent paper-trace, NOT a human playtest.** No actual game session was played. Instead, an agent simulated the seeded crisis state described in `production/playtests/protocols/economy-tuning.md` against the live economy + cascade + tv-rights formulas to predict week-by-week outcomes. This validates the PROTOCOL itself + identifies pre-emptive tuning issues with the seeded state.

## Session Metadata

| Field | Value |
|---|---|
| **Date** | 2026-05-21 |
| **Playtester** | Claude (Opus 4.7) — paper-trace mode |
| **Profile** | Crisis-prone state simulation against production main branch code |
| **Build** | Sprint 8 closed state (commit `753db77`) |
| **Method** | Forward-simulation of cascade + economy + tv-rights formulas from the protocol's seeded state |

## Seeded State (per protocol)

- W4 of season 1
- `corruption_exposure = 65`  (above `TV_SCANDAL_THRESHOLD = 60`)
- `financial_balance = 80` €K  (close to `CRITICAL_BUFFER_WEEKS * weekly_costs ≈ 55 €K`)
- Active REGIONAL TV contract (3yr, signed last season)
- 2 active sponsor contracts (kit + boards)
- Default squad, no transfers pending

## Forward Simulation

### Tick Math (assumes the player makes NO active recovery decisions — worst-case)

Per `weekly_total_costs ≈ 18.25 €K` (economy.md AC-ECO-02) + `REGIONAL D2 weekly TV revenue ≈ 1.75 €K` + sponsor revenue ~3-4 €K + matchday revenue ~28 €K when home:

| Week | Action | corruption_exposure | financial_balance | TV state | Player-visible events |
|---|---|---|---|---|---|
| W4 (start) | — | 65 | 80 €K | REGIONAL ACTIVE | (no banner yet) |
| W5 | tick | 65.5 (+0.5 REGIONAL) | ~75 (no match this week → −3.25 net) | REGIONAL ACTIVE | "En Riesgo" balance banner; no scandal indicator |
| W6 | tick (match week) | 66.0 | ~85 (+10 from matchday + sponsors − costs) | REGIONAL ACTIVE | Balance briefly recovers; no scandal indicator |
| W7 | tick | 66.5 | ~80 | REGIONAL ACTIVE | "En Riesgo" persists |
| W8 | tick (match) | 67.0 | ~90 | REGIONAL ACTIVE | Balance recovers more |
| W9 | tick | 67.5 | ~85 | REGIONAL ACTIVE | (steady-state drift) |
| W10 | tick (match) | 68.0 | ~95 | REGIONAL ACTIVE | (continues) |

**Observation**: at +0.5/week and starting at 65, **corruption_exposure reaches 80 (scandal threshold) at W34** (`65 + (80-65)/0.5 = 30 weeks later`). Match-day revenue + sponsor income roughly offsets cost drain. **No dramatic crisis event fires within the 60-min session boundary.**

### What ACTUALLY happens at threshold checks

The F-TV3 threshold check is `(prev_corruption < 60) AND (new >= 60)`. At W4 baseline, `prev=65` is ALREADY above 60. The threshold-crossed-upward predicate is FALSE every tick. **No TV cancellation fires.**

Similarly, the F8 scandal (cascade-engine §C18a/F8) requires corruption to CROSS 80 upward. At +0.5/week from 65, that's W34 — 30 weeks of playable session before the dramatic crisis. Within a 60-min real-time session covering ~8-12 in-game weeks, the player will reach W12-W16 max, with corruption at ~71-73 (still 7-9 points away from F8).

## Success Metrics Evaluation

### Metric 1: First crisis recognition within 8 in-game weeks

**Prediction: 🟡 PARTIAL FAIL**.

The player WILL see a financial "En Riesgo" banner from W4 onwards (balance=80 < WARNING_BUFFER_WEEKS×costs ≈ 127). That's a recognition signal. But:

- The **TV cancellation crisis** the protocol explicitly names does NOT fire from the seeded state (prev>=60 means threshold predicate is false).
- The **F8 scandal crisis** at corruption=80 doesn't fire until W34 — **way outside session bounds**.
- The **bankruptcy crisis** (balance < CRITICAL ≈ 55 €K) requires several consecutive non-match weeks (-15-20 €K/week). Possible within 60-min session but depends on the seeded fixture schedule.

So the player sees ONE crisis signal (En Riesgo) and possibly graduates to "Crisis" via the bankruptcy path — but the TV-cancellation crisis the protocol promised is unreachable.

### Metric 2: Cause attribution correct in ≥1 of 3 dimensions

**Prediction: ✅ PROBABLE** — the En Riesgo banner names the cause (slow cashflow drain) clearly enough.

The TV scandal dimension is moot because no TV cancellation fires.

### Metric 3: Recovery action within 5 in-game weeks of recognition

**Prediction: ✅ PROBABLE** — the player can lower training_intensity, raise ticket_price_index, or visit /finance/tv-rights to read TV contract status. Multiple visible levers.

### Metric 4: Visible improvement within 4 weeks of recovery action

**Prediction: ✅ PROBABLE for financial recovery** — lowering training_intensity has no direct €K effect, but lowering staff tiers or selling players (if /squad allows) would. The actual mechanics for recovery depend on what UI affords mid-game (transfer market exists? staff can be fired?).

### Metric 5: No "death spiral despair" before actual bankruptcy

**Prediction: ✅ PASS** — the cashflow drain is slow enough that the player has runway.

## Pre-Emptive Findings — PROTOCOL CALIBRATION ISSUE

🔴 **The seeded state in `production/playtests/protocols/economy-tuning.md` is MISCALIBRATED for the stated hypothesis.**

The protocol promises to validate "F8 scandal cliff + F-TV3 corruption thresholds + bankruptcy protocol", but:

1. **TV cancellation cannot fire** from the seeded state. `corruption_exposure=65` is already above `TV_SCANDAL_THRESHOLD=60`, so the threshold-crossed-upward predicate (`prev<60 AND new>=60`) is permanently false. The TV cancellation crisis is the protocol's CENTERPIECE — it has been engineered out of the seeded state.

2. **F8 scandal at corruption=80 is 30 weeks away** with REGIONAL drift alone. A 60-min session covers ~8-12 in-game weeks. The scandal won't fire.

3. **Bankruptcy IS reachable** within session bounds but requires a specific cashflow profile (e.g., a string of away matches). Whether the seeded fixture schedule produces that is fixture-dependent.

### Recommended seeded-state retune (Sprint 9 task before running the human protocol)

| Field | Current | Recommended | Why |
|---|---|---|---|
| `corruption_exposure` | 65 | **59** | Must be BELOW 60 so the +0.5/wk REGIONAL drift CROSSES the threshold within session bounds. At 59 + 0.5/wk: TV cancellation fires at W5 (1 tick after start). |
| Alternative: TV tier | REGIONAL | **NACIONAL** | NACIONAL drift is +1.5/wk. From CE=58 + NACIONAL, threshold crosses at W6. |
| `financial_balance` | 80 €K | 80 €K (KEEP) | Already crisis-prone — fine. |
| Active contracts | kit + boards | KEEP | Sponsor cancellation on F8 scandal works once F8 fires. |
| Cascade-injected corruption shock | None | **Add a NOTIFY event at W2** with `decision_delta_corruption: +5` | Forces a second threshold check, validates the cascade-injection branch of F-TV3 (paso 6). |

Alternatively: keep `corruption_exposure=65` but RAISE `TV_SCANDAL_THRESHOLD` constant temporarily for the playtest seed (NOT for production code — that's a /balance-check question). This would require a fixture-specific config override.

## Verdict

**Prediction: PROTOCOL NEEDS RECALIBRATION before human session**.

The hypothesis is well-stated; the seeded state doesn't actually test it. A human playtester running the current protocol would experience the SLOW drift of corruption without any dramatic crisis — the protocol would fail to validate the F-TV3 + F8 + bankruptcy interplay it was designed to test.

**Sprint 9 task (Nice-to-Have)**: retune the protocol's seeded-state section to match the recommended values above. Once retuned, the protocol is ready for a human session.

## Limitations of this Paper-Trace

- Cannot evaluate the actual UI's STOP-event modal copy when a crisis fires (the modals exist in code but haven't been visually validated for "crisis legibility").
- Cannot simulate the player's emotional response to a slow-burn drift.
- Cannot detect if the staff-message generation surfaces the corruption drift as a perceptible signal (depends on observer tier + the diff magnitudes).

This doc exists to:
1. Validate the protocol's testability against the actual code dynamics.
2. Surface the seeded-state calibration issue BEFORE recruiting a human playtester.
3. Give Pablo a concrete Sprint 9 backlog item (seeded-state retune + crisis fixture loader).
