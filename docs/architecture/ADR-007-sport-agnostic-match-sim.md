# ADR-007: Arquitectura Sport-Agnostic del Simulador de Partidos

## Status
Accepted

## Date
2026-05-16 (accepted 2026-05-16 after /architecture-review · fixes aplicados: MatchOutcome.winner único + iteración ReadonlyMap correcta)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Simulation |
| **Knowledge Risk** | LOW — TypeScript interfaces y plugin pattern, sin APIs externas |
| **References Consulted** | `docs/engine-reference/web/modules/web-game-patterns.md` §Deterministic Simulation, ADR-002, ADR-003 |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Implementar FootballPlugin y verificar que `simulateMatch` es determinista con ADR-002 seeds |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (SimContext como parámetro de sim), ADR-003 (WorldState como fuente de variables del partido), ADR-005 (match result se guarda en world_snapshots) |
| **Enables** | `match-simulation.md` GDD (ahora puede especificar el modelo de partido con la interfaz definida aquí) |
| **Blocks** | Epic de match-simulation — no puede comenzar sin SportPlugin definido |
| **Ordering Note** | `match-simulation.md` GDD debe referenciar esta ADR y especificar los parámetros concretos del FootballPlugin |

## Context

### Problem Statement

El game-concept establece que el engine es **sport-agnostic** — empieza con fútbol pero el código debe soportar otros deportes sin refactoring mayor. Sin una interfaz de plugin, el simulador de partido y el motor de cascadas tendrán referencias directas a "fútbol" hardcodeadas, haciendo imposible la extensión futura.

Adicionalmente, la conexión entre el resultado del partido y el WorldState de cascadas (ADR-003) necesita ser un contrato explícito: el match result afecta `fan_momentum`, `club_prestige`, etc. — ¿quién escribe esos valores y cómo?

### Constraints

- El simulador de partidos es una función pura que acepta SimContext (ADR-002)
- El resultado del partido se convierte en inputs para el motor de cascadas (ADR-003) — via WorldState updates
- El engine deportivo nunca toca la DB directamente (ADR-002: pure function, sin I/O async)
- Los parámetros deportivos (duración, goles, posiciones) son datos del plugin, no del engine genérico

### Requirements

- Una interfaz `SportPlugin` que cualquier deporte puede implementar
- El `FootballPlugin` implementa el MVP
- El resultado del partido se convierte en `MatchOutcome` genérico que el motor de cascadas puede consumir
- Las formaciones, posiciones, y reglas específicas del deporte viven en el plugin, no en el engine genérico
- Nuevo deporte = nuevo plugin; el engine no cambia

## Decision

**Interface `SportPlugin` + `FootballPlugin` como implementación MVP. El resultado del partido se expresa como `MatchOutcome` genérico que el motor de cascadas consume. Separación total entre "reglas del deporte" (plugin) y "estado del mundo" (WorldState).**

### Architecture

```
packages/shared/src/sim/
├── context.ts              # SimContext (ADR-002)
├── cascade-engine.ts       # evaluateTick (ADR-003)
├── cascade-types.ts        # WorldState, CascadeGraph (ADR-003)
├── sport-plugin.ts         # SportPlugin interface (este ADR)
├── match-outcome.ts        # MatchOutcome type (este ADR)
└── sports/
    └── football/
        ├── football-plugin.ts   # FootballPlugin implements SportPlugin
        ├── football-types.ts    # FootballTeamState, FootballLineup, etc.
        └── football-formulas.ts # Fórmulas específicas del fútbol (en cascade-engine.md GDD)
```

### Key Interfaces

