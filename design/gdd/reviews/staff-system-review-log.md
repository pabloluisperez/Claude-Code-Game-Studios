# Review Log — staff-system.md

## Review R3 — 2026-05-18 — Verdict: APPROVED
Scope signal: L
Specialists: ninguno (lean mode — sin redesign estructural)
Blocking items: 2 resueltos en sesión | Recommended: 3 aplicados
Summary: Revisión lean post-R2. Se encontraron y corrigieron 2 discrepancias documentales sin decisiones de diseño: (1) la tabla de variables de F3 tenía el safe range `[0.01–0.03]` sin actualizar desde R2, cuando los Tuning Knobs ya lo habían corregido a `[0.01–0.020]`; (2) AC-STAFF-15 citaba "umbral T2 de 0.06" cuando el umbral T2 real es 0.03 (0.06 es T1). Adicionalmente: stale note de event-system.md en Dependencies corregida, MARKET_CANDIDATES default ambiguo clarificado, heading "Detailed Design" → "Detailed Rules". GDD implementable.
Prior verdict resolved: Sí — R2 NEEDS REVISION (18 blockers)


## Review R2 — 2026-05-18 — Verdict: NEEDS REVISION → Revisado en sesión (18 blockers)

Scope signal: L
Specialists: game-designer · systems-designer · economy-designer · qa-lead · creative-director
Blocking items: 18 resueltos en sesión (3 decisiones diseño + 15 fixes documentación) | Recommended: 6
Prior verdict resolved: Sí — R1 MAJOR REVISION NEEDED (7 blockers estructurales)

**Summary**: El GDD estaba arquitectónicamente sólido pero con 18 nuevos blockers en especificación y tuning. Issues más críticos: (1) D1 — communications_director podía contratar T3 inmediatamente en unlock violando el arco de progresión: resuelto con T1-only first hire; (2) D2 — OQ-STAFF-05 interpolación: resuelto como NO (templates estáticos, Pilar 1 seguro); (3) registry base_threshold_pct stale 0.04→0.02 con rango incorrecto [0.02-0.08]→[0.01-0.020]; (4) Tuning Knobs upper bound incorrecto [0.01-0.03]→[0.01-0.020] + INVARIANT de acoplamiento añadido; (5) ejemplo T3 en Player Fantasy violaba Pilar 1 ("training en 78") reescrito + ejemplos canónicos por tier añadidos. Re-review R3 recomendada en lean mode (sin especialistas — no hay rediseño estructural pendiente).

### Cambios aplicados en R2

- **Player Fantasy**: ejemplo T3 "training en 78" → prosa cualitativa; guía de tono por tier + ejemplos canónicos añadidos; restricciones Pilar 1 del template library documentadas.
- **Core Rule 8**: nota de T1-only first hire para communications_director en primer unlock.
- **Core Rule 9**: recurrencia STABLE_CHECK definida (reset tras disparar, ciclo de 4 semanas).
- **Hiring Mechanics punto 5**: T1-only first hire; nota de diseño Via A/Via B por impacto de vacante (D3 decision).
- **Nota communications_director**: actualizada con T1-only first hire.
- **Edge Cases**: (nuevo) priority_node + URGENT same-tick behavior; (actualizado) market rotation garantía de tier; (actualizado) communications_director unlock T1-only.
- **F1**: sustainability note corregida 27→27.25 €K (6-slot) y 29.5 €K (7-slot).
- **F2**: nota clarificatoria sobre communications_director T1 indemnización.
- **F3/Tuning Knobs**: safe range [0.01-0.03]→[0.01-0.020]; INVARIANT de acoplamiento añadido.
- **Tuning Knobs**: STABLE_CHECK_INTERVAL_WEEKS añadido; FORMATION_MULTIPLIER nota de D3.
- **Dependencies**: chore pendiente economy.md D3 fila documentado.
- **AC-STAFF-03**: GIVEN especifica nodos explícitamente (sin counter nodes).
- **AC-STAFF-12**: T2 boundary wording corregido a ≥ consistente.
- **AC-STAFF-15**: tag corregido `[INTEGRATION]`→`[E2E]`.
- **AC-STAFF-24**: nota de posible reclasificación a `[INTEGRATION]`.
- **AC-STAFF-25**: nuevo — calendar messages tier ≥ 2 gate `[UNIT]`.
- **AC-STAFF-26**: nuevo — Via B hiring gate T2→T3 `[UNIT]`.
- **OQ-STAFF-05**: cerrado como RESUELTO (no interpolación).
- **entities.yaml registry**: base_threshold_pct 0.04→0.02, rango [0.02-0.08]→[0.01-0.020]; effectiveThreshold output_range [0.04,0.12]→[0.02,0.06].

