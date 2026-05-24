# Review Log — hud-ui.md

## Review — 2026-05-18 — Verdict: APPROVED (R3 lean)
Scope signal: L
Specialists: none (lean mode)
Blocking items: 2 resolved | Recommended: 1 applied
Summary: R3 lean pass found 2 blockers introduced by the same-session approval of match-simulation.md R6: (1) UI Requirements table described instruction selectors as "independientes y combinables" contradicting Regla 6 "mutuamente exclusivos" — programmer would not know whether to render radio buttons or checkboxes; (2) Regla 6 said to "desaconsejar COUNTER from home" but match-simulation.md now specifies server returns HTTP 400 and UI must not show COUNTER for home team. Both fixed as text corrections. Recommended: AC-HUD-13 updated to verify radio group semantics and COUNTER omission for home. All 10 R2 blockers confirmed resolved.
Prior verdict resolved: Yes — R2 was NEEDS REVISION (10 blockers), all resolved before R3

---

## Review — 2026-05-18 (R2) — Verdict: NEEDS REVISION → 10 blockers resueltos en sesión
Scope signal: L
Specialists: ux-designer · web-frontend-specialist · qa-lead · game-designer · creative-director
Blocking items: 10 | Recommended: 11
Summary: GDD maduro tras R1, pero 3 hoyos críticos bloqueaban la implementación: (1) FSM sin transición `match_decision_pending→advancing` — resuelto con Regla 6.5 + estados combinados; (2) match decision panel sin input UI ni datos de snapshot suficientes (fitness, formación) — resuelto con Regla 6 completa y Pilar 3 tier-gated; (3) CSS `bottom:0` conflicto con tab bar — resuelto con `TAB_BAR_HEIGHT_PX=56`. También resueltos: posición de toasts en mobile, rAF→expired handoff, Pilar 3 en Staff panel, 3 ACs nuevos (Rule 9/10/modal combined state), reclasificación AC-HUD-09/10/11 a BLOCKING, split AC-HUD-23 en 23a/b/c, precedencia etiqueta "Avanzar". Pendiente R3 lean re-review en sesión fresca.
Prior verdict resolved: Yes — R1 (2026-05-18) 22 blockers resueltos, todos cerrados

## Review — 2026-05-18 — Verdict: NEEDS REVISION
Scope signal: L
Specialists: game-designer · systems-designer · qa-lead · ux-designer · web-frontend-specialist · creative-director
Blocking items: 22 | Recommended: 14
Summary: El esqueleto del GDD era sólido (8/8 secciones) pero tres problemas atacaban los tres pilares del MVP simultáneamente: sin UI para los inputs del cascade-engine (P1), race condition REST/Socket.IO que descontextualizaba los BLOCKING modals (P3), y badge genérico de mensajes que violaba Pilar 4. Además, el contrato `weeks_runway` era ambiguo entre GDD y ADR-008, la FSM no cubría estados combinados, y el protocolo de reconexión omitía el endpoint de mensajes. Todos los 22 blockers fueron resueltos en sesión en la misma revisión: F1 reescrita para que el servidor envíe `financial_status` enum, badge cambiado a URGENT-only, Reglas 9 y 10 añadidas, AC-HUD-22 reclasificado como Integration BLOCKING, 2 ACs nuevos (25 y 26), y 14 recommended también aplicados. Pendiente re-review R2 en sesión fresca.
Prior verdict resolved: No — primera revisión
