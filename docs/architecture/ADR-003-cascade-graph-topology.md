# ADR-003: Topología del Grafo de Cascadas

## Status
Accepted

## Date
2026-05-16 (accepted 2026-05-16 after /architecture-review)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Simulation |
| **Knowledge Risk** | LOW — algoritmos de grafo en TypeScript puro, sin APIs de engine |
| **References Consulted** | `docs/engine-reference/web/modules/web-game-patterns.md` §Deterministic Simulation, `docs/engine-reference/web/modules/backend.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Test con grafo cíclico (fan_momentum loop): verificar que la evaluación no diverge en 100 semanas |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (Determinismo del simulador — establece SimContext como parámetro y el patrón pure function) |
| **Enables** | `cascade-engine.md` GDD (ahora puede especificar nodos, edges y fórmulas usando la topología definida aquí) |
| **Blocks** | `cascade-engine.md` GDD — no puede redactarse sin esta topología definida; `economy.md` GDD — depende de cascade-engine |
| **Ordering Note** | ADR-003 Accepted → cascade-engine.md GDD redactado → economy.md GDD redactado |

## Context

### Problem Statement

El motor de cascadas de Cascada FC conecta variables interdependientes (field_quality, fan_momentum, team_fitness, attendance, etc.) mediante relaciones de causa-efecto. Algunas de esas relaciones forman **ciclos**:

```
fan_momentum → attendance_sensitivity → attendance → match_results → fan_momentum
groundskeeper_budget → field_quality → injury_risk → squad_available → match_performance
```

Sin decidir explícitamente cómo se evalúa el grafo, el implementador de `cascade-engine.ts` elegirá una estrategia arbitraria. Si asume DAG (sin ciclos) y el diseño tiene ciclos, el engine es incorrecto por construcción. Si implementa un solver iterativo cuando no hace falta, añade complejidad injustificada. Esta decisión debe tomarse antes de que se redacte ningún GDD que especifique fórmulas de cascada.

### Constraints

- El prototipo validó que los delays multi-semana (groundskeeper → field_quality en 1 semana, scouting → player en 3 semanas) son una feature positiva, no un bug.
- El juego avanza por ticks semanales (semana de partido como unidad fundamental — ADR-001, concept doc).
- El simulador debe ser determinista (ADR-002) y sus funciones puras.
- El grafo debe ser **tuneable sin tocar el engine**: las fórmulas de cascada cambiarán durante el balanceo; no debe requerir refactoring cada vez.
- Solo developer → la complejidad de implementación importa.

### Requirements

- Soporte de ciclos sin divergencia.
- Soporte de delays discretos (1, 2, 3 semanas).
- Las fórmulas de transferencia son datos (tuneable), no código del engine.
- Evaluación determinista dado el mismo estado previo + misma semilla (ADR-002).
- Varios edges pueden contribuir al mismo nodo destino (efectos aditivos).
- El engine no tiene opinión sobre cuántas cascadas existen — se añaden nuevas sin modificar el engine.

## Decision

**Discrete weekly ticks con prev-state reads + grafo data-driven.**

### Modelo de evaluación: Markov-1 semanal

Cada variable `v` tiene un valor para la semana actual `v(t)` y para la semana anterior `v(t-1)`. Durante la evaluación de un tick:

```
Para cada edge (from → to):
  delta = edge.transferFn(prevState[from], prevState[to], ctx)
  nextState[to] += delta   // SIEMPRE aditivo; prevState no se modifica

Para cada delayed_effect en buffer[week=currentWeek]:
  nextState[to] += effect.value

Después de todos los edges:
  Aplicar player_decisions como modificadores directos sobre nextState
  Clamp todos los valores a sus rangos definidos
```

**La regla clave**: `transferFn` siempre lee de `prevState`. Nunca lee de `nextState`. Esto hace que los ciclos sean automáticamente seguros — la salida de un ciclo en el tick N se convierte en input del mismo ciclo en el tick N+1. Sin divergencia, sin solver.

### Modelo de delays

Los delays no son una propiedad de los edges — son modeled as **effects scheduled en el futuro**:

```typescript
// Un edge con delay=0 escribe directamente a nextState (mismo tick)
// Un edge con delay=1 añade un ScheduledEffect que se aplica en el tick siguiente
// Un edge con delay=2 se aplica dos ticks después
```

El engine mantiene un `DelayedEffectsBuffer` — una cola de efectos indexados por número de semana de aplicación. Al inicio de cada tick, los efectos con `applyAt === currentWeek` se aplican a nextState.

### Architecture

```
                 packages/shared/src/sim/