```typescript
// packages/shared/src/sim/sport-plugin.ts

import type { SimContext } from './context';
import type { WorldState } from './cascade-types';

/** Estado del equipo para un partido — abstracto, independiente del deporte */
export interface TeamState {
  /** Habilidad media del equipo (0-100) */
  overallSkill: number;
  /** Jugadores disponibles (0-11 para fútbol; adaptable) */
  availablePlayers: number;
  maxPlayers: number;
  /** Moral del equipo en el momento del partido (0-100) */
  morale: number;
  /** Datos opcionales específicos del deporte (ej: formación, jugadores concretos) */
  sportSpecific?: Record<string, unknown>;
}

/** Resultado genérico de un partido — independiente del deporte */
export interface MatchOutcome {
  homeScore: number;
  awayScore: number;
  /** winner siempre derivado del score — nunca settear independientemente */
  readonly winner: 'home' | 'away' | 'draw';
  /** Eventos del partido relevantes para narrativa (goles, tarjetas, lesiones) */
  events: MatchEvent[];
  /**
   * Efectos que este resultado debe producir en el WorldState.
   * El motor de cascadas los aplica como modificadores directos en el tick.
   *
   * NOTA: con noUncheckedIndexedAccess:true, consumidores deben usar:
   *   const delta = getMatchDelta(outcome.worldStateDeltas, nodeId);
   * No acceder directamente — devuelve number|undefined.
   */
  worldStateDeltas: ReadonlyMap<string, number>; // Map, no Record — .get() comunica nullable explícitamente
}

export interface MatchEvent {
  type: 'goal' | 'red_card' | 'injury' | 'penalty' | string; // extensible
  minute: number;
  team: 'home' | 'away';
  description?: string; // para IA narrativa
}

/** Interfaz que todo sport plugin debe implementar */
export interface SportPlugin {
  readonly sportId: string;

  /**
   * Simula un partido. Pure function — sin side effects, sin I/O.
   * Usa ctx.rng() para toda aleatoriedad (ADR-002).
   * Lee del WorldState solo variables relevantes para el partido.
   */
  simulateMatch(
    ctx: SimContext,
    homeTeam: TeamState,
    awayTeam: TeamState,
    worldState: WorldState
  ): MatchOutcome;

  /**
   * Convierte el TeamState específico del deporte desde el WorldState.
   * Permite que el engine genérico prepare el TeamState sin conocer el deporte.
   */
  buildTeamState(worldState: WorldState, clubId: string): TeamState;

  /**
   * Lista de nodeIds del WorldState que este deporte lee durante el partido.
   * Usado para optimizar qué variables cargar.
   */
  readonly worldStateReads: readonly string[];

  /**
   * Lista de nodeIds del WorldState que el partido puede modificar via worldStateDeltas.
   * Documenta el contrato de escritura del plugin.
   */
  readonly worldStateWrites: readonly string[];
}
```

### FootballPlugin (implementación MVP)

