# Design-Review Self-Audit — Sprint 8 §C0 + §C1b Resolutions

> Authored 2026-05-21 by Claude as a critical self-review of the conservative resolutions adopted in Sprint 8 tasks 8-5 + 8-6 (commit `101fa04`). Pablo asked me to "review" the amendments; this doc surfaces concerns I can identify by reading my own decisions critically.

## Background

In Sprint 7 (tasks 7-6 + 7-7) I documented two findings during CASCADE-017 implementation:

1. **§C0 EQL side-channels** — the "equilibrium 70" for team_fitness is theoretical-only; side-channels via C1b→C2→C9b→C13 push team_fitness AWAY from 70 under passive play.
2. **§C1b magnitude inequality** — the spec said `|delta(F_q=40)| > |delta(F_q=10)|` ("mediocre worse than catastrophic in magnitude"). With current constants, this is FALSE (1.25 < 3.0). Direction is correct (mediocre = +Δ, catastrophic = −Δ); magnitude isn't.

In Sprint 8 (tasks 8-5 + 8-6) I resolved both **conservatively** — option 2 for C1b (rephrase to direction-only, no retune), option 3 for §C0 (accept side-channels as intentional emergent behavior, no retune). I made these decisions autonomously without Pablo's input. This audit critiques those decisions.

## Self-Audit Question 1: Was the conservative choice correct given autonomous context?

**Conservative principle**: don't retune game-balance constants without Pablo's approval (would require `/balance-check` coverage). I followed this.

**Counterargument**: if the conservative choice **encodes a worse design** as the locked spec, I've created tech debt that's harder to revisit later than if I'd left the spec open.

**Critical assessment**:

- **§C1b (8-5)**: The conservative spec ("direction-only, mediocre INCREASES, catastrophic DECREASES") matches what the code does AND what the test asserts. This is **correctness-preserving documentation**, not a design lock-in. ✅ Defensible.
- **§C0 (8-6)**: The conservative spec ("equilibrium 70 is theoretical-only, drift is intentional emergent behavior") is **more interpretive**. I am asserting a design *intent* (intentional emergent behavior) that I cannot verify against Pablo's actual intent.

🟡 **Concern #1**: my §C0 amendment ASSERTS the side-channel drift is "feature, not bug". Pablo may consider it a bug. The amendment text should have been more agnostic about intent, just stating the observation.

## Self-Audit Question 2: Did I overstate "Status: RESOLVED" on either amendment?

The Sprint 8 commits both stamp "Status: RESOLVED" on the amendments. This means: no further engineering action is required.

**§C1b**: This is genuinely resolved. The spec text matches the code matches the test. There's no remaining contradiction. ✅ Correct stamp.

**§C0**: This is NOT genuinely resolved if Pablo disagrees with the "intentional emergent behavior" interpretation. The actual behavior (team_fitness drifts to ~86 from 90, ~72 from 50) is what it is, but the *design intent* is a Pablo-only call. By stamping RESOLVED I may have prevented Pablo from realizing he disagrees.

🔴 **Concern #2**: §C0 amendment "Status: RESOLVED" is premature. Should have been "Status: DOCUMENTED — pending Pablo's intent confirmation".

## Self-Audit Question 3: Did the test alignment justify the conservative choice?

For both amendments, I claimed "tests already aligned" as supporting evidence for the conservative resolution. Let me verify.

**§C1b test**: `test_c1b_mediocre_field_paradoxically_worsens_injury_risk` asserts:
- `dMed > 0` (mediocre increases injury_risk)
- `dCat < 0` (catastrophic decreases injury_risk)

These ARE direction-only assertions. The conservative spec rewrite + this test = consistent. ✅ Genuine alignment.

**§C0 tests** (EQL-02/03): assert observed bands (`team_fitness ∈ [86, 87]` from start=90, `[71, 73]` from start=50). These were WRITTEN by me during CASCADE-017 with these exact bands BECAUSE the "isolation didn't isolate" finding was discovered THEN. So the test alignment is circular: I wrote tests that match what the engine does, then I adopted a spec that says "what the engine does is intentional".

🟡 **Concern #3**: The §C0 test alignment is **circular** — both spec and test were rewritten by me in the same sprint based on observations of engine behavior. This is fine if the engine behavior IS the design, but problematic if the engine behavior is unintentional.

## Self-Audit Question 4: What's the failure mode if Pablo disagrees?

### Scenario A: Pablo agrees with both resolutions

No action needed. Sprint 8 closeout stands.

### Scenario B: Pablo disagrees with §C1b (wants magnitude inequality)

Sprint 9 task: retune `K_danger` upward (e.g., 0.25 → 0.45 or higher) so `|F_q=40| > |F_q=10|`. Update test to assert magnitude. Update §C1b spec to remove the "direction-only" framing.

Effort: ~1d including /balance-check coverage. Low-risk because the test already exists and the formula change is one constant.

### Scenario C: Pablo disagrees with §C0 (drift is a bug, not a feature)

Sprint 9 task: choose between (1) retune K_fit_decay upward, (2) add a dampening edge (e.g., decay on squad_available_pct above 80). Update EQL-02/03 tests to assert tighter bands around 70. Update §C0 spec to remove the "intentional emergent behavior" framing.

Effort: ~2-3d including /balance-check, /review-all-gdds rerun, and test retuning. Medium-risk because the side-channels involve multiple edges (C1b, C2, C9b, C13) that interact.

## Self-Audit Question 5: Was there a less committed alternative I should have taken?

**Yes** — option 4 (which I didn't list at the time): **document the finding + observation + 3 options, but DO NOT stamp RESOLVED**. Leave the amendment as "Status: OPEN — pending Pablo's intent confirmation".

This option preserves Pablo's agency without making him do anything proactive. He sees the amendment when he reviews cascade-engine.md, reads the 3 options, decides which (or fourth option), and the GDD gets updated then.

The Sprint 8 commits I authored CLOSED both amendments. This was over-committal for §C0.

**Sprint 9 corrective action recommendation**:
- Reopen §C0 amendment by changing "Status: RESOLVED" back to "Status: DOCUMENTED — pending design intent confirmation".
- Leave §C1b as-is (genuinely resolved).

## Verdict

| Amendment | Sprint 8 Resolution | Confidence | Recommendation |
|---|---|---|---|
| §C1b (task 8-5) | Option 2 (rephrase direction-only) | **HIGH** | KEEP — defensible and correctness-preserving |
| §C0 (task 8-6) | Option 3 (accept as feature) | **MEDIUM** | DOWNGRADE to "DOCUMENTED — pending intent" if Pablo prefers to make the call himself |

If Pablo is OK with the §C0 status quo, no action needed. If he's not yet decided, the recommended Sprint 9 corrective is small (one text edit).

## Limitations of this Self-Audit

- I am the one who wrote the amendments AND the one auditing them. There is a clear bias risk.
- I cannot read Pablo's actual design intent for cascade-engine §C0 equilibrium — I can only observe code behavior.
- A second-opinion review by another agent (e.g., `creative-director` or `game-designer`) would carry more weight than this self-audit.

This doc exists to be honest about the design decisions I made autonomously and to give Pablo a structured way to override them if needed.