┌────────────────────────────────────────────────────────────┐
│  cascade-graph.ts          cascade-engine.ts               │
│  ─────────────────         ─────────────────               │
│  CascadeNodeDef[]          evaluateTick(                   │
│  CascadeEdgeDef[]    ─────>   ctx: SimContext,             │
│  (DATOS PUROS)              prevState: WorldState,         │
│                              decisions: PlayerDecisions,   │
│                              delayedBuf: DelayedBuffer     │
│                           ): TickResult                    │
└────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
  Configurable                 Algoritmo fijo
  (añadir cascadas            (nunca cambia salvo
   = añadir datos)             bugs o ADR nuevo)
```

### Key Interfaces

```typescript
// packages/shared/src/sim/cascade-types.ts

export type NodeId = string;  // e.g. 'field_quality', 'fan_momentum', 'team_fitness'

// NOTA: Map<NodeId, number> en vez de Record<NodeId, number>.
// Con noUncheckedIndexedAccess:true, Record[key] devuelve number|undefined,
// rompiendo la aritmética en transferFn. Map.get() devuelve number|undefined
// explícitamente — se maneja con el helper getNode().
export type WorldState = Map<NodeId, number>;

/** Helper de acceso seguro — SIEMPRE usar esto en lugar de state.get() desnudo */
export function getNode(state: WorldState, id: NodeId): number {
  const v = state.get(id);
  if (v === undefined) throw new Error(`Cascade node '${id}' not found in WorldState`);
  return v;
}

/** Define una variable del sistema de cascadas */
export interface CascadeNodeDef {
  id: NodeId;
  range: [min: number, max: number];  // típicamente [0, 100]
  default: number;                     // valor en la semana 1 de una nueva partida
}

/** Define una relación causal entre dos variables.
 *
 * REVISIÓN 2026-05-19 (Sprint 02): Field names y firma de `transferFn` actualizadas
 * para reflejar la implementación canónica de CASCADE-ENGINE-002:
 *   - `from` → `fromNode` (primary driver; otros inputs vía `ctx.prevState`)
 *   - `to` → `toNode` (exclusive write target)
 *   - `transferFn(fromValue, toValue, ctx)` → `transferFn(prevState, ctx)` — la
 *     función recibe el WorldState completo (Readonly), no valores individuales.
 *     Esto permite edges multi-input (C8 lee fan_momentum + ticket_price_index;
 *     C4 lee training_intensity + staff_morale para C10 multiplier).
 *   - `delay: number` → `delay: 0 | 1 | 2` (MVP scope; updateable si v1.1+ requiere más).
 *   - Añadido `guardFn?` (opcional) — para hasMatchThisWeek (C11/C14/C16b) y
 *     corruption_exposure < 80 (C18a).
 *   - Añadido `counterintuitive: boolean` — metadata para design-review tooling (7 anchors).
 */
