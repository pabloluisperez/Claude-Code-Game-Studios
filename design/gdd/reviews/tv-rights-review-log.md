## Review R7 — 2026-05-20 — Verdict: APPROVED
Scope signal: L
Specialists: game-designer · economy-designer · systems-designer · qa-lead · web-backend-specialist · creative-director
Blocking items: 3 (todos resueltos en sesión) | Recommended: 6 (todos aplicados)
Summary: 3 blockers resueltos. (B1) F-TV4: clamp `min(1.0, ...)` en `fan_attendance_effective` — previene overflow cuando `fan_loyalty=50` produce multiplicador 1.25 sobre fan_attendance cerca de 1.0, desbordando el output_range de match_day_revenue en entities.yaml. (B2) REGIONAL 2yr ⚠️: añadida nota de riesgo en Rule 5b (cliff `corruption_exposure ≥ 22` → cancelación T2 semana 36-38 sin midseason offer) e indicador equivalente en UI Requirements, simétrico al de NACIONAL 3yr. (B3) Combinaciones ilegales de F-TV1 sin AC: añadidos AC-TV-50 (LOCAL 2yr → HTTP 400) y AC-TV-51 (REGIONAL 3yr / NACIONAL 2yr → HTTP 400). 6 recomendaciones aplicadas: invariante de precisión para external_delta del cascade en Tick Order paso 6; CANCELLED→CANCELLED por rechazo de midseason offer en state machine table; AC-TV-52 (cliff corruption=3.0 boundary); AC-TV-53 (NACIONAL 3yr always cancels T2, confirma que el happy path completo no existe dado que T1 acumula 57.0); AC-TV-54 (rechazo en T1 / prev_pos=null). Total: 54 ACs. Veredicto sin re-review formal: creative-director prevalidó que B1/B2/B3 resueltos = APPROVED.
Prior verdict resolved: Sí — R6 (2026-05-20) fue NEEDS REVISION → REVISED IN SESSION

## Review R6 — 2026-05-20 — Verdict: NEEDS REVISION → REVISED IN SESSION
Scope signal: L
Specialists: game-designer · economy-designer · systems-designer · qa-lead · web-backend-specialist · creative-director
Blocking items: 8 (todos resueltos en sesión) | Recommended: 6 (4 abordados; 2 deferidos — fan_loyalty decay y backend ADR)
Summary: 8 blockers resueltos. (1) Regla REGIONAL: añadida "D1 actual" como condición suficiente — elimina el gap contraintuitivo LOCAL+NACIONAL sin REGIONAL para managers D1+rep<2. (2) F-TV1 guards: RangeError para division/duration fuera de tabla + combinaciones ilegales (NACIONAL 2yr, etc.) — previene NaN en contrato rate. (3) F-TV3 ceiling: CORRUPTION_MAX=100 añadido en F-TV3 y paso 6 del Tick Order — alinea con cascade_node_default_range del registry y previene overflow de numeric(5,2). (4) Sección "Cuándo elegir cada tier": LOCAL documentado como instrumento de gestión de riesgo multi-temporada, con 3 casos de uso explícitos. (5) NACIONAL 3yr señalización: nota ⚠️ en Rule 5b + indicador de riesgo en UI Requirements cuando corruption_exposure > 0. (6) AC-TV-22b reescrito: par de pruebas (59.0 → CANCELLED+0; 58.0 → ACTIVE+7.16) verifican ordering sin instrumentación interna. (7) AC-TV-47: LOCAL cancelado por cascade-engine (rama TIER_BELOW[LOCAL]=LOCAL, única y no cubierta). (8) AC-TV-49: D1+rep<2 = 3 tiers disponibles (comportamiento correcto post-fix). Adicionales: AC-TV-48 (NACIONAL 3yr D2→D1), AC-TV-24 ext, OQ-TV-04 (ADR backend pre-impl). Total: 49 ACs. creative-director rechazó los 8 hallazgos del web-backend-specialist como bloqueantes del GDD (pertenecen a ADR) y adjudicó LOCAL como instrumento de riesgo válido (no P1 violation, sino falta de documentación). Pendiente re-review en sesión limpia.
Prior verdict resolved: Sí — R5 (2026-05-20) fue MAJOR REVISION NEEDED → REVISED IN SESSION

