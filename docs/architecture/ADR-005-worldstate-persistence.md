# ADR-005: Persistencia del WorldState y Arquitectura de Save Game

## Status
Accepted

## Date
2026-05-16 (accepted 2026-05-16 after /architecture-review)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo (Drizzle ORM + PostgreSQL 16) |
| **Domain** | Backend / Data Persistence |
| **Knowledge Risk** | LOW — Drizzle relational API + PostgreSQL JSONB son estables |
| **References Consulted** | `docs/engine-reference/web/modules/backend.md`, `docs/engine-reference/web/modules/web-game-patterns.md` §Save Game Models §Persistence Tiers, `docs/engine-reference/web/current-best-practices.md` §Drizzle |
| **Post-Cutoff APIs Used** | Drizzle `db.query.<table>.findFirst({ with: ... })` — relational API verificado en VERSION.md |
| **Verification Required** | Verificar que JSONB serializa/deserializa `Map<NodeId, number>` correctamente (Map no es JSON-serializable nativamente — usar Object.fromEntries/new Map) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-001 (Web Stack — Drizzle + PostgreSQL), ADR-002 (Determinismo — seeds para reproducibilidad de snapshots), ADR-003 (WorldState type = Map<NodeId, number>) |
| **Enables** | `cascade-engine.md` GDD (puede especificar cómo el engine lee/escribe WorldState desde/a DB), `economy.md` GDD (balance, historial financiero), `league-system.md` GDD (standings semanales) |
| **Blocks** | Epic de cascade-engine — no puede comenzar hasta que el schema de persistencia esté definido |
| **Ordering Note** | Debe estar Accepted antes del epic de cascade-engine y economy |

## Context

### Problem Statement

El motor de cascadas (ADR-003) opera sobre `WorldState = Map<NodeId, number>` y produce un `DelayedEffectsBuffer` que debe aplicarse en semanas futuras. Para una arquitectura server-authoritative (ADR-001), ambos deben persistirse en PostgreSQL entre ticks semanales. Sin una decisión de schema, los implementadores inventarán estructuras de tabla incompatibles entre los sistemas de economía, cascadas y partido.

Adicionalmente, el `web-game-patterns.md` recomienda explícitamente **single autosave por usuario por playthrough** para management games. Esta ADR codifica esa decisión y define las tablas concretas.

### Constraints

- `WorldState = Map<NodeId, number>` (ADR-003) — no es JSON-serializable directamente (Map no es JSON). Conversión necesaria en la capa de persistencia.
- Los seeds de cada tick deben guardarse para reproducibilidad (ADR-002 — replay y debugging).
- Solo developer → schema simple, sin over-engineering. Una tabla por bounded context.
- El patron Drizzle del stack: `relational queries con db.query.<table>.findFirst({ with: ... })`, no joins manuales.
- El snapshot de WorldState debe ser suficientemente pequeño para que reads/writes sean rápidos (<50ms).

### Requirements

- 1 playthrough activo por usuario en MVP (single autosave — extensible a multi-slot post-MVP)
- WorldState completo persiste en cada tick semanal (snapshot full, no delta)
- DelayedEffectsBuffer persiste junto al WorldState del tick que los creó
- Los seeds de simulación se almacenan por tick para reproducibilidad total
- El historial de semanas anteriores se mantiene (configurable: N semanas) para debugs y replay
- El schema es extensible para el MMO futuro (multiple clubs, multiple usuarios en la misma liga)

## Decision

**Single autosave por playthrough. WorldState como JSONB en PostgreSQL. Snapshot completo por tick semanal.**

### Schema Drizzle

