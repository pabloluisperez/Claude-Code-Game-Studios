# Session State — Cascada FC

## Tarea actual
- Task: manager-rpg.md design-review R1 completado — APPROVED
- File: design/gdd/manager-rpg.md
- Status: ✅ APPROVED (R1 — 2026-05-18)

## Decisiones de sesión tomadas hoy (2026-05-18)

### Sesión anterior (2026-05-18)
- cascade-engine.md: APPROVED (R3) — 6 blockers resueltos
- /review-all-gdds: FAIL → 6 blockers cross-GDD → todos resueltos
- entities.yaml: fan_momentum default 50→60, hysteresis range fix
- economy.md: FINE_SEVERITY_FACTOR 1.0→0.667
- event-system.md: F4d nota de autoridad, BLOCKING simultaneous spec añadida
- player-management.md: APPROVED (R2) — 15 blockers resueltos

### Esta sesión (2026-05-18 — segunda sesión)
- match-simulation.md: R2 review con 4 specialists + creative-director
- 21 blockers resueltos (todos en sesión):
  - F4 pseudo-code 10x factor corregido (fuente de verdad = F4 Formulas)
  - F6/F7 NaN guards añadidos (división por cero 0/0 → fallback)
  - P_goal_conceded modifier integrado en F6 (divisor sobre def_ctx)
  - mpi_delta draw: venue-differentiated (home=-3, away=+1)
  - Sustituciones: 3→5 cambios (FIFA post-2020, pool compartido)
  - BullMQ re-enqueue pattern documentado + MatchSessionSnapshot type definido
  - Session lock constraint añadido (UNIQUE INDEX)
  - fan_attendance visitante clarificado
  - team_instructions timing especificado
  - AC-03 split → 03a (unit) + 03b (integration)
  - AC-04 rewritten (3→5)
  - AC-07 consolidado con clamp case (era AC-20)
  - AC-11 timeout nota añadida
  - AC-14 draw scenarios actualizados
  - AC-17 rewritten (stats field eliminado, valores concretos)
  - AC-18 updated (decisionTimeoutMs injectable)
  - AC-21 added (3 ventanas exactas)
  - AC-22 added (segundo amarillo → roja)
  - AC-23 added (banquillo vacío jugador campo)
  - ADR-013 creado y Accepted (Match Session Pattern / Re-enqueue)
  - OQ-MATCH-01 y OQ-MATCH-05 resueltos
  - player-management stale ref corregida
  - P_attack sum invariant documentado en F5

## match-simulation GDD review — R5 2026-05-18
- Status: In Review (R5 resolved — pendiente R6 APPROVED en sesión fresca)
- Verdict R5: NEEDS REVISION → 14 blockers identificados y listos para fix en R6
- Blockers R5 (todos acotados, sin rediseño):
  * F6 comment invertido (mayor divisor → defensa MENOS efectiva, no más)
  * F4 output range: ±5.5 técnico vs ±6.5 total — añadir distinción
  * F5 min 0.0285→0.0214 (5-3-2+HOLD_SHAPE); max 0.189 es base_rate no P_attack (real: 0.1812)
  * Edge Case: min P_attack 0.03 incorrecto (real: 0.0214 → 1 ataque cada 47 ticks)
  * F9: añadir nota que solo incrementa, decay es cascade-engine
  * AC-28: causal_node='injury_risk' en TODO evento injury
  * AC-backend-mutex: POST /matches/:id/decision con 2 instrucciones → 400
  * AC-29: MatchOutcome.events no contiene substitution_window
  * AC-30: formation_attack_mod aplicado a base_rate no P_goal
  * AC-31: rival AI selecciona formación por strength_ratio (no hardcode 4-4-2)
  * F10 playerRatings: Map→Record
  * worldStateDeltas: declarar como Record, cambiar .set()/.get() a obj[k]=v
  * Recovery worker: especificar trigger (BullMQ scheduler, frecuencia, SQL)
  * AC header: "tests/unit/ salvo donde se indique explícitamente" (vs AC-24 integration)
- ADR-013 sync chore separado: UNIQUE INDEX añadir 'failed', PRNG Option A→B
- Specialists: game-designer, systems-designer, qa-lead, web-backend-specialist, creative-director

## Estado del pipeline (2026-05-18 — octava sesión / fin de día)
- cascade-engine ✅ economy ✅ event-system ✅ league-system ✅ player-management ✅
- match-simulation ✅ APPROVED (R6 — 2026-05-18)
- hud-ui ✅ APPROVED (R3 lean — 2026-05-18)
- manager-rpg ✅ APPROVED (R1 — 2026-05-18)
- staff-system 📋 (Designed — pendiente /design-review en sesión fresca)

