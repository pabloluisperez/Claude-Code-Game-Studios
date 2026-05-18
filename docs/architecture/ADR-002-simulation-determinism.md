# ADR-002: Estrategia de Determinismo del Simulador

## Status
Accepted

## Date
2026-05-16 (accepted 2026-05-16 after /architecture-review)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Simulation |
| **Knowledge Risk** | LOW — pure TypeScript patterns, no post-cutoff API risk |
| **References Consulted** | `docs/engine-reference/web/modules/web-game-patterns.md` §Deterministic Simulation, `docs/engine-reference/web/VERSION.md` |
| **Post-Cutoff APIs Used** | None — `seedrandom` npm package is stable, no version risk |
| **Verification Required** | Run determinism test suite (same seed → same output, 1000 iterations) before first match simulation sprint |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-001 (Web Stack — establece que `packages/shared/sim/` es el lugar del código de simulación) |
| **Enables** | ADR-003 (Topología del grafo de cascadas — la topología del grafo asume función de evaluación determinista) |
| **Blocks** | `cascade-engine.md` GDD — no puede escribirse sin esta decisión tomada; `match-simulation.md` GDD — idem |
| **Ordering Note** | Este ADR debe estar Accepted antes de empezar cualquier GDD que especifique fórmulas de simulación |

## Context

### Problem Statement

El simulador de partido y el motor de cascadas de Cascada FC deben producir resultados idénticos dados los mismos inputs y la misma semilla. Sin esta garantía, los GDDs que especifican fórmulas y cadenas de cascada son ambiguos para el implementador, el debugging de bugs reproducibles es imposible, y la trayectoria MMO (en la que el servidor debe ser autoridad única sobre todos los outputs de simulación) queda comprometida desde el diseño.

### Constraints

- El stack web establece `packages/shared/sim/` como ubicación canónica del código de simulación
- El servidor es la única fuente de verdad (ADR-001: server-authoritative)
- TypeScript en Node.js — no hay floating-point portability risk entre instancias del mismo runtime
- Solo developer → simplicidad de implementación primero
- Prototype del motor de cascadas usó `Math.random()` — ese código es throwaway, no se migra

### Requirements

- El mismo seed + los mismos inputs deben producir exactamente el mismo output
- La lógica de simulación debe poder ejecutarse en el cliente para previsualizaciones (sin persistir)
- No se puede usar `Date.now()`, `Math.random()`, ni I/O asíncrono dentro del cuerpo de simulación
- El código de simulación debe ser puro (sin side effects), testable en aislamiento
- Compatible con la trayectoria MMO futura (el servidor computa la verdad; múltiples clientes pueden previsualizar)

## Decision

**Determinismo server-authoritative con opción de client preview.**

Toda la lógica de simulación vive en `packages/shared/src/sim/` como funciones puras. El servidor ejecuta esas funciones con autoridad y persiste el resultado. El cliente puede ejecutar las mismas funciones con los mismos inputs para previsualización (sin persistir). El RNG se encapsula en un `SimContext` que se pasa explícitamente — nunca se llama `Math.random()` directamente.

### RNG: `seedrandom` npm package

`seedrandom` es la librería estándar para PRNG determinista en JavaScript/TypeScript:
- API simple: `const rng = seedrandom(seed); const val = rng(); // 0 ≤ val < 1`
- Battle-tested (>5M descargas semanales), TypeScript types via `@types/seedrandom`
- Algoritmo PRNG ARC4, distribución uniforme correcta para game simulations
- Zero dependencies, <3KB minified

### Architecture

```
                      packages/shared/src/sim/
                      ┌──────────────────────────┐
Seed + State ────────>│  Funciones puras de sim   │────> Resultado determinista
worldClock ──────────>│  (sin side effects)       │
                      │  - simulateMatch()         │
                      │  - evaluateCascades()      │
                      │  - tickEconomy()           │
                      └──────────────────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │                              │
             apps/api                       apps/web
             (AUTORIDAD)                   (PREVIEW ONLY)
             Ejecuta sim,                  Puede ejecutar la
             persiste resultado            misma sim localmente
             en PostgreSQL                 sin persistir —
                                           para UI responsiva
```

### Key Interfaces