```typescript
// packages/db/src/schema/playthroughs.ts

export const playthroughs = pgTable('playthroughs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clubId: uuid('club_id').notNull().references(() => clubs.id),
  currentWeek: integer('current_week').notNull().default(1),
  currentSeason: integer('current_season').notNull().default(1),
  status: pgEnum('playthrough_status', ['active', 'completed', 'abandoned'])
            ('status').notNull().default('active'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }).notNull().defaultNow(),
});

// La snapshot del WorldState por semana
export const worldSnapshots = pgTable('world_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id').notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' }),
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  /**
   * WorldState serializado: { [nodeId]: value }
   * Map se convierte con Object.fromEntries() al guardar
   * y new Map(Object.entries()) al cargar.
   */
  worldState: jsonb('world_state').notNull().$type<Record<string, number>>(),
  /**
   * DelayedEffectsBuffer serializado: array de ScheduledEffect
   * { applyAt: number, toNode: string, delta: number }[]
   */
  delayedEffects: jsonb('delayed_effects').notNull().$type<Array<{
    applyAt: number;
    toNode: string;
    delta: number;
  }>>(),
  /** Seed usado en este tick — para reproducibilidad (ADR-002) */
  tickSeed: text('tick_seed').notNull(),
  /** Decisiones del jugador este tick — para replay completo */
  playerDecisions: jsonb('player_decisions').$type<Record<string, number>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Garantiza que hay máximo 1 snapshot por (playthrough, semana, temporada)
  uniqWeekSeason: unique('world_snapshots_playthrough_week_season_uniq')
    .on(table.playthroughId, table.week, table.season),
}));

// Relaciones
export const playthroughsRelations = relations(playthroughs, ({ one, many }) => ({
  user: one(users, { fields: [playthroughs.userId], references: [users.id] }),
  club: one(clubs, { fields: [playthroughs.clubId], references: [clubs.id] }),
  snapshots: many(worldSnapshots),
}));

export const worldSnapshotsRelations = relations(worldSnapshots, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [worldSnapshots.playthroughId],
    references: [playthroughs.id],
  }),
}));
```

### Architecture

```
Cada tick semanal:

1. Load (antes del tick)
   db.query.worldSnapshots.findFirst({
     where: and(eq(playthroughId), eq(week: current-1)),
     // devuelve el snapshot de la semana anterior
   }) → deserializar worldState + delayedEffects

2. Simulate (en packages/shared/src/sim/)
   evaluateTick(ctx, graph, prevState, decisions, pending)
   → nextState + newDelayedEffects + log

3. Persist (después del tick — en la misma transacción DB)
   INSERT INTO world_snapshots (worldState, delayedEffects, tickSeed, ...)
   UPDATE playthroughs SET currentWeek = +1, lastTickAt = now()

   // Limpiar snapshots > N semanas (IMPORTANTE: filtrar por playthroughId además de week
   // para no borrar snapshots de otros usuarios)
   DELETE FROM world_snapshots
   WHERE playthrough_id = $playthroughId AND week < currentWeek - SNAPSHOT_RETENTION_WEEKS
```

### Serialization Helpers

```typescript
// packages/db/src/sim-persistence.ts

import type { WorldState, DelayedEffectsBuffer } from '@smt/shared/sim/cascade-types';

/** Map → JSON-serializable object (para JSONB en Postgres) */
export function serializeWorldState(state: WorldState): Record<string, number> {
  return Object.fromEntries(state);
}

/** JSON object → Map (al cargar desde Postgres) */
export function deserializeWorldState(raw: Record<string, number>): WorldState {
  return new Map(Object.entries(raw));
}

/** DelayedEffectsBuffer → JSON-serializable (es un array de plain objects, ya serializable) */
export function serializeDelayedEffects(
  buffer: DelayedEffectsBuffer
): Array<{ applyAt: number; toNode: string; delta: number }> {
  return [...buffer]; // shallow copy para no mutar el readonly array
}
```

### Data Access Pattern (Drizzle)

```typescript
// apps/api/src/modules/cascade/repo.ts

// Schemas Zod para validación en runtime de JSONB — .$type<>() es TypeScript-only
const WorldStateJsonSchema = z.record(z.number());
const DelayedEffectsJsonSchema = z.array(z.object({
  applyAt: z.number(),
  toNode: z.string(),
  delta: z.number(),
}));

/** Cargar el estado actual de un playthrough (semana más reciente) */
export async function loadCurrentWorldState(
  playthroughId: string
): Promise<{ state: WorldState; pending: DelayedEffectsBuffer; week: number } | null> {
  const snapshot = await db.query.worldSnapshots.findFirst({
    where: eq(worldSnapshots.playthroughId, playthroughId),
    orderBy: [desc(worldSnapshots.week), desc(worldSnapshots.season)],
  });
  if (!snapshot) return null;

  // Zod parse OBLIGATORIO — .$type<>() no valida en runtime; Postgres puede tener data corrupta
  const rawState = WorldStateJsonSchema.parse(snapshot.worldState);
  const rawPending = DelayedEffectsJsonSchema.parse(snapshot.delayedEffects);

  return {
    state: deserializeWorldState(rawState),
    pending: rawPending,
    week: snapshot.week,
  };
}

/** Guardar el resultado de un tick (en transacción) */
export async function saveTickResult(
  tx: typeof db,
  playthroughId: string,
  week: number,
  season: number,
  result: TickResult,
  seed: string,
  decisions: PlayerDecisions
): Promise<void> {
  await tx.insert(worldSnapshots).values({
    playthroughId,
    week,
    season,
    worldState: serializeWorldState(result.nextState),
    delayedEffects: serializeDelayedEffects(result.newDelayedEffects),
    tickSeed: seed,
    playerDecisions: decisions as Record<string, number>,
  });

  await tx.update(playthroughs)
    .set({ currentWeek: week, lastTickAt: new Date() })
    .where(eq(playthroughs.id, playthroughId));
}
```

