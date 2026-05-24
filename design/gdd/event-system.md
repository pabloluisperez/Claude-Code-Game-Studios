# Sistema de Eventos (Event System)

> **Status**: Revised (7 blockers resolved — pending re-review or acceptance)
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-17
> **Implements Pillar**: P4 (Calm Is The Tempo) · P1 (Tinkering Beats Optimization) · P3 (You Grow Like Your Club)
> **ADR References**: ADR-008 (World Clock + Event Loop) · ADR-009 (Staff Message Routing) · ADR-010 (Manager-RPG Progression)

## Overview

El sistema de eventos es la capa que da estructura al paso del tiempo en Cascada FC: decide cuándo el advance loop se detiene, por qué razón se detiene, y qué información llega al jugador en ese momento. Gestiona dos categorías de eventos distintas — los **eventos de calendario** (partidos, cierre de mercado, fin de mes, reuniones de directiva, fin de temporada, subidas de nivel del manager), pre-generados al inicio de cada temporada y almacenados en `calendar_events` (ADR-008), y los **eventos dinámicos**, que nacen en tiempo real cuando el motor de cascadas supera un umbral crítico (`ThresholdCrossing.priority === 'BLOCKING'`) y necesitan la atención inmediata del jugador. Cada evento tiene una prioridad: `STOP` detiene el advance en esa semana; `NOTIFY` lo registra pero el tiempo sigue. El jugador nunca ve el sistema directamente — lo vive como una sensación de ritmo y expectativa: sabe que viene un partido, una reunión, una oportunidad; y cuando algo inesperado para el tiempo, entiende que el club le está pidiendo algo. Los eventos interactivos (board meetings, reuniones de crisis) requieren una decisión del jugador antes de que el advance pueda continuar. El flavor text de todos los eventos es generado por un **motor de templates** (Pilar 4: sin IA en MVP, sin FOMO, sin urgencia artificial). La arquitectura de datos y el contrato de servicio están especificados en ADR-008 (World Clock + Event Loop).

## Player Fantasy

El jugador de Cascada FC aprende rápido el ritmo del tiempo: el partido llega el domingo, el fin de mes trae el balance, el mercado de fichajes abre en verano. Esa predictibilidad de fondo es intencionada — el calendar de eventos crea una semana de partido como unidad natural, y el jugador empieza a anticipar, a preparar, a cerrar cada ciclo con una expectativa concreta. El HUD siempre muestra el siguiente evento esperado, y esa información actúa como gancho de retención silencioso: *"el partido decisivo es en tres días de juego, mejor decido el entreno esta semana"*.

Pero la fantasía más intensa del sistema de eventos no viene del ritmo — viene de su ruptura.

El jugador pulsa "avanzar" creyendo que llegará al siguiente partido. Y el juego para antes. En la semana 17, en mitad de una temporada que iba bien, el balance ha caído por debajo del umbral crítico. O la afición ha perdido la confianza. O el director deportivo encontró algo. El tiempo se detiene. La directiva llama. El jugador lee el evento y siente algo que no esperaba: *el club me necesita ahora mismo*.

La fantasía es el contraste. La rutina predecible hace que la interrupción pese. Y las elecciones que el jugador toma en esos momentos de crisis — vender al mejor jugador vs. asumir deuda, enfrentar el escándalo vs. taparlo — son las decisiones que el jugador recuerda al final de la temporada. El event-system es la voz del club hablando al manager cuando las cosas salen del plan. El template de texto es la boca; el cascade engine, el contenido; y el jugador, el destinatario que no esperaba el mensaje.

## Detailed Design

### Core Rules

**1. Dos categorías de eventos:**
- **Eventos de calendario**: pre-generados al inicio de cada temporada por `season-service`. Almacenados en `calendar_events` (ADR-008). Tienen semana y tipo fijados antes de que el jugador avance. Los match fixtures los genera `league-system` (ADR-011).
- **Eventos dinámicos**: generados en tiempo real cuando `evaluateTick()` devuelve `ThresholdCrossing.priority === 'BLOCKING'`. Se insertan en `calendar_events` como `type: 'dynamic'` en la misma transacción del advance (ADR-008).

**2. Taxonomía de eventos MVP:**

| `CalendarEventType` | Priority | Interactivo | Generado por | Desencadenante |
|---|---|---|---|---|
| `match` | `STOP` | No (va a la vista de partido) | league-system | Fixtures del calendario |
| `end_of_month` | `STOP` | Light (resumen revisable) | season-service | Cada 4 semanas |
| `transfer_window_open` | `STOP` | No (notificación + abre mercado) | season-service | Por competición |
| `transfer_window_close` | `STOP` | No (notificación de cierre) | season-service | Por competición |
| `board_meeting` | `STOP` | Sí (evaluación mensual de directiva) | season-service | Una vez al mes |
| `season_end` | `STOP` | Sí (renovaciones + resumen) | season-service | Semana final de liga |
| `manager_level_up` | `STOP` | Condicional (interactivo si activa CE-1/2/3) | manager-rpg (XP threshold) | Cruce de umbral de XP |
| `dynamic` (fan_crisis) | `STOP` | Sí | cascade-engine | `fan_momentum < 20` |
| `dynamic` (captain_crisis) | `STOP` | Sí | cascade-engine | `player_happiness < 25` |
| `dynamic` (scandal) | `STOP` | Sí | cascade-engine | `corruption_exposure > 80` |
| `dynamic` (financial_crisis) | `STOP` | Sí | economy.md threshold | `balance < 3 × weekly_costs` |

**3. Presentación al jugador:**
- Eventos `STOP` → modal bloqueante. El advance no puede continuar hasta que el jugador cierra o responde el modal.
- Eventos `NOTIFY` → notificación inline en el inbox del club (feed lateral del HUD). No bloquea el advance. El jugador puede revisarlas a su ritmo.

**4. Regla de bloqueo:** Si el advance produce un evento STOP en la semana `W`, el servidor detiene el loop en `W`, persiste todo, y el cliente muestra el modal. `POST /api/game/advance` no puede llamarse de nuevo hasta que el evento quede `consumed = true`.

**5. Eventos interactivos — cálculo de opciones en servidor:**
Las opciones disponibles para cada evento interactivo se calculan en el servidor en el momento en que el jugador solicita ver el evento (`GET /api/game/events/:id/options`). El servidor lee el WorldState y `ClubFinances` actuales y filtra las opciones posibles. Las opciones no cambian una vez presentadas — están "congeladas" en el WorldState del momento de presentación.