export interface CascadeEdgeDef {
  readonly id: string;                // para debugging y logs (e.g. 'C0', 'C1a', 'C16b')
  readonly fromNode: NodeId;          // primary driver; otros inputs vía ctx.prevState
  readonly toNode: NodeId;            // exclusive write target
  readonly delay: 0 | 1 | 2;          // en semanas (0 = mismo tick, 1+ = futuro)
  /** Optional skip predicate. Returns true to evaluate; false to skip the edge entirely. */
  readonly guardFn?: (prevState: Readonly<WorldState>, ctx: SimContext) => boolean;
  /**
   * Función de transferencia pura — NUNCA llama Math.random() ni Date.now().
   * Recibe `prevState` (read-only) y devuelve el DELTA (no el nuevo valor) a añadir
   * al nodo destino. Multi-input edges leen otros nodos vía `prevState.X`.
   *
   * NOTA: usar `import type { SimContext, WorldState }` por verbatimModuleSyntax:true.
   * NOTA: las funciones NO son JSON-serializable — "data-driven" en este ADR
   * significa configuración en código TypeScript tipado, NO en base de datos.
   * Si en el futuro se necesita persistir el grafo en BD, usar el patrón
   * transferFnId: string + TransferFnRegistry en el módulo de sim.
   *
   * Ejemplos (de las cadenas implementadas en stories 006-008):
   *  C0 (decay):       (prev) => -K_fit_decay * (prev.team_fitness - 70)
   *  C1a (linear):     (prev) => (prev.groundskeeper_budget - 50) * K_ground
   *  C1b (piecewise):  (prev) => { const fq = prev.field_quality; if (fq >= 75) return -6.0; ... }
   *  C2 (noisy):       (prev, ctx) => -K_injury * (prev.injury_risk - IR_base) + (ctx.rng() - 0.5) * NOISE_C2_AMP
   *  C4 (multi-input): (prev, ctx) => { const K_eff = K_C4 * (MORALE_SCALE_MIN + prev.staff_morale/100 * 0.5); ... }
   */
  readonly transferFn: (prevState: Readonly<WorldState>, ctx: SimContext) => number;
  /** True para las 7 cadenas counterintuitive (Core Rule 7): C1b, C4, C6, C8, C12, C15, C18a. */
  readonly counterintuitive: boolean;
}

/** El grafo completo — todos los nodos y edges de cascada del juego */
export interface CascadeGraph {
  nodes: CascadeNodeDef[];
  edges: CascadeEdgeDef[];
}

// packages/shared/src/sim/cascade-engine.ts

export interface ScheduledEffect {
  applyAt: number;    // worldClock week at which to apply
  toNode: NodeId;
  delta: number;
}

// readonly: evita mutación accidental dentro de evaluateTick (pure function guarantee)
export type DelayedEffectsBuffer = readonly ScheduledEffect[];

export interface TickResult {
  nextState: WorldState;
  newDelayedEffects: readonly ScheduledEffect[];  // effects this tick scheduled for future weeks
  log: readonly CascadeLog[];                      // qué edges se activaron y con qué delta
  thresholdCrossings: readonly ThresholdCrossing[]; // nodos que cruzaron umbrales este tick (ADR-008)
}

// ThresholdCrossing type lives in `packages/shared/src/types/game-clock.ts` (defined by ADR-008).
// Replicated here for documentation purposes only — single source of truth is ADR-008.
// (Revised 2026-05-16 per ADR-008 World Clock + Event Loop integration.)
export interface ThresholdCrossing {
  nodeId: NodeId;
  previousValue: number;
  newValue: number;
  direction: 'above' | 'below';
  priority: 'BLOCKING' | 'ADVISORY';
}

export interface CascadeLog {
  edgeId: string;
  fromValue: number;
  delta: number;
  toNode: NodeId;
  appliedAt: number;  // worldClock when applied (may differ from tick if delayed)
}

/**
 * Evalúa un tick semanal del motor de cascadas.
 * PURE FUNCTION: sin side effects, sin I/O, sin Math.random().
 * Determinista dado ctx.seed + prevState + decisions + pendingEffects.
 */