### Snapshot Retention Policy

Para evitar crecimiento infinito de `world_snapshots`, implementar una limpieza automática:

```typescript
const SNAPSHOT_RETENTION_WEEKS = 8; // mantener las últimas 8 semanas para debug/replay

// Ejecutar en cada tick, después del INSERT.
// IMPORTANTE: filtrar por playthroughId — sin él borraría snapshots de otros usuarios.
await tx.delete(worldSnapshots)
  .where(
    and(
      eq(worldSnapshots.playthroughId, playthroughId), // ← OBLIGATORIO
      lt(worldSnapshots.week, week - SNAPSHOT_RETENTION_WEEKS)
    )
  );
```

## Alternatives Considered

### Alternative A: Delta storage (solo guardar cambios)

- **Description**: En lugar de guardar el WorldState completo cada semana, guardar solo los nodos que cambiaron respecto a la semana anterior.
- **Pros**: Menor espacio en disco; queries de historial más informativas (qué cambió cuándo).
- **Cons**: Reconstruir el estado actual requiere recorrer toda la cadena de deltas hasta el snapshot base; más complejo de implementar; los errores en deltas se propagan acumulativamente.
- **Rejection Reason**: El WorldState con 20-30 nodos es pequeño (< 1KB serializado como JSONB). El coste de espacio de guardar el estado completo es despreciable. La simplidad del full snapshot supera la eficiencia marginal del delta.

### Alternative B: Redis como store de WorldState (sin persistir en PostgreSQL)

- **Description**: El WorldState activo vive en Redis (TTL = sesión activa). Solo se persiste en PostgreSQL al final de la sesión o periódicamente.
- **Pros**: Lecturas/escrituras más rápidas para el tick semanal activo.
- **Cons**: Redis es volátil sin persistencia explícita — el estado puede perderse en crash. Requiere lógica adicional de sync Redis→Postgres. El web-game-patterns.md es explícito: "nothing that affects gameplay outcomes lives only on the client [o en cache volátil]".
- **Rejection Reason**: Complejidad innecesaria. El tick semanal ocurre una vez por semana in-game — no hay pressure de latencia que justifique Redis para este caso.

### Alternative C: Estado del mundo como columnas en la tabla `clubs`

- **Description**: Añadir columnas directamente a la tabla `clubs` para cada variable de cascada (field_quality, fan_momentum, etc.).
- **Pros**: Simple, sin tabla adicional.
- **Cons**: El schema de clubs no puede evolucionar sin migraciones al añadir nuevas variables de cascada. No hay historial de semanas anteriores. El JSONB en `world_snapshots` es más flexible y extensible.
- **Rejection Reason**: Viola la separación de concerns — el schema de clubs modela identidad y metadata; el WorldState modela el estado de simulación que cambia semanalmente. Son concerns distintos con ciclos de vida distintos.

## Consequences

### Positive

- **Historial de replay completo**: seed + worldState + playerDecisions por semana = reproducibilidad total de cualquier semana anterior (ADR-002).
- **Schema extensible**: añadir nuevas variables de cascada = añadir entradas al `CASCADA_FC_GRAPH`, no modificar el schema de DB.
- **MMO-ready**: `playthroughs` tiene `userId` y `clubId` separados — cuando llegue el MMO, múltiples usuarios en la misma liga tienen playthroughs distintos que pueden compararse.
- **Single autosave transparente**: el usuario nunca gestiona save slots en MVP.