**6. Motor de templates (flavor text):**
Cada `CalendarEventType` tiene un pool de 3–5 plantillas de texto. Al generar el texto del evento, el sistema selecciona una plantilla determinísticamente: `selectedIndex = seedrandom(playthroughId + eventType + week)() % poolSize`. Las plantillas contienen slots `{variable}` sustituibles con valores del WorldState/ClubFinances. Plantillas almacenadas en `packages/shared/src/events/templates/`. Estructura: un objeto exportado por tipo, cada uno con array de strings.

**7. Aplicación de consecuencias:** Cuando el jugador toma una decisión en un evento interactivo, el cliente envía `POST /api/game/events/:id/resolve` con `{ choiceId: string }`. El servidor aplica las consecuencias como `PlayerDecision` sobre el WorldState (o como operación sobre `ClubFinances`), marca el evento `consumed = true`, y devuelve el nuevo WorldState parcial. El advance queda desbloqueado.

**8. Determinismo:** El mismo `playthroughId` + `eventType` + `week` siempre selecciona el mismo template. Las consecuencias de cada `choiceId` son funciones puras del WorldState en el momento de resolución.

**9. Cooldown de crisis dinámicas:** Tras la resolución de un `dynamic` STOP event, el sistema suprime nuevos BLOCKING generados por ThresholdCrossings durante `DYNAMIC_EVENT_COOLDOWN_WEEKS` semanas. Los umbrales siguen evaluándose internamente — si una variable cruza el umbral durante el cooldown, el BLOCKING se genera para la semana `current_week + semanas_restantes_de_cooldown` en lugar de la semana actual. Los eventos de calendario (`match`, `board_meeting`, etc.) no se ven afectados por el cooldown.

---

### Opciones Detalladas por Evento Interactivo

**`dynamic/fan_crisis`** — `fan_momentum < 20 → BLOCKING`:
Opciones calculadas por servidor según WorldState actual:
- **"Campaña promocional"** (siempre disponible): gasta 5 €K, +5 `fan_momentum` en 2 semanas vía `DelayedEffectsBuffer`.
- **"Reducir precio de entradas"** (si `ticket_price_index > 55`): fija `ticket_price_index = 45`.
- **"Mensaje personal del manager a la afición"** (si `reputation.level ≥ 3` y no usada en las últimas `PERSONAL_MESSAGE_COOLDOWN_WEEKS` semanas): aplica +8 `fan_momentum` inmediato, `reputation_xp = max(0, reputation_xp − 1)`. **Trade-off**: quema un recurso no recuperable (XP de reputación acumulada en eventos de carrera) a cambio de resolución inmediata. Si el cooldown la bloquea, aparece disabled con la semana de disponibilidad visible.

**`dynamic/captain_crisis`** — `player_happiness < 25 → BLOCKING`:
- **"Reducir intensidad de entreno"** (siempre disponible): fija `training_intensity = 40`.
- **"Bonus salarial a la plantilla"** (si `balance_eur_k > 2 × weekly_wage_bill_eur_k`): paga 1× `weekly_wage_bill_eur_k`, +15 `player_happiness` inmediato.
- **"Charla motivacional del primer entrenador"** (si `head_coach.qualityTier ≥ 2` y no usada en las últimas `HEAD_COACH_CHAT_COOLDOWN_WEEKS` semanas): +10 `player_happiness` inmediato, sin coste económico. **Trade-off**: la opción de tier 2+ es más eficiente por temporada, pero el cooldown crea ventanas donde el bonus salarial es la única opción viable — el jugador con buen cuerpo técnico no está "siempre protegido", sino "protegido una vez cada mes".

**`dynamic/scandal`** — `corruption_exposure > 80 → BLOCKING`:
- **"Cooperar con la investigación"** (siempre disponible): paga `scandal_fine_base_eur_k` = 30 €K, cancela slot camiseta del patrocinador, `corruption_exposure` → 0.
- **"Negar los hechos"** (siempre disponible): sin pago inmediato. Siguiente tick: 50% chance `corruption_exposure += 20`; si supera 80 de nuevo → nuevo BLOCKING con multa escalada y -1 reputation.level.
- **"Gestión discreta"** (si `reputation.level ≥ 4`): paga 15 €K, `corruption_exposure` → 20, no cancela patrocinador. Sin coste de reputación inmediato. **Trade-off de riesgo latente**: corruption en 20 significa que el cascade engine puede empujar el valor de vuelta al umbral BLOCKING en 2–4 temporadas de mal gobierno sin necesidad de un escándalo externo nuevo. "Cooperar" (corruption → 0) es la limpieza total a mayor coste; "Gestión discreta" es la solución barata que deja una mecha encendida.

**`dynamic/financial_crisis`** — `balance < 3 × weekly_total_costs → BLOCKING`:
Servidor calcula opciones disponibles del estado actual:
- **"Vender jugador"** (si hay jugadores con valor de mercado > 0): servidor lista los 3 jugadores de mayor valor. Player elige uno → venta inmediata al precio de mercado.
- **"Préstamo de emergencia"** (si préstamos activos < 2): monto calculado para cubrir el gap hasta el umbral WARNING. Aplica fórmula `emergency_loan` (interés escalante).
- **"Reducir presupuestos operativos"** (si `groundskeeper_budget > 30` o `catering_budget > 30` o `scouting_budget > 30`): servidor sugiere reducción específica con ahorro semanal estimado.

**`board_meeting` mensual:**
Muestra rendimiento actual vs. objetivos de la directiva (posición en liga, balance). Opciones:
- **"Continuar como estamos"** (siempre disponible).
- **"Ajustar objetivo de temporada"** (si `reputation.level ≥ 2` y la directiva lo permite según la posición actual).

**`season_end`:**
Disparador de renovaciones de contratos de plantilla, resumen narrativo de temporada (template), aplicación de ascenso/descenso al WorldState y ClubFinances.

---

### States and Transitions

Cada evento sigue el ciclo de vida (perspectiva del jugador):

```
PENDING
  │ (advance para en esta semana, evento devuelto en eventsTriggered)
  ▼
DISPLAYED
  │
  ├── (evento no interactivo) → jugador hace click en "Continuar" → CONSUMED
  │
  └── (evento interactivo) → AWAITING_DECISION
        │ (jugador elige opción vía POST /events/:id/resolve)
        ▼
      DECISION_MADE
        │ (servidor aplica consecuencias, marca consumed=true)
        ▼
      CONSUMED
```

La transición a `CONSUMED` desbloquea el advance: el cliente puede llamar de nuevo a `POST /api/game/advance`.

---

### Interactions with Other Systems

**Lee de cascade-engine.md:**
- `ThresholdCrossing[]` del `AdvanceResult` (triggers de eventos dinámicos)
- WorldState: `fan_momentum`, `player_happiness`, `corruption_exposure`, `ticket_price_index`, `training_intensity` (para calcular opciones de eventos crisis)

