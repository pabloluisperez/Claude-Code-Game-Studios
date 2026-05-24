# Retrospective: Sprint 02 — Cascade Chains + Match-Sim Foundation

**Period**: 2026-05-19 (single session — same-day delivery, 2nd consecutive sprint)
**Generated**: 2026-05-19
**Sprint Goal**: Implement 8 cascade chain formulas (linear batch C0–C18) and match-sim type foundation, completing the cascade engine core and unlocking the match-simulation pipeline.

---

## Metrics

| Métrica | Planificado | Real | Delta |
|---|---|---|---|
| Stories | 7 Must Have | 7 done | 0 |
| Completion rate | — | 100% Must Have | — |
| Días estimados | 8.25d | ~1 sesión | −7d |
| Bugs encontrados | — | 0 (S1/S2/S3/S4) | — |
| Bugs fixeados (oportunistas) | — | 9 TypeScript implicit-any errors + 1 retro action item | — |
| Should Have completados | 3 (1.5+0.5+1.0d) | 0 | -3d (no necesario por velocity real) |
| Automated tests añadidos | — | +84 tests (143 → 227) | — |
| TODO/FIXME/HACK | 0 | 0 | 0 |

---

## Velocity Trend

| Sprint | Planned | Completed | Rate |
|---|---|---|---|
| Sprint 01 | 5 stories / 8d | 5 / ~1d session | 100% |
| Sprint 02 (current) | 7 Must Have / 8.25d | 7 / ~1d session | 100% Must Have |

**Trend**: Stable — confirmando el patrón del Sprint 01 (agent-pair velocity ~5-8x solo-dev estimate).

**Calibration data point #2**: Sprint 01 (5 stories) y Sprint 02 (7 stories) ambos delivered en 1 sesión. La velocity baseline ahora es estable: **~6 stories/sesión productiva con Pablo activo en review**.

**Sprint 03 estimate adjustment**: Si Sprint 03 puede acomodar ~6 stories en una sesión, los candidatos son: CASCADE-010 + 011 + 012 + 013 (resto de cascade chains, ~7.5d estimado solo-dev) — todo en 1-2 sesiones.

---

## What Went Well

1. **Action items del retro Sprint 01 implementados correctamente**: `tsc --noEmit` fue añadido al test script — y **inmediatamente surfaceó 9 errores de TypeScript implícit-any** que esbuild/Vitest silenciaba. Sin este fix, errores reales habrían llegado a producción. Es el caso perfecto de "retro insights → caught bug" en un ciclo.

2. **`tsc --noEmit` capturó 9 type errors silentes**: Los inline arrow functions en cascade-graph.ts (`transferFn: (prevState) => ...`) tenían tipos implícitos `any` aunque el `CascadeEdgeDef` interface declaraba la firma. TypeScript contextual typing no inferió desde el `Object.freeze([...]) as readonly CascadeEdgeDef[]`. Detección temprana ahorró un debugging molesto futuro.

3. **`MatchSessionSnapshot` shape evolutiva**: El agent extendió el shape del story scope mínimo con todos los campos de ADR-013 (yellowCardsByPlayerId, currentFormation, timeoutJobId). El reviewer detectó esto y lo validó como decisión correcta — más completo es mejor cuando refleja el ADR.

4. **Patrón `{ ctx, rng }` para PRNG stateful**: La decisión de retornar `{ ctx, rng }` en `createMatchSimContext` (en vez de solo `ctx`) preserva el `SimContext` interface intacto Y expone el raw PRNG para serialización. Solución elegante para un problema real (closure-over-rng descarta el state).

5. **AC #9 deviation gestionada con criterio**: El story-008 AC #9 decía "≈-10.5 ±0.5" pero la math determinística da -9.984. El agent identificó la discrepancia, documentó la diferencia con comment explicativo, y el test usa el valor preciso. No silenciamos el spec — lo refinamos.

---

## What Went Poorly

1. **El `tsc --noEmit` chore debió ejecutarse PRIMERO en Sprint 02**, no al final: Si los 9 errores implicit-any hubieran sido detectados al inicio del sprint, las stories 006/007/008 habrían usado el patrón correcto desde el inicio. En lugar de eso, las edits durante el sprint propagaron el patrón sin type annotations explícitas, y todas se corrigieron en batch al final. Pérdida de eficiencia: ~5 minutos.

2. **Comment duplicado en MatchOutcome.worldStateDeltas** (caught en code review): El comentario explicando la resolución del conflicto ADR-007 aparecía 2 veces (JSDoc del campo + JSDoc inline). El code review lo capturó; debería haberse evitado en el primer pase.

3. **AC test naming convention drift**: Tests en match-sim usaban `test_emergency_gk_*` y `test_match_event_emitter_can_be_implemented_*` — falta el prefijo `[system]`. El code review lo capturó, pero un linter rule lo automatizaría.

---

## Blockers Encountered

