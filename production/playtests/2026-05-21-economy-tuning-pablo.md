# Playtest 2026-05-21 — Economy-Tuning (Pablo, solo-dev human session)

> Per `production/playtests/protocols/economy-tuning.md`. Pablo's 3rd live playtest of the project (after the 2026-05-18 slice + 2026-05-21 fresh-player sessions). Satisfies Production → Polish gate's 3-session minimum.

## Session Metadata

| Field | Value |
|---|---|
| **Date** | 2026-05-21 |
| **Playtester** | Pablo (solo dev) |
| **Profile** | Senior dev; second session of the day after fresh-player |
| **Build** | Sprint 9 post-playtest-1 fixes (commit `075443c` — RangeSlider patch + 3 bug fixes + 6 polish items) |
| **Method** | Incognito browser session against `http://localhost:5173` with crisis-overlay applied via direct SQL UPDATE on the latest world_snapshot (CE=59, balance=80, REGIONAL TV ACTIVE, 2 sponsors) |
| **Pre-overlay state** | Pablo's natural W4 state already had `financial_balance=-60.2 €K` — significantly worse than the protocol's intended balance=80. **This is itself a finding** (see "Critical economy finding" below). |

## Nine-Question Debrief

| # | Question | Response |
|---|---|---|
| 1 | ¿En qué momento sentiste que tu club estaba en problemas? | "Solo vi problemas económicos, pero es normal — me faltan herramientas para evitarlo." |
| 2 | ¿Qué te lo indicó? (UI específica) | Mensajes en bandeja de entrada + balance del topbar |
| 3 | ¿Pudiste identificar la causa raíz? ¿Qué creías que era? | **No — me falta info.** El jugador no tiene visibilidad de qué está drenando la caja. |
| 4 | ¿Qué acciones tomaste para recuperarte? | **Ninguna pude tomar.** El jugador no encuentra levers de recuperación accesibles. |
| 5 | ¿Viste mejora? | No. |
| 6 | ¿En algún momento sentiste que el juego no te daba salida? | **Sí — no hay salida actualmente.** |
| 7 | ¿Hubo alguna mecánica que NO entendiste? (escándalo, TV cancellation) | "No pude verlas" — las mecánicas de crisis (F-TV3, F8) no llegaron a dispararse antes de que el jugador abandonase por desesperanza económica. |
| 8 | ¿La gravedad de la crisis se sintió justa o injusta? | **Muy injusto — no hice nada y estaba en crisis.** |
| 9 | PROCEED / TUNING NEEDED / PIVOT | **TUNING NEEDED** (implícito por el conjunto: "el balance debe solucionarlo") |

## Critical Finding — Economy has no Agency

> *"Con lo que hay implementado ahora siempre estoy abocado a crisis y no tengo herramientas para mejorarlo, el balance debe solucionarlo."*

This is the headline finding. The protocol couldn't even validate the F-TV3 / F8 / bankruptcy dynamics because the player gave up before the crisis events fired (~W5-W6 expected). Two layered problems:

### Problem A: Pre-kickoff balance drain is steep + opaque

Pablo's NATURAL W4 state (without my crisis overlay) was already `financial_balance = -60.2 €K`:
- W2: 94.8 €K
- W3: 17.3 €K  (drain ≈ -77.5 €K, but includes initial bonus reset)
- W4: -60.2 €K (drain ≈ -77.5 €K)

Sustained drain of ~-30-40 €K/wk pre-kickoff. With matchday revenue ≈ +28 €K/wk on home matches only, the economy is only sustainable WHEN matches happen. Pre-kickoff (W0-W4 in Quinta) is pure burn.

### Problem B: Recovery levers exist but are not legible

Looking at the code, the player CAN:
- Lower `training_intensity` (slight cascade benefit, no direct €K)
- Lower budgets (catering/scouting/groundskeeper) — these reduce ongoing costs but Pablo didn't see them as economic levers
- Set season ticket price in `/finance/abonos` — but Pablo couldn't because the RangeSlider was crashing (B2 fixed AFTER the playtest started)
- Fire staff (severance is 4 weeks of wage, then ongoing cut)

Pablo found NONE of these. The UI does not communicate "here are your options to cut burn or boost income". The /finance route shows the state but not the actionable levers.

## Bug Findings (parallel to economy)