```typescript
// packages/shared/src/sim/sports/football/football-plugin.ts

import type { SimContext } from '../../context';
import type { WorldState } from '../../cascade-types';
import { getNode } from '../../cascade-types';
import type { SportPlugin, TeamState, MatchOutcome } from '../../sport-plugin';

export const FootballPlugin: SportPlugin = {
  sportId: 'football',

  // Aligned with cascade-engine.md NodeId catalog (2026-05-17)
  worldStateReads: [
    'team_fitness', 'team_skill', 'squad_available_pct',  // squad_available_pct [0-100], NOT ratio [0-1]
    'field_quality', 'fan_attendance', 'staff_morale', 'player_happiness',
  ] as const,

  // NOTE: fan_momentum is NOT written directly — cascade-engine C6 handles
  // match_performance_index → fan_momentum. Writing it twice would double-count.
  worldStateWrites: [
    'match_performance_index',  // primary output; cascade C6 propagates to fan_momentum
    'injury_risk',              // injuries during match raise injury risk
  ] as const,

  buildTeamState(worldState: WorldState, _clubId: string): TeamState {
    const availablePct = getNode(worldState, 'squad_available_pct'); // 0-100
    return {
      overallSkill:      getNode(worldState, 'team_skill'),
      availablePlayers:  Math.round((availablePct / 100) * 11),  // convert pct to player count
      maxPlayers:        11,
      morale:            getNode(worldState, 'player_happiness'), // player morale, not staff
    };
  },

  simulateMatch(ctx, home, away, worldState): MatchOutcome {
    const fieldBonus    = (getNode(worldState, 'field_quality') - 50) * 0.15;
    const atmosphereBonus = (getNode(worldState, 'fan_attendance') - 50) * 0.1;
    const squadRatio    = home.availablePlayers / home.maxPlayers;

    let performance =
      home.overallSkill * 0.4 +
      home.morale * 0.15 +
      squadRatio * 100 * 0.2 +
      fieldBonus +
      atmosphereBonus;
    performance *= 0.75 + ctx.rng() * 0.5;

    const awayPerformance = away.overallSkill * 0.4 + away.morale * 0.15 +
      (away.availablePlayers / away.maxPlayers) * 100 * 0.2;

    const homeGoals = Math.max(0, Math.floor((performance / 100) * 3 * ctx.rng()));
    const awayGoals = Math.max(0, Math.floor((awayPerformance / 100) * 2 * ctx.rng()));

    // winner SIEMPRE derivado del score (nunca independiente — evita contradicción)
    const winner = homeGoals > awayGoals ? 'home' as const :
                   homeGoals < awayGoals ? 'away' as const : 'draw' as const;

    // match_performance_index: 50 = empate técnico. >50 = victoria local. <50 = derrota.
    // Cascade C6 (match_performance_index → fan_momentum) propagará el efecto en fan_momentum.
    // NO escribir fan_momentum directamente — eso es responsabilidad del cascade engine.
    const matchPerfIndex = winner === 'home'
      ? 50 + (homeGoals - awayGoals) * 10  // 60-90 para victorias
      : winner === 'away'
      ? 50 - (awayGoals - homeGoals) * 10  // 10-40 para derrotas
      : 50;  // empate

    // ReadonlyMap: .get() comunica nullable explícitamente bajo noUncheckedIndexedAccess
    const worldStateDeltas = new Map<string, number>([
      ['match_performance_index', matchPerfIndex - 50],  // delta, no valor absoluto

    return {
      homeScore: homeGoals,
      awayScore: awayGoals,
      winner,
      events: [], // detalle de eventos en match-simulation.md GDD
      worldStateDeltas,
    };
  },
};
// NOTE: This is a stub implementation. The concrete formulas, constants, and
// worldStateDeltas values are specified in design/gdd/match-simulation.md GDD.
```

### Integración con el Motor de Cascadas

```typescript
// El tick semanal usa el plugin para simular el partido y actualiza el WorldState
async function processMatchWeek(
  ctx: SimContext,
  graph: CascadeGraph,
  prevState: WorldState,
  decisions: PlayerDecisions,
  pending: DelayedEffectsBuffer,
  sport: SportPlugin
): Promise<TickResult> {
  // 1. Construir TeamState desde WorldState (via plugin)
  const homeTeam = sport.buildTeamState(prevState, decisions.clubId);
  const awayTeam = getAwayTeamState(decisions.matchdayOpponentId); // de DB

  // 2. Simular el partido (pure function)
  const outcome = sport.simulateMatch(ctx, homeTeam, awayTeam, prevState);

  // 3. Aplicar los worldStateDeltas del partido al prevState antes del tick de cascadas
  // NOTA: worldStateDeltas es ReadonlyMap — iterar con `for...of` directo, NO Object.entries
  // (Object.entries sobre un Map devuelve propiedades del objeto Map, no los entries).
  const stateAfterMatch = new Map(prevState);
  for (const [nodeId, delta] of outcome.worldStateDeltas) {
    const current = stateAfterMatch.get(nodeId) ?? 0;
    stateAfterMatch.set(nodeId, current + delta);
  }

  // 4. Evaluar el motor de cascadas con el estado post-partido
  return evaluateTick(ctx, graph, stateAfterMatch, decisions, pending);
}
```

## Alternatives Considered

### Alternative A: Hardcode fútbol directamente en el engine

- **Description**: No interfaz de plugin — el simulador de partidos asume fútbol.
- **Pros**: Más simple en el MVP; sin abstracción prematura.
- **Cons**: Viola el requirement explícito del game-concept de sport-agnostic engine; refactoring costoso si/cuando se añaden otros deportes.
- **Rejection Reason**: El concept doc específicamente menciona "el motor sea agnóstico del deporte, pero empezamos con fútbol". La interfaz de plugin es el mecanismo que garantiza esa propiedad desde día 1, con coste mínimo.

