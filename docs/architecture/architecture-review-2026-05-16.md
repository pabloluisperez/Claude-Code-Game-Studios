# Architecture Review — Cascada FC (run 2)

**Fecha**: 2026-05-16 (re-run, post ADR-008..012)
**Stack**: Web (TypeScript full-stack monorepo) — SvelteKit 2 + Svelte 5 + Hono 4 + Drizzle 0.36+ + Socket.IO 4 + PixiJS 8 + BullMQ 5
**GDDs revisados**: 1 (`design/gdd/game-concept.md`)
**ADRs revisados**: 12 (ADR-001..ADR-012)
**Status lifecycle al final del review**: ADR-001..012 todos **Accepted** (tras aplicar fixes §4)
**Verdict**: 🟡 **CONCERNS** (en el momento del análisis) → ✅ **PASS efectivo** tras aplicar las 3 ediciones de §4 en este mismo turno.

> **Contexto**: Este es el segundo `/architecture-review` del día. El primer run (cuya copia previa de este archivo se ha sobrescrito) terminó con CONCERNS por 5 ADR gaps. Tras escribir ADR-008..012 y aplicar los fixes §2.1/§2.2 del run anterior, este run valida la espina ADR completa y aplica el contract-drift cleanup que faltaba antes de mover los nuevos ADRs a Accepted.

---

## 1. Cambios vs. run 1

| Item | Run 1 | Run 2 (este) |
|------|-------|--------------|
| Gaps arquitectónicos | 5 (ADR-008..012) | **0** ✅ |
| ADR-007 bugs (Map iter, doble `winner`) | 2 | **0** ✅ |
| ADR Status (002..007) | Proposed | **Accepted** ✅ |
| ADR Status (008..012) | — | **Accepted** ✅ (aplicado este turno) |
| Contract drift (TickResult, CalendarEventType) | — | **Resuelto** ✅ (aplicado este turno) |
| Conflictos severos | 0 | **0** ✅ |
| `consistency-failures.md` | Not found | Not found (sin entradas que añadir) |
| `architecture.md` | Not found | Not found (esperado pre-create-architecture) |

---

## 2. Traceability Summary

Por estar aún en fase Concept (sin GDDs por sistema), los TRs siguen siendo concept-level (~32 del `game-concept.md`).

| Estado | Conteo | Δ vs run 1 |
|--------|--------|------------|
| ✅ Covered | 24 | +9 (5 ADRs nuevos cierran gaps; 4 partials promovidos a covered tras leer las nuevas ADRs) |
| ⚠️ Partial | 6 | −2 |
| ❌ Gap | 2 (formulas economy + balance content — GDD-level, no arquitectónico) | −9 |

### 2.1 Coverage por sistema

| Sistema (slug) | ADR(s) | Estado |
|----------------|--------|--------|
| Web stack / browser-first / MMO-ready | ADR-001 | ✅ |
| Match simulation (determinista) | ADR-002 + ADR-007 | ✅ |
| Cascade engine (topología, ciclos, delays, data-driven) | ADR-003 | ✅ |
| fan_momentum (variable raíz, histéresis) | ADR-003 | ✅ |
| Narrative AI (llama.cpp + fallback + validation) | ADR-004 | ✅ (spike OQ1 pendiente) |
| WorldState persistence | ADR-005 | ✅ |
| Isometric rendering (PixiJS 8) | ADR-006 | ✅ (mobile spike TR3 pendiente) |
| Sport-agnostic plugin | ADR-007 | ✅ |
| **Event system / world clock / skip-por-eventos** | **ADR-008** | **✅ NUEVO** |
| **Staff message routing & granularidad** | **ADR-009** | **✅ NUEVO** |
| **Manager-RPG progression model** | **ADR-010** | **✅ NUEVO** |
| **League / competition schema** | **ADR-011** | **✅ NUEVO** |
| **UI architecture (DOM↔Canvas)** | **ADR-012** | **✅ NUEVO** |
| **P1↔P3 resolution (cascadas via crecimiento)** | **ADR-010 + ADR-009** | **✅ resuelto arquitectónicamente** |
| Economy (formulas, quiebra) | ADR-003 (partial) | ⚠️ formulas → GDD economy.md |
| city-progression (tiers, criterios) | ADR-006 | ✅ |

**Highlight estructural**: la tensión central de diseño del concept doc (Pilar 1 ↔ Pilar 3: opacidad de cascadas vs. crecimiento del manager) está resuelta **mecánicamente**:

```
Manager reputation.level → getMaxHirableStaffQuality() → qualityTier
                                                              ↓
                                                StaffPerceptionConfig.baseThresholdPct × qualityFactor
                                                              ↓
                                                Threshold de percepción de cambios de WorldState
                                                              ↓
                                                Templates de mensaje (más específicos a tier 3)
```

La UI nunca expone fórmulas. La visibilidad de cascadas crece sólo si el manager crece. Es una resolución limpia y testeable.

---

## 3. Cross-ADR Coherence

**Conflictos severos**: **0**. Los ADRs 008-012 están explícitamente acoplados vía Depends On / Enables / Blocks. Ejemplos de acoplamiento limpio:

- **ADR-008 ↔ ADR-009**: `staffMessagesQueue.add()` se enfila al final de `advance()` **después** del DB commit — explícito en ambos ADRs.
- **ADR-008 ↔ ADR-010**: ADR-010 inserta `manager_level_up` calendar events **dentro** de la transacción de advance — mismo modelo de eventos, mismo transaction scope.
- **ADR-009 ↔ ADR-010**: contrato `getMaxHirableStaffQuality(reputationLevel) → qualityTier` definido en ADR-010 (función pura), consumido por `StaffPerceptionConfig.qualityTier` de ADR-009.
- **ADR-011 ↔ ADR-007 ↔ ADR-008**: fixtures pre-genera `calendar_events(type='match')` con `metadata.fixtureId`; SportPlugin.simulateMatch consume el fixture; standings se actualiza dentro de la transacción advance.
- **ADR-012 ↔ ADR-006**: ADR-012 reusa el patrón `$state.raw<Application>` y el destroy API v8 ya establecidos por ADR-006.

### 3.1 Asimetría intencional (no conflicto)

ADR-009 usa BullMQ async (template rendering + Socket.IO push); ADR-010 usa **inline** synchronous en `advance()` (XP es O(15) operaciones). La asimetría está justificada en ADR-010 §Alternatives Considered #3: "BullMQ es para I/O-bound; XP es CPU-bound microsegundo-scale". Coherente.

### 3.2 Hallazgos menores (no-bloqueantes)