## Review R5 — 2026-05-20 — Verdict: MAJOR REVISION NEEDED → REVISED IN SESSION
Scope signal: L
Specialists: game-designer · economy-designer · systems-designer · qa-lead · creative-director
Blocking items: 5 (5 técnicos resueltos; 1 estructural (multi-año vs Player Fantasy) aceptado por usuario via reframe de fantasy) | Recommended: 6 (5 abordados en sesión; 1 deferido a cross-review)
Summary: 5 bloqueantes técnicos resueltos en sesión. (1) Player Fantasy reescrita con framing "la relación con el mundo madura" — multi-año se reframea como "pacto sellado" en vez de "ausencia de ritual"; el game-designer concern sobre P3 se mitiga sin revertir multi-año (decisión del usuario). (2) LOCAL_CORRUPTION_SHIELD subido de -0.3 a -0.5/sem (-19/temporada): recovery real desde corruption=72 en una temporada. Tuning Knob safe range extendido a -0.2 a -0.8. (3) fan_loyalty pathway documentado en nueva fórmula F-TV4: `fan_attendance × (1 + fan_loyalty × 0.005)`, cap 50. Rechazar TV ahora es decisión P1 calculable. Nueva OQ-TV-03 BREAKING CHANGE menor pendiente de cross-review (dónde reside el cálculo). (4) Tick Order reescrito: cascade-engine inyecta corrupción en pasos 6-8 (post-F-TV3), con re-evaluación de threshold; AC-TV-40 reescrito con la asimetría intencional documentada (F-TV3 cancel = revenue 0; cascade cancel = revenue preservado). (5) `corruption_exposure` storage type especificado: `numeric(5,2)` con round-trip a DB cada paso, eliminando float drift. Adicionalmente: AC-TV-10 con assert observable de idempotencia (COUNT events); AC-TV-32 reescrita como pure unit test del predicado sin bypass de capa; cliff `corruption < 3.0` documentado con precisión; 5 nuevas ACs (AC-TV-42 a AC-TV-46) — REGIONAL 2yr D1, double-sign 409, promoción D2→D1 trap, cross-season corruption accumulation, fan_loyalty pathway. Total: 46 ACs. Pendiente re-review en sesión limpia.
Prior verdict resolved: Sí — R4 (2026-05-20) fue MAJOR REVISION NEEDED → REVISED IN SESSION

## Review R4 — 2026-05-20 — Verdict: MAJOR REVISION NEEDED → REVISED IN SESSION
Scope signal: L
Specialists: game-designer · economy-designer · systems-designer · qa-lead · creative-director
Blocking items: 6 | Recommended: 4
Summary: Cuatro blockers estructurales resueltos en sesión. B1 (ciclo LOCAL→NACIONAL determinista): añadidos contratos multi-año REGIONAL 2yr (+5%) y NACIONAL 3yr (+10%) que comprometen corruption sin posibilidad de rotar a LOCAL hasta expiración o cancelación. B2 (paradoja midseason: si filtro corruption aplica, siempre LOCAL; si no aplica, free upgrade): resuelta con regla TIER_BELOW — el midseason offer es siempre el tier inmediatamente inferior al cancelado, sin re-evaluación de condiciones. B3 (AC-TV-23 mecánicamente imposible: LOCAL no puede cancelarse por escrutinio): reescrito como REGIONAL cancelado → midseason LOCAL con aritmética verificada. B4 (predicado "cruce al alza" no definido formalmente): predicado canónico `threshold_crossed_upward = (prev < 60) AND (new >= 60)` añadido a F-TV3 y al Tick Order. B5 (NACIONAL D2 dominante vía rep≥4): mitigado por multi-year 3yr que acumula sin salida — 1yr sigue siendo posible; trade-off aceptado bajo P1. B6 (7 ACs faltantes): añadidos AC-TV-35 a AC-TV-41. Total: 41 ACs. Pendiente re-review en sesión limpia.
Prior verdict resolved: Sí — R3 (2026-05-20) fue MAJOR REVISION NEEDED → REVISED IN SESSION