**Escribe a cascade-engine.md** (vía PlayerDecision tras resolución):
- `fan_momentum` (fan_crisis resolution)
- `player_happiness` (captain_crisis resolution)
- `corruption_exposure` (scandal resolution)
- `ticket_price_index` (fan_crisis "reducir precios")
- `training_intensity` (captain_crisis "reducir intensidad")

**Lee de economy.md:**
- `balance_eur_k`, `weekly_total_costs_eur_k` (crisis threshold check)
- `weekly_wage_bill_eur_k` (cálculo del bonus de plantilla)
- `debt_outstanding_eur_k` (determina disponibilidad del préstamo de emergencia)
- Valores de mercado de jugadores (opción de venta en financial_crisis)

**Escribe a economy.md** (vía event resolution):
- `balance_eur_k` (desembolso de préstamo, pago de multa, bonus salarial)
- `debt_outstanding_eur_k`, `weekly_debt_repayment_eur_k` (si se acepta préstamo)
- `sponsor_quality = 0` slot camiseta (si scandal resuelto por cooperación)

**Lee de manager-rpg.md:**
- `reputation.level` (gatea opciones de fan_crisis y scandal)
- Cruce de umbral de XP (trigger de `manager_level_up` CalendarEvent)

**Escribe a manager-rpg.md** (tras ciertos eventos):
- Reputation XP (gestión exitosa de crisis = +XP; scandal negado y empeorado = -reputation.level)
- `last_personal_message_week` (fan_crisis "Mensaje personal" → tracking de cooldown)
- `last_coach_chat_week` (captain_crisis "Charla motivacional" → tracking de cooldown)

**Provee a hud-ui.md:**
- `nextEventPreview: { week, type: string | null }` en cada `AdvanceResult` — hook de retención del HUD. Para eventos de **calendario** (`match`, `board_meeting`, `season_end`, etc.), `type` contiene el tipo legible. Para eventos **dinámicos** (`fan_crisis`, `captain_crisis`, `scandal`, `financial_crisis`), `type = null` — el HUD muestra `"⚡ Atención requerida"` sin revelar el tipo de crisis. La imprevisibilidad de las crisis dinámicas es parte de la Player Fantasy.

**Lee de league-system.md:**
- `match` CalendarEvents insertados por league-system al inicio de temporada

**Relacionado con staff-system.md:**
- El staff de tier 2+ genera mensajes de calendario como pre-avisos de STOP events próximos, vía ADR-009 (staff message pipeline post-advance). El event-system no llama directamente al staff-system.

## Formulas

### F1 — Selección determinista de template

`selectedIndex = floor( seedrandom( playthroughId + ":" + eventType + ":" + week )() × poolSize )`

**Variables:**

| Variable | Símbolo | Tipo | Rango | Descripción |
|---|---|---|---|---|
| ID de partida | `playthroughId` | string | UUID | Garantiza variedad entre partidas distintas |
| Tipo de evento | `eventType` | string | CalendarEventType | Separa los pools por tipo de evento |
| Semana | `week` | int | [1, 38] | Semana del calendario in-game |
| Tamaño del pool | `poolSize` | int | [3, 5] | Constante por tipo, definida en `packages/shared/src/events/templates/` |
| RNG output | `seedrandom(...)()` | float | [0, 1) | PRNG seeded; clave = concatenación separada por `:` |

**Output range:** `[0, poolSize − 1]` — nunca fuera del array.
**Ejemplo:** Seed `"abc123:fan_crisis:17"`, RNG = 0.71, poolSize = 3 → `floor(0.71 × 3) = 2` → template índice 2.
**Garantía anti-save-scum:** mismo `playthroughId + eventType + week` → mismo template siempre.

---

### F2 — Predicados de disponibilidad de opciones

Funciones booleanas puras evaluadas en `GET /api/game/events/:id/options`. Variables leídas del WorldState y ClubFinances en ese instante. Una vez presentadas, las opciones no cambian.

**F2a — fan_crisis (`fan_momentum < 20`):**

| Opción | Predicado | Variables |
|---|---|---|
| "Campaña promocional" | `true` (siempre) | — |
| "Reducir precio de entradas" | `ticket_price_index > 55` | `ticket_price_index` ∈ [0, 100] |
| "Mensaje personal del manager" | `reputation_level ≥ 3 AND (current_week − last_personal_message_week) ≥ PERSONAL_MESSAGE_COOLDOWN_WEEKS` | `reputation_level` ∈ {1..5}; `last_personal_message_week` ∈ [0, 38] (0 = nunca usado) |

**F2b — captain_crisis (`player_happiness < 25`):**

| Opción | Predicado | Variables |
|---|---|---|
| "Reducir intensidad de entreno" | `true` (siempre) | — |
| "Bonus salarial a la plantilla" | `balance_eur_k > 2 × weekly_wage_bill_eur_k` | €K |
| "Charla motivacional del primer entrenador" | `head_coach_quality_tier ≥ 2 AND (current_week − last_coach_chat_week) ≥ HEAD_COACH_CHAT_COOLDOWN_WEEKS` | {1, 2, 3}; `last_coach_chat_week` ∈ [0, 38] (0 = nunca usado) |

**F2c — scandal (`corruption_exposure > 80`):**

| Opción | Predicado |
|---|---|
| "Cooperar con la investigación" | `true` (siempre) |
| "Negar los hechos" | `true` (siempre) |
| "Gestión discreta" | `reputation_level ≥ 4` |

**F2d — financial_crisis (`balance < 3 × weekly_total_costs`):**

| Opción | Predicado |
|---|---|
| "Vender jugador" | `count(players where market_value_eur_k > 0) ≥ 1` |
| "Préstamo de emergencia" | `active_loan_count < 2` |
| "Reducir presupuestos operativos" | `groundskeeper_budget > 30 OR catering_budget > 30 OR scouting_budget > 30` |

**Regla de mínimo:** el servidor nunca devuelve 0 opciones — cada evento interactivo tiene siempre al menos una opción `true` por diseño.

---

### F3 — Resolución determinista de "Negar los hechos" (scandal)

`escalates = seedrandom( playthroughId + ":scandal_deny:" + week_of_denial )() < 0.50`

**Variables:**

| Variable | Símbolo | Tipo | Rango | Descripción |
|---|---|---|---|---|
| ID de partida | `playthroughId` | string | UUID | Anti-save-scum: mismo seed → mismo resultado |
| Semana de negación | `week_of_denial` | int | [1, 38] | Semana en que el jugador eligió "Negar" |
| RNG output | `seedrandom(...)()` | float | [0, 1) | PRNG seeded. Clave = concatenación separada por `:` |