export function evaluateTick(
  ctx: SimContext,
  graph: CascadeGraph,
  prevState: WorldState,
  decisions: PlayerDecisions,
  pendingEffects: DelayedEffectsBuffer
): TickResult;
```

### Pseudocódigo del evaluador

```typescript
function evaluateTick(ctx, graph, prevState, decisions, pendingEffects): TickResult {
  const nextState = { ...prevState };
  const newDelayedEffects: ScheduledEffect[] = [];
  const log: CascadeLog[] = [];

  // 1. Aplicar efectos diferidos que vencen esta semana
  for (const effect of pendingEffects) {
    if (effect.applyAt === ctx.worldClock) {
      nextState[effect.toNode] = clamp(
        nextState[effect.toNode] + effect.delta,
        graph.nodes.find(n => n.id === effect.toNode)!.range
      );
    }
  }

  // 2. Evaluar todos los edges del grafo
  for (const edge of graph) {
    // Guard check (opcional): saltar el edge si guardFn retorna false
    if (edge.guardFn && !edge.guardFn(prevState, ctx)) continue;

    // El edge lee `prevState` completo (Readonly). transferFn determina cómo usa fromNode
    // y otros inputs (e.g. C8 lee fan_momentum + ticket_price_index).
    const delta = edge.transferFn(prevState, ctx);

    if (edge.delay === 0) {
      // Efecto inmediato — acumulamos sobre deltaMap (clamp aplica al final, Rule 4)
      deltaMap.set(edge.toNode, (deltaMap.get(edge.toNode) ?? 0) + delta);
    } else {
      // Efecto diferido — va a la cola
      newDelayedEffects.push({
        applyAt: ctx.currentWeek + edge.delay,
        toNode: edge.toNode,
        delta,
        edgeId: edge.id,
      });
    }
    log.push({ source: 'edge', edgeId: edge.id, nodeId: edge.toNode, delta, week: ctx.currentWeek });
  }

  // 3. Aplicar decisiones del jugador (siempre tienen efecto inmediato)
  applyDecisions(nextState, decisions, graph, ctx);

  // 4. Clamp final de todos los nodos
  for (const node of graph.nodes) {
    nextState[node.id] = clamp(nextState[node.id], node.range);
  }

  return {
    nextState,
    newDelayedEffects,
    log,
  };
}
```

### Ejemplo de grafo (formato actualizado — Sprint 02 implementación)

```typescript
// packages/shared/src/sim/cascade-graph.ts — DATOS, no lógica
import type { CascadeEdgeDef, WorldState, SimContext } from './cascade-types';