### Negative

- **JSONB sin tipado en DB**: PostgreSQL no valida la estructura interna del JSONB — un bug en `serializeWorldState` puede producir JSONB inválido silenciosamente. Los helpers de serialización necesitan tests.
- **Retention policy mínima de 8 semanas**: en 52 semanas de juego, cada club tendrá 8 snapshots activos + historial de temporadas anteriores. Aceptable pero requiere monitoreo.

### Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Map no serializa a JSONB correctamente | BAJO | ALTO | Tests unitarios de serializeWorldState / deserializeWorldState antes del primer sprint |
| worldState JSONB crece más de lo esperado | BAJO | BAJO | Loggear el tamaño del JSONB en los primeros playtests; limite práctico ~10KB por snapshot |
| Transacción INSERT + UPDATE + DELETE demasiado lenta | MUY BAJO | BAJO | Postgres maneja esto en <10ms para los volúmenes de este juego |
| playerDecisions en JSONB pierde type safety | MEDIO | BAJO | Añadir schema Zod para PlayerDecisions antes del epic de cascade-engine |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `cascade-engine.md` (pendiente) | El WorldState debe persistir entre ticks semanales | `world_snapshots` tabla con JSONB del WorldState completo por semana |
| `cascade-engine.md` (pendiente) | El DelayedEffectsBuffer debe sobrevivir entre sesiones | `delayed_effects` columna JSONB en `world_snapshots` |
| `economy.md` (pendiente) | El balance financiero y las decisiones económicas deben ser auditables | `player_decisions` en `world_snapshots` + `tick_seed` para reproducibilidad |
| `match-simulation.md` (pendiente) | Los resultados de partido son inputs para cascadas en semanas siguientes | Los resultados se modelan como variables del WorldState que persisten en el snapshot |
| `league-system.md` (pendiente) | El ranking de la liga refleja el estado actual del club | `playthroughs.currentWeek` + `worldSnapshots` del tick más reciente |

## Performance Implications

- **CPU**: Serialización/deserialización de WorldState: O(N) donde N = número de nodos (~20-30). < 1ms.
- **Memory**: Un snapshot completo = ~800 bytes en JSONB. Para 8 semanas = ~6KB por playthrough en memoria.
- **Load Time**: `loadCurrentWorldState()` = 1 query Drizzle + deserialización. Target: < 20ms.
- **Network**: Sin impacto — las queries son server-side. El WorldState no se envía al cliente completo (solo el diff visual vía Socket.IO).

## Migration Plan

No hay código de persistencia existente — todo nuevo. El scaffold del monorepo tiene `packages/db/src/schema/` con `users.ts`, `sessions.ts`, `clubs.ts`. Esta ADR añade `playthroughs.ts` y `world_snapshots.ts`.

La migración Drizzle se generará con `pnpm db:generate` después de añadir los schemas.

## Validation Criteria

```typescript
// tests/unit/db/sim-persistence.test.ts

it('serializes and deserializes WorldState correctly', () => {
  const original: WorldState = new Map([
    ['field_quality', 72.5],
    ['fan_momentum', 58.0],
    ['team_fitness', 81.0],
  ]);
  const serialized = serializeWorldState(original);
  const deserialized = deserializeWorldState(serialized);
  expect([...deserialized.entries()]).toEqual([...original.entries()]);
});

it('preserves floating point precision across serialization', () => {
  const state = new Map([['fan_momentum', 58.123456789]]);
  const round = deserializeWorldState(serializeWorldState(state));
  expect(getNode(round, 'fan_momentum')).toBeCloseTo(58.123456789, 6);
});

it('saveTickResult and loadCurrentWorldState are inverse operations', async () => {
  // Integration test with real DB — runs against test Postgres
  const { state, pending, week } = await loadCurrentWorldState(testPlaythroughId);
  // ... verify round-trip
});
```

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — Drizzle ORM y PostgreSQL 16 son la capa de persistencia
- [ADR-002](ADR-002-simulation-determinism.md) — tick_seed persiste para reproducibilidad
- [ADR-003](ADR-003-cascade-graph-topology.md) — define WorldState = Map<NodeId, number> que este ADR serializa
- `design/gdd/cascade-engine.md` (pendiente) — especificará el catálogo de nodos del WorldState
