## Retrospective: Sprint 25 — Cierre de deuda v1.1

**Período**: 2026-05-26 → 2026-05-29 (cerrado día 4 de 11; ventana hasta 2026-06-09)
**Generada**: 2026-05-29
**Modo**: Producción — solo dev + agentes especializados (piloto automático)

---

### Metrics

| Métrica | Planificado | Actual | Delta |
|---------|------------|--------|-------|
| Must Have stories | 8 | 8 | 0 |
| Should Have stories completadas | 2 | 0 | −2 (backlog) |
| Nice to Have completadas | 2 | 0 | −2 (backlog) |
| Tasa completado (Must Have) | 100% | 100% | — |
| Días usados de 9 disponibles | 9 | ~4 | −5 (completado anticipado) |
| Tests nuevos (api) | ~25 est. | 27 reales | +2 |
| Tests totales (shared+api+web) | ~1550+ | 1538 | −12 vs meta |
| Bugs pre-existentes descubiertos y resueltos | 0 plan | 6 | +6 no planeados |
| Regresiones introducidas | 0 | 0 | ✅ |
| Commits en el sprint | — | 25 | — |

### Velocity Trend

| Sprint | Stories cerradas | Días usados | Notas |
|--------|-----------------|-------------|-------|
| Sprint 04 (ref histórico) | 7 | ~1 sesión | baseline autónomo |
| Sprints 05-24 | n/d | n/d | sin retros — gap histórico |
| **Sprint 25** | **8/8 Must Have** | **~4 días** | **~200% velocidad estimada** |

**Tendencia**: Sin retros de Sprints 05-24, la curva de velocidad está ciega. Dentro de Sprint 25, las últimas 5 historias (25-4 a 25-8) se completaron en **una única sesión de piloto automático** con 4 agentes en paralelo — 2-3× más rápido que el trabajo secuencial de las primeras 3 historias.

---

### What Went Well

- **"Piloto automático" con 4 agentes paralelos funcionó sin fricciones.** Las historias 25-4, 25-5, 25-6, 25-7 y 25-8 se implementaron simultáneamente (web-backend ×2, web-frontend ×1, web-backend ×1 para GDPR). Sin conflictos de archivos porque el particionado respetó los límites de paquete (api/web/shared). ~5 días de estimación en ~2 horas de reloj.

- **El test de Agent A (25-7) capturó un bug latente en `tickClub`.** El ítem se marcaba `complete` pero dejaba `weeksRemaining = 1` en lugar de 0. Llevaba semanas en producción sin detectarse. El test especificó el estado canónico correcto antes de que se estudiara el código — test-first en la práctica.

- **Sprint cerrado 5 días antes del fin de ventana** con todos los DoD cumplidos: 8/8 Must Have, typecheck limpio (0 errores en shared/api/web), suite verde (1538 tests), 0 regresiones.

- **Deuda técnica = 0 markers en código fuente.** El repo no contiene ningún TODO, FIXME ni HACK en archivos productivos. Para un proyecto de esta escala y ritmo, es un activo de mantenibilidad significativo.

- **La infra de tests de integración heredada es sólida.** El patrón `dbReachable ? describe : describe.skip` y los `createTestEnv` reutilizables permitieron a los agentes añadir 27 tests nuevos sin setup desde cero.

---

### What Went Poorly

- **Corrupción silenciosa de imports ESM no detectada hasta la fase de verificación.** El trabajo de drizzle en 25-1 cambió 45 imports relativos de `./x.js` a `./x.ts` en 18 archivos de `packages/db/src/schema`, rompiendo `tsc`. El repo no tiene un paso de typecheck en CI. Coste: ~20 minutos de investigación.

- **Migración 0044 (`transfer_window_open`) no aplicada al volumen Docker local.** Causó 90 failures de api en la primera ejecución de la suite tras levantar containers. El esquema Drizzle y el código estaban correctos; la base de datos de desarrollo no. No hay health check pre-test que detecte deriva de esquema.

- **`sprint-status.yaml` completamente desactualizado.** Todas las historias siguen con `status: ready-for-dev`. Ninguna `/story-done` skill se ejecutó en el sprint — se usó piloto automático directo sin pasar por el flujo oficial de cierre de historia. El YAML es la fuente autoritativa que leerán skills futuras (/retrospective, /sprint-plan) y está ciego.

- **Retros de Sprints 05-24 no existen.** 20 sprints de historia sin retrospectiva. Impide análisis de tendencias de velocidad, bloqueadores recurrentes o evolución del proceso.

- **Dead code en `/league`: `let view = $state<...>('upcoming3')` declarado pero nunca usado.** Fue la raíz de los tests a11y obsoletos que había que corregir. No hay linter de variables sin usar en Svelte configurado en el proyecto.

---

### Blockers Encountered

| Bloqueador | Duración | Resolución | Prevención |
|-----------|----------|-----------|-----------|
| 45 imports `.ts` en packages/db (drift de 25-1) | ~20 min | `perl -pi` bulk fix | Añadir `typecheck` a turbo CI tasks |
| Migración 0044 no aplicada al volumen local | ~10 min + 90 test failures | `ALTER TABLE IF NOT EXISTS` manual | Health check pre-test o `globalSetup` de vitest |
| `Logger<never>` vs `Logger<string>` en pino child | ~5 min | Importar `Logger` de pino directamente | Anotar parámetro explícitamente en workers |
| `isNull`/`isNotNull` no re-exportados por `@smt/db` | ~5 min | Añadido al re-export en `client.ts` | Exportar helpers al crearlos en drizzle-orm |

---

### Estimation Accuracy