export const CASCADA_FC_GRAPH: readonly CascadeEdgeDef[] = Object.freeze([
  {
    id: 'C1a',
    fromNode: 'groundskeeper_budget',
    toNode: 'field_quality',
    delay: 1,  // efecto la semana siguiente
    transferFn: (prev: Readonly<WorldState>) =>
      (prev.groundskeeper_budget - 50) * K_ground,
    counterintuitive: false,
  },
  {
    id: 'C1b',
    fromNode: 'field_quality',
    toNode: 'injury_risk',
    delay: 0,
    // CONTRAINTUITIVO (piecewise): campo excelente O catastrófico → menos riesgo;
    // campo mediocre (T_safe_low < fq ≤ T_danger_peak) → MÁS riesgo
    transferFn: (prev: Readonly<WorldState>) => {
      const fq = prev.field_quality;
      if (fq >= T_safe_high)   return -K_safe_high;
      if (fq > T_danger_peak)  return -(fq - T_danger_peak) * K_danger;
      if (fq > T_safe_low)     return (T_danger_peak - fq) * K_danger;
      return -K_safe_low;
    },
    counterintuitive: true,
  },
  {
    id: 'C8',
    fromNode: 'fan_momentum',  // primary driver
    toNode: 'fan_attendance',
    delay: 0,
    // Multi-input: lee ticket_price_index vía ctx.prevState (no es fromNode)
    transferFn: (prev: Readonly<WorldState>, _ctx: SimContext) => {
      const momentum = prev.fan_momentum;
      const price = prev.ticket_price_index; // secondary input
      // ... formula completa en cascade-engine.md §C8
      return (momentum - 50) * 0.6 - (price - 50) * 0.25;
    },
    counterintuitive: true,
  },
    // ... completo en cascade-engine.md GDD
  ],
};
```

## Alternatives Considered

### Alternative B: Iterative Convergence Solver

- **Description**: En cada tick, evaluar todos los edges repetidamente hasta que todos los valores converjan (delta < epsilon entre iteraciones). Dentro de un tick, los ciclos se resuelven simultáneamente.
- **Pros**: Los efectos cíclicos se resuelven "instantáneamente" dentro del tick; más fiel a sistemas físicos continuos.
- **Cons**: Requiere criterio de convergencia (¿epsilon? ¿máx iteraciones?); puede no converger con funciones no lineales; mucho más difícil de debuggear; no necesario para un juego de gestión por semanas donde los efectos diferidos son la feature, no el bug.
- **Rejection Reason**: Overkill para un management game. Los delays multi-semana son correctos y deseables (el prototipo los validó como positivos). La complejidad adicional no aporta mejor experiencia — solo añade un solver que puede divergir.

### Alternative C: Layered Evaluation (Topological Sort + Sub-ticks para ciclos)

- **Description**: Separar el grafo en componentes acíclicas (mediante DFS) y evaluar en orden topológico. Los ciclos identificados se tratan en sub-ticks adicionales.
- **Pros**: Evaluación más precisa para variables sin ciclos; los ciclos están explícitamente aislados.
- **Cons**: Implementación compleja (requiere algoritmo de detección de ciclos + DFS + ordenamiento topológico + tratamiento especial de SCCs); la separación puede ser sorprendente para el diseñador que define edges; más código que mantener.
- **Rejection Reason**: La complejidad no está justificada. El modelo de prev-state resuelve los ciclos de forma elegante y natural sin necesidad de detectarlos explícitamente.

## Consequences

### Positive

- **Ciclos seguros por diseño**: `fan_momentum → attendance → results → fan_momentum` funciona sin configuración especial — el ciclo se propaga semana a semana de forma natural y controlada.
- **Delays como feature narrativa**: Los efectos diferidos (groundskeeper 1 semana, scouting 3 semanas) son ciudadanos de primera clase, no hacks.
- **Graph extensible sin tocar el engine**: añadir una nueva cascada = añadir un objeto a `cascade-graph.ts`. No se toca `cascade-engine.ts`.
- **Debuggable**: el `CascadeLog[]` en TickResult registra exactamente qué edge activó qué delta, en qué tick. Reproduce cualquier estado a partir de seed + decision history.
- **Compatible con ADR-002**: `evaluateTick` es una función pura que acepta `SimContext` como primer parámetro. El log de toda una sesión es reproducible con la misma seed.
- **Compatible con fan_momentum**: la histéresis asimétrica (se gana lento, se pierde rápido) se implementa como una función de transferencia con umbrales — no requiere tratamiento especial del engine.

### Negative

- **Markov-1 únicamente**: el estado de `t-2` o anteriores no es directamente accesible en una función de transferencia sin modelarlo como variable intermedia. Para efectos que dependan de la "racha" (3 victorias consecutivas), habrá que añadir variables de estado explícitas (`consecutive_wins`, etc.).
- **Composición aditiva**: múltiples edges a la misma variable se suman. Si el diseñador espera que un edge "sobrescriba" otro (en lugar de sumarse), producirá sorpresas. Documentar bien en el GDD de cada edge.

### Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Cascada no converge visualmente (oscilación) | BAJO | MEDIO | Si fan_momentum oscila cada semana, reducir el multiplicador. El log permite detectarlo inmediatamente. |
| Efectos aditivos inesperados (dos edges suman más de lo esperado) | MEDIO | BAJO | Tests unitarios por combinación de edges; el log muestra todos los deltas |
| Markov-1 insuficiente para "racha" o "momentum largo" | BAJO | MEDIO | Modelar variables de estado explícitas (`consecutive_wins`, `losing_streak`) como nodos adicionales |
| Edge con `delay=0` y transferFn con varianza alta → oscilación | BAJO | BAJO | Limitar varianza de RNG en transferFn a ±5% del rango de la variable |
| Client preview importa cascade-graph.ts con deps Node-only | MEDIO | MEDIO | El cliente usa `CascadeNodeDef[]`/`CascadeEdgeDef[]` solo para render visual; no invoca `evaluateTick`. Si se necesita preview funcional, crear `SimContextClient` ligero sin RNG completo. |
| `transferFn` no es JSON-serializable | BAJO | BAJO | "Data-driven" = config en TypeScript tipado, no en BD. Si en el futuro se persiste el grafo, usar patrón `transferFnId: string` + `TransferFnRegistry`. |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `cascade-engine.md` (pendiente) | El motor de cascadas debe soportar relaciones cíclicas sin divergencia | Discrete weekly ticks con prev-state reads: ciclos son seguros por diseño |
| `cascade-engine.md` (pendiente) | Los delays multi-semana son una mecánica positiva (prototipo validado) | `DelayedEffectsBuffer` modela delays 1-N semanas como ciudadanos de primera clase |
| `cascade-engine.md` (pendiente) | Añadir nuevas cascadas no debe requerir modificar el engine | Grafo data-driven: nuevas cascadas = nuevos objetos en `cascade-graph.ts` |
| `economy.md` (pendiente) | fan_momentum con histéresis asimétrica modula sensibilidad de ingresos | `fan_momentum` es un nodo del grafo; su función de transferencia implementa la histéresis |
| `match-simulation.md` (pendiente) | La simulación de partido lee variables del mundo (field_quality, squad_available) | Las variables del mundo son nodos del CascadeGraph; `evaluateTick` las expone en WorldState |

## Performance Implications

- **CPU**: O(E) por tick donde E = número de edges. Con 15 cascadas y ≤3 edges por cascada = ~45 evaluaciones por semana. Microsegundos. Totalmente despreciable.
- **Memory**: `WorldState` = Record de N floats. Con 20 variables = ~160 bytes. `DelayedEffectsBuffer` = cola pequeña. Negligible.
- **Load Time**: Sin impacto — `cascade-graph.ts` es un módulo TypeScript estático.
- **Network**: Sin impacto — el grafo se evalúa server-side. Los resultados se envían como WorldState diff vía Socket.IO.

## Migration Plan

El prototipo de la fase Concept implementó cascadas ad-hoc en un solo archivo HTML (código throwaway). No hay código de producción que migrar — todo el código en `packages/shared/src/sim/` comienza desde cero implementando estas interfaces.

El prototipo puede usarse como referencia para calibrar los multiplicadores del `CASCADA_FC_GRAPH`, no para reusar código.

## Validation Criteria

```typescript
// tests/unit/sim/cascade-topology.test.ts