**Output range:** booleano. Probabilidad de escalada = 50% exacto.
**Evaluación:** en `evaluateTick()` de la semana `week_of_denial + 1`.
**Si `escalates = true`:** `corruption_exposure += 20` (cap 100). Si > 80 de nuevo → ThresholdCrossing BLOCKING `scandal_reescalation` + `reputation_level -= 1` (mínimo 1).
**Ejemplo:** seed `"abc123:scandal_deny:22"`, RNG = 0.31 → escalates = true. `corruption_exposure` = 75 → 95 > 80 → nuevo BLOCKING.

---

### F4 — Magnitudes de consecuencias por opción

**F4a — fan_crisis:**

| Opción | Consecuencia exacta |
|---|---|
| "Campaña promocional" | `balance_eur_k -= 5`; `fan_momentum += 5` en semana `current_week + 2` (DelayedEffectsBuffer) |
| "Reducir precio de entradas" | `ticket_price_index := 45` (asignación absoluta, no delta) |
| "Mensaje personal del manager" | `fan_momentum += 8` (cap 100); `reputation_xp = max(0, reputation_xp − 1)`; `last_personal_message_week := current_week` |

**F4b — captain_crisis:**

| Opción | Consecuencia exacta |
|---|---|
| "Reducir intensidad de entreno" | `training_intensity := 40` (asignación absoluta) |
| "Bonus salarial a la plantilla" | `balance_eur_k -= weekly_wage_bill_eur_k`; `player_happiness += 15` (cap 100) |
| "Charla motivacional del primer entrenador" | `player_happiness += 10` (cap 100); `last_coach_chat_week := current_week` |

**F4c — scandal:**

| Opción | Consecuencia exacta |
|---|---|
| "Cooperar con la investigación" | `balance_eur_k -= 30`; `corruption_exposure := 0`; slot camiseta patrocinador cancelado |
| "Negar los hechos" | Sin efecto inmediato; evalúa F3 en `week + 1` |
| "Gestión discreta" | `balance_eur_k -= 15`; `corruption_exposure := 20`; patrocinador no se cancela |

Multa escalada en `scandal_reescalation`:
`scandal_fine_eur_k = 30 × (1 + 0.667 × (corruption_exposure − 80) / 20)`
**Output range:** [30, 50] €K para `corruption_exposure` ∈ [80, 100].
- exposure = 80 → 30 €K; exposure = 90 → 40 €K; exposure = 100 → 50 €K ✅
**Guard:** solo aplicar si `corruption_exposure ≥ 80`. La fórmula se invoca únicamente como consecuencia de `scandal_reescalation`, que garantiza el umbral por diseño.

**F4d — financial_crisis:**

Monto del préstamo de emergencia — fórmula idéntica a economy.md F6 (fuente autoritativa):
`loan_amount_eur_k = max(CRITICAL_THRESHOLD − balance_eur_k, 0) + LOAN_BUFFER_WEEKS × weekly_total_costs_eur_k`
Donde `CRITICAL_THRESHOLD = 3 × weekly_total_costs_eur_k` y `LOAN_BUFFER_WEEKS = 4`.

Repago semanal (de `emergency_loan` del registry):
`effective_rate = 0.15 × 2^(active_loan_count_before)`
`weekly_repayment_eur_k = loan_amount_eur_k × (1 + effective_rate) / 10`

**Ejemplo:** costes = 5 €K/sem, balance = 8 €K, préstamos activos = 0 → CRITICAL_THRESHOLD = 15 €K → loan = max(15−8, 0) + 4×5 = **7 + 20 = 27 €K**, rate = 0.15, repago = 3.105 €K/sem × 10 semanas.

Reducción de presupuesto operativo: `new_budget = max(30, budget_actual − 20)`.

**Output range préstamo:** `loan_amount_eur_k ∈ (4×weekly_costs, 7×weekly_costs]` — cuando la financial_crisis activa el BLOCKING, balance < CRITICAL_THRESHOLD garantiza que la componente max() > 0. El mínimo teórico es `4 × weekly_costs` (si balance = CRITICAL_THRESHOLD − ε).
**Output range repago:** `weekly_repayment_eur_k ∈ [0.115, ∞)` — depende del monto y número de préstamo.
**Préstamos simultáneos:** los dos préstamos de emergencia pueden coexistir mientras se amortizan. `active_loan_count_before` es el número de préstamos activos en el momento de la nueva solicitud (dominio válido: {0, 1}; el sistema rechaza la solicitud si `active_loan_count ≥ 2`). Con balance muy negativo, `loan_amount` puede ser elevado — por diseño: alcanzar `MAX_ACTIVE_LOANS` con otra financial_crisis y sin otras opciones representa el fracaso de gestión (la opción last-resort "Reducir estructura staff" garantiza siempre al menos 1 opción). `active_loan_count_before > 1` es estado inválido y debe guardarse con throw en implementación.

---

### Registry cross-check — sin conflictos

| Constante | Valor en registry | Usado en |
|---|---|---|
| `scandal_fine_base_eur_k` | 30 €K | F4c cooperar (30 €K), discreta (15 €K = 50%) ✅ |
| `critical_buffer_weeks` | 3 semanas | Trigger financial_crisis (F2d) ✅ |
| `warning_buffer_weeks` | 7 semanas | Cálculo loan_amount (F4d) ✅ |
| `fan_momentum_blocking_threshold_low` | 20 | Trigger fan_crisis (F2a) ✅ |
| `player_happiness_blocking_threshold_low` | 25 | Trigger captain_crisis (F2b) ✅ |
| `corruption_exposure_blocking_threshold_high` | 80 | Trigger scandal (F2c, F4c reescalation) ✅ |

## Edge Cases

- **Si dos ThresholdCrossings BLOCKING ocurren en el mismo tick**: el advance loop para en esa semana. El servidor genera un evento `dynamic` para el crossing de **mayor prioridad** según orden fijo: `financial_crisis > scandal > captain_crisis > fan_crisis`. El crossing de menor prioridad se genera como evento PENDING para la semana siguiente. El orden es determinista e independiente del orden de evaluación del cascade engine. `metadata.crossings` en el evento activo lista ambos crossings para log y diagnóstico. **Recursos entre eventos secuenciales**: cuando financial_crisis (semana N) precede a fan_crisis (semana N+1 PENDING), los deltas de balance de la resolución del financial_crisis (préstamo, ventas, ajuste de presupuesto) ya están aplicados cuando fan_crisis evalúa sus opciones. El floor de mínimo 1 opción (Regla de mínimo) garantiza que fan_crisis nunca queda sin opciones — `"Campaña promocional"` tiene predicado `true` (siempre disponible) aunque el balance sea bajo. (R3: clarificación añadida por /review-all-gdds 2026-05-18.)

