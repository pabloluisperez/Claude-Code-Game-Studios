# Review Log — match-simulation.md

## Review — 2026-05-18 — Verdict: APPROVED (R6)

Scope signal: XL
Specialists: game-designer · systems-designer · qa-lead · web-backend-specialist · creative-director
Blocking items: 14 resolved | Recommended: 7 addressed
Summary: R6 confirmed all 14 R5 blockers were unapplied and resolved them in session, plus 7 new blockers surfaced by R6 specialists: (1) Formula corrections — F6 comment inverted (fixed: larger divisor = less effective defense), F5 range [0.0285,0.189]→[0.0214,0.1812], Edge Case min P_attack 0.03→0.0214, tackle-check trigger clarified to option (b) (attack in multiple-of-15 tick); (2) Design decisions — P_injury rival fixed at 50 (constant, not from player WorldState), COUNTER home → HTTP 400; (3) TypeScript contracts — worldStateDeltas Map→Record in all occurrences (F8/F9/Post-Match/AC-05/AC-16), playerRatings Map→Record; (4) Implementation specs — BullMQ orphan delayed job guard added, canonical query `ORDER BY created_at DESC` for failed+in_progress coexistence, Socket.IO MatchPauseEvent/MatchResumedEvent types defined with namespace/room/resume event, recovery worker BullMQ RepeatableJob `*/15 * * * *` with SKIP LOCKED SQL; (5) AC coverage — AC-28 (causal_node mandatory in all injury events), AC-29 (mutual exclusion HTTP enforcement), AC-30 (substitution_window filtered from MatchOutcome), AC-31 (formation_attack_mod→base_rate not P_goal), AC-32 (rival AI formation by strength_ratio with boundary case), AC header exception clause added. Recommended items applied: F4 ±5.5 vs ±6.5 distinction, F9 decay responsibility note, F8 rango inconsistency fixed, causal_node note in MatchEvent table.
Prior verdict resolved: Yes — R5 was NEEDS REVISION (14 blockers), all resolved before R6

---

## Review — 2026-05-18 — Verdict: NEEDS REVISION (R5) — Resolved in session

Scope signal: XL
Specialists: game-designer · systems-designer · qa-lead · web-backend-specialist · creative-director
Blocking items: 14 (de-duplicated) | Recommended: 7
Summary: R5 verification of R4 fixes confirmed all 14 R4 changes landed correctly, but surfaced new issues in three categories: (1) Documentation contradictions — F6 comment inverted (larger divisor means less effective defense, not more), F4/F5 output range values wrong (actual min 0.0214 not 0.0285; max P_attack 0.1812 not 0.189), edge case minimum claim wrong; (2) Missing test coverage for R4 fixes — no ACs for causal_node presence in injury events, mutual-exclusion backend enforcement, MatchOutcome.events filtering, formation_attack_mod binding, rival AI formation selection; (3) Type contract gaps — MatchOutcome.playerRatings and worldStateDeltas still Map semantics (serializes as {} in JSONB), recovery worker has no trigger specification. ADR-013 sync (UNIQUE INDEX + PRNG Option A/B) tracked as separate chore. All 14 blockers targeted for R6 fix pass.
Prior verdict resolved: Yes — R4 was MAJOR REVISION NEEDED (14 blockers), all resolved before R5

---

## Review — 2026-05-18 — Verdict: MAJOR REVISION NEEDED (R4) — Resolved in session

Scope signal: XL
Specialists: game-designer · systems-designer · qa-lead · web-backend-specialist · creative-director
Blocking items: 14 resolved | Recommended: 7 addressed
Summary: R4 found 14 blockers across 4 tiers. Tier 1 (pillar integrity): causal_node threshold eliminated — now mandatory for ALL injury events regardless of injury_risk level; rival AI now selects from 3 formations via deterministic strength_ratio bucket. Tier 2 (formula contradictions): formation P_attack modifiers (4-3-3: ×1.2, etc.) bound to F5; formation momentum modifier (3-5-2: ×1.1) bound to F4; F6 clarified as using defending team's formation_mod; F8 goal_diff range corrected; bench size aligned to 7 in both GDDs; substitution_window events confirmed persistent in MatchEvent[]; team instructions declared mutually exclusive. Tier 3 (implementation contracts): yellowCardsByPlayerId Map→Record in snapshot type; BullMQ two-phase pattern specified (Redis not part of Postgres txn); FSM failed state added with assistant-manager auto-pilot recovery (no forfeit for technical problems); ADR-002/ADR-013 PRNG conflict documented (createSimContext must support state:true). Tier 4 (test coverage): AC-24 moved to tests/integration/; AC-11 prerequisite enforcement added; AC-27 added for rival AI zero-substitution scenario.
Prior verdict resolved: Yes — R3 was NEEDS REVISION (10 blockers), all resolved before R4

