## Retrospective: Sprint 26 — Generador Narrativo Determinista (Pillar D sin LLM)

**Período**: 2026-05-29 (ventana planificada 2026-06-10 → 2026-06-23; ejecutado anticipadamente en 1 sesión)
**Generada**: 2026-05-29
**Modo**: Producción — solo dev + agentes especializados (piloto automático)

---

### Metrics

| Métrica | Planificado | Actual | Delta |
|---------|------------|--------|-------|
| Must Have stories | 8 | 8 | 0 (100%) |
| Should Have stories | 2 | 2 | 0 ✅ (26-9, 26-10) |
| Nice to Have | 1 | 1 | 0 ✅ (26-NH1) |
| Trabajo no planeado (playtest UX Pablo) | 0 | 4 ítems | +4 (inbox ruido/rojo/cuadro + dashboard burbujas) |
| Tasa completado (Must Have) | 100% | 100% | — |
| Días usados de ~9 disponibles | ~9 | ~1 sesión | −8 (compresión piloto automático) |
| Tests narrativos nuevos | ~20 est. | 64 (engine 14 + qa 15 + golden 19 + locale 5 + ambient 6 +5 variety) | +44 |
| Tests totales (shared+api+web) | — | 1583 (1204+156+223) | — |
| Regresiones introducidas | 0 | 0 | ✅ |
| Bugs reales pendientes | — | 0 (los 2 del session-start estaban CLOSED) | — |
| Commits del sprint | — | 6 | — |

### Velocity Trend

| Sprint | Cerrado | Tiempo | Notas |
|--------|---------|--------|-------|
| Sprint 04 (ref) | 7 | ~1 sesión | baseline autónomo |
| Sprint 25 | 8/8 Must Have | ~4 días | ~200% velocidad estimada |
| **Sprint 26** | **8 Must + 2 Should + 1 Nice + 4 UX** | **~1 sesión** | **alcance completo + extra, una sola sesión** |

**Tendencia**: Creciente. Sprint 26 cerró no solo todo el Must Have sino también todo el Should/Nice-to-Have (que el 25 dejó como backlog) más feedback de playtest no planeado, en una sola sesión. La compresión temporal del piloto automático se sostiene.

### What Went Well
- **Cobertura completa del backlog del sprint en una sesión**: Must + Should + Nice, algo que el Sprint 25 no logró (dejó Should/Nice como deuda).
- **El motor narrativo era más maduro de lo documentado**: la exploración reveló que ya estaba cableado en 3 fases (6c/8b/8c), no solo "scaffolded". Evitó trabajo redundante.
- **Corrección de rumbo bien encajada**: Pablo señaló que la integración LLM estaba *descartada*, no aplazada. Se corrigió el encuadre del ADR-032 (Alternativa 4 rechazada, sin "futuro LLM opcional") y se guardó en memoria para no repetirlo.
- **Calidad lingüística es-ES tratada como feature, no afterthought**: se detectaron y arreglaron fallos de concordancia género/número que el approach plantilla+vocab genera por defecto ("Respaldo plena", "temporada desordenado").
- **Variedad medida, no asumida**: test de enumeración que cuenta renders distintos/bucket (≥200 en superficies frecuentes), atacando directamente el riesgo nº1 del plan.
- **Feedback de playtest convertido en mejoras inmediatas**: ruido del inbox, jerarquía visual (malas en rojo+negrita), rediseño de mensajes de staff a burbujas.
- **Deuda técnica = 0 markers** en código fuente, sostenido desde Sprint 25.

### What Went Poorly
- **Verificación visual no realizada en vivo**: dos cambios de UI (inbox + dashboard burbujas) quedaron validados solo por typecheck + tests; el dashboard está tras login y no hay usuario seed para capturar. Riesgo de desajuste visual no detectado.
- **`sprint-status.yaml` sigue desactualizado** (apunta a Sprint 25): el batch piloto-automático vuelve a saltarse `/story-done`, que es quien lo mantiene. Action item A5 del Sprint 25 no resuelto de raíz — smell recurrente por segundo sprint.
- **El "alcance" del sprint se difuminó**: se añadió trabajo no planeado (playtest UX) a mitad de sesión. Fue valioso, pero no pasó por scope-check; en un equipo mayor sería scope creep.

### Blockers Encountered

| Blocker | Duración | Resolución | Prevención |
|---------|----------|------------|------------|
| Verificación visual del dashboard tras login sin usuario seed | — (no resuelto) | Diferido a Pablo | Crear usuario+playthrough seed para dev, o un modo de preview de componentes |
| Encuadre erróneo del ADR (LLM como "futuro opcional") | <5 min | Corregido tras señalarlo Pablo; memoria creada | Confirmar decisiones de dirección descartadas vs aplazadas antes de redactar ADRs |