### ACs pendientes resolubles en epic (no bloqueantes para R3)
- AC-STAFF-24 / AC-STAFF-19 posible reclasificación [UNIT]→[INTEGRATION] según implementación de advance().
- Missing ACs: market-no-candidates (ADVISORY), communications_director slot unlock (ADVISORY), STABLE_CHECK suppressed (ADVISORY).
- Economy.md D3 fila: chore pendiente antes de /create-epics.

---

## Review — 2026-05-18 — Verdict: MAJOR REVISION NEEDED → Revisado en sesión

Scope signal: L  
Specialists: game-designer · systems-designer · economy-designer · qa-lead · web-backend-specialist · ux-designer · creative-director  
Blocking items: 7 estructurales resueltos en sesión + ~23 recomendados (resolubles en epic) | Recommended: ~17  
Prior verdict resolved: First review

**Summary**: El GDD tenía 8/8 secciones pero 7 blockers estructurales que impedían crear epics. Los más críticos: (1) contradicción directa con manager-rpg.md (7.º slot Director de Comunicación no documentado), (2) F3 default violaba contrato de cascade-engine.md (umbral T1=12 pts no cubre C1b máximo 6.25 pts; counter nodes nunca disparaban), (3) finance_director arquitectónicamente imposible bajo ADR-009 (balance_eur_k no es WorldState node). Todos resueltos en sesión con revisiones al GDD, corrección de economy.md, y adición de Schema Frozen Decisions. La Player Fantasy "desbloqueas una relación" se refuerza con staff names procedurales + mensaje formation_complete en Vía A. Re-review requerida antes de /create-epics.

### Cambios aplicados en esta sesión

- **Core Rules**: añadidos Rules 9 (STABLE_CHECK), 10 (staff names); Rules 1/3/5 actualizadas (7.º slot, counter_nodes, priority_nodes, routineCount reset).
- **Staff Roles**: añadida fila `communications_director` con dominio y notas.
- **Hiring Mechanics**: añadido punto 5 (slot exclusivo unlock), nota Vía A narrative beat, nota staff names.
- **F1**: añadida fila `communications_director`; totales actualizados (6-slot y 7-slot).
- **F2**: añadida fila `communications_director`.
- **F3**: reescrita completa — BASE_THRESHOLD_PCT 0.04→0.02, thresholds 12/6/4→6/3/2, `threshold_override` para counter nodes, `priority_nodes` para corruption_exposure. Rango safe [0.02-0.08]→[0.01-0.03].
- **F5**: añadida tabla completa de severances por rol × tier.
- **Edge Cases**: añadidos 4 edge cases (communications_director unlock, formación masiva warning, STABLE_CHECK con señales activas, communications_director + CE-3).
- **Dependencies**: actualizada entrada manager-rpg con `canHireDirectorDeComunicacion`; nota bidireccional de finance_director aclarada.
- **Tuning Knobs**: corregida descripción `BASE_THRESHOLD_PCT` (estaba invertida); default y rango actualizados.
- **UI Requirements**: añadidos puntos 6 (unlock notification) y 7 (advertencia formación masiva); UX Flag actualizado.
- **Acceptance Criteria**: AC-01, AC-02, AC-12 actualizados con nuevos umbrales; añadidos AC-17 a AC-24.
- **Schema Frozen Decisions**: sección nueva con 5 decisiones de schema que no pueden cambiar post-migración.
- **Open Questions**: OQ-STAFF-03 resuelto; OQ-STAFF-01 actualizado con criterio mínimo.
- **economy.md** (chore): corregida frase "Director financiero genera ADVISORY via staff-system" → clarificado que el ADVISORY viene del engine económico.

### Items no resueltos (resoluble en epic)

- 6 ACs de QA (mensajes de calendario, mercado sin candidatos, gate T2→T3 rep<4, STABLE_CHECK reset verificado por integración) — añadir al epic de staff-system.
- AC-15 debe clasificarse como [E2E] no [INTEGRATION].
- OQ-STAFF-02 (catálogo de eventos de calendario): resolver al escribir event-system.md.
- OQ-STAFF-04 (squad_morale:high_streak): resolver al diseñar el epic de advance().
- OQ-STAFF-05 (template interpolation): resolver antes del epic.
- Mobile layout 375px: `/ux-design staff-management` requerido en Pre-Production.