- **Si una opción de evento interactivo deja de ser válida entre el GET de opciones y el POST de resolve** (ej.: el balance cambia entre ambas llamadas): las opciones se "congelan" en el momento de `GET /events/:id/options`. El servidor aplica la opción con los valores del WorldState en el momento de `resolve`, no del `options`. La opción puede producir un resultado distinto al esperado — esto es correcto por diseño (el servidor es autoridad sobre el estado).

- **Si el jugador elige "Préstamo de emergencia" y `active_loan_count` llega a 2** y ocurre otro financial_crisis: la opción de préstamo no está disponible. Si tampoco hay jugadores vendibles ni presupuestos reducibles, el servidor añade automáticamente "Reducir estructura staff" (despedir un miembro de staff con indemnización de 4 semanas) como opción de último recurso. El financial_crisis nunca puede presentar 0 opciones.

- **Si `scandal_reescalation` ocurre cuando `reputation_level = 1`**: `reputation_level -= 1` se clamp a 1. No existe `reputation_level = 0`.

- **Si `season_end` y `board_meeting` caerían en la misma semana**: `season_end` absorbe la función de la reunión mensual. `season-service` no inserta `board_meeting` en la semana final — verifica ausencia de duplicado al generar el calendario.

- **Si el jugador ignora eventos NOTIFY durante muchas semanas**: las notificaciones se acumulan en el inbox sin límite ni expiración en MVP. El HUD puede mostrar un contador de no-leídos pero no fuerza su revisión.

- **Si `manager_level_up` ocurre y no activa CE-1/2/3** (no interactivo): el evento se presenta como modal informativo con un solo botón "Continuar". El advance se desbloquea sin requerir elección.

- **Si el jugador elige "Continuar como estamos" en el board_meeting mensual**: el evento se marca consumed. La directiva registra el no-cambio pero no impone penalización automática. La evaluación de objetivos ocurre de todas formas.

- **Si el advance produce un BLOCKING pero no hay STOP event de calendario en el horizon** (calendario vacío, mitigación R4 de ADR-008): el servidor avanza exactamente 1 semana. El dynamic event BLOCKING se inserta en esa semana y el flujo normal continúa.

- **Si un template contiene un slot `{variable}` con valor null o undefined**: el template engine sustituye el slot por `"—"` (em dash). El evento se presenta sin lanzar error. Puede ocurrir si un template de `match` referencia `{opponent_name}` antes de que league-system haya generado las fixtures.

## Dependencies

### Upstream (este sistema depende de ellos)

| Sistema | GDD | Tipo | Interfaz |
|---|---|---|---|
| Motor de cascadas | `cascade-engine.md` | **Hard** — el sistema no puede existir sin ThresholdCrossings | Recibe `ThresholdCrossing[]` en `AdvanceResult`; lee WorldState para calcular opciones de eventos crisis |
| Economía del club | `economy.md` | **Hard** — financial_crisis requiere `balance_eur_k` y `weekly_total_costs_eur_k` | Lee `ClubFinances`; escribe `balance_eur_k`, `debt_outstanding_eur_k` tras resolución |
| Sistema de Staff | `staff-system.md` | **Soft** — los pre-avisos de staff enriquecen la experiencia pero el event-system funciona sin ellos | Lee `head_coach.qualityTier` para captain_crisis. Staff lee `nextEventPreview` para mensajes de calendario (ADR-009) |
| Manager RPG | `manager-rpg.md` | **Soft** — el sistema funciona sin RPG pero pierde profundidad de opciones | Lee `reputation_level` para opciones gateadas. Recibe trigger de `manager_level_up` cuando XP cruza umbral |

### Downstream (dependen de este sistema)

| Sistema | GDD | Qué espera de este sistema |
|---|---|---|
| HUD y UI principal | `hud-ui.md` | `nextEventPreview: { week, type }` en cada `AdvanceResult` para el retention hook de "próximo evento" |
| Sistema de liga | `league-system.md` | Inserta `CalendarEventType.match` fixtures en `calendar_events`; el event-system los consume y detiene el advance en ellos |

### ADR dependencies

- **ADR-008** — define el schema `calendar_events`, la interface `ThresholdCrossing`, `CalendarEventPriority`, y el contrato `POST /api/game/advance`. Este GDD especifica el contenido que ADR-008 produce y consume.
- **ADR-009** — el staff message routing ocurre post-advance; el event-system no orquesta los mensajes del staff directamente.
- **ADR-010** — `manager_level_up` es una extensión additive de ADR-008; este GDD define cuándo es interactivo (activa CE-1/2/3) vs. informativo (sin career event).

## Tuning Knobs