// Test 1: Ciclo fan_momentum no diverge en 100 semanas
it('cyclic fan_momentum graph remains bounded after 100 ticks', () => {
  const ctx = createSimContext('test:cycle:1', 1);
  let state = getDefaultWorldState(CASCADE_FC_GRAPH);
  let pending: DelayedEffectsBuffer = [];

  for (let week = 1; week <= 100; week++) {
    const result = evaluateTick(
      { ...ctx, worldClock: week },
      CASCADE_FC_GRAPH, state, emptyDecisions, pending
    );
    state = result.nextState;
    pending = result.newDelayedEffects;
  }

  for (const node of CASCADE_FC_GRAPH.nodes) {
    expect(state[node.id]).toBeGreaterThanOrEqual(node.range[0]);
    expect(state[node.id]).toBeLessThanOrEqual(node.range[1]);
  }
});

// Test 2: Edge con delay=1 aplica el siguiente tick, no el actual
it('delayed edge applies one week later', () => {
  const ctx = createSimContext('test:delay:1', 1);
  const prevState = { groundskeeper_budget: 80, field_quality: 50 };
  // Tick 1: groundskeeper → field_quality (delay=1) no aplica todavía
  const tick1 = evaluateTick({ ...ctx, worldClock: 1 }, graph, prevState, emptyDecisions, []);
  expect(tick1.nextState.field_quality).toBe(50); // sin cambio
  expect(tick1.newDelayedEffects.some(e => e.applyAt === 2)).toBe(true); // en cola

  // Tick 2: el efecto diferido aplica
  const tick2 = evaluateTick({ ...ctx, worldClock: 2 }, graph, tick1.nextState, emptyDecisions, tick1.newDelayedEffects);
  expect(tick2.nextState.field_quality).toBeGreaterThan(50); // campo mejoró
});

// Test 3: Determinismo — mismo input → mismo output
it('is deterministic for same seed and state', () => {
  const ctx = createSimContext('test:det:1', 5);
  const state = getDefaultWorldState(CASCADE_FC_GRAPH);
  const result1 = evaluateTick(ctx, CASCADE_FC_GRAPH, state, emptyDecisions, []);
  const result2 = evaluateTick(ctx, CASCADE_FC_GRAPH, state, emptyDecisions, []);
  expect(result1.nextState).toEqual(result2.nextState);
});
```

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — establece `packages/shared/sim/` como home del código
- [ADR-002](ADR-002-simulation-determinism.md) — establece SimContext y el patrón pure function que `evaluateTick` implementa
- `design/gdd/cascade-engine.md` (pendiente) — define el catálogo concreto de nodos y edges que usan este grafo