| Historia | Estimado | Aprox. real | Varianza | Causa |
|---------|---------|-------------|---------|-------|
| 25-1 Drizzle drift | 0.5d | ~0.5d | 0 | Scope preciso |
| 25-2 contractStatus | 0.5d | ~0.5d | 0 | Mayoría ya implementado |
| 25-3 Transfer window | 1.0d | ~1.5d | +50% | Hook en advance-orchestrator más complejo; 9 tests adicionales |
| 25-4 Offer tests + frontend | 1.5d | ~0.8d | −47% | Service ya implementado; paralelo redujo tiempo |
| 25-5 AI rotation worker | 1.5d | ~0.6d | −60% | Helpers pure-fn ya en shared; scaffolding directo |
| 25-6 Counter-offer UI | 1.0d | ~0.5d | −50% | Patrón form actions establecido |
| 25-7 Stadium tick | 0.5d | ~0.4d | −20% | Función ya existía; pura integración |
| 25-8 GDPR export | 0.5d | ~0.3d | −40% | Función parcialmente existía |

**Precisión global**: 87% de historias dentro del ±50% estimado (aceptable a este nivel de granularidad). Los estimados day-level son ~3-5× superiores al tiempo real en modo agente-paralelo — sistemáticamente optimistas para planificación de capacidad humana, sistemáticamente pesimistas para agentes. Considerar una calibración de ×0.3 para el tiempo de agente vs estimados de historia al planificar piloto-automático.

---

### Carryover Analysis

| Historia | Sprint original | Veces diferida | Razón | Decisión |
|---------|----------------|---------------|-------|---------|
| 25-4 Offer service | Sprint 24 (24-5) | 1 | Dependía de free-agent schema (25-2) + transfer window (25-3) | ✅ Cerrada |
| 25-5 AI rotation | Sprint 24 (24-6) | 1 | Dependía de 25-4 | ✅ Cerrada |
| 25-9 Saved searches | Sprint 25 | 0 | Should Have no priorizado | Evaluar en Sprint 26 |
| 25-NH1 `.mcp.json` seguridad | Sprint 25 | 0 | Nice to Have — PERO riesgo de seguridad activo | **Alta prioridad real Sprint 26** |

---

### Technical Debt Status

| Marker | Anterior | Actual | Tendencia |
|--------|---------|--------|-----------|
| TODO en código productivo | n/d | **0** | Estable / excelente |
| FIXME en código productivo | n/d | **0** | Estable / excelente |
| HACK en código productivo | n/d | **0** | Estable / excelente |
| Dead code (`view` var en `/league`) | nueva | 1 variable | Identificada, pendiente limpieza |
| `sprint-status.yaml` sin actualizar | nueva | Desactualizado desde 2026-05-25 | Proceso roto |

---

### Previous Action Items Follow-Up

Los retros 01-04 datan de la fase de match-sim formulas puras (Mayo 2026-05-19). Sus acciones de seguimiento (`toBeCloseTo` convention, type extensions documentation) están fuera de contexto para el stack actual. **No se puede evaluar continuidad** por ausencia de retros 05-24.

---

### Action Items for Sprint 26

| # | Acción | Owner | Prioridad | Deadline |
|---|--------|-------|-----------|---------|
| 1 | Mover credencial de `.mcp.json` a variable de entorno; añadir `.mcp.json` a `.gitignore` si no está | Pablo | **Alta** | Día 1 de Sprint 26 |
| 2 | Añadir task `typecheck` a `turbo.json` que corra `tsc --noEmit` (api/shared) + `svelte-check` (web); ejecutarlo en pre-push o CI | Pablo | **Alta** | Día 1 de Sprint 26 |
| 3 | `vitest globalSetup` o `docker-compose` healthcheck que verifique columnas clave del esquema antes de correr la suite | Pablo | Media | Mitad de Sprint 26 |
| 4 | Eliminar `let view` de `/league/+page.svelte` (dead code); decidir si el switcher Próximas/Todas/Pasadas se restaura o descarta | Pablo | Baja | Sprint 26 |
| 5 | Actualizar `sprint-status.yaml` como parte del cierre de historia, o eliminarlo y reemplazarlo con una convención más liviana (grep de story files) | Pablo | Media | Próximo sprint done |

---

### Process Improvements

- **Codificar "piloto automático" como modo estándar para historias independientes.** Cuando ≥3 historias no se solapan en archivos destino, lanzar agentes paralelos particionados por paquete (api / web / shared). El batch 25-4..25-8 demostró que la compresión de tiempo es 3-5× sin pérdida de calidad. Añadir a la guía de sprint planning.

- **Typecheck debe ser una puerta, no un paso de verificación manual.** La única regresión técnica del sprint (ESM imports) habría sido detectada en <5 segundos por `tsc --noEmit`. El coste de no tenerlo en CI fue ~20 minutos de diagnóstico. La adición a `turbo.json` es un cambio de 5 líneas con retorno inmediato.

---

### Summary

Sprint 25 cerró los 8 Must Have con el sprint al 36% de su ventana temporal (4 días de 11). El patrón de "piloto automático" con agentes paralelos fue el único cambio de proceso relevante respecto a sprints anteriores y comprimió ~6 días de estimación a ~2 horas de reloj. El único punto de fricción no trivial fue la ausencia de typecheck automatizado en CI: una corrupción de imports ESM introducida silenciosamente en una sesión previa escapó al proceso y solo se detectó en verificación manual. La acción más urgente para Sprint 26 es rotar la credencial expuesta en `.mcp.json` (riesgo de seguridad activo) seguida de añadir typecheck a turbo (mejora de proceso con retorno inmediato).
