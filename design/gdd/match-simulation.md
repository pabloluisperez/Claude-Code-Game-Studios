# Simulación de Partido (Match Simulation)

> **Status**: In Review (R6 — 2026-05-18 — 14 blockers resueltos: F6 comment corrected, F5/Edge Case P_attack ranges corrected, worldStateDeltas/playerRatings Map→Record, causal_node en tabla MatchEvent, Socket.IO MatchPauseEvent spec, BullMQ orphan-job guard, canonical query failed+in_progress, Rival AI text contradiction, P_injury rival=50, tackle trigger opción-b, recovery worker spec, AC-28/29/30/31/32, AC header exception clause)
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-18 (R6 — 14 blockers resolved)
> **Implements Pillar**: P1 (Tinkering Beats Optimization) · P4 (Calm Is The Tempo)
> **ADR References**: ADR-002 (Determinismo) · ADR-007 (Sport-Agnostic Match Sim)

## Overview

El simulador de partido es una función pura determinista que produce el resultado de cada semana de partido — marcador, goles, tarjetas, lesiones — a partir del estado del mundo en ese tick. Toma como entrada un `SimContext` (semilla reproducible por partido), el `WorldState` del motor de cascadas (calidad del equipo, físico, disponibilidad de la plantilla, calidad del campo, asistencia, moral) y el modelo individual de los 11 titulares; devuelve un `MatchOutcome` con el marcador final, los eventos narrativos del partido (`MatchEvent[]`), y los `worldStateDeltas` que el motor de cascadas aplica en el mismo tick: `match_performance_index` (calidad del rendimiento, que la cascada C6 propaga a `fan_momentum`) e `injury_risk` (riesgo de lesión acumulado durante el partido). El simulador vive en `packages/shared/src/sim/sports/football/` como implementación de la interfaz `SportPlugin` (ADR-007) y usa exclusivamente `ctx.rng()` para aleatoriedad (ADR-002) — esto garantiza que cualquier partido es 100% reproducible dado el mismo seed y el mismo WorldState inicial. La gestión de plantilla (traspasos, contratos, desarrollo individual) pertenece al sistema `player-management` (GDD separado).

## Player Fantasy