### Alternative B: Sistema de componentes (ECS-style para deportes)

- **Description**: Un sistema Entity-Component donde las reglas deportivas son componentes intercambiables.
- **Pros**: Mayor flexibilidad; los deportes pueden compartir reglas comunes (ej: "tiene jugadores" como componente).
- **Cons**: Overkill para 2-3 deportes esperados; complejidad de ECS sin el performance justificado.
- **Rejection Reason**: Un solo `SportPlugin` interface es suficiente para los deportes planificados. ECS añade complejidad sin beneficio visible en este dominio.

## Consequences

### Positive

- **Nuevo deporte = nuevo archivo**: `basketball-plugin.ts` que implementa `SportPlugin`. El engine genérico no cambia.
- **Contrato explícito de escritura**: `worldStateWrites` documenta qué nodos puede modificar cada deporte — el sistema de cascadas puede validar esto.
- **Test del plugin aislado**: `FootballPlugin.simulateMatch()` se puede testear sin el motor de cascadas completo.
- **IA narrativa recibe `MatchEvent[]`**: el plugin genera eventos con `description` que `narrative-ai.ts` usa como contexto para los resúmenes de partido.

### Negative

- **`worldStateDeltas` hardcoded en el plugin**: los multiplicadores (`fan_momentum + 4` en victoria) son datos de balance que pertenecen al `match-simulation.md` GDD, no al código del plugin. En el MVP se aceptan hardcoded en el plugin; deben migrarse a config cuando el GDD esté aprobado.

### Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| worldStateDeltas de un partido desequilibran el motor de cascadas | MEDIO | MEDIO | Constraintar los deltas a ±10 por match event; testear con simulación de 52 semanas |
| Plugin no implementa todos los métodos correctamente | BAJO | BAJO | TypeScript interface garantiza exhaustividad en compile time |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `match-simulation.md` (pendiente) | Motor sport-agnostic (concept doc requirement) | SportPlugin interface separa reglas del deporte del engine genérico |
| `match-simulation.md` (pendiente) | Resultado del partido afecta fan_momentum, prestige | worldStateDeltas en MatchOutcome define el contrato |
| `cascade-engine.md` (pendiente) | El partido es un input al motor de cascadas, no un sistema separado | processMatchWeek() integra simulación de partido + tick de cascadas en orden definido |

## Performance Implications

Negligibles — el plugin es código TypeScript puro evaluado una vez por semana de partido.

## Migration Plan

No hay código existente. El stub de partido en el prototype HTML es throwaway.

## Validation Criteria

```typescript
it('FootballPlugin.simulateMatch is deterministic', () => {
  const ctx = createSimContext('test-match:1', 1);
  const state = new Map([['team_skill', 60], ['team_fitness', 70], ...]);
  const home = FootballPlugin.buildTeamState(state, 'club-a');
  const away: TeamState = { overallSkill: 55, availablePlayers: 11, maxPlayers: 11, morale: 65 };
  const r1 = FootballPlugin.simulateMatch(ctx, home, away, state);
  const r2 = FootballPlugin.simulateMatch(ctx, home, away, state);
  expect(r1).toEqual(r2);
});

it('worldStateDeltas.fan_momentum is positive on home win', () => {
  // ... setup for a clear win scenario
  expect(outcome.worldStateDeltas['fan_momentum']).toBeGreaterThan(0);
});
```

## Related Decisions

- [ADR-002](ADR-002-simulation-determinism.md) — SimContext como primer parámetro de simulateMatch
- [ADR-003](ADR-003-cascade-graph-topology.md) — WorldState que el plugin lee y escribe via worldStateDeltas
- [ADR-005](ADR-005-worldstate-persistence.md) — MatchOutcome se incluye en el world_snapshot del tick
- `design/gdd/match-simulation.md` (pendiente) — define parámetros concretos del FootballPlugin