| # | Hallazgo | Severidad | Acción |
|---|----------|-----------|--------|
| 3.2a | Catálogo central de NodeIds del WorldState sigue disperso entre ADRs (igual que run 1 §2.3). ADR-008 thresholds, ADR-009 template keys, ADR-007 deltas dependen del catálogo final. | MEDIA | Resuelve al escribir `cascade-engine.md` GDD (Foundation #1) |
| 3.2b | RAM budget 256MB (technical-preferences.md) vs llama-server (~5GB en ADR-004) — sin breakdown por proceso. | BAJA | Update `technical-preferences.md` con breakdown |
| 3.2c | `SNAPSHOT_RETENTION_WEEKS = 8` en ADR-005 — replay window limitado vs promesa ADR-002. | BAJA | Documentar tradeoff o subir cap a temporada actual |
| 3.2d | `clubs.colors` jsonb (ADR-011) tiene atributos UI en tabla de dominio. | MUY BAJA | Aceptable; colors son identidad del club, no presentación |
| 3.2e | Performance budget tight: N=4 ticks @ ~80ms + DB tx + XP + standings vs API budget <200ms. | BAJA | ADR-008 R1 limita N vía STOP at match cada ~1-2 semanas |
| 3.2f | In-process worker constraint ADR-009: el `io` import directo rompe en multi-process. | BAJA | Documentado con startup guard; sólo relevante post-MVP |

---

## 4. Contract Drift — Ediciones aplicadas en este run

### 4.1 ✅ APLICADO — ADR-003 `TickResult` extendido

ADR-008 declaraba en sus Negative Consequences que "ADR-003 must be updated with `thresholdCrossings: ThresholdCrossing[]` before implementation begins". Edit aplicado a `docs/architecture/ADR-003-cascade-graph-topology.md`:

```typescript
// Antes:
export interface TickResult {
  nextState: WorldState;
  newDelayedEffects: readonly ScheduledEffect[];
  log: readonly CascadeLog[];
}

// Después (líneas 186-192):
export interface TickResult {
  nextState: WorldState;
  newDelayedEffects: readonly ScheduledEffect[];
  log: readonly CascadeLog[];
  thresholdCrossings: readonly ThresholdCrossing[]; // ADR-008
}
```

Añadida también la interfaz `ThresholdCrossing` (documentación, single source of truth sigue en `packages/shared/src/types/game-clock.ts` per ADR-008).

### 4.2 ✅ APLICADO — ADR-008 `CalendarEventType` extendido

ADR-010 declaraba que "`'manager_level_up'` is added to the `CalendarEventType` union defined in ADR-008. This is an additive change." Edit aplicado a `docs/architecture/ADR-008-world-clock-event-loop.md` líneas 130-139:

```typescript
export type CalendarEventType =
  | 'match' | 'transfer_window_open' | 'transfer_window_close'
  | 'end_of_month' | 'board_meeting' | 'season_end'
  | 'dynamic'
  | 'manager_level_up';   // additive extension by ADR-010
```

ADR-010 requiere `assertNever` audit en `switch` sites como precondición de implementación — esta tarea queda pendiente para fase de implementación (no es bloqueante para mover el ADR a Accepted).

### 4.3 ✅ APLICADO — Status lifecycle

ADR-008 → ADR-011 → ADR-009 → ADR-010 → ADR-012 movidos de `Proposed` a `Accepted` (orden topológico de Depends On). `systems-index.md` actualizado consecuentemente. Stories que referencien estos ADRs ya no quedan auto-bloqueadas por el template de `/architecture-decision`.

---

## 5. ADR Dependency Order

```
ADR-001 (Accepted) ── Foundation: Web Stack
   │
   ├─► ADR-002 (Accepted) ── Determinism
   │      │
   │      ├─► ADR-003 (Accepted, revised TickResult) ── Cascade topology
   │      │      │
   │      │      └─► ADR-005 (Accepted) ── WorldState persistence
   │      │              │
   │      │              ├─► ADR-006 (Accepted) ── Isometric rendering
   │      │              │      │
   │      │              │      └─► ADR-012 (Accepted) ── UI Architecture
   │      │              │
   │      │              ├─► ADR-007 (Accepted) ── Sport plugin
   │      │              │      │
   │      │              │      └─► ADR-011 (Accepted) ── League schema ──┐
   │      │              │                                                  │
   │      │              └─► ADR-008 (Accepted) ── World Clock ─────────────┤
   │      │                      │                                          │
   │      │                      ├─► ADR-009 (Accepted) ── Staff Messages   │
   │      │                      │      │                                   │
   │      │                      │      └─► ADR-010 (Accepted) ── RPG ──────┤
   │      │                      │                                          │
   │      │                      └─► ADR-012 (already above) ───────────────┘
   │
   └─► ADR-004 (Accepted) ── Narrative AI (depende solo de 001)
```

**Ciclos detectados**: ninguno ✅. Verificación: aunque ADR-009 y ADR-010 se referencian mutuamente vía contratos puros (`getMaxHirableStaffQuality()` exportado por ADR-010, consumido por ADR-009), las dependencias formales `Depends On` van 009→008 y 010→{008,009}, sin retorno.

---

## 6. Engine Compatibility Audit

Engine: **Web stack** (pinned 2026-05-15). 12/12 ADRs auditados.

| Check | Resultado |
|-------|-----------|
| Version consistency con `VERSION.md` | ✅ Svelte 5, PixiJS 8, Hono 4, Drizzle 0.36+, BullMQ 5, Socket.IO 4, PG16 — todos alineados |
| Engine Compatibility section presente | ✅ ADRs 002-012 incluyen la sección formal · ADR-001 usa "Post-Cutoff Knowledge Gaps" como equivalente (no bloqueante) |
| Post-Cutoff APIs documentados | ✅ ADR-010 (`$onUpdate`), ADR-011 (`unique().on()`), ADR-012 (Svelte 5 runes completas), ADR-006 (PixiJS 8 destroy single-options-object) |
| Deprecated API references | ✅ Ninguna detectada |

### 6.1 Patrones verificados en los nuevos ADRs

- **ADR-008**: BullMQ NO usado para tick (correcto, reservado para AI); `db.transaction` Drizzle pattern ✓; pgTable con jsonb metadata ✓; partial index documentado como custom-indexes.sql ✓.
- **ADR-009**: Worker import `io` directo dentro del mismo proceso ✓ con startup guard explícito; `satisfies StaffMessagesReadyEvent` ✓; partial index también vía custom-indexes.sql.
- **ADR-010**: `.$onUpdate(() => new Date())` Drizzle 0.36+ pattern ✓; `.unique()` columna referenced ✓; `assertNever` exhaustiveness audit documentado como pre-implementación ✓.
- **ADR-011**: `unique().on(...)` composite UNIQUE ✓; `relationName: 'homeFixtures'`/`'awayFixtures'` para self-join `clubs ↔ fixtures` (dos FKs al mismo target table) ✓.
- **ADR-012**: `$state.raw<Application>()` para PixiJS ✓; `onMount` síncrono con `.then()` cleanup ✓ (gotcha post-cutoff documentado); `$effect` con guarded double-fire ✓; dynamic import `await import('pixi.js')` para code-splitting ✓; `100dvh` para mobile Safari ✓.

### 6.2 Engine Specialist Consultation

**Omitida en este run** — los ADRs 008-012 fueron escritos vía `/architecture-decision` que ya ruta a especialistas en authoring time. La consulta secundaria es opcional. Si quieres validación adicional, spawnar `web-specialist` con foco en ADR-009 (Socket.IO + BullMQ + worker process boundary) y ADR-012 (Svelte 5 runes ↔ PixiJS 8 bridge).

---

## 7. GDD Revision Flags

**Ninguno**. `game-concept.md` sigue siendo coherente con todos los 12 ADRs. Los pendientes técnicos (TR1 llama spike, TR3 mobile PWA spike) ya están reconocidos en el concept doc; los ADR-004 y ADR-006 los referencian explícitamente.

---

## 8. Architecture Document Coverage

`docs/architecture/architecture.md` **no existe**. No bloqueante en Concept — el master architecture doc se construye con `/create-architecture` post Systems Design gate.

---

## 9. Verdict: 🟡 CONCERNS → ✅ PASS efectivo

El verdict formal del análisis es CONCERNS (3 items pendientes detectados: §4.1, §4.2, status lifecycle). Las tres ediciones fueron aprobadas y aplicadas en el mismo turno del review, por lo que el estado efectivo post-edits es PASS:

**Razones para PASS efectivo**:
- ✅ Cero gaps arquitectónicos (era 5 en run 1)
- ✅ Cero conflictos severos
- ✅ Los 5 ADRs nuevos están explícitamente acoplados vía Depends On / Enables / Blocks
- ✅ Pilar 1↔Pilar 3 resuelto arquitectónicamente — la pieza más conceptualmente importante del concept doc
- ✅ ADR-003 TickResult extendido con `thresholdCrossings` (§4.1)
- ✅ ADR-008 CalendarEventType extendido con `'manager_level_up'` (§4.2)
- ✅ Los 5 nuevos ADRs en Accepted (§4.3) — stories ya no se auto-bloquean

**Advisory (no bloqueante, post-gate)**:
- Crear `docs/consistency-failures.md` para registrar lecciones (template lo espera append-only)
- Update `technical-preferences.md` con RAM budget breakdown por proceso
- Considerar subir SNAPSHOT_RETENTION_WEEKS o documentar el tradeoff
- `assertNever` audit pre-implementación (ADR-010)
- Spikes pendientes: TR1 (llama.cpp coste real) y TR3 (PixiJS mobile)

---

## 10. Required Next Steps

### Inmediato (post-review, este turno completó la lista crítica)

1. ✅ ADR-003 TickResult edit — DONE
2. ✅ ADR-008 CalendarEventType edit — DONE
3. ✅ ADR-008..012 → Accepted — DONE
4. ✅ systems-index.md actualizado — DONE

### Próximo paso recomendado

```
/gate-check pre-production
```

> Pre-gate checklist (verifico abajo qué falta antes de poder pasar el gate):
> - `tests/unit/` y `tests/integration/` — ❓ run `/test-setup` si no existen
> - `.github/workflows/tests.yml` — ❓ run `/test-setup` si no existe
> - `design/ux/accessibility-requirements.md` — ❌ falta → `/ux-design`
> - `design/ux/interaction-patterns.md` — ❌ falta → `/ux-design`

(Tu siguiente turno verá el resultado del checklist; estoy listo para correr `/test-setup` o `/ux-design` si lo pides.)

### Tras gate-check PASS

```
/art-bible                    # paralelo — concern AD pendiente
/design-system cascade-engine # primer GDD Foundation (NodeId catalog central)
```

---

## 11. Re-run Trigger

Re-ejecutar `/architecture-review` después de:
- El primer system GDD escrito (`cascade-engine.md`) → produce TRs reales que pueblan `tr-registry.yaml`
- Cualquier ADR nuevo subsiguiente
- Cualquier revisión significativa de `game-concept.md`