## hud-ui GDD R2 (2026-05-18 — esta sesión)
- Task: /design-review hud-ui.md R2 completado — 10 blockers resueltos en sesión
- Status: In Review (R2 resolved — pendiente R3 lean re-review en sesión fresca)
- Verdict R2: NEEDS REVISION → todos los blockers resueltos en sesión
- Blockers R2 (10 resueltos):
  * FSM gap: match_decision_pending→advancing (Regla 6.5 + transiciones + estados combinados)
  * Match decision input UI: substitution_window (sustituir + formación + instrucción) + injury_pause (sustituto forzado o continuar con 10)
  * Snapshot expandido: fitness 3-bucket (🟢/🟡/🔴) + formación activa + Pilar 3 tier-gated context
  * CSS bottom sheet: TAB_BAR_HEIGHT_PX=56 en Tuning Knobs + Regla 7 offset spec
  * Mobile toast position: bottom del viewport con offset TAB_BAR_HEIGHT_PX (Regla 8)
  * rAF→expired handoff: active flag + null guard + cancelAnimationFrame protocol (UI Requirements)
  * Pilar 3 en Staff panel: tier-3 → 2 líneas de preview; tier-1/2 → 1 línea (Regla 5)
  * AC-HUD-27: Staff navigation + optimistic read marking (Integration BLOCKING)
  * AC-HUD-28: HUD strip truncation at 375px (Logic BLOCKING)
  * AC-HUD-29: modal_blocking + match_decision_pending combined state (Integration BLOCKING)
- También resueltos (recommended):
  * AC-HUD-09/10/11 reclasificados ADVISORY→BLOCKING en gate table
  * AC-HUD-23 split en 23a/23b/23c
  * AC-HUD-22: "igualdad estricta" → "deep equality"
  * AC-HUD-13 actualizado con nuevo snapshot
  * "Avanzar" label: nota de precedencia sobre interaction-patterns.md
  * OQ-HUD-08 expandida: cubre todos los paneles (Staff/Plantilla/Finanzas/Dashboard)
- ADR-008 chore pendiente: añadir financial_status enum al tipo AdvanceResult
- OQ-HUD-08 pendiente: Dashboard + Staff + Plantilla + Finanzas empty states antes del sprint

## /design-review staff-system.md completado (2026-05-18 — tercera sesión)

### 7 blockers estructurales resueltos:
1. **7.º slot Director de Comunicación**: añadido a staff-system.md (dominio: fan_momentum, fan_attendance, match_performance_index; salary T1/T2/T3: 0.50/1.00/2.25 €K; alineado con manager-rpg.md Approved)
2. **F3 reescrito**: BASE_THRESHOLD_PCT 0.04→0.02, thresholds T1/T2/T3 12/6/4→6/3/2 pts, counter_nodes (consecutive_wins/losses threshold_override=1), priority_nodes (corruption_exposure nunca silenciado)
3. **finance_director clarificado**: ADVISORY "En Riesgo" viene del engine económico, no del worker de staff. economy.md corregido.
4. **Upgrade timing trap**: Edge Case + UI warning para formación masiva > WARNING_THRESHOLD
5. **Early-game feedback**: Rule 9 STABLE_CHECK (después de 4 semanas estables, 1 mensaje de confirmación), Rule 10 staff names procedurales
6. **Staff texture OQ-STAFF-03 resuelto**: nombres procedurales + Vía A genera formation_complete ROUTINE message
7. **Schema Frozen Decisions**: sección nueva con 5 decisiones (idempotency constraint, role extensibility, anti-spam persistence, calendar events field, staff name field)

### Archivos modificados:
- design/gdd/staff-system.md (revisión completa — In Review)
- design/gdd/economy.md (chore: corregida frase ADVISORY finance_director)
- design/gdd/systems-index.md (staff-system: Designed→In Review)
- design/gdd/reviews/staff-system-review-log.md (nuevo)

### ACs pendientes (resoluble en epic, no bloqueantes para re-review):
- AC para mensajes de calendario (OQ-STAFF-02 sin resolver), mercado sin candidatos, gate T2→T3 rep<4
- AC-15 debe ser [E2E] no [INTEGRATION]
- OQ-STAFF-04, OQ-STAFF-05 siguen abiertos

## /design-review staff-system.md R2 completado (2026-05-18 — esta sesión)