| ID | Surface | Description | Severity |
|---|---|---|---|
| M1 | Match flow — skip to end | "Si durante el partido le doy a saltar al final, debería mostrar como si acabara de terminar el partido (resultado + eventos de golpe), pero ahora vuelve a dashboard." | S2 — match feel critical |
| M2 | Match flow — stale "pending" indicator | "Sigue saliendo el partido que acabo de ver pendiente. En cuanto vaya a partido ya el día de partido ha empezado y no hay vuelta atrás." | S2 — match state not transitioning to 'played' on UI |
| M3 | Match flow — "solo resultado" empty | "Si el día de partido le doy a solo resultado me sale el match pero sin goles ni eventos, debería verse todo automáticamente." | S2 — match result missing event detail |

These 3 bugs are in the SAME subsystem (match flow). Combined effect: the match experience is broken from a UX perspective even when the simulation works.

## UX Improvements Surfaced

| ID | Description | Sprint |
|---|---|---|
| D | Advance buttons redundant: "Saltar al fin de semana" e "Ir a partido" son prácticamente lo mismo. Unificar: si hay partido en el finde → "Avanzar a día de partido"; sino "Avanzar a fin de semana". | Same-session (consolidation) |
| E | "Cancelar y actuar" debería parar en el día actual. Las cosas deben poder pasar entre semana también, no solo findes. | Sprint 10 — architecturally complex (currently advance is week-by-week, not day-by-day) |
| F | Mensajes antiguos que pierdan validez por nuevos deberían marcarse como leídos solos. | Sprint 10 |

## Success Metrics Evaluation

| Metric | Target | Observed | Verdict |
|---|---|---|---|
| First crisis recognition within 8 in-game weeks | < 8 weeks | Immediate (~W4-W5) | ✅ Recognized |
| Cause attribution correct in ≥1 of 3 dimensions | ≥1 | **0** — Pablo couldn't identify causa raíz | ❌ FAIL |
| Recovery action within 5 weeks of recognition | ≥1 action | **0 actions taken** | ❌ FAIL |
| Visible improvement within 4 weeks of action | improvement OR feedback | N/A (no action) | ❌ FAIL |
| No "death spiral despair" before bankruptcy | no despair | **Despair confirmed** ("no hay salida actualmente") | ❌ FAIL |

**4 of 5 metrics FAIL.** This is a strong TUNING NEEDED signal. The MVP economy is not Polish-gate-ready as is.

## Required Sprint 10 Actions (autopilot is applying same-session per Pablo's autonomous-balance authorization)

### Same-session (this commit train)

1. **Balance retune**: reduce pre-kickoff drain so the player has runway. Options under investigation:
   - Cut player salary baseline by 25-35%
   - Cut staff salary baseline by 15-20%
   - Add a "directiva starting bonus" lump-sum at signup (+200 €K)
   - Add automatic season-ticket pre-payment lump-sum at signup
2. **Match flow bugs M1 + M2 + M3**: fix all 3 in the match route + dashboard "Partido jugado hoy" component.
3. **Advance button consolidation (D)**: unify the redundant "Saltar al fin de semana" + "Ir a partido" into a single context-aware button.

### Deferred Sprint 10

4. **Recovery levers legibility**: /finance needs a "Aquí puedes recortar costes" UX panel listing actionable levers (fire staff, lower budgets, set ticket price). This is a UX design task, not a copy fix — defer.
5. **Mid-week pause (E)**: currently advance is week-by-week. Day-by-day advance with mid-week interruption is an architectural change. Sprint 10+ design + ADR.
6. **Inbox auto-read (F)**: mark superseded messages as read automatically. Sprint 10.

## Limitations

- Pablo could not complete the protocol's expected validation (TV cancellation crisis at W6, F8 scandal eventually) because the natural pre-kickoff economy drain made him give up before crisis events fired.
- The crisis-overlay was applied to a playthrough that was ALREADY in deeper crisis (balance -60 → I overlaid balance=80 to give runway per protocol, but this masks the natural balance issue).
- Single-session, solo-dev playtester.

This session counts toward Production → Polish gate's 3-session minimum (3/3 satisfied: slice + fresh-player + economy-tuning). BUT the gate ALSO requires "Playtest findings have been reviewed and critical fun issues addressed (not just documented)" — the economy agency issue is exactly that kind of critical fun finding, and addressing it requires the balance retune below.