## Review R3 — 2026-05-20 — Verdict: MAJOR REVISION NEEDED → REVISED IN SESSION

Scope signal: L
Specialists: game-designer · economy-designer · systems-designer · qa-lead · creative-director
Blocking items: 11 | Recommended: 11
Summary: El GDD tenía tres violaciones de P1 (corrupción ≥ 60 al inicio = NACIONAL gratis; NACIONAL post-semana-30 sin penalización = free upgrade; rechazo siempre dominado por LOCAL). Resuelto: REGIONAL/NACIONAL bloqueados si corruption ≥ 60 al inicio, ventana de reemplazo extendida a semana ≤ 35 (antes ≤ 30), rechazo añade fan_loyalty +10. Bug funcional en AC-TV-28 (fórmula +50 producía 2.3675 → 2.37 en DB, no 2.36): reemplazado por fórmula canónica Math.round para todos los tiers. Backlink añadido en cascade-engine.md, BREAKING CHANGE aplicado en league-system.md (F6/AC-LGS-18/19 deprecated). Semana 38 race condition documentada en Tick Order. floor de corruption_exposure=0 añadido en F-TV3. AC-TV-10 clarificado (tarifa = tier elegido en midseason, no tier cancelado). AC-TV-19 reescrito con contrato HTTP. 4 nuevos ACs (31-34). Total: 34 ACs.
Prior verdict resolved: Sí — R2 (2026-05-20) fue MAJOR REVISION NEEDED → REVISED IN SESSION

## Review R2 — 2026-05-20 — Verdict: MAJOR REVISION NEEDED → REVISED IN SESSION

Scope signal: L
Specialists: game-designer · systems-designer · economy-designer · qa-lead · creative-director
Blocking items: 10 | Recommended: 8
Summary: El GDD tenía una violación estructural de pilar (P1): NACIONAL era estrategia dominante para managers con corrupción ≤ 23 (cero riesgo toda la temporada), LOCAL no tenía uso post-T1, y rechazar era siempre subóptimo. Resuelto en sesión: TV_SCANDAL_THRESHOLD separado en 60 (distinto del global 80) hace que cualquier manager con corrupción > 3 enfrente riesgo real con NACIONAL; LOCAL recibe delta negativo (-0.3/sem) como escudo de corrupción convirtiéndolo en opción estratégica de limpieza. Blockers técnicos también resueltos: AC-TV-08 reescrito con aritmética de enteros en centavos (sin drift IEEE 754), sección Tick Order añadida, F-TV2 prosa reescrita sin ambigüedad sobre re-evaluación de tiers, AC-TV-01 scope corregido, guard idempotente especificado en AC-TV-10, ACs faltantes AC-TV-24/25 añadidos, AC-TV-22 separado en Logic (22a) e Integration (22b). Total: 30 ACs (antes 23).
Prior verdict resolved: Sí — R1 (2026-05-20) fue MAJOR REVISION NEEDED → REVISED IN SESSION

## Review R1 — 2026-05-20 — Verdict: MAJOR REVISION NEEDED → REVISED IN SESSION

Scope signal: M
Specialists: game-designer · systems-designer · economy-designer · qa-lead · creative-director
Blocking items: 12 | Recommended: 8
Summary: El GDD tenía una contradicción estructural central entre Player Fantasy ("un sobre en T1") y las reglas de unlock (proxy=10 garantizaba REGIONAL a todos los clubs D2 desde T1). Adicionalmente, el sistema violaba P1 por ausencia de trade-offs entre tiers — el tier máximo disponible era siempre la elección dominante. Todos los blockers fueron resueltos en sesión: T1=solo LOCAL (sin proxy), F-TV3 añadida (corruption_exposure delta por tier como trade-off P1), OQ-TV-01 cerrado (canales generados por temporada), aritmética corregida en F-TV1/F-TV2, BREAKING CHANGE league-system §F6 documentado, state machine completado con CANCELLED→NONE, reject-all habilitado, 8 nuevos ACs (total: 23).
Prior verdict resolved: N/A — primera review