---

## Review — 2026-05-18 — Verdict: NEEDS REVISION (R3)

Scope signal: XL
Specialists: game-designer · systems-designer · web-backend-specialist · qa-lead · creative-director
Blocking items: 10 resolved | Recommended: 6 addressed
Summary: R3 found 10 blockers across three root causes (pillar fidelity, crash safety, determinism): causal_node marked "optional in MVP" directly contradicted the "detective de consecuencias" Player Fantasy; BullMQ atomicity gap between DB commit and job.complete() left matches permanently stuck on crash; queue.remove() race allowed double-execution of timeout+decision paths; PRNG fixed-call invariant was unachievable with conditional branches; OQ-MATCH-02/03 left rival AI entirely unspecified with zero test coverage; F5 BASE_ATTACK_RATE was global but PRESS_HIGH/HOLD_SHAPE are per-team; F6 HOLD_SHAPE divisor was in prose only, not in formula; COUNTER was incoherent for home teams. All 10 resolved in R3 session: causal_node now mandatory for injury when injury_risk>70; BullMQ pattern specifies DB txn commit before job.complete with idempotent worker; SELECT FOR UPDATE added to decision handler; prngState field added to MatchSessionSnapshot; Rival AI Manager section added with fitness<40 substitution rule and own 5-sub pool; F5 split into base_rate_home/away per-team; F6 def_ctx_adj formula now explicit with combined divisor; COUNTER documented as only-away; AC-11 specifies seedrandom v3 + std_dev [0.8,2.5] assertion; AC-24/25/26 added for race condition, VAR+mpi_delta, COUNTER threshold.
Prior verdict resolved: Yes — R2 was NEEDS REVISION (21 blockers), all resolved before R3

---

## Review — 2026-05-18 — Verdict: NEEDS REVISION (R2)

Scope signal: XL
Specialists: game-designer · systems-designer · qa-lead · web-backend-specialist · creative-director
Blocking items: 21 resolved | Recommended: 12 addressed
Summary: R2 found 21 blockers across math bugs (F4 pseudo-code 10x factor, F6/F7 NaN division by zero), player fantasy (mpi_delta -2 flat for all draws, 3-sub pool agotable), architecture (BullMQ no tiene pause nativo, MatchSessionSnapshot indefinido, ADR-007 violation), and AC quality (AC-17 undefined stats field, AC-18 non-testeable timeout, 3 AC gaps). All 21 resolved in session: F4 pseudocode corrected, NaN guards added, mpi_delta draw now venue-differentiated (home=-3/away=+1), substitutions updated to 5-sub pool (FIFA post-2020), BullMQ re-enqueue pattern documented, MatchSessionSnapshot type defined, session lock constraint added, ADR-013 created and Accepted. AC-03 split into 03a/03b, AC-04/17/18 rewritten, AC-21/22/23 added.
Prior verdict resolved: No — first review (R1 was resolved separately before this session)

---

## Review — 2026-05-18 — Verdict: MAJOR REVISION NEEDED (R1)

Scope signal: XL
Specialists: (lean review — no specialist agents)
Blocking items: 8 resolved | Recommended: 0
Summary: R1 found 8 blockers: F8 home/away perspective bug (mpi_delta negativo para victoria de visitante), F4 MID.technique→passing NaN crash, F1 clamp no formalizado, F10 match_rating indefinido, K_loss=14 stale ref (debía ser 10), Causal Signal Contract ausente, F4 drift docs incorrectos, AC-11/14/15/17 incompletos. All 8 resolved in R1 session.
Prior verdict resolved: N/A — first review