| Knob | Valor MVP | Rango seguro | Efecto si demasiado alto | Efecto si demasiado bajo |
|---|---|---|---|---|
| `FAN_CRISIS_CAMPAIGN_COST_EUR_K` | 5 | [2, 20] | Opción "Campaña" inviable en fases tempranas → solo quedan opciones de precio/reputación | Demasiado barata → se usa siempre, pierde peso de decisión |
| `FAN_CRISIS_CAMPAIGN_DELAY_WEEKS` | 2 | [1, 4] | Efecto muy diferido → el jugador no asocia decisión con resultado (debilita feedback) | Efecto inmediato → pierde el carácter de "campaña que tarda en hacer efecto" |
| `FAN_CRISIS_PERSONAL_MESSAGE_MOMENTUM` | 8 | [4, 15] | Opción premium demasiado poderosa → siempre mejor que reducir precios | Demasiado débil para diferenciar el benefit de `reputation_level ≥ 3` |
| `CAPTAIN_CRISIS_BONUS_HAPPINESS` | 15 | [8, 25] | Crisis resuelta demasiado fácilmente → siempre se usa si hay presupuesto | Bonus insignificante → opción nunca compite con reducir entreno |
| `CAPTAIN_CRISIS_CHAT_HAPPINESS` | 10 | [5, 20] | Staff tier 2+ resuelve la crisis solo y sin coste → pierde valor del bonus salarial | Tan pequeño que no justifica diferenciación de tier 2+ |
| `SCANDAL_FINE_BASE_EUR_K` | 30 | [20, 60] | Penalización tan alta que el escándalo es ruinoso en fases tempranas | Tan baja que el riesgo de corrupción pierde peso en la toma de decisiones |
| `SCANDAL_DENY_ESCALATION_PROBABILITY` | 0.50 | [0.30, 0.70] | Negar siempre escala → opción nunca usable → pierde tensión de la elección | Negar raramente escala → siempre óptimo negar → la elección no tiene peso real |
| `SCANDAL_DISCRETE_CORRUPTION_RESET` | 20 | [10, 35] | Reset tan alto → opción discreta no diferencia de cooperar | Reset tan bajo → club queda casi en umbral BLOCKING inmediatamente |
| `FINANCIAL_CRISIS_BUDGET_REDUCTION_STEP` | 20 | [10, 30] | Reducción tan grande que vacía el presupuesto en un evento | Tan pequeña que no mejora el balance de costes de forma significativa |
| `TEMPLATE_POOL_SIZE_PER_TYPE` | 3–5 | [3, 8] | Más templates = más contenido a escribir sin ganancia jugable relevante en MVP | Menos de 3 → repetición notable en partidas largas |
| `MAX_ACTIVE_LOANS` | 2 | [1, 3] | Permite acumular deuda descontrolada → espiral de deuda sin salida | El jugador se queda sin opciones si tiene 1 préstamo y otra crisis financiera llega |
| `MONTHLY_BOARD_MEETING_OBJECTIVE_FLEX` | reputation_level ≥ 2 | — | Si todos los managers pueden ajustar objetivos → reputación pierde valor diferenciador | Inamovible → la directiva es narrativamente rígida y poco reactiva |
| `DYNAMIC_EVENT_COOLDOWN_WEEKS` | 2 | [1, 4] | Demasiado alto → crisis demasiado espaciadas, pierde tensión; se puede ignorar una crisis 4 semanas | Demasiado bajo → el cooldown no protege el ritmo; se encadenan crisis |
| `PERSONAL_MESSAGE_COOLDOWN_WEEKS` | 4 | [2, 8] | Demasiado alto → opción premium inutilizable en temporada corta; rep ≥ 3 pierde ventaja real | Demasiado bajo → siempre disponible, pierde exclusividad; XP-burn pasa a ser el único coste |
| `HEAD_COACH_CHAT_COOLDOWN_WEEKS` | 4 | [2, 8] | Demasiado alto → tier 2+ no diferencia en la práctica; bonus salarial domina siempre | Demasiado bajo → charla siempre disponible; bonus salarial nunca es relevante |

## Visual/Audio Requirements

El event-system es DOM-only en MVP (ADR-012). No tiene requisitos de renderizado en canvas ni assets de audio propios. El audio contextual de los eventos (si aplica) pertenece al presupuesto del HUD general y se especificará en `hud-ui.md`.

## UI Requirements

El event-system es la capa de presentación del advance loop. En DOM-only MVP (ADR-012), todos los eventos se presentan mediante componentes Svelte estándar.

**Modal de evento STOP (bloquea el advance):**
- Header: icono + título del tipo de evento (`match`, `board_meeting`, `dynamic/fan_crisis`, etc.)
- Cuerpo: texto del template seleccionado por F1 con slots interpolados
- Footer: botón "Continuar" (eventos no interactivos) OR lista de opciones calculadas por servidor (eventos interactivos)
- El modal no tiene botón de cierre — solo se cierra tras acción del jugador
- Ancho: adaptado a mobile-first (≥ 375px), sin scroll horizontal

**Lista de opciones interactivas:**
- Cada opción: label + coste/consecuencia estimada visible + estado de disponibilidad
- Opciones no disponibles aparecen **disabled, NO ocultas** — el jugador ve que la opción existe pero no está a su alcance (decisión deliberada de P3: crecer como manager revela opciones antes invisibles al volverse disponibles)

**Inbox / feed de NOTIFY events:**
- Panel lateral o drawer del HUD
- Entradas en orden cronológico inverso (más reciente primero)
- Cada entrada: icono de tipo + semana + primer párrafo del template
- Contador de no-leídos en el header del HUD
- Sin paginación en MVP — todas las notificaciones de la temporada actual visibles con scroll

**Anticipated event chip (HUD permanente):**
- Siempre visible. Para eventos de **calendario**: `"Próximo: [tipo] · Semana [N]"` (ej. `"⚽ Partido · Semana 20"`). Para eventos **dinámicos**: `"⚡ Atención requerida · Semana [N]"` — el tipo de crisis nunca se revela anticipadamente.
- Lee `nextEventPreview: { week, type: string | null }` del `AdvanceResult`. Si `type === null` → mostrar señal de tensión genérica.
- Clickeable → abre inbox o navega a vista relevante (calendar event → vista específica; dinámica → inbox)

> 📌 **UX Flag — Event System**: Este sistema tiene requisitos de UI sustanciales (modal de eventos, inbox de notificaciones, chip de evento anticipado). En Pre-Production, ejecutar `/ux-design` para crear un UX spec específico para cada componente antes de escribir los epics. Stories que referencien UI del event-system deben citar `design/ux/event-modal.md` y `design/ux/event-inbox.md`, no este GDD directamente.

## Acceptance Criteria

### Bloque A — Bloqueo del Advance Loop (Core Rules 1–4)

- **AC-EVT-01** GIVEN un evento `STOP` no consumido para la semana actual en `calendar_events`, WHEN el cliente envía `POST /api/game/advance`, THEN el servidor rechaza la petición y no avanza la semana hasta que el evento tenga `consumed = true`.
- **AC-EVT-02** GIVEN que no existe ningún evento `STOP` pendiente, WHEN el cliente envía `POST /api/game/advance`, THEN el servidor procesa la llamada y avanza la semana normalmente.
- **AC-EVT-03** GIVEN que el servidor detiene el advance en la semana W por un evento STOP, WHEN se consulta el estado del juego, THEN `AdvanceResult.eventsTriggered` contiene exactamente el evento STOP de esa semana y el WorldState persiste el estado de la semana W.
- **AC-EVT-04** GIVEN un evento `NOTIFY` generado durante un tick, WHEN el servidor procesa el advance, THEN el advance NO se bloquea y el evento aparece en el inbox con `consumed = false`.

### Bloque B — Ciclo de vida de eventos

- **AC-EVT-05** GIVEN un evento interactivo en `AWAITING_DECISION`, WHEN el cliente envía `POST /api/game/events/:id/resolve` con un `choiceId` válido, THEN el servidor retorna `HTTP 200` con `worldStatePartial` reflejando los cambios exactos del `choiceId` (valores numéricos verificables en Bloques D-G según tipo de evento), `GET /api/game/events/:id` devuelve `status: "consumed"`, y `POST /api/game/advance` ya no retorna `HTTP 409` por este evento.
- **AC-EVT-06** GIVEN un evento no interactivo en `DISPLAYED`, WHEN el jugador hace click en "Continuar", THEN el evento pasa a `CONSUMED` sin requerir elección y el advance se desbloquea.
- **AC-EVT-07** GIVEN un evento interactivo en `AWAITING_DECISION`, WHEN el cliente intenta `POST /api/game/advance`, THEN el servidor rechaza la petición y el evento permanece en `AWAITING_DECISION`.