```typescript
// packages/shared/src/sim/context.ts
// NOTA: usar `import type` por verbatimModuleSyntax: true en tsconfig base
import seedrandom from 'seedrandom';
import type { PRNG } from 'seedrandom';

export interface SimContext {
  /** Semilla única por evento simulado. Nunca cambia para el mismo evento. */
  seed: string;
  /** Reloj del mundo en semanas de juego. NUNCA usar Date.now(). */
  worldClock: number;
  /** PRNG determinista. Único punto de aleatoriedad permitido en sim. */
  rng: PRNG;
}

/**
 * Crea un SimContext. Llamar SOLO desde el servidor (para sim autoritativa)
 * o desde el cliente SOLO para preview (no persistir el resultado).
 *
 * seed derivation: `${entityId}:${weekNumber}:${seasonId}` — único y estable.
 */
// NOTA: { state: false } evita el gotcha de Vite SSR donde seedrandom
// puede comportarse distinto en Node (SSR) vs browser si tree-shaking
// resuelve la variante incorrecta.
export function createSimContext(seed: string, worldClock: number): SimContext {
  return { seed, worldClock, rng: seedrandom(seed, { state: false }) };
}

// IMPORTANTE: La seed se genera SIEMPRE en el servidor (BullMQ worker o endpoint).
// El cliente NUNCA genera su propia seed — recibe la seed del servidor para preview.
// Si el cliente genera seed propia, el resultado preview nunca coincide con el autoritativo.

// packages/shared/src/sim/match-sim.ts
export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];  // goles, tarjetas, lesiones — todos deterministas
}

export function simulateMatch(
  ctx: SimContext,
  home: TeamState,
  away: TeamState,
  fieldCondition: number  // 0-100, afecta el resultado
): MatchResult { /* ... */ }

// packages/shared/src/sim/cascade-engine.ts
export function evaluateCascades(
  ctx: SimContext,
  worldState: WorldState,
  decisions: PlayerDecisions
): CascadeResult { /* ... */ }
```

### Seed Derivation Strategy

```typescript
// El seed se construye concatenando identificadores estables
const matchSeed = `match:${clubId}:${weekNumber}:${seasonId}`;
const cascadeSeed = `cascade:${clubId}:${weekNumber}:${seasonId}`;
const economySeed = `economy:${clubId}:${weekNumber}:${seasonId}`;
```

Los seeds son únicos por evento y completamente reproducibles — la misma semana de la misma temporada siempre produce el mismo resultado dado el mismo estado inicial.

### Invariantes del simulador (NUNCA violar)

```
✗ Math.random()         → usar ctx.rng()
✗ Date.now()            → usar ctx.worldClock
✗ await dentro de sim   → cargar estado antes, simular puro, persistir después
✗ setState() / DB calls → sim devuelve resultado; la capa de servicio lo persiste
✓ ctx.rng()             → única fuente de aleatoriedad
✓ inputs como parámetros → sin lectura de estado global
✓ output como valor de retorno → sin mutación de estado externo
```

## Alternatives Considered

### Alternative 1: No determinismo — random simple + event log

- **Description**: Cada simulación llama `Math.random()`. El servidor guarda un log de todos los valores aleatorios generados para replay.
- **Pros**: Implementación trivial. Sin dependencias externas.
- **Cons**: El log de eventos crece linealmente con partidas; el replay requiere reproducir la secuencia exacta de llamadas al RNG, que puede romperse con cualquier refactor; debugging difícil; preview client imposible sin replicar el log.
- **Rejection Reason**: Incompatible con preview client (el cliente necesita los mismos valores sin el log del servidor) y con el debugging en cascadas multi-semana donde los bugs aparecen semanas después.

### Alternative 2: Cross-platform bit-exact determinism (fixed-point)

- **Description**: Usar aritmética de punto fijo (integers, no floats) para garantizar exactamente el mismo resultado en cualquier hardware y runtime.
- **Pros**: 100% reproducible en cualquier entorno, incluido un posible cliente nativo futuro.
- **Cons**: Complejidad masiva — TypeScript no tiene primitivos de fixed-point; requiere una librería de aritmética completa o una implementación propia. Las fórmulas de simulación se vuelven 3-5x más complejas. Overkill para TypeScript en Node.js donde el float64 es idéntico entre instancias del mismo runtime.
- **Rejection Reason**: No hay planes para clientes nativos. El scope es server (Node) + client (browser V8) — ambos usan el mismo IEEE 754 float64 con el mismo resultado. La complejidad no está justificada.

### Alternative 3: Isolated workers por simulación

- **Description**: Cada simulación corre en un Web Worker / worker_thread separado con estado completamente aislado. `Math.random()` se permite dentro del worker.
- **Pros**: Aislamiento total de estado entre simulaciones concurrentes.
- **Cons**: No resuelve el problema de reproducibilidad (Math.random() sigue siendo no determinista). Mayor overhead de mensajería entre threads. La simultaneidad de simulaciones concurrentes puede manejarse de otras formas.
- **Rejection Reason**: No aporta determinismo; el overhead es innecesario para una simulación management con baja frecuencia de ticks (una vez por semana in-game, no tiempo real).

## Consequences

### Positive