### 18 blockers resueltos:
**Decisiones de diseño (D1/D2/D3):**
1. **D1 communications_director T1-only first hire**: mercado muestra solo T1 en primer unlock; arco T1→T2→T3 preservado.
2. **D2 OQ-STAFF-05 cerrado**: no interpolación — templates son strings literales fijos; Pilar 1 seguro al 100%.
3. **D3 Via A/Via B documentación**: tensión escala por impacto de vacante; groundskeeper Via B domina económicamente (by design documentado).

**Fixes de documentación:**
4. Player Fantasy: ejemplo "training en 78" → prosa cualitativa; guía de tono por tier + ejemplos canónicos; restricciones Pilar 1 del template library.
5. Registry entities.yaml: base_threshold_pct 0.04→0.02, rango [0.02-0.08]→[0.01-0.020]; effectiveThreshold output_range corregido.
6. Tuning Knobs BASE_THRESHOLD_PCT: safe range [0.01-0.03]→[0.01-0.020].
7. INVARIANT de acoplamiento añadido: BASE_THRESHOLD_PCT × QUALITY_FACTOR[T1] ≤ 0.0625.
8. AC-STAFF-03: nodos explícitos en GIVEN (sin counter nodes).
9. AC-STAFF-12: T2 boundary ≥ consistente.
10. AC-STAFF-15: tag [INTEGRATION]→[E2E].
11. AC-STAFF-25 nuevo: calendar messages tier ≥ 2 gate.
12. AC-STAFF-26 nuevo: Via B hiring gate T2→T3.
13. Core Rule 9: recurrencia STABLE_CHECK definida + STABLE_CHECK_INTERVAL_WEEKS Tuning Knob.
14. Edge Cases: priority_node+URGENT same-tick behavior; market rotation garantía de tier; T1-only first hire.
15. F1: totales 27→27.25 €K (6-slot) y 29.5 €K (7-slot).
16. F2: clarificación communications_director T1 indemnización.
17. Dependencies: chore economy.md D3 fila documentado.
18. Hiring Mechanics: Via A/Via B nota de diseño por impacto de vacante.

### Archivos modificados:
- design/gdd/staff-system.md (R2 revisado — In Review)
- design/gdd/systems-index.md (staff-system: updated con R2 details)
- design/gdd/reviews/staff-system-review-log.md (R2 entry añadida)
- design/registry/entities.yaml (base_threshold_pct + effectiveThreshold corregidos)

### Pendientes no bloqueantes para R3:
- AC-STAFF-24/19: posible reclasificación [UNIT]→[INTEGRATION] según implementación advance()
- Economy.md D3 fila: chore antes de /create-epics
- ADVISORY: calendar anti-spam, counter node max value, STABLE_CHECK señal económica falsa

## Session Extract — /design-review staff-system.md R3 lean + /review-all-gdds (2026-05-18)

### /design-review staff-system.md R3 (lean)
- Veredicto: APPROVED
- 2 blockers resueltos: F3 safe range [0.01–0.03]→[0.01–0.020] sincronizado; AC-STAFF-15 "umbral T2 de 0.06"→"de 0.03"
- 3 recomendados aplicados: event-system.md stale note; MARKET_CANDIDATES default clarificado; "Detailed Design"→"Detailed Rules"
- systems-index.md: staff-system → Approved
- review-log: R3 entry añadida

### /review-all-gdds (set completo — 9 sistemas)
- Veredicto: **FAIL** — 6 blockers (5 consistency + 1 design)
- GDDs revisados: cascade-engine · economy · event-system · league-system · manager-rpg · match-simulation · player-management · staff-system · hud-ui + game-concept
- Reporte: design/gdd/gdd-cross-review-2026-05-18b.md

**Blockers que requieren decisión de diseño:**
1. B-02: Regla de forfeit — league-system (63% pct) vs player-management (<7 count)
2. B-03: financial_acumen — semanal (F5) vs en la firma (AC-RPG-12) — contradicción interna manager-rpg.md
3. B-04: player_happiness WorldState vs PlayerState.morale individual — agregación undefined
4. D-01: fan_momentum 50% WR — recovery paths documentadas sin validación cuantitativa

**Blockers resolubles con doc fixes:**
5. B-01: event-system.md F4d fórmula != F6 (valores distintos)
6. B-05: match-simulation.md F2 — form range [0,100] debe ser [30,90] per player-management