El jugador es el manager en el banquillo que no puede tocar el balón. La simulación del partido no se usa — se observa. Un feed de eventos en orden cronológico (gol en el 34', tarjeta roja en el 67', lesión del titular en el 71') construye la narrativa de un partido que el jugador no controla pero que ha condicionado completamente: el campo en mal estado que definiste no mantener, el defensa cansado que decidiste no rotar, la asistencia alta que da ventaja local porque invertiste en precios justos. La fantasy es la del manager-vicarioso que siente cada gol como reivindicación o fracaso de sus decisiones de la semana anterior.

La segunda capa de la fantasy es la del **detective de consecuencias**: cuando el equipo pierde en el 90' por un jugador lesionado en el 60' — y el jugador sabe que esa lesión viene de la racha de `injury_risk` alta que lleva tres semanas ignorando — el sistema entrega su recompensa más poderosa. No es magia ni randomness; es su WorldState proyectándose en 90 minutos de partido. El feed de eventos es la prueba visible del grafo invisible de cascadas que el jugador está aprendiendo a leer.

Esta es infraestructura que crea una experiencia directa: debajo del resultado hay un motor determinista reproducible. Encima del motor hay una presentación DOM-only en MVP (lista de eventos + marcador final) que evoluciona a resumen narrativo en versiones posteriores.

## Detailed Design

### Core Rules

1. El partido se simula en el servidor como un **proceso con estado** (BullMQ job) que avanza tick a tick (1 tick = 1 minuto de partido, 90 ticks total) y puede pausarse para recibir decisiones del manager. El tick-by-tick es determinista: dada la misma seed y el mismo WorldState inicial, el partido siempre produce los mismos eventos en los mismos minutos, **incluyendo** las mismas decisiones por defecto si el manager no interviene.

2. El manager puede tomar decisiones en **ventanas de pausa** predefinidas: injuries (en cualquier minuto), ventanas de cambios (minuto 45, minuto 60, minuto 75), y al final del partido. No hay tiempo real: cada pausa espera indefinidamente a que el manager decida antes de continuar (P4: Calm Is The Tempo).

3. El partido conoce dos lineups: el `homeLineup: PlayerState[]` inicial (11 titulares + max 7 bench) y el lineup del rival. Las sustituciones del rival se resuelven automáticamente por el AI manager del club contrario (probabilidades simples, no decisiones del jugador).

4. **Todas** las reglas de aleatoriedad se resuelven con `ctx.rng()` en orden determinista por tick. Las ventanas de pausa no introducen nueva aleatoriedad — la semilla que generó el evento de lesión o el gol es la misma independientemente de cuándo el manager tomó la decisión.

5. El partido escribe exactamente dos `worldStateDeltas` al cascade engine al finalizar: `match_performance_index` e `injury_risk`. No escribe `fan_momentum` directamente — la cascada C6 lo propaga.

6. VAR se resuelve **inline** dentro del tick de simulación — no requiere decisión del manager. El manager observa el resultado del VAR pero no lo controla.

---

### Player Model (Individual Stats)

**Stats universales** (todos los jugadores):

| Stat | Rango | Descripción |
|------|-------|-------------|
| `skill` | [0-100] | Calidad técnica base. Permanente; gestionada por player-management. |
| `fitness` | [0-100] | Condición física actual. Varía semana a semana (player-management). |
| `morale` | [0-100] | Motivación individual. Influenciada por player_happiness (WorldState). |
| `form` | [30-90] | Racha de rendimiento reciente (media rolling de las últimas 5 actuaciones). Rango per player-management.md F3. |
| `stamina` | [40-100] | Resistencia a la fatiga durante el partido — determina el ritmo de decay de fitness efectiva en los ticks del partido. Rango per player-management.md (floor=40 en world-gen). |

**Stats específicos por posición** (2 por posición):

| Posición | Stat A | Stat B |
|----------|--------|--------|
| GOALKEEPER | `reflexes [0-100]` | `handling [0-100]` |
| DEFENDER | `strength [0-100]` | `tackling [0-100]` |
| MIDFIELDER | `passing [0-100]` | `vision [0-100]` |
| FORWARD | `speed [0-100]` | `finishing [0-100]` |

**Effective rating** (usado en el match algorithm):
```
effective_rating(player, t) =
  skill * 0.35 + form * 0.20 + morale * 0.15 +
  effective_fitness(player, t) * 0.30

effective_fitness(player, t) =
  max(0, fitness - (t / 90) * (1 - stamina/100) * FITNESS_DECAY_MAX)
```
`FITNESS_DECAY_MAX` = 15 (constante de la fórmula; con el floor de stamina=40 per player-management.md, el decay real máximo es `15 × (1−40/100) = 9 pts`; con stamina=100, decay=0).

**Lineup**: 1 GK + 4 DEF + 4 MID + 2 FWD (4-4-2 por defecto). Formaciones alternativas configurables como presets (ver Tuning Knobs).

---

### Match Algorithm (tick-by-tick)

**Por cada tick t = 1..90:**

```
1. MOMENTUM: Recalcular home_momentum basado en balance técnico de midfielders
   home_momentum[t] = clamp(home_momentum[t-1] + momentum_delta, 20, 80)
   momentum_delta = (avg MID.passing home - avg MID.passing away) / 100 × 3.0
                  + (avg MID.vision home - avg MID.vision away) / 100 × 2.0
                  + (rng() × 2 - 1)
   // Fuente de verdad: sección Formulas F4. Este pseudo-código es ilustrativo.

2. ATTACK: ¿El tick genera un ataque?
   P_attack_home = BASE_ATTACK_RATE * (home_momentum[t] / 100) + FWD_speed_bonus
   if rng() < P_attack_home → home_attack
   elif rng() < P_attack_away → away_attack

3. Si ataque: ¿Llega a remate?
   P_shot = (attacker_FWD.effective_rating * 0.4 + attacker_FWD.speed * 0.3 + mid_vision * 0.3)
          vs (def_DEF.effective_rating * 0.4 + def_DEF.strength * 0.3 + def_DEF.tackling * 0.3)
   (normalizado a [0,1])

4. Si remate: ¿Gol?
   P_goal = (attacker_FWD.finishing × 0.6 + attacker_FWD.effective_rating × 0.4)
          vs (GK.reflexes × 0.5 + GK.handling × 0.3 + GK.effective_fitness(t) × 0.2)
   // Fuente de verdad: sección Formulas F7.
   Si gol: MatchEvent {type:'goal', minute:t, team:'home'|'away'}
   → CHECK VAR (ver Match Events)

5. CARDS: Verificación en ticks múltiplo de 15 (15, 30, 45, 60, 75, 90) cuando P_attack_away fue positivo en ese tick (es decir, hubo un ataque rival en ese minuto de verificación):
   P_yellow = (1 - DEF.tackling/100) * 0.12 * (DEF.effective_fitness(t) < 40 ? 1.5 : 1)
   P_red_direct = 0.003 por tackle check
   Dos amarillas al mismo jugador = roja automática

6. INJURIES: Verificación en ticks de gol, tarjeta, y en ticks 45 y 90:
   P_injury_player = (injury_risk_ctx / 100) * 0.08 * (1 - player.effective_fitness(t)/100)
   // injury_risk_ctx para jugadores del club del jugador = WorldState.injury_risk
   // injury_risk_ctx para jugadores del equipo rival = 50 (constante fija, equipo neutral)
   // El injury_risk del rival NO accede al WorldState del jugador — las consecuencias
   // de la gestión de injury_risk son del manager, no del rival.
   Si lesión: MatchEvent {type:'injury', player_id, minute:t} → PAUSA (ver Manager Decisions)
```

---

### Match Events

**Tipos de MatchEvent:**

| type | Trigger | Campos adicionales |
|------|---------|-------------------|
| `goal` | P_goal roll positivo (post-VAR si aplica) | `team`, `player_id`, `minute` |
| `goal_disallowed` | VAR overturns goal | `team`, `original_minute`, `reason:'offside'|'foul'` |
| `yellow_card` | P_yellow roll positivo | `team`, `player_id`, `minute` |
| `red_card` | P_red_direct o 2ª amarilla | `team`, `player_id`, `minute`, `reason:'direct'|'second_yellow'` |
| `red_downgraded` | VAR overturns red → yellow | `team`, `player_id`, `minute` |
| `injury` | P_injury roll positivo | `team`, `player_id`, `minute`, `severity:'minor'|'major'`, **`causal_node:'injury_risk'`** (siempre obligatorio en MVP — ver §Contrato de Señal Causal) |
| `substitution` | Manager decision o auto (rival) | `team`, `player_out_id`, `player_in_id`, `minute` |
| `substitution_window` | Ticks 45, 60, 75 — señal de pausa. **Persiste en `MatchEvent[]`** (ver AC-21). `MatchOutcome.events` entregado a league-system y player-management NO incluye eventos de tipo `substitution_window` (filtrados post-partido). `hud-ui.md` los usa para renderizar las ventanas de decisión. | `decision_type:'substitution_window'`, `minute` |
| `playing_with_ten` | Lesión/expulsión sin sustituto disponible | `team`, `minute` |
| `var_review` | Post-goal/penalty/red check | `event_type`, `outcome:'confirmed'|'overturned'`, `minute` |
| `penalty` | Extensión futura (foul en área) — no MVP | — |

> **`causal_node`**: Todos los tipos de MatchEvent tienen el campo `causal_node: string | null`. En MVP, `causal_node` es **obligatorio solo para `injury`** (valor: `'injury_risk'`). Para todos los demás tipos, `causal_node = null`. V1.1+ extenderá el campo a goles condicionados por `field_quality`, tarjetas por `team_fitness` bajo, etc.

**VAR inline (sin decisión del manager):**
```
P_VAR_review_goal    = 0.25   // 25% de los goles se revisan
P_VAR_review_penalty = 0.40   // 40% de los penaltis se revisan (v1.1+)
P_VAR_review_red     = 0.30   // 30% de las rojas directas se revisan
P_overturn           = 0.35   // 35% de las revisiones revierten la decisión

Si VAR activo y overturn: evento original se reemplaza por evento 'overturned'
El MatchEvent de VAR siempre se añade al feed (el jugador siempre ve el resultado)

⚠ Cuando VAR anula un gol (`var_review.outcome === 'overturned'` post-goal):
  - El MatchEvent `goal` se reemplaza por `goal_disallowed` en `MatchOutcome.events`
  - El scoreboard interno (`homeScore` / `awayScore`) se DECREMENTA — el gol no cuenta
  - `MatchOutcome.worldStateDeltas.match_performance_index` se recalcula con el score final corregido (F8)
  - La UI del live match (per ADR-018 OQ-LIVE-01) DEBE actualizar el marcador visiblemente para reflejar la decisión authoritative
  - Fix post-sprint-planning 2026-05-19: el slice mantuvo el score en pantalla por simplicidad (visual-only), pero el código de producción debe seguir la autoridad del simulador. Pablo's UX spec match-live.md AC documenta esta corrección.
```

---

### Manager Decisions (Pauses)

**Tipos de pausa:**

| Tipo | Trigger | Decisión requerida |
|------|---------|-------------------|
| `injury_pause` | MatchEvent type='injury' en titular | Elegir sustituto del banquillo (o continuar con 10 si no hay bench disponible o pool agotado) |
| `substitution_window` | Ticks 45, 60, 75 | Hasta 1 cambio voluntario por ventana (máx 5 total en pool compartido) + opción de cambio táctico |
| `end_of_match` | Tick 90 | Sin decisión — cierre del MatchSession |

**Sustituciones:**
- Máximo 5 cambios por partido (regla FIFA post-2020) — pool compartido entre sustituciones voluntarias y forzadas por lesión
- Banquillo: hasta 7 jugadores disponibles (configurados antes del partido por player-management)
- El sustituto hereda el slot de posición del sustituido; sus stats se aplican desde t+1
- Si no hay bench disponible en una `injury_pause`: el equipo continúa con 10 jugadores (MatchEvent `{type:'playing_with_ten'}`)
- Si el pool de 5 cambios está agotado y hay una nueva lesión: el equipo continúa con el jugador lesionado en campo o con 10 si no puede seguir

**Cambios tácticos (formation presets):**

| Formación | P_attack modifier | P_goal_conceded modifier | home_momentum modifier |
|-----------|-------------------|--------------------------|------------------------|
| 4-4-2 (default) | ×1.0 | ×1.0 | ×1.0 |
| 4-3-3 (ataque) | ×1.2 | ×1.15 | ×1.0 |
| 3-5-2 (control) | ×0.9 | ×1.05 | ×1.1 |
| 5-3-2 (defensivo) | ×0.75 | ×0.85 | ×1.0 |

**Instrucción de equipo (opcional, aplica sobre la formación):**

> **Aplicación per-team**: cada instrucción modifica el `BASE_ATTACK_RATE` de ese equipo individualmente (ver F5). Los dos equipos pueden tener instrucciones distintas simultáneamente sin romper el invariant de F5.

- `PRESS_HIGH`: `base_rate_own` +5%, P_injury_player ×1.1 (presionar cansa más)
- `HOLD_SHAPE`: `base_rate_own` -5%, `hold_shape_mod = 0.9` (reduce P_shot via F6 — ver F6)
- `COUNTER`: **Instrucción exclusiva para equipo visitante.** Si `home_momentum > 65`, `P_attack_away += P_attack_away × 0.10`. Cuando el equipo local la selecciona, el servidor devuelve HTTP `400 Bad Request` con `{ error: 'invalid_decision', reason: 'counter_unavailable_for_home' }`. La UI no debe mostrar COUNTER como opción para el home team. La condición `home_momentum > 65` solo beneficia al visitante porque P_attack_away depende inversamente del momentum.

**Flujo de pausa en servidor (Re-enqueue pattern):**

> **Nota arquitectónica (R2)**: BullMQ no soporta suspender un job en ejecución. El patrón correcto es **re-enqueue**: el job procesa ticks hasta el próximo evento de pausa, persiste un `MatchSessionSnapshot` en DB, completa el job atómicamente, y encola un nuevo job al recibir la decisión del manager. Un **delayed job** (`timeoutJobId` guardado en `match_sessions`) aplica la decisión default si el manager no decide antes de `MATCH_PAUSE_TIMEOUT_HOURS`. El handler HTTP `POST /matches/:id/decision` cancela el delayed job antes de encolar el job de reanudación.

```
Tick t genera pause event →
  // CRÍTICO: La DB transaction (pasos 1-3) debe COMMITAR antes de que BullMQ
  // marque el job como completado (paso 5). Si el proceso crashea entre commit y
  // job.complete(), BullMQ reintenta el job — el worker debe ser idempotente:
  // si encuentra snapshot.currentTick == t y state == 'paused_for_decision' en DB,
  // re-emite el Socket.IO event sin duplicar el snapshot.
  //
  // NOTA two-phase (R4): Redis (BullMQ) no puede participar en una txn PostgreSQL.
  // El delayed job se crea DESPUÉS del COMMIT — si queue.add() falla (Redis caído),
  // la sesión queda paused_for_decision con timeoutJobId=null. El recovery worker
  // (BullMQ RepeatableJob — ver especificación en §States and Transitions) detecta este estado.
  //
  // GUARD de idempotencia para retry (R6): si el worker crashea DESPUÉS del COMMIT
  // pero ANTES de job.complete(), BullMQ reintenta el job completo. El paso 3 NO debe
  // llamar queue.add() si timeoutJobId ya está persistido — de lo contrario se crea un
  // segundo delayed job huérfano que escapa a queue.remove() en el decision handler.
  // Pseudocódigo obligatorio en el worker:
  //   if (session.timeoutJobId === null) {
  //     const jobId = await queue.add('match-timeout', { matchSessionId, applyDefault: true },
  //                                    { delay: MATCH_PAUSE_TIMEOUT_HOURS * 3600000 });
  //     await db.update(matchSessions).set({ timeoutJobId: jobId }).where(eq(matchSessions.id, session.id));
  //   }
  1. BEGIN DB TRANSACTION:
     a. Escribir/upsert MatchSessionSnapshot en DB (ver tipo completo abajo)
     b. MatchSession.state = 'paused_for_decision', timeoutJobId = null
  2. COMMIT DB TRANSACTION
  3. queue.add() BullMQ delayed job (delay: MATCH_PAUSE_TIMEOUT_HOURS × 3600000 ms)
     → UPDATE match_sessions SET timeoutJobId = <new_job_id> WHERE id = ...
     (Si queue.add() falla: la sesión permanece paused con timeoutJobId=null hasta recovery)
  4. Completar el BullMQ job actual (libera el slot) — DESPUÉS del commit y del queue.add()
  5. Socket.IO → namespace `/match`, room `match:${matchSessionId}` (solo al socket del manager):
     Emitir evento `MatchPauseEvent` (ver tipo abajo)

Player decide → HTTP POST /matches/:id/decision →
  // SELECT FOR UPDATE previene que el timeout job y la decisión del player
  // ejecuten simultáneamente si el delayed job ya está en estado 'active'.
  1. BEGIN DB TRANSACTION + SELECT match_sessions WHERE id=... FOR UPDATE
  2. Verificar state == 'paused_for_decision'; si no → 409 Conflict ("already_processed")
  3. queue.remove(timeoutJobId) — si el job ya es 'active', el cancel falla
     silenciosamente; el FOR UPDATE garantiza que solo uno de los dos paths
     avanzará al paso 4
  4. MatchSession.state = 'in_progress' + aplicar decisión en snapshot
  5. COMMIT + Encolar nuevo BullMQ job desde MatchSessionSnapshot.currentTick+1
```

**Tipos de Socket.IO (R6):**

```typescript
// Namespace: /match   Room: match:${matchSessionId}   (solo al socket del manager)

interface MatchPauseEvent {
  type: 'match_pause';
  matchSessionId: string;
  decisionType: 'injury_pause' | 'substitution_window';
  eventsSoFar: MatchEvent[];
  options: {
    availableSubs: PlayerSlot[];                     // jugadores del banquillo del player disponibles
    currentFormation?: FormationPreset;              // solo en decisionType='substitution_window'
    currentInstruction?: TeamInstruction | null;     // solo en decisionType='substitution_window'
  };
}

// Emitido por el HTTP handler tras COMMIT de la decisión del manager:
interface MatchResumedEvent {
  type: 'match_resumed';
  matchSessionId: string;
}
```

> **PRNG y re-simulación (R3)**: La garantía de determinismo en re-simulación desde snapshot se logra mediante **serialización del estado PRNG** (Option B). El `MatchSessionSnapshot` incluye el campo `prngState: string` con el estado serializado del PRNG tras la última `ctx.rng()` del tick actual. Al reanudar un job desde el snapshot, el worker restaura el PRNG a este estado antes de continuar con `currentTick+1`. Esto es más robusto que garantizar un número fijo de llamadas por tick, ya que ramas condicionales (CARDS: "when a tackle occurs", INJURIES: "en ticks específicos") hacen que el número de llamadas por tick sea data-dependent.

> **Conflicto ADR-002 / ADR-013 (R4 — requiere acción pre-implementación)**: `createSimContext()` de ADR-002 usa `seedrandom(seed, { state: false })`. Para el match worker interactivo (ADR-013), se necesita `{ state: true }` para capturar `prng.getState()` y persistirlo en el snapshot. El match worker **NO puede usar `createSimContext()` directamente** sin modificación. Antes de implementar el match worker, ADR-002 debe actualizarse para soportar un parámetro `{ persistState?: boolean }` en la factory, o el match worker debe crear su propio `SimContext` con `{ state: true }`. Adicionalmente, `seedrandom` debe pinarse con versión exacta (sin `^`) en `packages/shared/package.json` — un cambio de versión menor puede alterar el formato de estado serializado e invalidar todos los snapshots live.

**Instrucciones son mutuamente exclusivas (R4):** `PRESS_HIGH`, `HOLD_SHAPE` y `COUNTER` son opciones single-select — un equipo solo puede tener UNA instrucción activa al mismo tiempo. No se pueden combinar. La UI debe renderizarlas como radio buttons, no como checkboxes. Si el manager no selecciona ninguna, el equipo opera sin instrucción adicional (`instruction_mod = 1.0`).

**Instrucciones de equipo:** `PRESS_HIGH`, `HOLD_SHAPE`, `COUNTER` se configuran al inicio del partido o en cada `substitution_window`. No pueden cambiarse entre ventanas — se confirman junto con la decisión de sustitución (o independientemente si el manager no realiza sustitución).

---

### Rival AI Manager (Resuelve OQ-MATCH-02 y OQ-MATCH-03)

El rival (equipo IA) toma decisiones automáticas en cada `substitution_window` y en `injury_pause`. El rival tiene su **propio pool de 5 cambios**, independiente del pool del jugador.

**Formación pre-partido del rival (R4):**

El rival selecciona su formación al inicio del partido mediante una regla determinista basada en `relative_strength` — esto garantiza variedad táctica para que las decisiones del manager sean significativas:

```
rival_avg_rating = mean(awayLineup.map(p => effective_rating(p, t=0)))
home_avg_rating  = mean(homeLineup.map(p => effective_rating(p, t=0)))
strength_ratio   = rival_avg_rating / home_avg_rating

awayFormation =
  strength_ratio > 1.10 ? '4-3-3'  // rival significativamente más fuerte → ataca
  strength_ratio < 0.90 ? '5-3-2'  // rival significativamente más débil → defiende
                        : '4-4-2'  // roughly igual → default
```

El rival **nunca cambia su formación durante el partido** (MVP — mid-match rival formation changes son v1.1+). El rival no usa instrucciones de equipo (PRESS_HIGH / HOLD_SHAPE / COUNTER). Los `formation_mod` de F6 y `formation_attack_mod` de F5 sí se aplican a la formación del rival.

**Algoritmo de sustitución rival (MVP — reglas simples):**
```
En cada substitution_window (ticks 45, 60, 75):
  Para cada titular rival con effective_fitness(t) < 40:
    Si hay jugadores en el banquillo rival en la misma posición:
      Sustituir por el de mayor effective_rating(t) del banco
      awaySubstitutionsUsed++
    Parar si awaySubstitutionsUsed == 5

En injury_pause del rival:
  Si hay banquillo disponible Y awaySubstitutionsUsed < 5:
    Sustituir con el primer jugador disponible del banco en la misma posición
    (o cualquier posición si no hay match de posición)
    awaySubstitutionsUsed++
  Si no: rival continúa con 10 (MatchEvent {type:'playing_with_ten', team:'away'})
```

**Instrucciones tácticas del rival:** El AI rival no usa instrucciones (PRESS_HIGH / HOLD_SHAPE / COUNTER). El AI rival no cambia su formación DURANTE el partido — la formación inicial se selecciona por strength_ratio al crear el MatchSession job (ver §Formación pre-partido del rival) y es fija hasta el tick 90.

**Carga del lineup rival (OQ-MATCH-03):** El `MatchSession.awayLineup` se carga desde `player-management` al crear el BullMQ job de inicio. El AI rival genera su alineación automáticamente: titulares = los 11 jugadores con mayor `effective_rating(t=0)` en el squad, respetando el mínimo de 1 GK, 2 DEF, 2 FWD.

---

### Post-Match Effects

Al finalizar el tick 90:

**`match_performance_index` delta:**
```
// player_club_won: bool — el club del jugador ganó (independientemente de si es local o visitante)
// goal_diff: |homeScore - awayScore| desde la perspectiva del ganador
// is_draw: bool

if player_club_won:
  mpi_delta = +10 + goal_diff * 5   // rango: +15 a +30 (goal_diff ≥ 1 en victoria; no existe victoria 0-0)
elif is_draw:
  if player_club_is_home:  mpi_delta = -3   // empate en casa: bajo el estándar de ganar en tu campo
  else:                    mpi_delta = +1   // empate fuera: punto valioso, supera la expectativa mínima
else:  // player_club_lost
  mpi_delta = -10 - goal_diff * 5   // rango: -10 a -30

worldStateDeltas['match_performance_index'] = clamp(mpi_delta, -30, +30)
// worldStateDeltas type: { match_performance_index: number; injury_risk: number }
// Usar object literal / Record — NO Map (Map no serializa a JSONB: JSON.stringify(new Map()) → '{}')
```

**Nota (R1 fix)**: La fórmula anterior usaba `winner === 'home'/'away'` produciendo mpi_delta negativo cuando el club del jugador ganaba de visitante. La fórmula ahora usa la perspectiva del club del jugador (`player_club_won`). El `SimContext` debe incluir `playerClubId` para que `player_club_won = (winner_club_id === playerClubId)`.

**`injury_risk` delta:**
```
injury_count = events.filter(e => e.type === 'injury').length
high_intensity = events.filter(e => e.type === 'yellow_card').length > 3 ? 1 : 0

injury_risk_delta = injury_count * INJURY_RISK_PER_INJURY
                  + high_intensity * INJURY_INTENSITY_BONUS

worldStateDeltas['injury_risk'] = clamp(injury_risk_delta, 0, +15)
```
Constantes: `INJURY_RISK_PER_INJURY = 5`, `INJURY_INTENSITY_BONUS = 3`

**Fitness individual** (responsibility de player-management, no de este sistema):
- Este GDD entrega `MatchOutcome.events` con `minutes_played` por jugador
- player-management aplica la fórmula de fatiga individual post-partido

---

### States and Transitions

```
MatchSession FSM:

  [pre_match]
      │ startMatch() — BullMQ job created
      ▼
  [in_progress]
      │ pause event (injury, sub_window)
      ▼
  [paused_for_decision] ◄─── resume(decision) ──────┐
      │                                               │
      │ decision received                             │
      ▼                                               │
  [in_progress] ──── next pause event ───────────────┘
      │ tick 90 reached
      ▼
  [completed]
      │ applyWorldStateDeltas() → cascade tick
      ▼
  [archived] (persisted in world_snapshot — ADR-005)

  [in_progress] OR [paused_for_decision]
      │ BullMQ worker crash — todos los reintentos agotados
      ▼
  [failed]
      │ recovery worker: restaurar último MatchSessionSnapshot
      │ aplicar decisiones default (segundo entrenador) para todos los ticks/pausas restantes
      ▼
  [completed] (partido concluido en modo auto-piloto — mismo resultado que timeout 24h)
  
  Nota: El jugador NO pierde el partido por un problema técnico. El segundo entrenador 
  completa el partido con decisiones conservadoras (no hacer nada en cada pausa).
  Si el snapshot es irrecuperable (DB corruption): archived con mpi_delta=0, injury_risk_delta=0
  y un evento de sistema en event-system. El estado [failed] es excluido del UNIQUE INDEX.
```

La pausa persiste hasta que el manager responde O transcurren `MATCH_PAUSE_TIMEOUT_HOURS` (default: 24h), tras lo cual el segundo entrenador aplica la decisión por defecto conservadora: no hacer nada. Este timeout es un mecanismo de recuperación de servidor — no castiga al jugador (el partido continúa con la opción más segura), en línea con P4.

**Lock de sesión única por club:** Constraint DB: `UNIQUE INDEX ON match_sessions(playthrough_id) WHERE state NOT IN ('completed', 'archived', 'failed')`. El endpoint `POST /matches/:id/start` devuelve `409 Conflict` con `"match_already_in_progress"` si ya existe una sesión activa para ese playthrough. El estado `failed` está excluido del índice para que el recovery worker pueda crear un nuevo job sin violar el constraint. Esto previene que una race condition cree dos jobs procesando el mismo WorldState y corrompa los `worldStateDeltas`.

**Query canónica (R6):** Cuando coexisten un registro `failed` y uno `in_progress` para el mismo `playthrough_id` (posible tras recovery), las queries en `repo.ts` que buscan la sesión activa DEBEN usar: `WHERE state NOT IN ('completed', 'archived', 'failed') ORDER BY created_at DESC LIMIT 1`. Sin `ORDER BY`, `findFirst` puede devolver el registro `failed` en lugar del activo, rompiendo la UI.

**Recovery worker (R6):** BullMQ RepeatableJob definido en `apps/api/src/jobs/queues.ts` con `pattern: '*/15 * * * *'` (cada 15 minutos). Detecta sesiones huérfanas (Redis cayó después del COMMIT, antes del `queue.add()`):
```sql
SELECT id FROM match_sessions
WHERE state = 'paused_for_decision'
  AND timeout_job_id IS NULL
  AND updated_at < NOW() - INTERVAL '2 minutes'
FOR UPDATE SKIP LOCKED
```
Por cada fila: encolar `queue.add('match-resume', { matchSessionId: id, applyDefaultDecision: true })` y actualizar `timeout_job_id`. `SKIP LOCKED` garantiza que múltiples instancias del worker no procesen la misma sesión. El intervalo de 2 minutos previene falsos positivos en sesiones recién creadas donde `timeout_job_id` todavía está en tránsito.

**MatchSessionSnapshot** — tipo persistido en DB entre jobs re-enqueueing:
```typescript
interface MatchSessionSnapshot {
  currentTick: number;
  eventsAccumulated: MatchEvent[];
  currentLineupHome: PlayerSlot[];        // lineup actual post-sustituciones aplicadas
  currentLineupAway: PlayerSlot[];
  homeMomentum: number;
  substitutionsUsed: number;              // pool player: voluntarias + forzadas por lesión
  awaySubstitutionsUsed: number;          // pool rival AI: independiente del player — VERIFICAR en ADR-013 (campo ausente en def. ADR-013)
  yellowCardsByPlayerId: Record<string, number>; // Map no es JSON-serializable (JSON.stringify → {}) — usar Record para JSONB
  currentFormationHome: FormationPreset;  // formación activa home en este tick
  currentFormationAway: FormationPreset;  // formación activa away (siempre 4-4-2 MVP)
  activeInstructionHome: TeamInstruction | null;
  activeInstructionAway: TeamInstruction | null;
  prngState: string;                      // estado serializado del PRNG tras la última rng() de currentTick
  state: MatchSessionState;
  timeoutJobId: string | null;            // BullMQ delayed job id para cancelar al recibir decisión
}
```

**fan_attendance en partidos de visitante:** El `SimContext` debe incluir el `fan_attendance` del estadio donde se juega el partido (siempre el del equipo local). Para partidos de visitante del club del jugador, se usa el `fan_attendance` del rival, no el del club del jugador. Esto refleja el efecto de intimidación del estadio contrario.

---

### Interactions with Other Systems

| Sistema | Dirección | Datos | Interfaz |
|---------|-----------|-------|----------|
| cascade-engine | ← lee | team_fitness, team_skill, squad_available_pct, field_quality, fan_attendance, staff_morale, player_happiness | FootballPlugin.worldStateReads + WorldState.get() |
| cascade-engine | → escribe | match_performance_index delta, injury_risk delta | MatchOutcome.worldStateDeltas |
| player-management | ← lee | PlayerState[] (skill, fitness, morale, form, stamina + position stats) para ambos lineups | Via MatchSession.homeLineup / awayLineup (loaded by BullMQ job) |
| player-management | → entrega | MatchOutcome.events (lesiones, minutos jugados) | Para aplicar fatiga individual post-partido |
| league-system | ← lee | Fixture del partido (home/away clubs, week, season) | Via MatchSession.fixture |
| league-system | → entrega | MatchOutcome (scores, winner) | Para actualizar tabla de clasificación |
| event-system | → entrega | MatchEvent[] (goals, cards, injuries, VAR) | Para trigger de mensajes del staff y eventos narrativos |
| hud-ui | → muestra | MatchPauseEvent + MatchEvent[] feed + marcador final | Via Socket.IO real-time feed |
| BullMQ | usa | Gestión del MatchSession state entre decisiones | matchWorker.ts — tick-by-tick processing con pause/resume |

> **Nota arquitectónica**: La naturaleza stateful del partido (pausa → decisión → resume) representa una extensión del contrato de ADR-007, que define `simulateMatch` como función pura. Este GDD propone extender la interfaz `SportPlugin` con un patrón de **match session** (proceso BullMQ pausable) en lugar de una función pura de un solo paso. Esto requiere una actualización de ADR-007 o un nuevo ADR-013. Flagged como `OQ-MATCH-01` en Open Questions.

---

### Contrato de Señal Causal (Pre-Match WorldState)

Para que la Player Fantasy del "detective de consecuencias" sea entregable, el sistema debe exponer el WorldState relevante antes del partido. Este es el **contrato de API que hud-ui.md consumirá** — no es responsabilidad de match-simulation mostrar los datos, pero sí de especificar cuáles deben estar disponibles.

`PreMatchSnapshot` (incluido en `MatchSession` al crear el BullMQ job):
```
{
  team_fitness: number        // WorldState.get('team_fitness')
  team_skill: number          // WorldState.get('team_skill')
  squad_available_pct: number // WorldState.get('squad_available_pct')
  field_quality: number       // WorldState.get('field_quality')
  fan_attendance: number      // WorldState.get('fan_attendance')
  staff_morale: number        // WorldState.get('staff_morale')
  player_happiness: number    // WorldState.get('player_happiness')
}
```

Estos son exactamente los 7 nodos que match-simulation lee como inputs (FootballPlugin.worldStateReads). Exponer el snapshot pre-partido permite al jugador conectar: "entré en este partido con team_fitness=58 (bajo) y field_quality=35 (deteriorado) → la derrota 0-1 en el minuto 85 tiene causas visibles antes de que empiece." Sin este snapshot, el "detective de consecuencias" no tiene las pistas necesarias.

Adicionalmente, cada `MatchEvent` incluye un campo `causal_node: string | null` que vincula el evento al WorldState node responsable. **En MVP, este campo es OBLIGATORIO para TODOS los eventos de tipo `injury`**, independientemente del nivel de `injury_risk` — no existe ningún threshold de activación. Toda lesión lleva `causal_node: 'injury_risk'`, vinculando explícitamente la baja con el nodo de WorldState que la condiciona. Esto garantiza que el "detective de consecuencias" es legible desde el primer partido con una baja, no solo en situaciones de crisis avanzada. El nivel de `injury_risk` en `PreMatchSnapshot` controla la *prominencia visual* del causal signal en la UI (color, énfasis en el texto del evento, copy contextual en hud-ui.md) — no si el campo se emite. Para todos los demás tipos de evento en MVP, `causal_node` puede ser `null` (el schema reserva el campo para v1.1+: goles condicionados por field_quality, tarjetas por team_fitness bajo, etc.).

## Formulas

### F1: Fitness efectiva durante el partido

`effective_fitness(player, t) = max(0, fitness - (t / 90) × (1 - stamina/100) × FITNESS_DECAY_MAX)`

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Condición física inicial | `fitness` | float | [0,100] | Stat de fitness del jugador al inicio del partido |
| Minuto actual | `t` | int | [1,90] | Tick del partido |
| Resistencia a la fatiga | `stamina` | float | [40,100] | Cuánta fitness se preserva bajo esfuerzo (floor=40 per player-management.md) |
| Decay máximo | `FITNESS_DECAY_MAX` | const | 15 | Pérdida máxima de fitness efectiva al minuto 90 para stamina=0 |

**Output Range:** [0, fitness] — clampeado a 0 si la resta sería negativa (R1 fix: clamp en fórmula, no solo en Edge Cases)
**Ejemplo:** Jugador con fitness=72, stamina=65 en t=90: `max(0, 72 - (1)×(0.35)×15) = max(0, 66.75) = 66.75`
**Ejemplo extremo:** fitness=8, stamina=40, t=90: `max(0, 8 - 0.6×15) = max(0, -1.0) = 0.0`

---

### F2: Rating efectivo del jugador

`effective_rating(player, t) = skill×0.35 + form×0.20 + morale×0.15 + effective_fitness(player,t)×0.30`

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Calidad técnica base | `skill` | float | [0,100] | Permanente; gestionada por player-management |
| Racha reciente | `form` | float | [30,90] | Media rolling de últimas 5 actuaciones (rango per player-management.md) |
| Motivación | `morale` | float | [0,100] | Influenciada por player_happiness (WorldState) |
| Fitness efectiva en t | `effective_fitness(player,t)` | float | [0,100] | Fórmula F1 |

**Output Range:** [13, 96] con los rangos reales de player-management.md (skill∈[20,95], form∈[30,90], morale∈[0,100], effective_fitness∈[0,100]). Mínimo: 20×0.35+30×0.20+0×0.15+0×0.30=**13**. Máximo: 95×0.35+90×0.20+100×0.15+100×0.30=**96.25**.
**Ejemplo:** skill=63, form=70, morale=60, effective_fitness=66.75: `22.05 + 14 + 9 + 20.03 = 65.08`

---

### F3: Momentum inicial del partido (home)

`home_momentum_initial = 50 + (field_quality - 50)/100 × 5 + (fan_attendance - 50)/100 × 5`

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `field_quality` | float | [0,100] | WorldState node — calidad del campo propio |
| `fan_attendance` | float | [0,100] | WorldState node — % de aforo |

**Output Range:** [45, 55] bajo condiciones normales
**Ejemplo:** field_quality=70, fan_attendance=60: `50 + 1.0 + 0.5 = 51.5`

---

### F4: Delta de momentum por tick

```
// formation_momentum_mod: 3-5-2 (5 midfielders) amplifica la contribución del mediocampo home.
// Otras formaciones no modifican el momentum (mod = 1.0).
formation_momentum_mod_home = (homeFormation === '3-5-2') ? 1.1 : 1.0

momentum_delta(t) = (pass_home × formation_momentum_mod_home - pass_away)/100 × 3.0
                  + (vis_home × formation_momentum_mod_home - vis_away)/100 × 2.0
                  + (rng() × 2 - 1)

home_momentum[t] = clamp(home_momentum[t-1] + momentum_delta, 20, 80)
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `pass_home/away` | float | [0,100] | Media de `passing` de los 4 MID del equipo |
| `vis_home/away` | float | [0,100] | Media de `vision` de los 4 MID |
| `formation_momentum_mod_home` | float | {1.0, 1.1} | 1.1 si homeFormation = '3-5-2'; 1.0 en cualquier otra formación |
| `rng()` | float | [0,1) | PRNG determinista — ctx.rng() |

**Output Range del delta:** drift técnico máximo = ±5.5 (solo componente skill, sin rng()); rango total incluyendo rng() ∈ [-6.5, +6.5) (rng() contribuye hasta ±1.0 al delta). Para equipos balanceados la contribución técnica es ≈0 y el rango efectivo es ≈[-1, +1]. Un equipo dominante puede alcanzar el clamp de momentum [20,80] en ~5 ticks desde el centro.
**Output Range del momentum:** [20, 80] por clamp
**Ejemplo:** pass_home=65, pass_away=60, vis_home=60, vis_away=57, rng()=0.6, homeFormation=4-4-2: `(65-60)/100×3.0 + (60-57)/100×2.0 + 0.2 = 0.15 + 0.06 + 0.2 = 0.41` → momentum sube 0.41 este tick

---

### F5: Probabilidad de ataque por tick

```
// Paso previo: calcular tasa base por equipo según formación e instrucción activa (R4 fix)
// formation_attack_mod: 4-3-3=1.2, 3-5-2=0.9, 5-3-2=0.75, 4-4-2=1.0 (ver tabla formaciones)
// instruction_mod: PRESS_HIGH=1.05, HOLD_SHAPE=0.95, ninguna=1.0
// Ambos modificadores se aplican multiplicativamente.
// formationAttackMods = { '4-4-2': 1.0, '4-3-3': 1.2, '3-5-2': 0.9, '5-3-2': 0.75 }
formation_attack_mod_home = formationAttackMods[homeFormation]
formation_attack_mod_away = formationAttackMods[awayFormation]
instruction_mod_home = PRESS_HIGH ? 1.05 : (HOLD_SHAPE ? 0.95 : 1.0)
instruction_mod_away = PRESS_HIGH_away ? 1.05 : (HOLD_SHAPE_away ? 0.95 : 1.0)
base_rate_home = BASE_ATTACK_RATE × formation_attack_mod_home × instruction_mod_home
base_rate_away = BASE_ATTACK_RATE × formation_attack_mod_away × instruction_mod_away

P_attack_home(t) = base_rate_home × (home_momentum[t] / 100) + avg_FWD_speed_home/100 × 0.03
P_attack_away(t) = base_rate_away × (1 - home_momentum[t] / 100) + avg_FWD_speed_away/100 × 0.03

// COUNTER instrucción (solo efectiva para away): aplicar después de calcular P_attack_away
if COUNTER_away AND home_momentum[t] > 65:
  P_attack_away(t) = P_attack_away(t) × 1.10

roll = rng()
if roll < P_attack_home              → home attack this tick
elif roll < P_attack_home + P_attack_away → away attack this tick
else                                 → no attack this tick
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `BASE_ATTACK_RATE` | const | 0.15 | Tasa base de ataques por tick. **Tuning knob principal de volumen de goles.** |
| `formation_attack_mod_home/away` | float | {0.75, 0.9, 1.0, 1.2} | Modificador per-team según formación activa (ver tabla formaciones) |
| `instruction_mod_home/away` | float | {0.95, 1.0, 1.05} | Modificador per-team según instrucción activa (mutuamente exclusiva con HOLD_SHAPE/COUNTER) |
| `home_momentum[t]` | float | [20,80] | Momentum del tick actual |
| `avg_FWD_speed` | float | [0,100] | Media de `speed` de los FWD del equipo |

**Output Range:** `P_attack_home` ∈ [0.0214, 0.1812] — mínimo con 5-3-2+HOLD_SHAPE+momentum=20+speed=0 (`0.15×0.75×0.95×0.20=0.0214`); sin instrucción, mínimo = 0.0225 (5-3-2+momentum=20). Máximo con 4-3-3+PRESS_HIGH+momentum=80+speed=100 (`0.15×1.26×0.80+0.03=0.1812`). En momentum=50, equipo medio con 4-4-2: ~0.09
**Ejemplo (t=45, momentum=52, FWD_speed_avg=70, 4-4-2 sin instrucción):** `0.15×1.0×1.0×0.52 + 0.70×0.03 = 0.099`
**Expected goals (equipos medios, 4-4-2 vs 4-4-2):** 90 × 0.099 × P_shot(0.42) × P_goal(0.34) ≈ **1.27 goles por equipo ≈ 2.5 goles totales**
**Invariant (P_attack sum):** Caso peor = ambos equipos con 4-3-3 + PRESS_HIGH (×1.2×1.05): `P_home_max = 0.15×1.26×0.80+0.03=0.181`; `P_away_max = 0.15×1.26×0.20+0.03=0.068`. Suma = 0.249 < 1.0. Con COUNTER activo en momentum=80: P_away_COUNTER = 0.068×1.10=0.075; suma = 0.256 < 1.0. El roll único de rng() funciona para cualquier combinación de formaciones e instrucciones.

---

### F6: Probabilidad de remate dado ataque

```
att_ctx       = (FWD.effective_rating × 0.4 + FWD.speed × 0.3 + avg_MID_vision × 0.3) / 100
def_ctx       = (DEF.effective_rating × 0.4 + DEF.strength × 0.3 + DEF.tackling × 0.3) / 100

// R3 fix: ambos modificadores se aplican multiplicativamente en un único divisor.
// formation_mod y hold_shape_mod pertenecen al equipo DEFENSOR (el que no está atacando en este tick).
// formation_mod: 4-4-2=1.0, 4-3-3=1.15, 3-5-2=1.05, 5-3-2=0.85
// hold_shape_mod: 0.9 si el equipo DEFENSOR tiene activa la instrucción HOLD_SHAPE, 1.0 en caso contrario
// Mayor divisor (formation_mod alto) → def_ctx_adj MENOR → P_shot AUMENTA → defensa MENOS efectiva.
// Ejemplo: defensor 4-3-3 (mod=1.15) concede más remates que defensor 5-3-2 (mod=0.85). Intencional.
def_ctx_adj   = def_ctx / (formation_mod × hold_shape_mod)

// Guard NaN: si att_ctx=0 AND def_ctx_adj=0 (DEF-portero con skill=0 exhausto),
// 0/0 produce NaN en TypeScript — el clamp no protege.
P_shot = (att_ctx + def_ctx_adj) > 0
       ? clamp(att_ctx / (att_ctx + def_ctx_adj) × 0.80, 0.10, 0.70)
       : 0.10  // fallback: mínimo del clamp (sin habilidad en ningún lado = remate improbable)
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `FWD.effective_rating` | float | [0,100] | F2 evaluada en el FWD atacante |
| `FWD.speed` | float | [0,100] | Stat position-specific del FWD |
| `avg_MID_vision` | float | [0,100] | Media de `vision` de los 4 MID atacantes |
| `DEF.effective_rating` | float | [0,100] | F2 evaluada en el DEF principal |
| `DEF.strength`, `DEF.tackling` | float | [0,100] | Stats position-specific del DEF |

**Output Range:** [0.10, 0.70] por clamp
**Ejemplo:** att_ctx=0.654, def_ctx=0.586: `0.654/1.240 × 0.80 = 0.42`

---

### F7: Probabilidad de gol dado remate

```
goal_att = (FWD.finishing × 0.6 + FWD.effective_rating × 0.4) / 100
gk_def   = (GK.reflexes × 0.5 + GK.handling × 0.3 + GK.effective_fitness(t) × 0.2) / 100

// Guard NaN: DEF-portero de emergencia con DEF.skill=0 exhausto produce gk_def=0.
// Si además goal_att=0, 0/0 = NaN en TypeScript — el clamp devuelve NaN, no 0.05.
P_goal = (goal_att + gk_def) > 0
       ? clamp(goal_att / (goal_att + gk_def) × 0.65, 0.05, 0.45)
       : 0.25  // fallback neutro: ambos sin habilidad = partido de calle, probabilidad media
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `FWD.finishing` | float | [0,100] | Stat position-specific del FWD atacante |
| `FWD.effective_rating` | float | [0,100] | F2 del FWD |
| `GK.reflexes`, `GK.handling` | float | [0,100] | Stats position-specific del portero |
| `GK.effective_fitness(t)` | float | [0,100] | F1 evaluada en el GK en el minuto t |

**Output Range:** [0.05, 0.45] por clamp
**Ejemplo:** goal_att=0.671, gk_def=0.601: `0.671/1.272 × 0.65 = 0.343`

---

### F8: Delta de match_performance_index

```
// R1 fix: perspectiva del club del jugador, no del equipo local
// player_club_won = (winner_club_id === playerClubId)  — del SimContext
// goal_diff = |homeScore - awayScore|

if player_club_won:  mpi_delta = +10 + goal_diff × 5   // rango: +15 a +30 (goal_diff ≥ 1 siempre en victoria)
elif is_draw:
  if player_club_is_home:  mpi_delta = -3   // empate en casa: bajo el estándar
  else:                    mpi_delta = +1   // empate fuera: punto valioso
else (lost):         mpi_delta = -10 - goal_diff × 5   // rango: -10 a -30

mpi_delta = clamp(mpi_delta, -30, +30)
worldStateDeltas['match_performance_index'] = mpi_delta
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `player_club_won` | bool | — | El club del jugador ganó (local o visitante) |
| `is_draw` | bool | — | Empate |
| `goal_diff` | int | [1, ~6] en victoria; 0 en empate | Diferencia de goles. En tiempo reglamentario MVP (sin penaltis), `goal_diff ≥ 1` cuando `player_club_won=true` — no existe victoria 0-0. |

**Output Range:** [-30, +30]
**Ejemplos:** Victoria 2-0 (en casa o fuera): +20. Victoria 1-0: +15. Derrota 0-2: -20. Empate en casa 1-1: -3. Empate fuera 1-1: +1. Victoria 5-0 (goal_diff=5): +30 (clampeado desde +35).
**Nota (R2 fix):** La diferenciación home/away en empates entrega la señal causal del "detective de consecuencias" — un empate heroico fuera y uno vergonzoso en casa producen deltas distintos en cascada. El cascade C6 propaga este delta a `fan_momentum` mediante la fórmula de histéresis asimétrica (K_win=8, K_loss=10 — cascade-engine.md R3, 2026-05-18).

---

### F9: Delta de injury_risk post-partido

```
injury_count    = events.filter(e => e.type === 'injury').length
high_intensity  = events.filter(e => e.type === 'yellow_card').length > 3 ? 1 : 0
injury_risk_delta = injury_count × INJURY_RISK_PER_INJURY
                  + high_intensity × INJURY_INTENSITY_BONUS
injury_risk_delta = clamp(injury_risk_delta, 0, +15)
worldStateDeltas['injury_risk'] = injury_risk_delta
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `injury_count` | int | [0, ~3] | Lesiones ocurridas durante el partido |
| `high_intensity` | 0/1 | {0,1} | 1 si hay >3 tarjetas amarillas |
| `INJURY_RISK_PER_INJURY` | const | 5 | Incremento de injury_risk por cada lesión |
| `INJURY_INTENSITY_BONUS` | const | 3 | Incremento adicional si el partido fue muy físico |

**Output Range:** [0, +15] — **solo incrementos**. El clamp mínimo=0 es defensivo (injury_count e high_intensity son siempre ≥0, así que el delta nunca puede ser negativo antes del clamp). El decay semanal de `injury_risk` es responsabilidad exclusiva de cascade-engine — este sistema NO implementa ningún decremento de injury_risk.
**Ejemplo:** 1 lesión + partido duro (4 amarillas): `1×5 + 1×3 = 8` → injury_risk sube 8 puntos

---

### F10: match_rating individual (output para player-management form update)

`match_rating(player) = effective_rating(player, t=90)`

(Resuelve OQ-MATCH-04 — ver Open Questions)

**Variables:** mismas que F2 evaluada en t=90
**Output Range:** [0, 100] (hereda el output de F2)
**Condición de emisión**: solo para jugadores con `minutes_played ≥ 30`

**Contrato de output**: `MatchOutcome.playerRatings: Record<string, number>` — el objeto incluye exactamente los jugadores del equipo del jugador con ≥30 minutos jugados. Player-management usa este objeto para actualizar el rolling average de `form` (F4 de player-management.md). **NO usar `Map<player_id, number>`** — `Map` no es JSON-serializable (`JSON.stringify(new Map(...))` produce `{}`); si `MatchOutcome` extiende la interfaz `SportPlugin` de ADR-007, actualizar la interfaz en `packages/shared/types/` antes de implementar.

**Ejemplo:** Jugador con skill=65, form=70, morale=75, fitness=55 (tras 90 min, stamina=60): effective_fitness(t=90) = max(0, 55-0.4×15) = max(0,49) = 49. match_rating = 65×0.35 + 70×0.20 + 75×0.15 + 49×0.30 = 22.75+14+11.25+14.7 = **62.7**

## Edge Cases

- **Si `squad_available_pct` ≤ 63 (7 o menos jugadores disponibles) al inicio del partido**: El partido no se puede disputar. Se registra como derrota por incomparecencia (0-3 por defecto de liga, o el reglamento que aplique). `worldStateDeltas`: `mpi_delta = -30`, `injury_risk_delta = 0`. El event-system genera un evento de crisis que activa mensajes del staff.

- **Si el portero se lesiona y no hay GK en el banquillo**: Un DEF ocupa la portería. Sus stats como GK: `reflexes = DEF.skill × 0.4`, `handling = DEF.skill × 0.3`. El equipo continúa con 10 jugadores de campo efectivos. El DEF-portero pierde sus stats de DEF para el cálculo de `def_ctx` en F6 durante el resto del partido.

- **Si dos lesiones ocurren en el mismo tick**: Se resuelven en orden de jugador (índice en lineup array). Ambas se incluyen en el mismo `injury_pause` event — el manager elige sustituto para cada una (o ninguna). Si solo hay un sustituto disponible para dos lesionados, el manager elige quién recibe al sustituto; el otro continúa con su lesión o el equipo queda con 10.

- **Si `home_momentum` alcanza el clamp (20 o 80)**: Hard clamp. Un equipo con mucha ventaja técnica puede dominar con momentum≈80; el rival siempre tiene `P_attack_away_min ≈ 0.03+`, garantizando que puede contraatacar ocasionalmente.

- **Si `effective_fitness(player, t)` baja de 0** (fitness muy baja + stamina=0 + t=90): Clampear a 0. El jugador sigue en campo con `effective_rating_min ≈ skill×0.35 + form×0.20 + morale×0.15` — rinde muy por debajo de su nivel base pero no se retira automáticamente.

- **Si un jugador expulsado (roja) es el único DEF disponible**: El equipo defiende con 3 DEF restantes. `def_ctx` en F6 usa la media de DEF restantes. El manager puede sustituir en la próxima ventana si tiene sustituciones disponibles.

- **Si VAR revierte un gol en el minuto 89 o 90**: El marcador final usa el resultado post-VAR. Event feed: `{type:'goal', minute:89}` → `{type:'goal_disallowed', minute:89, reason:'offside'}`. `mpi_delta` (F8) se calcula sobre el marcador post-VAR.

- **Si el partido genera 4+ goles de diferencia (`mpi_delta` clampea a ±30)**: Victorias más amplias no crean efectos de cascada desproporcionados. El límite ±30 evita que una goleada 5-0 produzca un `fan_momentum` desequilibrante y hace que el tuning sea más estable.

- **Si `BASE_ATTACK_RATE` o pesos de formación producen 0 ataques en 90 ticks**: Imposible bajo los valores definidos. El mínimo `P_attack = 0.15×0.75×0.95×0.20 = 0.0214` (5-3-2+HOLD_SHAPE+momentum=20+speed=0) garantiza ≥1 ataque esperado en ~47 ticks. Con 90 ticks disponibles, el equipo más defensivo espera ≈1.9 ataques por partido. Un partido sin ningún ataque es matemáticamente improbable (<0.05%).

- **Si el manager cierra el navegador sin tomar una decisión en una pausa**: La pausa persiste en DB. El BullMQ job espera hasta `MATCH_PAUSE_TIMEOUT_HOURS = 24` horas reales. Si el manager vuelve antes de las 24h, el partido se recupera desde el estado exacto en que se pausó (misma seed, mismo tick). Si se cumple el timeout, el segundo entrenador aplica la decisión por defecto: **no hacer nada** — no se realizan sustituciones (para lesiones: el equipo continúa con 10; para cambios voluntarios: se omite el cambio). El partido continúa y el manager asume las consecuencias de su ausencia.

## Dependencies

### Dependencias upstream (este sistema depende de)

| Sistema | GDD | Tipo | Interfaz requerida | Notas |
|---------|-----|------|--------------------|-------|
| Motor de Cascadas | `cascade-engine.md` | **Hard** | `WorldState.get(nodeId)` para reads; `worldStateDeltas` para writes | Lee team_fitness, team_skill, squad_available_pct, field_quality, fan_attendance, staff_morale, player_happiness |
| Player Management | `player-management.md` *(Designed)* | **Hard** | `PlayerState[]` por lineup (homeLineup, awayLineup) | Stats individuales de los 11 titulares + bench. Sin estos datos no se puede calcular `effective_rating` por jugador |
| League System | `league-system.md` *(Approved)* | **Hard** | `MatchFixture` (home club, away club, weekNumber, seasonId) | Define qué partido se juega cuándo |
| ADR-002: Determinismo | — | **Hard** | `SimContext` con `seedrandom` | Única fuente de aleatoriedad: `ctx.rng()`. Sin esto el partido no es reproducible |
| ADR-007: Sport-Agnostic | — | **Hard** | `SportPlugin` interface + `TeamState` + `MatchOutcome` | Arquitectura de plugin ya definida; este GDD especifica las constantes concretas del FootballPlugin |

### Dependencias downstream (otros sistemas dependen de este)

| Sistema | GDD | Tipo | Datos que consume | Notas |
|---------|-----|------|-------------------|-------|
| Motor de Cascadas | `cascade-engine.md` | **Hard** | `MatchOutcome.worldStateDeltas` (mpi, injury_risk deltas) | Aplicados en el tick semanal post-partido |
| Player Management | `player-management.md` *(Approved)* | **Hard** | `MatchOutcome.events` (minutos jugados, lesiones por jugador) | Para aplicar fatiga individual y actualizar `form` rolling average |
| League System | `league-system.md` *(Approved)* | **Hard** | `MatchOutcome` (homeScore, awayScore, winner) | Para actualizar tabla de clasificación, gestionar ascenso/descenso |
| Event System | `event-system.md` *(Approved)* | Soft | `MatchEvent[]` (goals, cards, injuries, VAR) | Trigger de mensajes del staff y eventos narrativos post-partido |
| HUD/UI Principal | `hud-ui.md` *(Not Started)* | Soft | `MatchPauseEvent + MatchEvent[]` feed, marcador final | Presentación DOM del partido vía Socket.IO |

**Nota de bidireccionalidad**: player-management.md y league-system.md tienen dependencia mutua con este sistema (este los necesita para empezar el partido; ellos lo necesitan para los resultados). cascade-engine.md ya documenta su relación con match-simulation en su sección de Dependencies.

## Tuning Knobs

| Knob | Valor MVP | Rango seguro | Qué rompe en extremos |
|------|-----------|-------------|----------------------|
| `BASE_ATTACK_RATE` | 0.15 | [0.08, 0.22] | Bajo: partidos 0-0 frecuentes. Alto: 5+ goles normales, pierde drama. |
| `FITNESS_DECAY_MAX` | 15 | [8, 25] | Bajo: stamina irrelevante. Alto: minutos 80-90 inútiles para baja stamina; favorece over-rotation. |
| Formation modifier ataque (4-3-3: ×1.2) | ×1.2 | [×1.0, ×1.5] | Por encima de ×1.5, la formación domina y no hay contrapartida real. |
| Formation modifier defensa (5-3-2: ×0.85) | ×0.85 | [×0.70, ×1.0] | Por debajo de ×0.70, la formación hace el partido prácticamente imbatible. |
| `P_VAR_review_goal` | 0.25 | [0.10, 0.40] | Bajo: VAR invisible. Alto: VAR domina la narrativa; todo partido tiene revisión. |
| `P_overturn` | 0.35 | [0.15, 0.55] | Bajo: VAR siempre confirma, decorativo. Alto: más del 50% de las revisiones revierten — desequilibra. |
| `INJURY_RISK_PER_INJURY` | 5 | [2, 10] | Bajo: lesiones no impactan la semana siguiente. Alto: un partido duro crea crisis crónica de lesiones. |
| `INJURY_INTENSITY_BONUS` | 3 | [0, 8] | Bajo: partido físico sin diferencia. Alto: muchas tarjetas = crisis de lesiones garantizada. |
| `MATCH_PAUSE_TIMEOUT_HOURS` | 24 | [4, 168] | Bajo: frustrante para jugador casual. Alto: partido bloqueado días en DB. |
| `P_yellow` base | 0.12 | [0.05, 0.20] | Bajo: sin drama de tarjetas. Alto: expulsiones cada partido. |
| `P_red_direct` | 0.003 | [0.001, 0.008] | Bajo: rojas directas casi nunca. Alto: >1 por temporada normal (demasiado frecuente). |

**Interacciones entre knobs**:
- `BASE_ATTACK_RATE` + `P_VAR_review_goal` + `P_overturn` determinan los goles efectivos por partido. Ajustar siempre como grupo.
- `INJURY_RISK_PER_INJURY` debe coordinarse con el decay semanal de `injury_risk` en cascade-engine — si el decay es lento, un partido duro puede dejar el squad en riesgo crónico varias semanas.
- El rango `mpi_delta` ±30 debe reverificarse contra C6 de cascade-engine con K_loss=10 (cascade-engine R3, 2026-05-18 — anterior calibración usaba K_loss=14). Cambiar el rango de `mpi_delta` requiere recalibrar la histéresis de cascade-engine. (R1: referencia actualizada de K_loss=14→10.)

## Visual/Audio Requirements

**MVP (DOM-only):**
- **Iconos en el feed de eventos**: símbolo por tipo de evento en la lista de MatchEvent — ⚽ gol, 🟨 amarilla, 🟥 roja, 🤕 lesión, 🎥 VAR. No sprites, no canvas.
- **Marcador en tiempo real**: componente DOM `[home_score] — [away_score] · [t]'` actualizado por Socket.IO en cada evento significativo (gol, tarjeta, lesión).
- **Indicador de VAR**: notificación visual no blocking — `"🎥 VAR revisando el gol…"` → `"✅ Gol confirmado"` o `"❌ Gol anulado (fuera de juego)"`.
- **Iconos de formación**: identificador textual de la formación activa (ej. "4-4-2") visible en las sub_windows.

**Audio (minimal MVP):**
- Sonido de gol (fanfare corto, ~1 segundo)
- Silbato de fin de partido
- Sonido de tarjeta roja/lesión (dramatic sting)
- Sin música de fondo exclusiva del partido (la música ambiental del juego continúa a volumen reducido)

> 📌 **Asset Spec** — Visual/Audio requirements definidos. Después de aprobar el art bible, correr `/asset-spec system:match-simulation` para generar specs de iconos e integración de audio.

---

## UI Requirements

1. **Match Feed Panel** — Lista cronológica de MatchEvent[]. Cada entrada muestra: icono del tipo, minuto, equipo, descripción breve. Auto-scroll al evento más reciente; scroll manual disponible para ver eventos pasados.

2. **Match Scoreboard** — Siempre visible durante el partido: nombre equipo home | score home – score away | nombre equipo away + minuto actual. Actualizado en tiempo real vía Socket.IO.

3. **Decision Modal (injury_pause / substitution_window)** — Bloquea el avance del partido hasta decisión del manager. Muestra: descripción del evento de pausa, lista de opciones de sustitución (jugadores disponibles del bench con stats resumidas), y opción de cambio táctico si es sub_window. CTA principal: "Confirmar". CTA secundario: "No hacer nada". El modal cumple `min 44×44 CSS px` en mobile (`accessibility-requirements.md`).

4. **VAR Notification** — Toast no blocking: muestra el estado del VAR en tiempo real ("Revisando…" → resultado). No requiere acción del jugador. Anchored al top del Match Feed Panel (patrón Toast de `interaction-patterns.md`).

5. **Post-Match Summary Panel** — Al completarse el partido: marcador final, lista de eventos clave (goles, tarjetas rojas, lesiones, VAR reversals), `match_performance_index` delta resultante, link a la siguiente acción (Decision Panel principal o tabla de clasificación).

> 📌 **UX Flag — Match Simulation**: Este sistema tiene requisitos de UI. En Pre-Production, correr `/ux-design match-view` para crear la UX spec completa antes de escribir las epics. Las stories de UI deben referenciar `design/ux/match-view.md`, no este GDD directamente.

---

## Acceptance Criteria

> **Story type**: Logic — todos los criterios requieren tests automatizados en `tests/unit/sim/match-simulation/`, **salvo donde el propio AC especifique explícitamente otra ubicación** (AC-03b y AC-24 son tests de integración en `tests/integration/sim/match-simulation/` — no pueden ejecutarse con mocks de DB). Son **BLOCKING** antes de marcar cualquier historia de match-simulation como Done.

**AC-01 — Determinismo (decisiones default)**
- **GIVEN** un `SimContext` con seed `"abc123"` y un `WorldState` inicial fijo, **WHEN** el partido se simula dos veces sin intervención del manager (todas las pausas resueltas con decisión default), **THEN** ambas simulaciones producen exactamente el mismo `MatchEvent[]` en los mismos minutos, el mismo marcador final, y los mismos `worldStateDeltas`.

**AC-02 — Determinismo (con intervención scripted)**
- **GIVEN** un `SimContext` con seed `"abc123"`, un `WorldState` inicial fijo, y un script de decisiones predefinidas (ej. sustitución en minuto 45: jugador A por B), **WHEN** el partido se simula dos veces aplicando las mismas decisiones, **THEN** ambas simulaciones producen el mismo `MatchEvent[]` y el mismo marcador final.

**AC-03a — Pausa en substitution_window (unit)**
- **GIVEN** un partido en progreso sin lesiones, **WHEN** el simulador alcanza el tick 45, **THEN** `MatchSession.state` transiciona a `'paused_for_decision'` con `decision_type: 'substitution_window'`, y el simulador no genera eventos para ticks ≥ 46 sin recibir una decisión.

**AC-03b — Emisión Socket.IO en substitution_window (integration)**
- **GIVEN** el simulador con un `MatchEventEmitter` injectable en `SimContext`, partido sin lesiones, **WHEN** el simulador alcanza el tick 45, **THEN** el `MatchEventEmitter` recibe exactamente un evento `{type:'match_pause', decision_type:'substitution_window', events_so_far: MatchEvent[]}`.

**AC-04 — Límite de 5 sustituciones (pool compartido)**
- **GIVEN** el manager ha realizado 5 sustituciones (voluntarias y/o forzadas por lesión, pool compartido), **WHEN** se envía una sexta sustitución via `POST /matches/:id/decision`, **THEN** el endpoint retorna error y `MatchOutcome.events` no contiene más de 5 eventos `{type:'substitution', team:'home'}`.
- **GIVEN** el manager ha realizado 2 voluntarias y han ocurrido 3 forzadas por lesión (pool = 5/5), **WHEN** se produce una cuarta lesión, **THEN** el `MatchEvent[]` contiene `{type:'playing_with_ten'}` si el jugador lesionado no puede continuar (sin sustitución disponible).

**AC-05 — worldStateDeltas contiene exactamente 2 propiedades**
- **GIVEN** cualquier partido completado (victoria, derrota o empate), **WHEN** se inspecciona `MatchOutcome.worldStateDeltas`, **THEN** el objeto contiene exactamente las propiedades `'match_performance_index'` e `'injury_risk'`, y NO contiene la propiedad `'fan_momentum'`. Verificar con: `Object.keys(worldStateDeltas).sort()` deepEqual `['injury_risk', 'match_performance_index']`.

**AC-06 — VAR no genera pausa del manager**
- **GIVEN** un partido en el que un gol genera una revisión VAR que lo revierte, **WHEN** el VAR resuelve, **THEN** el `MatchEvent[]` contiene `{type:'goal_disallowed'}`, el marcador final no incluye ese gol, y `MatchSession.state` NUNCA transiciona a `'paused_for_decision'` como consecuencia del VAR.

**AC-07 — F1: effective_fitness decay correcto y clamp a 0**
- **GIVEN** un jugador con `fitness=72`, `stamina=65`, evaluado en `t=90`, **WHEN** se calcula `effective_fitness(player, 90)`, **THEN** el resultado es `66.75`; con `stamina=100` en cualquier tick el resultado es igual al `fitness` inicial sin decremento.
- **GIVEN** un jugador con `fitness=8`, `stamina=40`, evaluado en `t=90`, **WHEN** se calcula `effective_fitness`, **THEN** el resultado es `max(0, 8 - 1.0 × 0.60 × 15) = max(0, -1.0) = 0.0`, no `-1.0`. El clamp a 0 garantiza que `P_goal` en F7 no recibe `gk_def` negativos.

**AC-08 — F2: effective_rating compuesto correcto**
- **GIVEN** un jugador con `skill=63`, `form=70`, `morale=60`, `effective_fitness=66.75`, **WHEN** se calcula `effective_rating(player, t)`, **THEN** el resultado es `65.08`; una variación de ±1 en cualquier stat produce una variación proporcional al peso definido en la fórmula.

**AC-09 — F3: momentum inicial en rango [45, 55]**
- **GIVEN** `field_quality=70`, `fan_attendance=60`, **WHEN** se calcula `home_momentum_initial`, **THEN** el resultado es `51.5`; para cualquier combinación válida en [0,100], `home_momentum_initial` está en [45, 55].

**AC-10 — F4: momentum clampeado a [20, 80]**
- **GIVEN** un equipo home con MID `technique=95`, `vision=95` vs. rival con `technique=5`, `vision=5`, **WHEN** se simulan 90 ticks de momentum, **THEN** ningún valor de `home_momentum[t]` supera 80 ni baja de 20.

**AC-11 — F5: media de goles en rango esperado**
- **GIVEN** dos equipos con fixture canónico fijo: skill=60, form=60, morale=60, fitness=90, stamina=70, speed=60, finishing=60, passing=60, vision=60, reflexes=60, handling=60, strength=60, tackling=60; `BASE_ATTACK_RATE=0.15`, lineup=4-4-2 por defecto, sin instrucciones tácticas, `player_club_is_home=true`, usando **`seedrandom` v3** (implementación del proyecto — `ctx.rng = seedrandom(seed, { state: true })`) **WHEN** se ejecutan 10,000 simulaciones de 90 ticks con seeds `"test:goals:0000"` a `"test:goals:9999"`,
- **THEN**: (1) La **media** de goles totales por partido está en `[2.0, 3.0]`; (2) La **desviación estándar** de goles por partido (per-simulación, no del estimador de la media) está en `[0.8, 2.5]` — SD fuera de este rango indica distribución de goles anormalmente estrecha o ancha; (3) El resultado es 100% reproducible entre ejecuciones de CI dado el mismo rango de seeds.
- **Nota de implementación**: Este test requiere `testTimeout: 300_000` en `vitest.config.ts` (budget máximo 5 min para 10,000 simulaciones). **AC-19 es un prerrequisito estructural**: AC-11 debe incluir un `beforeAll` que ejecute la simulación canónica, mida su tiempo, y aborte con mensaje explícito `"PREREQUISITE AC-19 FAILED: simulation > 50ms — run AC-19 first"` si supera el umbral. Sin este guard, CI reportará "timeout" en lugar del diagnóstico correcto.

**AC-12 — F6: P_shot clampeada a [0.10, 0.70]**
- **GIVEN** un atacante con todas las stats a 100 vs. un defensa con stats a 0, **WHEN** se calcula `P_shot`, **THEN** el resultado no supera `0.70`; con atacante a 0 vs. defensa a 100, no baja de `0.10`.

**AC-13 — F7: P_goal clampeada a [0.05, 0.45]**
- **GIVEN** un FWD con `finishing=100`, `effective_rating=100` vs. GK con `reflexes=0`, `handling=0`, `effective_fitness=0`, **WHEN** se calcula `P_goal`, **THEN** el resultado no supera `0.45`; con FWD a 0 vs. GK a 100, no baja de `0.05`.

**AC-14 — F8: mpi_delta por resultado (perspectiva del club del jugador)**
- **GIVEN** `player_club_is_home=true`, marcador home=2 away=0 (victoria en casa), **WHEN** se calcula `mpi_delta`, **THEN** resultado = `+20`.
- **GIVEN** `player_club_is_home=true`, marcador home=0 away=2 (derrota en casa), **WHEN** se calcula `mpi_delta`, **THEN** resultado = `-20`.
- **GIVEN** `player_club_is_home=false` (visitante), marcador home=1 away=2 (**victoria de visitante**), **WHEN** se calcula `mpi_delta`, **THEN** resultado = `+15` (goal_diff=1, player_club_won=true → +10+5). **Verificación crítica**: la victoria de visitante produce mpi_delta POSITIVO.
- **GIVEN** `player_club_is_home=false` (visitante), marcador home=3 away=1 (derrota de visitante), **WHEN** se calcula `mpi_delta`, **THEN** resultado = `-20`.
- **GIVEN** `player_club_is_home=true`, empate 1-1 en casa, **WHEN** se calcula `mpi_delta`, **THEN** resultado = `-3` (empate en casa: bajo el estándar).
- **GIVEN** `player_club_is_home=false`, empate 1-1 fuera, **WHEN** se calcula `mpi_delta`, **THEN** resultado = `+1` (empate fuera: punto valioso). **Verificación crítica**: el mismo marcador 1-1 produce deltas distintos según venue.
- **GIVEN** victoria 5-0 (player_club_won, goal_diff=5), **WHEN** se calcula `mpi_delta`, **THEN** resultado = `+30` (clampeado desde +35).

**AC-15 — F9: injury_risk_delta con clamp**
- **GIVEN** un partido con 2 lesiones y exactamente 4 tarjetas amarillas (`high_intensity = events.filter(e=>e.type==='yellow_card').length > 3 ? 1 : 0 → 1`), **WHEN** se calcula `injury_risk_delta`, **THEN** resultado = `2×5 + 1×3 = 13`.
- **GIVEN** un partido con 3 lesiones y 4 tarjetas amarillas (high_intensity=1), **WHEN** se calcula `injury_risk_delta`, **THEN** el valor sin clamp sería `3×5 + 1×3 = 18`; el resultado final es `clamp(18, 0, 15) = 15`.
- **GIVEN** un partido con 0 lesiones y exactamente 3 tarjetas amarillas (high_intensity=0), **WHEN** se calcula `injury_risk_delta`, **THEN** resultado = `0` (no llega a threshold >3 y no hay lesiones).

**AC-16 — Edge: derrota por incomparecencia**
- **GIVEN** un `WorldState` donde `squad_available_pct = 60` (≤ 63%), **WHEN** se intenta iniciar el partido, **THEN** el partido no genera 90 ticks; `MatchOutcome.homeScore=0`, `awayScore=3`; `worldStateDeltas['match_performance_index'] === -30`; `worldStateDeltas['injury_risk'] === 0`; el `MatchEvent[]` contiene un evento de crisis para el event-system.

**AC-17 — Edge: portero lesionado sin GK en banquillo**
- **GIVEN** el GK titular se lesiona en el minuto 30, el banquillo no tiene ningún GOALKEEPER, y el mejor DEF del banco tiene `DEF.skill=70`, `fitness=90`, `stamina=70`, **WHEN** la `injury_pause` se resuelve,
- **THEN** el `MatchEvent[]` contiene una sustitución donde el sustituto tiene `position: 'DEF'` con `assignedAs: 'GK'` y stats calculadas: `reflexes = 70 × 0.4 = 28`, `handling = 70 × 0.3 = 21`.
- **THEN** al calcular F7 en t=31 con el DEF-portero (reflexes=28, handling=21, effective_fitness≈88.5) vs un FWD con finishing=70, effective_rating=65: `gk_def_DEF = (28×0.5 + 21×0.3 + 88.5×0.2)/100 = 0.380`; `goal_att = (70×0.6 + 65×0.4)/100 = 0.680`; `P_goal_DEF_portero = clamp(0.680/(0.680+0.380)×0.65, 0.05, 0.45) ≈ 0.417`.
- **THEN** con el GK titular original (reflexes=70, handling=60, effective_fitness≈88.5): `gk_def_GK = (70×0.5 + 60×0.3 + 88.5×0.2)/100 = 0.712`; `P_goal_GK_normal = clamp(0.680/(0.680+0.712)×0.65, 0.05, 0.45) ≈ 0.318`.
- **VERIFICACIÓN**: `P_goal_DEF_portero (0.417) > P_goal_GK_normal (0.318)` — el DEF como portero es significativamente peor, cuantificable con estos valores fijos.

**AC-18 — Edge: timeout 24h de pausa (decisión por defecto)**
- **GIVEN** el partido está en `'paused_for_decision'` por lesión en minuto 60 con sustituto disponible, **WHEN** el delayed BullMQ timeout se dispara (simulado con `SimContext.decisionTimeoutMs: 0` y fake clock de Vitest), **THEN** el job de reanudación se ejecuta automáticamente; no se registra ningún evento `{type:'substitution'}` del segundo entrenador; el `MatchEvent[]` contiene `{type:'playing_with_ten'}`; el partido completa los ticks hasta el 90.
- **Nota de implementación**: `SimContext.decisionTimeoutMs` debe ser injectable (default: `24 × 60 × 60 × 1000`). Sin este campo, el AC no es testeable en Vitest sin esperar 24h reales.

**AC-19 — Performance: tiempo de simulación**
- **GIVEN** un partido completo de 90 ticks con 11 titulares + 7 suplentes por equipo, sin pausas, **WHEN** se ejecuta la simulación pura en Node.js (sin I/O de DB), **THEN** el tiempo total medido con `performance.now()` es menor a 50ms.

> *AC-20 consolidado en AC-07 (R2, 2026-05-18): el caso de clamp effective_fitness ≤ 0 se cubre en AC-07, segundo escenario.*

**AC-21 — Ventanas de sustitución en ticks exactos**
- **GIVEN** un partido completado sin lesiones y sin sustituciones voluntarias del manager, **WHEN** se inspecciona el `MatchEvent[]`, **THEN** contiene exactamente 3 eventos `{type:'substitution_window'}` en los minutos 45, 60 y 75; y ningún `{type:'substitution_window'}` en otros minutos.

**AC-22 — Segundo amarillo produce roja automática**
- **GIVEN** el estado interno del simulador con `yellowCardsByPlayerId['X'] = 1` (jugador X con una amarilla previa), **WHEN** el `P_yellow` roll positivo selecciona al jugador X en un tackle-check, **THEN** el `MatchEvent[]` contiene `{type:'yellow_card', player_id:'X', minute:t}` seguido inmediatamente de `{type:'red_card', player_id:'X', minute:t, reason:'second_yellow'}`; **Y** los ticks > t reflejan que el equipo de X tiene un jugador menos disponible en campo.

**AC-23 — Jugador de campo lesionado con banquillo vacío**
- **GIVEN** el banquillo tiene 0 jugadores disponibles y un jugador de campo (posición MID) se lesiona en el tick 50, **WHEN** el simulador procesa la `injury_pause`, **THEN** el `MatchEvent[]` NO contiene ningún `{type:'substitution'}` en respuesta a esa lesión; **Y** contiene `{type:'playing_with_ten'}` en el minuto 50; **Y** el partido continúa desde el tick 51 con 10 jugadores en campo.

**AC-24 — Idempotencia: timeout y decisión simultánea producen exactamente una reanudación**
- **GIVEN** el partido está en `'paused_for_decision'`, el delayed timeout job está en estado `active` (ya en ejecución), y el manager envía `POST /matches/:id/decision` simultáneamente, **WHEN** ambas rutas ejecutan concurrentemente, **THEN**: (1) exactamente un job de reanudación es encolado (el `MatchEvent[]` no se duplica); (2) el segundo path recibe `409 Conflict` con `"already_processed"`; (3) el partido completa los 90 ticks exactamente una vez.
- **Test location**: `tests/integration/sim/match-simulation/` — **NO** `tests/unit/`. AC-24 requiere PostgreSQL real con `SELECT FOR UPDATE` activo. Un mock no puede verificar el mecanismo garantizador de exclusión mutua. Testar con `Promise.all([decision(), simulatedTimeout()])` contra DB real en Docker Compose.

**AC-25 — VAR anulado aplica mpi_delta sobre marcador post-VAR**
- **GIVEN** el marcador es home=1 away=0 en el minuto 85, un gol home es revisado y anulado por VAR (`goal_disallowed`), terminando el partido 0-0 (empate), y `player_club_is_home=true`, **WHEN** se calcula `mpi_delta` en F8, **THEN** el resultado es `-3` (empate en casa), no `+15` (que habría sido la victoria 1-0 pre-VAR). El `MatchOutcome.homeScore` es 0 en el resultado final.

**AC-26 — COUNTER: sin efecto cuando momentum ≤ 65, sin efecto para home team**
- **GIVEN** el equipo away usa instrucción `COUNTER` y `home_momentum[t] = 60`, **WHEN** se calcula `P_attack_away(t)`, **THEN** el resultado es igual al calculado SIN COUNTER (el umbral 65 no se cumple; no se aplica el ×1.10).
- **GIVEN** el equipo home usa instrucción `COUNTER` y `home_momentum[t] = 70`, **WHEN** se calcula `P_attack_home(t)`, **THEN** el resultado es igual al calculado SIN COUNTER (COUNTER no tiene efecto para el home team).

**AC-27 — Rival AI: cero sustituciones cuando effective_fitness ≥ 40 (R4)**
- **GIVEN** todos los titulares del equipo rival tienen `effective_fitness(t) ≥ 40` en cada ventana de sustitución (minutos 45, 60, 75), y el banquillo rival tiene jugadores disponibles, **WHEN** el simulador procesa las tres `substitution_window`, **THEN** el `MatchEvent[]` no contiene ningún evento `{type:'substitution', team:'away'}` generado por el rival AI; y `awaySubstitutionsUsed` es 0 al finalizar el partido.

**AC-28 — causal_node obligatorio en todos los eventos injury (R6)**
- **GIVEN** un partido que genera al menos un evento `{type:'injury'}`, **WHEN** se inspecciona el `MatchEvent[]`, **THEN** TODOS los eventos con `type:'injury'` tienen el campo `causal_node` con valor exactamente `'injury_risk'` — no `null`, no `undefined`, no otra cadena.
- **GIVEN** un partido que genera eventos de cualquier otro tipo (`goal`, `yellow_card`, `red_card`, `substitution`, `var_review`, `substitution_window`), **WHEN** se inspecciona el `MatchEvent[]`, **THEN** el campo `causal_node` de esos eventos puede ser `null` (no se exige valor en MVP).

**AC-29 — Instrucciones mutuamente exclusivas: enforcement HTTP (R6)**
- **GIVEN** el partido está en `'paused_for_decision'` (cualquier `substitution_window`), **WHEN** el manager envía `POST /matches/:id/decision` con dos instrucciones simultáneas (e.g. `{ instruction: ['PRESS_HIGH', 'HOLD_SHAPE'] }`), **THEN** el endpoint retorna HTTP `400 Bad Request` con `{ error: 'invalid_decision', reason: 'instructions_mutually_exclusive' }`; el estado del partido permanece `'paused_for_decision'`; ningún job de reanudación es encolado.
- **GIVEN** el equipo home envía `POST /matches/:id/decision` con `{ instruction: 'COUNTER' }`, **WHEN** el endpoint procesa, **THEN** retorna HTTP `400 Bad Request` con `{ error: 'invalid_decision', reason: 'counter_unavailable_for_home' }`.
- **GIVEN** el manager envía exactamente una instrucción válida (`PRESS_HIGH`, `HOLD_SHAPE`) o sin instrucción (`instruction: null`), **WHEN** el endpoint procesa, **THEN** retorna HTTP `200` y el partido reanuda normalmente.

**AC-30 — substitution_window excluido del MatchOutcome final (R6)**
- **GIVEN** un partido completado que incluye las tres ventanas de sustitución (minutos 45, 60, 75), **WHEN** se accede a `MatchOutcome.events` (el payload entregado a league-system y player-management), **THEN** el array no contiene ningún evento con `type: 'substitution_window'`.
- **THEN** el `MatchEvent[]` interno del `MatchSessionSnapshot` (usado por hud-ui.md vía Socket.IO) SÍ contiene los tres eventos `{type:'substitution_window'}` en los minutos 45, 60 y 75 (verificado también en AC-21). Los dos arrays son distintos: el snapshot interno tiene los eventos de pausa; el MatchOutcome externo los filtra.

**AC-31 — formation_attack_mod incrementa P_attack (vía base_rate), no P_goal (R6)**
- **GIVEN** dos partidos idénticos (misma seed, mismo WorldState, mismo lineup) salvo que en el primero el equipo home usa formación `4-4-2` y en el segundo usa `4-3-3`, **WHEN** se mide `P_attack_home(t=45)` con `home_momentum=50` en ambas simulaciones, **THEN** `P_attack_home_4-3-3 / P_attack_home_4-4-2 ≈ 1.2` (ratio exacto del `formation_attack_mod`).
- **THEN** `P_goal` calculado en F7 con el mismo FWD y GK es idéntico en ambas simulaciones — `formation_attack_mod` NO altera `P_goal` directamente.

**AC-32 — Rival AI: selección de formación por strength_ratio (R6)**
- **GIVEN** `rival_avg_rating = 75`, `home_avg_rating = 65` (`strength_ratio = 1.154 > 1.10`), **WHEN** se inicializa el `MatchSession`, **THEN** `currentFormationAway` en el `MatchSessionSnapshot` es `'4-3-3'`.
- **GIVEN** `rival_avg_rating = 55`, `home_avg_rating = 65` (`strength_ratio = 0.846 < 0.90`), **WHEN** se inicializa, **THEN** `currentFormationAway` es `'5-3-2'`.
- **GIVEN** `rival_avg_rating = 65`, `home_avg_rating = 65` (`strength_ratio = 1.0`), **WHEN** se inicializa, **THEN** `currentFormationAway` es `'4-4-2'`.
- **GIVEN** `strength_ratio = 1.10` exacto (boundary), **WHEN** se inicializa, **THEN** `currentFormationAway` es `'4-4-2'` (umbral estricto `> 1.10`, no `≥`).
- **THEN** en ninguna `substitution_window` durante el partido cambia `currentFormationAway` (el rival no cambia formación en MVP).

## Open Questions

| ID | Pregunta | Propietario | Resolver en |
|----|---------|-------------|-------------|
| ~~OQ-MATCH-01~~ | ~~El modelo BullMQ pausable extiende ADR-007. ¿Crear ADR-013 o actualizar ADR-007?~~ **EN PROGRESO (R2, 2026-05-18)**: ADR-013 creado en esta sesión. `simulateMatch` pura (ADR-007) y `MatchSession` stateful (ADR-013) son dos contratos separados. Resolve al escribir ADR-013. | Technical Director | ✅ ADR-013 creando |
| ~~OQ-MATCH-02~~ | ~~¿Qué algoritmo usa el AI manager del equipo rival?~~ **RESUELTO (R3, 2026-05-18)**: Algoritmo de regla simple documentado en §Rival AI Manager: sub en sub_window cuando effective_fitness < 40, elige el de mayor effective_rating en la misma posición. Pool propio de 5 cambios, independiente del player. | — | ✅ Cerrado |
| ~~OQ-MATCH-03~~ | ~~¿Cómo se carga el lineup del equipo rival?~~ **RESUELTO (R3, 2026-05-18)**: Lineup rival cargado desde player-management al crear el BullMQ job de inicio. AI rival elige los 11 con mayor effective_rating(t=0) respetando mínimo 1 GK, 2 DEF, 2 FWD. Documentado en §Rival AI Manager. | — | ✅ Cerrado |
| ~~OQ-MATCH-04~~ | ~~match_rating individual~~. **RESUELTO (R1, 2026-05-18)**: match_rating = effective_rating(player, t=90). Definido en F10. Output en MatchOutcome.playerRatings. Player-management lo usa en F4 (form rolling average). | — | ✅ Cerrado |
| ~~OQ-MATCH-05~~ | ~~¿Qué pasa si el servidor se cae durante la pausa?~~ **RESUELTO (R2, 2026-05-18)**: El re-enqueue pattern (ADR-013) persiste `MatchSessionSnapshot` en DB antes de completar cada job. Si el servidor se cae durante el procesamiento del siguiente job, el job se re-encola automáticamente por BullMQ (jobs en estado `active` se retrasan al reiniciar). El `MatchSessionSnapshot` en DB garantiza que la reanudación es idempotente. | — | ✅ Resuelto vía ADR-013 |