### Estimation Accuracy

| Task | Estimado | Actual | Varianza | Causa probable |
|------|----------|--------|----------|----------------|
| Must Have completo (26-1..26-8) | ~7.5 días | ~1 sesión | −7d | Motor ya cableado; trabajo era cobertura+hardening, no greenfield |
| Should+Nice (26-9/10/NH1) | ~2 días | misma sesión | −2d | Alta sinergia con el trabajo recién hecho (inbox/narrativa) |

**Precisión**: las estimaciones en días-hombre siguen sin correlacionar con el tiempo de reloj del piloto automático. Como en Sprint 25, la unidad útil no es "días" sino "¿caben los archivos objetivo sin solaparse?".

### Carryover Analysis

| Task | Sprint origen | Veces arrastrada | Razón | Acción |
|------|---------------|------------------|-------|--------|
| Wiring de sponsorRenewal/contractRenewal/promotionRelegation/boardConfidence | 26 | 0 (nuevo) | Grupos creados pero sus emisores viven en handlers de decisión / rollover | Opcional/decorativo — Sprint 27 o descartar |
| 25-9 Saved searches | 25 | 1 | Diferido en 25, no retomado en 26 | Reconsiderar Sprint 27 |

### Technical Debt Status
- TODO / FIXME / HACK en código productivo: **0** (estable vs Sprint 25)
- Nuevo: 4 grupos narrativos "mudos" (escritos, sin emisor) — deuda funcional, no de código, documentada en `production/qa/narrative-hardcoded-audit-2026-05-29.md`
- Tendencia: estable / excelente

### Previous Action Items Follow-Up

| Acción (Sprint 25) | Estado | Notas |
|--------------------|--------|-------|
| A1 — credencial `.mcp.json` a env + gitignore | ✅ Hecho (687f3e1) | Pablo confirma 2026-05-29: servidor local, riesgo descartado |
| A2 — task `typecheck` en turbo + CI | ✅ Hecho (687f3e1) | `pnpm typecheck` 3/3 usado como puerta todo el sprint |
| A3 — vitest schema guard | ✅ Hecho (687f3e1) | globalSetup en api |
| A4 — eliminar dead `view` en /league | ✅ Hecho (687f3e1) | — |
| A5 — actualizar `sprint-status.yaml` en cierre de historia | ❌ **No resuelto** | Sigue en Sprint 25; el batch salta `/story-done`. **Recurrente.** |

### Action Items for Next Iteration

| # | Acción | Owner | Prioridad | Deadline |
|---|--------|-------|-----------|---------|
| 1 | Verificar en vivo (capturas) el inbox y el dashboard de burbujas; ajustar si hace falta | Pablo + Claude | **Alta** | Inicio Sprint 27 |
| 2 | Resolver A5 de raíz: o crear usuario/playthrough **seed de dev** (también desbloquea la verificación visual), o sustituir `sprint-status.yaml` por un grep de story files | Pablo | **Alta** | Sprint 27 |
| 3 | Decidir destino de los 4 grupos narrativos mudos: wirear (sponsor/contract en handlers, promo/releg en rollover, board confidence nuevo emisor) o descartar formalmente | Pablo | Media | Sprint 27 |
| 4 | Pasar `/scope-check` antes de aceptar trabajo no planeado a mitad de sesión | Claude | Baja | Continuo |

### Process Improvements
- **Crear un usuario+carrera seed de desarrollo.** Bloqueó la verificación visual este sprint y bloqueará toda futura validación de UI. Una sola vez, desbloquea screenshots/Playwright para siempre. (Cubre A.I. #1 y #2.)
- **Verificación visual obligatoria para cambios de UI**, no opcional. El estándar de codificación ya lo pide ("For UI changes, verify with screenshots"); este sprint lo incumplió por falta del seed de arriba.

### Summary
Sprint 26 cerró su alcance completo —Must, Should y Nice-to-Have— más cuatro mejoras de UX de playtest no planeadas, todo en una sola sesión, con 0 regresiones y 64 tests narrativos nuevos. El producto: Pillar D ("la voz del mundo") es ahora un generador determinista, seguro y testeable, con el approach LLM formalmente **descartado** (no aplazado). El punto débil del sprint —y la acción más importante de cara al 27— es la **ausencia de verificación visual**: dos rediseños de UI se entregaron validados solo por tests porque no existe un usuario/carrera seed para capturar pantallas. Crear ese seed resuelve a la vez la verificación visual y el smell recurrente del `sprint-status.yaml`.