**Warnings notables (pre-blocking para epics):**
- W-02: OQ-PM-05 player-management dice 3 formaciones; cuerpo dice 4 (quick fix)
- W-08: ADR-011 usa 16 clubs; league-system tiene 20 (resolver antes del epic)
- D-04: squad_morale:high_streak OQ-STAFF-04 aún open — afecta man_management XP speed
- Scenario 2: Vía A single-upgrade puede cruzar WARNING threshold sin warning UI

### /review-all-gdds blockers resueltos en sesión (2026-05-18)

**Decisiones de diseño tomadas:**
- B-02 Forfeit: pct ≤63% (league-system) es canónico → player-management.md actualizado (F8 nota, Edge Case, Tuning Knob FORFEIT_MIN_PLAYERS→FORFEIT_SQUAD_PCT_THRESHOLD, AC-PM-11)
- B-03 financial_acumen: lock at signing (AC-RPG-12) — manager-rpg.md F5 y Edge Case reescritos
- B-04 player_happiness: media de los 11 titulares → F9b añadido en player-management.md
- D-01 fan_momentum K_loss_base: 10→8 (ratio 1.25→1.0) → cascade-engine.md C6 + Tuning Knobs + AC-CTI-C6 + nota recovery quantificada; entities.yaml output_range [-20,+5.5]→[-16,+5.5]

**Doc fixes aplicados:**
- B-01: event-system.md F4d = fórmula idéntica a F6 (max(CRITICAL-balance,0) + 4×costs)
- B-05: match-simulation.md form [0,100]→[30,90]; output range [25,100]→[13,96]; stamina [0,100]→[40,100]
- W-01/W-03: game-concept.md 16→20 clubs, 10-15→18 cascadas (3 secciones)
- W-02: player-management.md OQ-PM-05 "3 formaciones"→"4 formaciones"
- W-03: staff-system.md F1 "D3 inicio"→"D2/Segunda"; entities.yaml nota tv_rights D3→D2
- W-06: match-simulation.md FITNESS_DECAY_MAX aclara floor stamina=40 → max decay real = 9 pts
- W-07: cascade-engine.md Interactions: player-management.md añadido como writer (squad_available_pct, team_skill)
- W-09: staff-system.md F1 player wages ~12→~6 €K (alineado con economy.md target D2)

**Archivos modificados:**
- cascade-engine.md (K_loss_base 10→8, output range, AC-CTI-C6, recovery note, player-management writer, Last Updated R4)
- event-system.md (F4d = F6)
- game-concept.md (clubs + cascades count)
- manager-rpg.md (financial_acumen F5 timing + Edge Case)
- match-simulation.md (form [30,90], stamina [40,100], output range [13,96], FITNESS_DECAY note)
- player-management.md (forfeit pct rule, F9b player_happiness, OQ-PM-05 3→4 formaciones)
- staff-system.md (D3→D2, player wages ~12→~6)
- entities.yaml (fan_momentum_asymmetric_hysteresis output_range + notes; tv_rights nota D3→D2)

**Pendientes (resolubles en epics, no bloqueantes para /review-all-gdds R2):**
- W-04: "Reducir estructura staff" dep → staff-system.md + economy.md (OQ-EVT-01 aún open)
- W-05: scandal "cooperar" flat 30K vs F8 — ¿intencional? (decisión de diseño pendiente)
- W-08: ADR-011 16→20 clubs chore (ADR edit antes del epic de league-system)
- W-10: hud-ui.md AC faltante COUNTER home
- D-02/D-03/D-04/D-05/D-06: warnings de diseño (documentados, no bloqueantes)

### /review-all-gdds R2 — PASS (2026-05-18)
- Veredicto: **PASS** — 0 blockers
- 1 nuevo blocker encontrado (B-06: F9b absoluta sobreescribía C17) y resuelto en sesión (F9b→delta)
- 3 quick fixes aplicados: AC-EVT-28 (28→27€K), entities.yaml effective_rating range [13,96], player-management.md F8 denominator=25 fijo
- W-05 cerrado como falso positivo. D-01/D-04 cerrados como resueltos.
- Reporte: design/gdd/gdd-cross-review-2026-05-18c.md
- Archivos adicionales modificados: player-management.md (F9b delta, F8 denom=25, AC-PM-11), event-system.md (AC-EVT-28), entities.yaml (effective_rating range)

## Próxima sesión recomendada
1. ADR-013 sync chore: UNIQUE INDEX añadir 'failed', PRNG Option A→B (antes de /create-epics)
2. ADR-011 update: 16→20 clubs (antes del epic de league-system)
3. /create-epics — TODOS los GDDs MVP están Approved y el cross-review está PASS