| Blocker | Duración | Resolución | Prevención |
|---|---|---|---|
| `tsc --noEmit` surfaceó 9 type errors al final del sprint | ~10 min | Anotación explícita `Readonly<WorldState>` y `SimContext` en 7 transferFn arrows | Aplicar `tsc --noEmit` como pre-commit hook (no solo en npm test) |
| Story-008 AC #9 numérico discrepante | ~5 min | Test usa valor preciso (-9.984) con comment explicativo | En `/story-readiness`, validar matemáticas de ACs cuantitativos |

---

## Estimation Accuracy

| Story | Estimado | Real (aprox) | Varianza | Causa |
|---|---|---|---|---|
| 002-01 ADR-003 update | 0.5d | ~5 min | −99% | Doc edit puro |
| 002-02 tsc --noEmit | 0.25d | ~10 min (con type fixes) | −94% | El script en sí es 1 línea; los type fixes añadieron tiempo |
| CASCADE-006 | 2.0d | ~2h | −87% | Patrón establecido en Sprint 01 |
| CASCADE-007 | 1.5d | ~1.5h | −85% | Noise pattern reutilizable |
| CASCADE-008 | 2.0d | ~2.5h | −85% | Más compleja (C10 multiplier + Rule 3 critical test) |
| MATCH-SIM-001 | 1.0d | ~1.5h | −80% | Sólo tipos; voluminoso pero mecánico |
| MATCH-SIM-002 | 1.0d | ~2h | −75% | seedrandom gotcha + design decision sobre `{ctx, rng}` |

**Overall**: Sprint 02 confirma el patrón Sprint 01 — estimados solo-dev son 5-8x mayores que el throughput agent-pair real.

**Recomendación firme para Sprint 03**: Usar "horas de sesión activa de Pablo" (review + decisión) como unidad de capacity planning, no days. Sprint 03 con ~6-8 stories realistas en 1-2 sesiones.

---

## Carryover Analysis

Ninguno. 7/7 Must Have done. Las Should Have (CASCADE-009, MATCH-SIM-003, MATCH-SIM-004) se difirieron a Sprint 03 sin haber sido empezadas — decisión correcta dada la velocity.

---

## Technical Debt Status

- TODOs en src/: **0**
- FIXMEs en src/: **0**
- HACKs en src/: **0**
- TODOs en tests: **1** (`test_match_outcome_events_excludes_substitution_window` — strengthen when outcome construction function exists, story 005+)
- Trend: Limpio. El único TODO es intencional y traceable a una story futura.

---

## Previous Action Items (Sprint 01 → Sprint 02)

| Action Item | Status | Notes |
|---|---|---|
| Commit Sprint 01 work | ✅ Done | 3 commits + push antes de empezar Sprint 02 |
| Update ADR-003 | ✅ Done | 002-01 — fromNode/toNode, transferFn(prevState, ctx) signature, guardFn, counterintuitive |
| Add `tsc --noEmit` to test script | ✅ Done | 002-02 — detected 9 implicit-any errors in cascade-graph.ts |
| Recalibrate velocity baseline | ✅ Done (in this retro) | Sprint 02 confirms ~6 stories/sesión |
| Fix test path convention in `/create-stories` | ⏳ Pending | Baja prioridad; los stories actuales documentan el path correcto en QA Test Cases |

---

## Action Items for Sprint 03

| # | Action | Priority | Deadline |
|---|---|---|---|
| 1 | **Commit + push Sprint 02 work** antes de empezar Sprint 03 | ALTA | Antes de `/sprint-plan new` |
| 2 | **Pre-commit hook**: añadir `tsc --noEmit` como pre-commit hook (no solo en npm test) para capturar type holes al commit | MEDIA | Sprint 03 Day 1 |
| 3 | **ADR-007 sync chore**: amendar ADR-007 para usar `Record<string, number>` (matchea control-manifest y la implementación) | MEDIA | Sprint 03 Day 1 (o agendar para Sprint 04) |
| 4 | **`/create-stories` skill**: validar que las stories generadas embeben `packages/shared/tests/[system]/` no `tests/unit/[system]/` | BAJA | Sprint 03 backlog |

---

## Process Improvements

1. **Configurar git pre-commit hook con `tsc --noEmit`**: El test script tiene `tsc --noEmit`, pero un developer puede hacer commit sin ejecutar tests. Pre-commit hook forzaría la verificación.

2. **Considerar `eslint` con `@typescript-eslint/no-implicit-any-catch` y reglas similares** para capturar implicit any en arrow functions inline antes de llegar a `tsc --noEmit`.

3. **Linter rule para test naming convention** (`test_[system]_[scenario]_[expected]`): los nombres derivativos son detectables. Bajo prioridad pero mejoraría code review.

---

## Summary

Sprint 02 fue otro success completo: 7/7 Must Have done, 227 tests, cero bugs. El highlight más valioso fue la captura de 9 type errors silentes por `tsc --noEmit` — exactly el bug que el retro de Sprint 01 había predicho. Los retros funcionan cuando los action items se ejecutan.

La velocity se ha estabilizado: ~6 stories por sesión productiva. Sprint 03 debería planificarse a esa escala (no a la del estimado solo-dev). Los próximos candidatos lógicos son cascade chains 010-013 (~7.5d solo-dev = 1-2 sesiones agent-pair).
