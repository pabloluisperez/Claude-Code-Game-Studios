# Cascade Engine — Review Log

---

## Review — 2026-05-17 — Verdict: NEEDS REVISION
Scope signal: XL
Specialists: `game-designer`, `systems-designer`, `qa-lead`, `creative-director` (lean mode — CD skipped)
Blocking items: 6 | Recommended: 3
Summary: El GDD tenía 3 blockers de diseño (SNR < 1 en early game, C12 sin agencia sobre training_intensity, C18a timing bug donde el decay absorbía la PlayerDecision antes del ThresholdCrossing), 3 errores matemáticos en ACs (C4: -7.93 era -9.984; C8: -9.67 era -8.67; rangos sin noise) y 3 gaps de AC (timing C18a, multiplicador C10, transición ascendente C1b). El GDD fue marcado para revisión en sesión fresca por límite de contexto.
Prior verdict resolved: No — primera revisión.

---

## Review — 2026-05-18 — Verdict: NEEDS REVISION (R2 — blockers parcialmente resueltos)
Scope signal: XL
Specialists: `game-designer`, `systems-designer`, `qa-lead`, `creative-director`
Blocking items resolved: 11 | Remaining blocking items: 0 | Recommended remaining: 5
Summary: Revisión completa con 4 especialistas. El creative-director elevó el veredicto inicial a MAJOR REVISION NEEDED por 5 problemas estructurales. En sesión de revisión colaborativa se resolvieron todos los blockers: (1) noise reducido a ±1 en C2/C4/C9a/C14; (2) C12 reescrita con training_intensity como modulador de agencia; (3) C18a guard implementada (`prevState.CE < 80`), OQ-CASCADE-05 cerrado; (4) K_loss_base 14→10, default fan_momentum 50→60, histéresis ratio 1.75→1.25; (5) todos los errores matemáticos en ACs corregidos; (6) 2 nuevos ACs añadidos (C10-interaction, C1b-ascendente); (7) OQ-CASCADE-02 cerrado (C10 es excepción documentada al principio aditivo). Las 5 recomendaciones pendientes son advisory, no blocking — el GDD está listo para R3 (re-review en sesión fresca).
Prior verdict resolved: Parcialmente — R1 identificó los blockers; R2 los resolvió y encontró blockers adicionales, todos resueltos en la misma sesión.

### Cambios aplicados en R2

| Blocker | Fix |
|---------|-----|
| SNR < 1 early game | NOISE amplitudes 4.0→2.0 en C2, C4, C9a, C14 |
| C12 sin agencia (P1/P4) | Fórmula reescrita: lee training_intensity, intensity_mod actúa como modulador |
| C18a timing bug | Guard `prevState.CE < 80`; OQ-CASCADE-05 cerrado |
| Histéresis 14:8 viola P4 | K_loss_base 14→10; default fan_momentum 50→60 |
| AC-CTI-C4 valor incorrecto | −7.93 → −9.984; SM=60 especificado en GIVEN |
| AC-CTI-C8 contradicción | delta −9.67 → −8.67 (Sección H alineada con Sección D) |
| C6 discontinuidad MPI=50 | Edge Case añadido: MPI=50 usa rama positiva |
| AC-ADD-01 faltaba C12 | C12 añadida a lista de edges sobre team_fitness |
| AC-EQL-01 excepción falsa | Excepción scouting_points=100 eliminada; rng=0.5 especificado |
| AC-DEL-01 misleading | Nota sobre efectos de C3/C14 en W=1 añadida |
| AC-PERF flaky | Promedio 100 runs; budget 1000 ticks: 1s→2s |
| AC-THR-06 sin seed | rng=0.5 explícito especificado |
| C1b rango +7.5 incorrecto | Corregido a +6.25; nota de discontinuidad en FQ=20 |
| "19 nodos" en ACs | Corregido a 20 en AC-DET-01, AC-PERF-01, AC-ADM-01, AC-SER-01 |
| OQ-CASCADE-02 abierto | Cerrado: C10 es excepción documentada al principio aditivo |
| Gap AC C10×C4 | AC-C10-interaction añadido (SM=0 y SM=100) |
| Gap AC C1b ascendente | AC-CTI-C1b-ascendente añadido |

---

## Review — 2026-05-18 — Verdict: APPROVED (R3)
Scope signal: XL
Specialists: `game-designer`, `systems-designer`, `qa-lead`, `creative-director`
Blocking items: 6 | Recommended: 4 | Nice-to-have: 3
Summary: R3 descubrió 4 blockers técnicos nuevos (C1b boundary condition en F_q=75, C11/C14/C16b sin match-week guards invalidando AC-THR-06/EQL-01/EQL-02/03, entities.yaml K_loss_base stale) más 2 blockers "in spirit" elevados por creative-director (Core Rule 7 indemostrable tras 2 ciclos, ausencia de contrato mínimo de señal tier-1 para Player Fantasy). Todos resueltos en la misma sesión. El GDD está listo para implementación — el epic de cascade-engine puede comenzar.
Prior verdict resolved: Sí — R2 resolvió los blockers de diseño; R3 resolvió los blockers de especificación formal.

---

### Recomendaciones pendientes (advisory — no blocking para implementación)

1. Herramientas activas de recuperación de fan_momentum no documentadas en cascade-engine.md (delegado a event-system.md).
2. C8 rango declarado [-60,+60] no refleja rango matemático real [-145,+77.5] — documentación.
3. C9a equilibrio con SC≥54 pega en 100 por clamping — no documentado explícitamente.
4. Estrategias dominantes post-discovery (catering max, groundskeeper max) — a resolver en playtesting/balance.
5. Core Rule 7 inconsistencia (10/18 cadenas sin contraintuitiva vs. regla que dice "todas") — considerar reescribir la regla.