### Bloque C — Generación de eventos dinámicos

- **AC-EVT-08** GIVEN `fan_momentum = 15` al ejecutar un tick, WHEN `evaluateTick()` produce un `ThresholdCrossing BLOCKING` para `fan_momentum`, THEN `POST /api/game/advance` retorna `AdvanceResult.eventsTriggered` conteniendo un evento `fan_crisis` para la semana actual, el WorldState persiste en esa semana (no avanza), Y si el advance falla con error interno antes de persistir, el evento `fan_crisis` NO aparece en `GET /api/game/events` (atomicidad: o ambos persisten o ninguno).
- **AC-EVT-09** GIVEN `player_happiness = 20` al ejecutar un tick, WHEN produce un `ThresholdCrossing BLOCKING` para `player_happiness`, THEN se inserta `captain_crisis` para la semana actual.
- **AC-EVT-10** GIVEN `corruption_exposure = 85` al ejecutar un tick, WHEN produce un `ThresholdCrossing BLOCKING` para `corruption_exposure`, THEN se inserta `scandal` para la semana actual.
- **AC-EVT-11** GIVEN `balance_eur_k = 10` y `weekly_total_costs_eur_k = 5` (balance = 2× costes, menor que 3×), WHEN produce un `ThresholdCrossing BLOCKING` para el balance, THEN se inserta `financial_crisis` para la semana actual.

### Bloque D — fan_crisis (F2a + F4a)

- **AC-EVT-12** GIVEN `fan_crisis` activo con `ticket_price_index = 60` y `reputation.level = 2`, WHEN `GET /api/game/events/:id/options`, THEN devuelve "Campaña promocional" y "Reducir precio" disponibles; "Mensaje personal del manager" disabled (reputation 2 < 3).
- **AC-EVT-13** GIVEN `fan_crisis` con `ticket_price_index = 50` y `reputation.level = 4`, WHEN `GET /api/game/events/:id/options`, THEN "Campaña" y "Mensaje personal" disponibles; "Reducir precio" disabled (50 no > 55).
- **AC-EVT-14** GIVEN "Campaña promocional" elegida con `balance_eur_k = 20`, WHEN server aplica resolución, THEN `balance_eur_k = 15` y `fan_momentum += 5` se aplica en semana `current_week + 2` (no inmediatamente).
- **AC-EVT-15** GIVEN "Mensaje personal" elegido con `fan_momentum = 18` y `reputation_xp = 10`, WHEN server aplica resolución, THEN `fan_momentum = 26` (inmediato, +8) y `reputation_xp = 9`.
- **AC-EVT-16** GIVEN "Reducir precio de entradas" elegido con `ticket_price_index = 70`, WHEN server aplica resolución, THEN `ticket_price_index = 45` exactamente (asignación absoluta, no delta de −25).

### Bloque E — captain_crisis (F2b + F4b)

- **AC-EVT-17** GIVEN `captain_crisis` con `head_coach.qualityTier = 1`, `balance_eur_k = 5`, `weekly_wage_bill_eur_k = 3`, WHEN `GET /api/game/events/:id/options`, THEN solo "Reducir intensidad de entreno" disponible (5 no > 2×3=6; tier 1 no ≥ 2).
- **AC-EVT-18** GIVEN "Reducir intensidad de entreno" elegido con `training_intensity = 65`, WHEN server aplica, THEN `training_intensity = 40` (asignación absoluta).
- **AC-EVT-19** GIVEN "Bonus salarial" elegido con `weekly_wage_bill_eur_k = 4` y `player_happiness = 20`, WHEN server aplica, THEN `balance_eur_k -= 4` y `player_happiness = 35` (cap 100).
- **AC-EVT-20** GIVEN "Charla motivacional" elegida con `head_coach.qualityTier ≥ 2` y `player_happiness = 22`, WHEN server aplica, THEN `player_happiness = 32` (+10) y balance no cambia.

### Bloque F — scandal (F2c + F3 + F4c)

- **AC-EVT-21** GIVEN `scandal` con `reputation.level = 3`, WHEN `GET /api/game/events/:id/options`, THEN "Cooperar" y "Negar" disponibles; "Gestión discreta" disabled (3 < 4).
- **AC-EVT-22** GIVEN "Cooperar con la investigación" elegido con `balance_eur_k = 100`, WHEN server aplica, THEN `balance_eur_k = 70`, `corruption_exposure = 0`, slot camiseta del patrocinador cancelado.
- **AC-EVT-23** GIVEN "Gestión discreta" elegida con `reputation.level ≥ 4` y `balance_eur_k = 50`, WHEN server aplica, THEN `balance_eur_k = 35`, `corruption_exposure = 20`, patrocinador no cancelado.
- **AC-EVT-24** GIVEN "Negar los hechos" elegido en semana 22 con `playthroughId = "abc123"`, WHEN el servidor evalúa el tick de la semana 23 via F3, THEN el resultado de escalada producido por seed `"abc123:scandal_deny:22"` es idéntico en todas las ejecuciones con el mismo seed.
- **AC-EVT-25** GIVEN `escalates = true` con `corruption_exposure = 75`, WHEN server aplica escalada, THEN `corruption_exposure = 95` → supera 80 → nuevo BLOCKING `scandal_reescalation` + `reputation_level -= 1`.
- **AC-EVT-26** GIVEN `escalates = true` y `reputation_level = 1`, WHEN server aplica penalización de reescalada, THEN `reputation_level` permanece en 1 (clamp mínimo; no existe reputation_level = 0).

### Bloque G — financial_crisis (F2d + F4d)

- **AC-EVT-27** GIVEN `financial_crisis` sin jugadores vendibles, `active_loan_count = 2`, y todos los presupuestos ≤ 30, WHEN `GET /api/game/events/:id/options`, THEN la respuesta contiene exactamente 1 opción: "Reducir estructura staff" — nunca lista vacía.
- **AC-EVT-28** GIVEN "Préstamo de emergencia" elegido con `weekly_total_costs_eur_k = 5`, `balance_eur_k = 8`, `active_loan_count = 0`, WHEN server aplica, THEN `loan_amount = 27 €K` (= max(3×5−8,0) + 4×5 = 7+20) y `weekly_repayment = 3.105 €K/sem` durante 10 semanas.
- **AC-EVT-29** GIVEN "Reducir presupuestos" elegido con `groundskeeper_budget = 50`, WHEN server aplica, THEN `groundskeeper_budget = 30` exactamente (`max(30, 50 − 20) = 30`).
- **AC-EVT-30** GIVEN `active_loan_count = 2` en un `financial_crisis`, WHEN `GET /api/game/events/:id/options`, THEN "Préstamo de emergencia" aparece como disabled (2 no < 2).