- **Debugging trivial**: cualquier bug reportado con `seed + weekNumber + seasonId` es 100% reproducible en local.
- **Preview client habilitado**: el cliente puede mostrar el resultado probable de una decisión sin llamar al servidor — mejora UX en móvil (latencia percibida 0).
- **Replay habilitado**: las partidas pueden re-ejecutarse para análisis o para la IA narrativa (generación de "crónicas" a posteriori).
- **Test suite robusta**: los tests de simulación son deterministas — no hay flaky tests por aleatoridad.
- **MMO-ready**: el servidor siempre tiene razón y puede demostrar por qué (reproducir la simulación con los inputs de ese tick).
- **Migration testing**: al cambiar fórmulas, se puede correr la misma semilla antes y después y comparar diffs de output.

### Negative

- **Dependencia externa**: `seedrandom` se añade al bundle de `packages/shared`. Riesgo: mínimo (librería estable desde 2013).
- **Disciplina requerida**: cualquier desarrollador que introduzca `Math.random()` en `packages/shared/sim/` rompe la garantía. Necesita regla en control-manifest.
- **No hay preview sin estado actual del mundo**: el cliente necesita el `WorldState` para ejecutar la preview — requiere sincronización de estado inicial.

### Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Dev introduce Math.random() en sim | MEDIO | ALTO | Lint rule + forbidden pattern en control-manifest |
| seedrandom produce distribución sesgada para simulaciones largas | BAJO | MEDIO | Property-based tests verifican distribución estadística |
| Preview client muestra resultado diferente al servidor | BAJO | ALTO | Test suite con seed compartido: mismo input → mismo output en ambos lados |
| Seed derivation produce colisiones | MUY BAJO | MEDIO | Seeds incluyen IDs únicos (uuid); colisión es matemáticamente improbable |
| seedrandom SSR/browser bundle split | BAJO | MEDIO | Usar `{ state: false }` en createSimContext + `ssr.noExternal: ['@smt/shared']` en vite.config.ts — ya configurado |
| `noUncheckedIndexedAccess` en sim functions | MEDIO | BAJO | Todo acceso a arrays dentro del sim requiere guards explícitos o aserciones `!` justificadas. Anticipar en code review. |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `cascade-engine.md` (pendiente) | Las cascadas multi-semana deben ser reproducibles para debugging | SimContext con seed por semana hace cada tick de cascadas determinista y reproducible |
| `cascade-engine.md` (pendiente) | El servidor es autoridad en los efectos de cascada | El servidor ejecuta `evaluateCascades()` con autoridad; el cliente puede previsualizar con los mismos inputs |
| `match-simulation.md` (pendiente) | Los resultados de partido deben ser deterministas para la trayectoria MMO | `simulateMatch(ctx, ...)` con seedrandom garantiza que el servidor computa el resultado correcto |
| `match-simulation.md` (pendiente) | Posibilidad de replay de partidos para IA narrativa | Seed estable por partido permite re-ejecutar la simulación para generar crónicas |

## Performance Implications

- **CPU**: `seedrandom(seed)` = ~0.1ms por inicialización. Por partida: despreciable.
- **Memory**: ~50 bytes por instancia de PRNG. Uno por SimContext. Despreciable.
- **Load Time**: `seedrandom` <3KB minified. Bundle impact negligible.
- **Network**: No hay impacto — la seed se calcula localmente; no se transmite el estado del PRNG.

## Migration Plan

El prototype de la fase Concept usó `Math.random()` directamente. Ese código es **throwaway** y no se migra — todo código de producción en `packages/shared/src/sim/` comienza determinista desde cero.

No hay código de producción que migrar. Esta ADR aplica a código nuevo solamente.

## Validation Criteria

```typescript
// tests/unit/sim/determinism.test.ts

// Test 1: Mismo seed → mismo output (1000 iteraciones)
it('produces identical output for the same seed', () => {
  const ctx1 = createSimContext('match:club-a:week-1:season-1', 1);
  const ctx2 = createSimContext('match:club-a:week-1:season-1', 1);
  const result1 = simulateMatch(ctx1, homeTeam, awayTeam, 75);
  const result2 = simulateMatch(ctx2, homeTeam, awayTeam, 75);
  expect(result1).toEqual(result2);
});

// Test 2: Seeds distintas → outputs típicamente distintos
it('produces different output for different seeds', () => {
  const ctx1 = createSimContext('match:club-a:week-1:season-1', 1);
  const ctx2 = createSimContext('match:club-a:week-2:season-1', 1);
  // No strict equality check — probabilístico. Verificar en 100 pares.
});

// Test 3: Sin Math.random() ni Date.now() en packages/shared/sim/
// (Este test es un lint rule, no un runtime test)
```

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — establece `packages/shared/sim/` como home del código de simulación
- ADR-003 (pendiente) — Topología del grafo de cascadas — depende de esta decisión de determinismo