### Bloque H — Determinismo de templates (F1)

- **AC-EVT-31** GIVEN `playthroughId = "X"`, `eventType = "fan_crisis"`, `week = 17`, `poolSize = 3` ejecutado dos veces, WHEN calcula F1 ambas veces, THEN produce el mismo `selectedIndex` sin excepción.
- **AC-EVT-32** GIVEN dos partidas con IDs distintos y el mismo `eventType` y `week`, WHEN calculan F1, THEN el cálculo usa `playthroughId` en el seed (verificar que el índice no está hardcoded).
- **AC-EVT-33** GIVEN `poolSize = 3` y cualquier seed válido, WHEN F1 calcula `selectedIndex`, THEN el resultado siempre es 0, 1 o 2 — nunca un índice fuera del array.

### Bloque I — Dos BLOCKINGs simultáneos (Edge Case)

- **AC-EVT-34** GIVEN que `evaluateTick()` devuelve dos `ThresholdCrossing BLOCKING` en el mismo tick (ej. `fan_momentum` y `player_happiness`), WHEN el servidor genera eventos, THEN se crea UN evento dinámico activo para la semana actual correspondiente al crossing de **mayor prioridad** (`captain_crisis` precede a `fan_crisis` en el orden `financial_crisis > scandal > captain_crisis > fan_crisis`), y UN segundo evento dinámico PENDING para la semana siguiente. El resultado es determinista independientemente del orden de evaluación interno de `evaluateTick()`.
- **AC-EVT-35** GIVEN el escenario de AC-EVT-34, WHEN el jugador resuelve el primer evento y llama a `POST /advance`, THEN la semana avanza exactamente 1 y el segundo evento PENDING bloquea esa semana siguiente.

### Bloque J — Mínimo de opciones (financial_crisis — Edge Case)

- **AC-EVT-36** GIVEN `financial_crisis` con las tres opciones normales inaccesibles (sin jugadores vendibles, 2 préstamos activos, presupuestos todos ≤ 30), WHEN `GET /api/game/events/:id/options`, THEN la respuesta contiene exactamente 1 opción: "Reducir estructura staff".

### Bloque K — Opciones congeladas (Core Rule 5 — Edge Case)

- **AC-EVT-37** GIVEN opciones calculadas con `balance_eur_k = 20`, WHEN balance cae a 2 entre el GET y el POST resolve, THEN el servidor aplica "Campaña promocional" sobre el balance actual (2 − 5 = −3) sin rechazar la petición.

### Bloque L — season_end + board_meeting (Edge Case)

- **AC-EVT-38** GIVEN que `season_end` cae en la semana 38, WHEN `season-service` genera el calendario, THEN NO se inserta `board_meeting` para esa misma semana — solo existe un evento STOP de tipo `season_end` en la semana 38.

### Bloque M — Template slot nulo (Edge Case)

- **AC-EVT-39** GIVEN que un template de `match` contiene el slot `{opponent_name}` y league-system aún no ha generado fixtures, WHEN el motor de templates sustituye los slots, THEN `{opponent_name}` se reemplaza por `"—"` (em dash) sin error ni crash.

### Bloque N — Robustez y casos de error

- **AC-EVT-40** GIVEN un evento interactivo en `AWAITING_DECISION` no resuelto, WHEN el cliente envía `POST /api/game/advance`, THEN el servidor retorna `HTTP 409 Conflict` con body `{ error: "pending_event", eventId: "<id>" }` y el advance no se procesa.

- **AC-EVT-41** GIVEN un evento interactivo en `AWAITING_DECISION`, WHEN el cliente envía `POST /api/game/events/:id/resolve` con `choiceId` que no pertenece al evento (ej. `choiceId: "invalid_xyz"`), THEN el servidor retorna `HTTP 400 Bad Request` y el evento permanece en `AWAITING_DECISION` sin modificación.

- **AC-EVT-42** GIVEN que el balance resulta en `−3 €K` tras la resolución de un evento (ej. escenario de AC-EVT-37), WHEN el servidor evalúa el siguiente tick con `weekly_total_costs_eur_k = 5`, THEN `evaluateTick()` genera `ThresholdCrossing BLOCKING` para `financial_crisis` (−3 < 3 × 5 = 15), lo que desencadena un `financial_crisis` STOP event para la semana siguiente.

---

> **Nota QA**: AC-EVT-24 y AC-EVT-31 son tipo **Logic** → test automatizado BLOCKING requerido antes de Done. AC-EVT-14, 19, 22, 28 son tipo **Integration** → requieren DB real (no mocks), conforme a la política de testing del proyecto. AC-EVT-40 y AC-EVT-41 son tipo **Logic** (validación de contrato HTTP, sin DB). AC-EVT-42 es tipo **Integration** (requiere tick evaluation + DB real).

## Open Questions

- **OQ-EVT-01** — La opción "Reducir estructura staff" (last resort en financial_crisis) cuesta `severance_weeks × salario del miembro despedido`. ¿Qué miembro elige el servidor — el de menor salario, o el jugador elige de una lista? *(Provisión: el servidor elige el staff de menor salario para maximizar ahorro. Validar cuando se escriba player-management.md.)*

- **OQ-EVT-02** — `reputation_xp -= 1` en fan_crisis/mensaje personal: ¿hay suficiente XP pool en fases tempranas para que esta opción sea usable sin penalizar el progreso RPG del manager? *(Marcar para `/balance-check` en pre-producción cuando ambos GDDs estén implementados.)*

- **OQ-EVT-03** — Los eventos NOTIFY se acumulan sin expiración en MVP. ¿Se archivan o borran al final de temporada? *(Decidir en hud-ui.md. Provisión actual: se mantienen sin expiración mientras dure la partida.)*

- **OQ-EVT-04** — El board_meeting mensual muestra rendimiento vs. objetivos de directiva. Los objetivos específicos (posición en liga, hitos) dependen de league-system.md aún no diseñado. *(Provisión: objetivos = "posición en tabla top 8" + "balance positivo". Validar cuando se escriba league-system.md.)*

- **OQ-EVT-05** — Idioma de los templates: ¿MVP en español exclusivamente, o inglés como base + i18n keys? *(Provisión: español único en MVP. Actualizar si se decide i18n desde día 1 con el localization pipeline.)*
