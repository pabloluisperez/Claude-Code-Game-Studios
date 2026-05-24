# Motor de Cascadas (Cascade Engine)

> **Status**: Approved (R3 — 2026-05-18)
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-18 (R4 cross-review fix — K_loss_base 10→8; output range [-20,+5.5]→[-16,+5.5]; ratio K_loss/K_win 1.25→1.0; AC-CTI-C6 updated; fan_momentum recovery note quantified)
> **Implements Pillar**: P1 (Tinkering Beats Optimization) · P3 (You Grow Like Your Club) · P4 (Calm Is The Tempo)
> **Creative Director Review (CD-GDD-ALIGN)**: Conducted R3 2026-05-18. Verdict: NEEDS REVISION → pending these fixes → APPROVED.

## Overview

El motor de cascadas conecta cada decisión de gestión del club — presupuesto del jardinero, precio de entradas, intensidad de entrenos, calidad del catering — con consecuencias en cadena a través de todos los sistemas del club, con delays de semanas y efectos acumulativos que el jugador descubre experimentando. La mecánica central es el descubrimiento: el jugador nunca ve el grafo de relaciones directamente, sino que lo infiere desde los mensajes del staff y los resultados del equipo. Los momentos más memorables emergen de cascadas contraintuitivas — el prototipo validó que "más descanso puede deteriorar la física del equipo" fue el momento de mayor engagement. La variable raíz del sistema es `fan_momentum`, que acumula la historia emocional de la afición y actúa como modulador path-dependent: la misma subida de precio de entradas produce efectos distintos según el momentum acumulado en la relación club-afición (se gana lento, se pierde rápido). El grafo se evalúa semanalmente mediante ticks discretos como función pura y determinista — ver ADR-003 (Topología del Grafo de Cascadas) para la especificación técnica del evaluador. El catálogo de nodos y edges es configuración de datos: añadir nuevas cascadas no requiere modificar el motor.

## Player Fantasy

El jugador es un detective de sistemas que todavía no sabe que lo es. No ve el grafo — ve un equipo que entrena, un campo con más o menos hierba, mensajes del jardinero y del preparador físico que a veces parecen no relacionados. Ajusta un presupuesto, espera, lee un mensaje, y en algún momento de la semana 4 se da cuenta: "claro, el campo estaba mal porque yo bajé eso hace tres semanas". Ese momento de cierre causal es la recompensa central del motor de cascadas.

La fantasía emocional es la del **descubridor paciente**: el jugador que confía en que hay un sistema coherente aunque no lo entienda todavía, y que siente satisfacción profunda cuando las conexiones emergen desde el comportamiento del mundo — no desde un tooltip. La variante más poderosa de esta fantasía es la cascada **contraintuitiva**: cuando el efecto contradice la intuición inicial ("di más descanso y el equipo fue peor"), el momento "ajá" es más intenso porque desafía el modelo mental previo.

El motor de cascadas también entrega una segunda fantasy que se superpone: la del **gerente con información privilegiada**. La calidad del staff que el jugador contrata determina cuántas señales del grafo le llegan y con qué precisión — un preparador físico experto avisa antes, con más detalle. Mejorar el staff no es "subir un número", es ampliar la visibilidad del mundo. Esta fantasy conecta directamente con P3: tú creces junto a tu club.

## Detailed Design

### Core Rules

1. El motor de cascadas evalúa el WorldState una vez por semana de juego in-game. Un "tick" = una semana. El jugador no puede avanzar menos de una semana; el tiempo se detiene hasta que el jugador decide avanzar (ver ADR-008).

2. Toda variable del sistema es un nodo (`NodeId`) con rango `[min, max]` y un valor actual. El WorldState completo es un snapshot de todos los nodos en un tick dado. El motor nunca escribe parcialmente el WorldState — cada tick produce un WorldState completo o falla con error.

3. Cada edge del grafo lee **siempre del prevState** (estado de la semana anterior), nunca del nextState en construcción. Esto garantiza que los ciclos son seguros por construcción: un ciclo `A → B → A` se propaga semana a semana sin divergir ni requerir solver.

4. Los efectos de múltiples edges sobre el mismo nodo son **aditivos**: si dos edges escriben a `team_fitness`, sus deltas se suman. No hay sobreescritura entre edges. El clamping al rango del nodo se aplica al final del tick.

5. Cada edge puede tener un **delay en semanas** (0 = mismo tick; 1 = siguiente semana; 2+= semanas futuras). Los efectos diferidos se almacenan en el `DelayedEffectsBuffer` y se aplican al inicio del tick en el que vencen. Los delays son un mecanismo de diseño intencional — "el campo no mejora de un día para otro" es un feedback loop narrativo, no fricción técnica.

6. Las **Player Decisions** (decisiones del jugador esa semana) se aplican al nextState como modificadores directos, después de que todos los edges hayan sido evaluados. Tienen efecto inmediato (delay: 0) en el nextState y no son retroactivas.

7. La regla de **contraintuitiva a nivel sistema**: el sistema de cascadas en su conjunto incluye al menos 6 cadenas contraintuitivas distribuidas entre los nodos `fan_momentum`, `team_fitness` y `match_performance_index`. Un efecto contraintuitivo es aquel en el que la dirección del cambio (más → peor, o menos → mejor bajo ciertas condiciones) contradice la intuición del jugador novel. Las cadenas directas (C2, C5a, C5b, C7, C9a/b, C11, C13, C16a, C17) son intencionalmente simples — son el contexto que hace que las contraintuitivas destaquen, no cascadas de segundo tier. Los momentos "ajá" de mayor engagement vienen de las 7 cadenas contraintuitivas (C1, C4, C6, C8, C12, C15, C18) — validado en prototipo 2026-05-16. (Revisado en R3: la regla original "toda cadena MVP" era indemostrable con el catálogo real.)

8. `fan_momentum` es la **variable raíz de path-dependency**. Actúa como modulador de sensibilidad para otros efectos, especialmente los relacionados con precios y asistencia. La misma subida de `ticket_price_index` produce efectos distintos según el valor actual de `fan_momentum`. La histéresis es **asimétrica**: subir fan_momentum es lento (requiere semanas de buenos resultados + precios razonables); bajarlo es rápido (pocas derrotas o precios percibidos como injustos son suficientes).

9. La detección de actividades de riesgo (`corruption_exposure` → caught event) depende del `qualityTier` del director deportivo contratado (ADR-009). Un director de tier 3 detecta exposición acumulándose antes de que llegue al umbral de BLOCKING y puede reducirla activamente. Un director de tier 1 solo reporta cuando ya es crítico. Esta mecánica conecta P3 (crecer como manager) con el sistema de riesgo-recompensa.

10. El grafo de cascadas es **datos configurables**, no código del motor. Añadir una nueva cadena de cascada = añadir un objeto `CascadeEdgeDef` en `packages/shared/src/sim/cascade-graph.ts`. Cambiar un peso = cambiar una constante nombrada en ese fichero. El motor (`cascade-engine.ts`) nunca se toca para cambios de balance.

---

### Catálogo de Nodos (NodeId Catalog) — MVP

| NodeId | Rango | Default | Tipo | Descripción |
|--------|-------|---------|------|-------------|
| `groundskeeper_budget` | [0–100] | 50 | Input | Presupuesto semanal de mantenimiento del campo |
| `training_intensity` | [0–100] | 50 | Input | Carga de entrenamiento semanal |
| `catering_budget` | [0–100] | 50 | Input | Calidad del catering para plantilla y staff |
| `ticket_price_index` | [0–100] | 50 | Input | Precio de entradas relativo a expectativa del mercado (50 = justo) |
| `scouting_budget` | [0–100] | 30 | Input | Presupuesto mensual de scouting |
| `field_quality` | [0–100] | 50 | Estado interno | Calidad del césped |
| `injury_risk` | [0–100] | 20 | Estado interno | Probabilidad de lesiones (mayor = más riesgo) |
| `team_fitness` | [0–100] | 70 | Estado interno | Condición física del equipo |
| `staff_morale` | [0–100] | 60 | Estado interno | Satisfacción del staff de apoyo |
| `player_happiness` | [0–100] | 60 | Estado interno | Moral del vestuario (plantilla) |
| `fan_momentum` | [0–100] | 60 | Estado interno (raíz) | Inercia emocional acumulada de la afición |
| `fan_attendance` | [0–100] | 40 | Estado interno | % de aforo en partidos (calculado) |
| `consecutive_wins` | [0–10] | 0 | Estado interno | Racha de victorias consecutivas |
| `consecutive_losses` | [0–10] | 0 | Estado interno | Racha de derrotas consecutivas |
| `scouting_points` | [0–100] | 0 | Estado interno | Puntos acumulados de scouting |
| `sponsor_quality` | [0–100] | 0 | Estado interno | Nivel del patrocinador actual (0 = sin patrocinio) |
| `corruption_exposure` | [0–100] | 0 | Estado interno | Riesgo acumulado por actividades irregulares; decae semanalmente si no se acumula |
| `team_skill` | [0–100] | 50 | Estático (vía PlayerDecision) | Calidad media del equipo. Cambia vía fichajes y desarrollo — no tiene cascade edge propio. Leído por match-simulation. |
| `match_performance_index` | [0–100] | 50 | Sim-output | Calidad del rendimiento en el último partido (escrito por match-sim) |
| `squad_available_pct` | [0–100] | 90 | Sim-output | % de la primera plantilla disponible |

---

### Catálogo de Cadenas de Cascada — MVP

| ID | Edge(s) | Delay(s) | Contraintuitiva | Descripción |
|----|---------|----------|-----------------|-------------|
| C1 | groundskeeper_budget → field_quality → injury_risk | 1w, 0 | **SÍ** | Campo mediocre es MÁS peligroso que campo bueno o muy malo. Jugadores ajustan comportamiento en extremos. |
| C2 | injury_risk → squad_available_pct | 1w | No | Más lesiones = menos jugadores disponibles |
| C3 | field_quality → team_fitness | 0 | Leve | Campo pobre = fatiga extra por terreno irregular |
| C4 | training_intensity → team_fitness | 1w | **SÍ** | Extremos (>70 Y <30) dañan fitness. Sweet spot: 40–60 |
| C5a | catering_budget → team_fitness | 1w | No | Jugadores con mejor comida rinden más (la cadena del "tupper") |
| C5b | catering_budget → staff_morale | 1w | No | El staff también come; catering afecta su moral |
| C6 | match_performance_index → fan_momentum | 0 | **SÍ (asim.)** | Victoria: +poco. Derrota: -mucho. Asimetría intencional. |
| C7 | consecutive_wins → fan_momentum | 0 | No | Bonus acumulativo por racha; reset a 0 en primera derrota |
| C8 | fan_momentum × ticket_price_index → fan_attendance | 0 | **SÍ** | Con momentum alto, subir precio tiene menos impacto en asistencia. Con momentum bajo, el mismo precio crea éxodo. |
| C9 | scouting_budget → scouting_points → squad_available_pct | 1w+2w | No | 3 semanas para ver efecto en plantilla. Delay es feature, no bug. |
| C10 | staff_morale → training_intensity effectiveness | 0 | No | Staff desmoralizado = entrenamientos peor organizados (multiplicador sobre C4) |
| C11 | staff_morale → match_performance_index | 0 | No | Staff desmoralizado = peor preparación táctica del partido. **Guard: solo evalúa en ticks con partido** (`ctx.hasMatchThisWeek`). |
| C12 | consecutive_losses × training_intensity → team_fitness | 1w | **SÍ** | Derrotas con intensidad de entrenamiento alta → sobreentrenamiento desesperado. Bajar training_intensity evita el daño (agencia del jugador). |
| C13 | squad_available_pct → team_fitness | 1w | No | Plantilla completa = mejores ejercicios de grupo = mayor fitness |
| C14 | field_quality → match_performance_index | 0 | No | Campo propio en buen estado = ligera ventaja local. **Guard: solo evalúa en ticks con partido** (`ctx.hasMatchThisWeek`). |
| C15 | ticket_price_index → fan_momentum | 2w | **SÍ** | Precios altos sostenidos (>65) erosionan lentamente la lealtad aunque se gane |
| C16 | player_happiness → team_fitness + match_performance_index | 0 | No | Vestuario contento = entrega total en entrenos y partidos. **C16b guard: la rama match_performance_index solo evalúa en ticks con partido** (`ctx.hasMatchThisWeek`). C16a (→ team_fitness) evalúa siempre. |
| C17 | sponsor_quality → player_happiness | 1w | No | Coches, relojes, comida premium de sponsor = vestuario más feliz |
| C18 | corruption_exposure → fan_momentum (si BLOCKING) | 0 | **SÍ** | Si te pillan: caída masiva de fan_momentum + evento narrativo de escándalo |

---

### States and Transitions

El motor no tiene FSM propio — su "estado" es el WorldState completo. El ciclo semanal:

```
Inicio del tick (semana W)
  │
  ├─► 1. Aplicar efectos diferidos del buffer (applyAt === W)
  │       → nextState[toNode] += effect.delta para cada efecto vencido
  │
  ├─► 2. Evaluar todos los edges del grafo
  │       Para cada edge (from → to):
  │         delta = edge.transferFn(prevState[from], prevState[to], ctx)
  │         Si delay === 0: nextState[to] += delta
  │         Si delay > 0: añadir a newDelayedEffects con applyAt = W + delay
  │
  ├─► 3. Aplicar Player Decisions de la semana
  │       → Modificadores directos sobre nextState (siempre delay: 0)
  │       → Incluye: ajustes de budget, decisiones especiales (eventos), acciones irregulares
  │
  ├─► 4. Clamp final de todos los nodos a sus rangos [min, max]
  │
  ├─► 5. Detectar ThresholdCrossings (ADR-008)
  │       Para cada nodo con umbrales configurados:
  │         Si el valor cruza un umbral: emitir ThresholdCrossing BLOCKING o ADVISORY
  │
  └─► 6. Retornar TickResult
          { nextState, newDelayedEffects, log, thresholdCrossings }
```

**Reglas de Player Decisions:** Se aplican en el Paso 3, después de todos los edges. Son inmediatas (delay: 0). No son retroactivas. Si el jugador baja `ticket_price_index` esta semana, el efecto en `fan_attendance` es visible en el mismo tick; el efecto en `fan_momentum` via C15 tarda 2 semanas.

**Threshold Crossings configurados (MVP):**

| NodeId | Umbral | Dirección | Priority | Efecto en el juego |
|--------|--------|-----------|----------|--------------------|
| `corruption_exposure` | 80 | above | BLOCKING | Escándalo de corrupción — para el advance loop, evento narrativo forzado |
| `fan_momentum` | 20 | below | BLOCKING | Fan base en crisis — board meeting forzado |
| `player_happiness` | 25 | below | BLOCKING | Crisis del vestuario — reunión con el capitán forzada |
| `fan_momentum` | 75 | above | ADVISORY | Momentum muy alto — notificación del director comercial |
| `injury_risk` | 70 | above | ADVISORY | Riesgo de lesiones crítico — mensaje del preparador físico |
| `squad_available_pct` | 60 | below | ADVISORY | Plantilla muy mermada — aviso del director deportivo |
| `field_quality` | 30 | below | ADVISORY | Campo deteriorado — mensaje del jardinero |

---

### Interactions with Other Systems

**→ `match-simulation.md`** *(lector del WorldState; escritor de match_performance_index e injury_risk)*
- **Lee**: `team_fitness`, `team_skill`, `squad_available_pct`, `field_quality`, `fan_attendance`, `staff_morale`, `player_happiness` (7 nodos, via FootballPlugin.worldStateReads — ADR-007)
- **Escribe**: `match_performance_index` (calidad del rendimiento → cascade C6 propaga a fan_momentum) + `injury_risk` (lesiones durante el partido → acumulado en worldStateDelta post-partido)
- **Contrato**: match-sim recibe el WorldState del tick del partido como parte de SimContext. Escribe exactamente 2 nodos via MatchOutcome.worldStateDeltas — el cascade engine los aplica en el mismo tick. No escribe fan_momentum directamente. (Actualizado 2026-05-17 — /consistency-check corrigió stale description)

**→ `economy.md`** *(lector de asistencia; escritor de financial nodes)*
- **Lee**: `fan_attendance`, `fan_momentum`, `sponsor_quality` — inputs para calcular revenue del partido
- **Escribe**: nodos económicos propios (definidos en economy.md); no escribe en el WorldState del cascade engine directamente
- **Contrato**: cascade engine calcula la asistencia → economy toma ese valor y calcula revenue. Flujo unidireccional por tick.

**→ `staff-system.md`** / **ADR-009** *(lector post-tick via BullMQ)*
- **Lee**: WorldStateDiff completo (prevState vs nextState) + ThresholdCrossings del tick
- **No escribe** al WorldState durante el tick. Los mensajes del staff son output, no input.
- **Contrato**: el template key `'{role}:{nodeId}:{direction}:{tier}'` usa exactamente los NodeIds de este catálogo. El catálogo de NodeIds de este GDD ES el catálogo de templates de ADR-009.
- **Contrato mínimo de señal (tier-1)**: Para que la Player Fantasy "detective paciente" funcione incluso con staff de menor calidad, el tier-1 staff DEBE emitir mensajes para al menos las siguientes transiciones contraintuitivas: (1) `injury_risk` subiendo cuando `field_quality` entra en zona mediocre [20–45] — cadena C1b; (2) `team_fitness` bajando en los extremos de `training_intensity` (<30 o >70) — cadena C4; (3) `team_fitness` bajando con rachas de derrota + alta intensidad — cadena C12. Sin estas señales mínimas, el jugador con staff tier-1 no puede descubrir las cadenas más valiosas del sistema. Los detalles del template se especifican en `staff-system.md`, pero este contrato mínimo es no negociable — es prerequisito del diseño de descubrimiento.

**→ `event-system.md`** *(lector de ThresholdCrossings; escritor de PlayerDecisions)*
- **Lee**: `ThresholdCrossings[]` en `AdvanceResult` para generar calendar events dinámicos (BLOCKING crossings detienen el advance loop)
- **Escribe**: Player Decisions de eventos especiales (cena de reconciliación, corrupción, patrocinadores, apartados) como deltas directos al WorldState — aplicados en el Paso 3 del ciclo semanal
- **Contrato**: cada PlayerDecision especial del event-system tiene definido qué NodeId afecta y con qué delta. El cascade engine aplica esos deltas sin conocer su origen.

**→ `manager-rpg.md`** *(lector de nodos de visibilidad; escritor indirecto via staff quality)*
- **Lee**: `fan_momentum`, `consecutive_wins`, `squad_available_pct` — contribuyen a la reputación del manager
- **Escribe**: la calidad del staff contratado (determinada por habilidades del manager) determina el `qualityTier` en `StaffPerceptionConfig` (ADR-009), controlando cuántos ThresholdCrossings son visibles para el jugador

**→ Debug/Admin Interface** *(tooling de desarrollo — no es feature de juego)*
- Ruta protegida `POST /admin/cascade-run` (solo dev/staging) acepta: `{ worldState: Record<string, number>, weeks: number, seed: string }` → devuelve `TickResult[]`
- Permite al desarrollador: set directo de cualquier NodeId, advance N ticks con seed fija, ver el `CascadeLog[]` completo de cada tick (qué edges se activaron, con qué delta), ejecutar escenarios predefinidos por cadena
- Sustituye el prototipo HTML como herramienta de playtesting rápido de cascadas individuales
- Los escenarios predefinidos por cadena (C1–C18) se definen en la Sección H (Acceptance Criteria) y son los mismos tests que corren en CI

## Formulas

Todas las funciones de transferencia son **funciones puras** — no llaman `Math.random()`. Cuando se indica `noise(AMP)`, se usa `(ctx.rng() - 0.5) * AMP`. Las cadenas C8 y C10 leen nodos adicionales del WorldState via `ctx.prevState` (SimContext extendido con `prevState: WorldState` read-only).

---

### C0: Decay natural de team_fitness (equilibrio en 70)

`delta_team_fitness_C0 = -K_fit_decay × (team_fitness - 70)`

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| team_fitness actual | TF | float | [0–100] | Valor de `team_fitness` en prevState |
| Tasa de decay | K_fit_decay | float | 0.05 | 5% de corrección semanal hacia el equilibrio |

**Rango del output:** −1.5 a +3.5 (siempre empuja hacia el equilibrio en 70)
**Ejemplo:** TF = 90 → delta = −0.05 × 20 = **−1.0** / TF = 50 → delta = −0.05 × (−20) = **+1.0**

> **Amendment 2026-05-21 (Sprint 7 task 7-6 — RESOLVED Sprint 8 task 8-6)**:
>
> El equilibrio analítico de C0 en 70 **NO es alcanzable bajo juego pasivo**. El cascade tiene **side-channels** que empujan `team_fitness` lejos del equilibrio puro de C0 incluso bajo "isolation" (training=25, catering=50, squad=75, happiness=50, sin partidos, sin decisiones, rng noise=0):
>
> - Default `field_quality=50` → C1b reduce `injury_risk` (campo "mediocre" mejora hacia "cautious")
> - Default `injury_risk` decay vía C1b → C2 sube `squad_available_pct`
> - Default `scouting_budget=30` → C9a acumula `scouting_points` → C9b sube `squad_available_pct`
> - `squad_available_pct > 75` → C13 escribe delta positivo a `team_fitness` (delayed:1)
>
> Resultado observado (rng=0.5, 20 ticks):
> - Empezando en TF=90, analítico-puro-C0 predice ≈77.17; observado real ≈86.5
> - Empezando en TF=50, analítico predice ≈62.83; observado real ≈72.2 (sobrepasa 70)
>
> **DECISIÓN (Sprint 8 task 8-6 — Option 3 adoptada autónomamente, conservadora)**:
>
> Se acepta como **comportamiento emergente intencional**: el equilibrio "70" descrito por C0 es la pull de C0 **aislada** — describe la fuerza de mean-reversion del edge, no el equilibrio agregado del cascade. La interconexión es feature, no bug — refleja el principio de diseño "todas las decisiones del jugador tienen consecuencias en cadena" (Pilar 1).
>
> **Implicación práctica para el jugador**: bajo juego pasivo, `team_fitness` deriva al alza por las recovery paths del cascade. Para mantener el equilibrio 70 se requieren decisiones activas (bajar training, recortar scouting, etc.). Esto es coherente con la fantasía de gestión — el club ENTRENA, el jugador DECIDE.
>
> **Las opciones 1 (retune K_fit_decay) y 2 (añadir dampening edge) NO se aplican** — esos cambios alterarían la balance del juego sin /balance-check coverage. Si en futuras observaciones de playtest el drift se siente excesivo, Pablo puede abrir un ticket de balance dedicado con /balance-check + retune en su propio sprint.
>
> Tests vivos (CASCADE-017 EQL-02/03) ya están alineados con esta decisión — afirman dirección de convergencia + bandas observadas reales, no la teórica [68, 72].
>
> **Status: RESOLVED (Option 3 confirmed by Pablo 2026-05-21 via "todo ok, continua" approval of Sprint 9 plan)**. The "intentional emergent behavior" interpretation is the locked design: the C0 equilibrium 70 is the ISOLATED pull of the edge, not the cascade's aggregate equilibrium; passive-play drift via side-channels (C1b→C2→C9b→C13 SP-creep path) is feature, not bug. Tests aligned (CASCADE-017 EQL-02/03 assert observed bands, not theoretical [68, 72]). No constants retuned. If future playtest data shows the drift feels excessive, Pablo can open a dedicated balance ticket with `/balance-check` in a future sprint.

---

### C1a: groundskeeper_budget → field_quality

`delta_field_quality = (groundskeeper_budget - 50) × K_ground`

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Presupuesto del jardinero | B_ground | float | [0–100] | Valor de `groundskeeper_budget` en prevState |
| Constante de transferencia | K_ground | float | 0.30 | Cuánto se mueve `field_quality` por punto de budget sobre 50 |

**Rango del output:** −15 a +15
**Ejemplo:** B_ground = 80 → delta = (80 − 50) × 0.30 = **+9.0** (campo sube 9 puntos esa semana)

---

### C1b: field_quality → injury_risk (CONTRAINTUITIVA — zona de peligro en campo mediocre)

```
Si F_q ≥ 75:          delta = -K_safe_high                           (campo excelente protege)
Si 75 > F_q > 45:    delta = -(F_q - 45) × K_danger                 (la protección decrece)
Si 45 ≥ F_q > 20:    delta = (45 - F_q) × K_danger                  (campo mediocre = mayor riesgo)
Si F_q ≤ 20:          delta = -K_safe_low                             (campo pésimo → jugadores van con cuidado)
```

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Calidad del campo | F_q | float | [0–100] | Valor de `field_quality` en prevState |
| Umbral campo excelente | T_safe_high | float | 75 | Por encima → campo seguro |
| Pico de peligro | T_danger_peak | float | 45 | Valor de máximo riesgo añadido |
| Umbral campo muy malo | T_safe_low | float | 20 | Por debajo → jugadores van con cuidado |
| Reducción en campo excelente | K_safe_high | float | 6.0 | Delta negativo fijo |
| Pendiente de zona peligrosa | K_danger | float | 0.25 | Pendiente de riesgo en zona mediocre |
| Reducción en campo pésimo | K_safe_low | float | 3.0 | Delta negativo fijo |

**Rango del output:** −6 a +6.25 (positivo = más riesgo de lesión; el supremo +6.25 se alcanza en F_q → 20 desde zona mediocre: (45−20)×0.25=+6.25). (R3: condición de branch A cambiada a `F_q ≥ 75` para que F_q=75 exacto entregue K_safe_high=-6.0, no -7.5 del tramo inferior.)
**Ejemplo (contraintuitiva):** F_q = 10 → delta = **−3.0** (campo pésimo = precaución) / F_q = 40 → delta = **+1.25** (campo mediocre ES más peligroso que campo pésimo)
**Nota de discontinuidad:** En F_q=20 exacto, el tramo "campo pésimo" aplica (delta=−3.0). En F_q=20.001, el tramo mediocre aplica (delta≈+6.25). Salto de +9.25 — intencional (el campo ha deteriorado tanto que los jugadores han ajustado su comportamiento). El AC-CTI-C1b-ascendente cubre esta transición.

> **Amendment 2026-05-21 (Sprint 7 task 7-7 — RESOLVED Sprint 8 task 8-5)**:
>
> La forma counterintuitive de C1b se documenta como "**mediocre INCREMENTA injury_risk, catastrófico LO REDUCE**" — una desigualdad direccional, NO de magnitud. La descripción anterior "mediocre worse than catastrophic in magnitude" era incorrecta con los valores actuales (K_danger=0.25, K_safe_low=3.0):
> - F_q=40 (mediocre) → +1.25  (INCREASE injury_risk — peor para el jugador)
> - F_q=10 (catastrófico) → −3.0  (DECREASE injury_risk — los jugadores ven el peligro y juegan con cuidado)
>
> **El "worse" intencional es direccional**: el campo mediocre es el ÚNICO branch que aumenta el riesgo. Un campo catastrófico de hecho lo reduce porque los jugadores cambian su comportamiento (cautious play). Esa es la paradoja completa.
>
> **DECISIÓN (Sprint 8 task 8-5 — Option 2 adoptada autónomamente, conservadora)**:
>
> Se reescribe la descripción counterintuitive de C1b en términos **direccionales puros** (lo que el código YA implementa y el test vivo YA afirma). NO se retunea K_danger.
>
> **Las opciones 1 (retune K_danger al alza) y 3 (aceptar magnitud actual + documentar) NO se aplican**:
> - Option 1 requeriría /balance-check coverage; no se ejecuta sin aprobación explícita de Pablo.
> - Option 3 deja la spec con una desigualdad de magnitud falsa colgando — confunde a futuras revisiones.
>
> Test vivo `test_c1b_mediocre_field_paradoxically_worsens_injury_risk` afirma dirección + branch coverage, no magnitudes. Ya está alineado con esta resolución.
>
> **Status: RESOLVED** — no further action required. Si en futuras playtest sessions el efecto de campo mediocre se siente subdimensionado (jugadores no perciben la paradoja porque el +1.25 es muy pequeño), Pablo puede abrir un ticket de balance específico con `/balance-check` para considerar Option 1.

---

### C2: injury_risk → squad_available_pct

`delta_squad_available = -K_injury × (injury_risk - IR_base) + noise(NOISE_C2_AMP)`

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Riesgo de lesión | IR_prev | float | [0–100] | Valor de `injury_risk` en prevState |
| Riesgo base | IR_base | float | 20 | Riesgo normal — no penaliza |
| Constante | K_injury | float | 0.30 | Pérdida de % plantilla por punto de riesgo sobre el base |
| Amplitud de ruido | NOISE_C2_AMP | float | 2.0 | Las lesiones tienen aleatoriedad real (±1) |

**Rango del output:** −25 a +7 (sin noise: −24 a +6)
**Ejemplo:** IR = 50 → delta = −0.30 × (50 − 20) + ruido = **−9.0** ± 1

---

### C3: field_quality → team_fitness

`delta_team_fitness_C3 = -K_field_fatigue × max(0, T_field_poor - field_quality)`

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Calidad del campo | F_q | float | [0–100] | Valor de `field_quality` en prevState |
| Umbral de campo pobre | T_field_poor | float | 40 | Por debajo → fatiga extra por terreno irregular |
| Constante de fatiga | K_field_fatigue | float | 0.10 | Fitness perdido por punto de campo bajo umbral |

**Rango del output:** −4 a 0
**Ejemplo:** F_q = 25 → delta = −0.10 × (40 − 25) = **−1.5**

---

### C4: training_intensity → team_fitness (CONTRAINTUITIVA — parábola invertida)

`delta_team_fitness_C4 = K_C4_effective × (training_intensity - T_low) × (T_high - training_intensity) / 625 + noise(NOISE_C4_AMP)`

Donde `K_C4_effective = K_C4 × (MORALE_SCALE_MIN + (staff_morale_prev / 100) × (1 - MORALE_SCALE_MIN))`
Y `625 = (T_high - T_low)² / 4` (normalizador — el máximo de la parábola es 1.0 antes de K_C4)

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Intensidad de entrenamiento | I_train | float | [0–100] | Valor de `training_intensity` en prevState |
| Umbral inferior | T_low | float | 25 | Por debajo → infraentrenamiento |
| Umbral superior | T_high | float | 75 | Por encima → sobreentrenamiento |
| Amplitud del beneficio | K_C4 | float | 8.0 | Ganancia máxima en sweet spot (I_train = 50) |
| Amplitud de ruido | NOISE_C4_AMP | float | 2.0 | Variabilidad del entrenamiento (±1) |
| Staff morale previo | SM_prev | float | [0–100] | Leído via `ctx.prevState` (ver C10) |
| Escala mínima de morale | MORALE_SCALE_MIN | float | 0.5 | Con morale=0, training es 50% efectivo |

**Rango del output:** −25 a +9 (sin noise: −24 a +8)
**Ejemplo (sweet spot):** I_train = 50, SM = 60 → K_C4_eff = 8.0 × 0.8 = 6.4 → delta = **+6.4**
**Ejemplo (sobreentrenamiento):** I_train = 80, SM = 60 → delta ≈ **−2.82** (la parábola da valor negativo)

---

### C5a: catering_budget → team_fitness

`delta_team_fitness_C5a = K_catering_fit × (catering_budget - 50) / 50`

**Variables:** catering_budget [0–100], K_catering_fit = 3.0
**Rango del output:** −3 a +3 / **Ejemplo:** CAT = 80 → delta = **+1.8**

---

### C5b: catering_budget → staff_morale

`delta_staff_morale = K_catering_moral × (catering_budget - 50) / 50`

**Variables:** catering_budget [0–100], K_catering_moral = 4.0 (el staff es más sensible que los jugadores)
**Rango del output:** −4 a +4 / **Ejemplo:** CAT = 20 → delta = **−2.4**

---

### C6: match_performance_index → fan_momentum (CONTRAINTUITIVA — histéresis asimétrica)

```
Si MPI ≥ 50 (victoria/empate):
  P_win = (MPI - 50) / 50
  delta = K_win_base × ln(1 + P_win)

Si MPI < 50 (derrota):
  P_loss = (50 - MPI) / 50
  delta = -K_loss_base × (1 + P_loss²)
```

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Índice de rendimiento | MPI | float | [0–100] | Valor de `match_performance_index` en prevState |
| Ganancia por victoria | K_win_base | float | 8.0 | Amplitud del delta positivo máximo |
| Pérdida por derrota | K_loss_base | float | 8.0 | Amplitud del delta negativo |

**Rango del output:** −16 a +5.5
**Ejemplo (victoria):** MPI = 70 → delta = 8.0 × ln(1.4) = **+2.71**
**Ejemplo (derrota):** MPI = 30 → delta = −8.0 × (1 + 0.16) = **−9.28** (misma distancia de 50 que el ejemplo de victoria MPI=70, ~3.4× más impacto — consistente con entities.yaml fan_momentum_asymmetric_hysteresis note. *Fix post-sprint-planning 2026-05-19: el ejemplo anterior usaba MPI=40 que era matemáticamente correcto pero no demostraba la asimetría "misma distancia" que la prosa reclamaba; MPI=30 está a la misma distancia de 50 que MPI=70 y produce el ratio 3.4× canónico.*)

---

### C7: consecutive_wins → fan_momentum

`delta_fan_momentum_C7 = K_streak_base × consecutive_wins × (consecutive_wins + 1) / 110`

**Variables:** consecutive_wins [0–10], K_streak_base = 2.0
**Rango del output:** 0 a +2.0 / **Ejemplo:** CW = 5 → **+0.55** / CW = 10 → **+2.0**

---

### C8: fan_momentum × ticket_price_index → fan_attendance (CONTRAINTUITIVA — price-momentum interaction)

```
attendance_base = fan_momentum / 100 × ATTEND_MAX_BASE + ATTEND_MIN_BASE
price_penalty   = max(0, ticket_price_index - 50) × (1 - fan_momentum / MOMENTUM_TOLERANCE_DIVISOR)
price_bonus     = max(0, 50 - ticket_price_index) × PRICE_BONUS_K
fan_attendance_target = attendance_base + price_bonus - price_penalty
delta_fan_attendance  = fan_attendance_target - fan_attendance_prev
```

Nota de implementación: lee `fan_momentum` y `ticket_price_index` via `ctx.prevState`.

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Fan momentum | F_m | float | [0–100] | `fan_momentum` en prevState |
| Ticket price index | TPI | float | [0–100] | `ticket_price_index` en prevState |
| Techo de asistencia | ATTEND_MAX_BASE | float | 60 | Asistencia máxima por momentum solo |
| Asistencia mínima | ATTEND_MIN_BASE | float | 5 | Seguidores incondicionales |
| Divisor de tolerancia | MOMENTUM_TOLERANCE_DIVISOR | float | 120 | A mayor valor, más protege el momentum contra precios altos |
| Bonus por precio bajo | PRICE_BONUS_K | float | 0.25 | Atracción por punto de precio bajo del mercado |

**Rango del output (delta matemático):** −145 a +77.5 (antes de clamping de `fan_attendance` a [0,100]). El clamping del nodo garantiza que `fan_attendance` nunca sale de [0,100], pero el delta calculado internamente puede ser mayor en ambas direcciones bajo valores extremos (FM=0/TPI=100 → target=-45 con A_prev=100 → delta=-145; FM=100/TPI=0 → target=77.5 con A_prev=0 → delta=+77.5). (R3: corregido desde [-60,+60] incorrecto.)
**Ejemplo (momentum alto + precio alto):** F_m = 80, TPI = 70, A_prev = 55 → target = 46.3 → delta = **−8.7** (la afición aguanta pero la asistencia cae)
**Ejemplo (momentum bajo + precio alto):** F_m = 30, TPI = 70, A_prev = 40 → target = 8 → delta ≈ **−32** (colapso)

---

### C9a: scouting_budget → scouting_points (acumulativo con decay)

`delta_scouting_points = K_scouting × scouting_budget / 100 - DECAY_scouting × scouting_points + noise(NOISE_C9a_AMP)`

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Presupuesto de scouting | SC_budget | float | [0–100] | Valor de `scouting_budget` en prevState |
| Generación máxima | K_scouting | float | 15.0 | Puntos generados con budget al 100 |
| Tasa de decay | DECAY_scouting | float | 0.08 | Los informes pierden vigencia |
| Amplitud de ruido | NOISE_C9a_AMP | float | 2.0 | El scouting tiene suerte (±1) |

**Equilibrio con SC_budget = 30:** SP ≈ **56 puntos** (supera el umbral de C9b de 50)

---

### C9b: scouting_points → squad_available_pct (threshold)

`delta_squad_available_C9b = K_scouting_roster × max(0, scouting_points - T_scouting_active) / (100 - T_scouting_active)`

**Variables:** scouting_points [0–100], T_scouting_active = 50, K_scouting_roster = 5.0
**Delay:** 0 — C9b evalúa en el mismo tick en que scouting_points supera T_scouting_active. El efecto tardío de la cadena C9 completa (3 semanas) viene del delay:1 de C9a, no de un delay en C9b. C9b es un threshold gate, no un delayed edge.
**Rango del output:** 0 a +5.0 / **Ejemplo:** SP = 75 → delta = **+2.5**

---

### C10: staff_morale → efectividad de training_intensity (multiplicador integrado en C4)

`K_C4_effective = K_C4 × (MORALE_SCALE_MIN + (staff_morale / 100) × (1 - MORALE_SCALE_MIN))`

**Variables:** staff_morale [0–100], MORALE_SCALE_MIN = 0.5 (training nunca cae a 0%)
**Ejemplo:** SM = 30 → K_C4_eff = 8.0 × 0.65 = **5.2** (training rinde 35% menos que con morale óptima)

---

### C11: staff_morale → match_performance_index

`delta_match_perf_C11 = K_morale_perf × (staff_morale - 50) / 50`

**Guard:** `ctx.hasMatchThisWeek === true` — C11 no evalúa en ticks sin partido. Sin esta guard, C11 acumularía MPI indefinidamente en semanas de descanso hasta saturar el nodo (P4: las semanas sin partido deben ser quietas).
**Variables:** staff_morale [0–100], K_morale_perf = 8.0
**Rango del output:** −8 a +8 / **Ejemplo:** SM = 20 → delta = **−4.8**

---

### C12: consecutive_losses × training_intensity → team_fitness (CONTRAINTUITIVA — sobreentrenamiento desesperado)

El cuerpo técnico presiona más en entrenamiento cuando pierde, pero solo si el manager mantiene la intensidad alta. Bajar `training_intensity` por debajo de `T_desperation_threshold` frena el sobreentrenamiento — esta es la palanca de agencia del jugador sobre esta cadena.

```
intensity_mod_C12 = max(0, training_intensity_prev - T_desperation_threshold) / (100 - T_desperation_threshold)
delta_team_fitness_C12 = -K_desperation × (consecutive_losses ^ DESPERATION_EXP) / (10 ^ DESPERATION_EXP) × intensity_mod_C12
```

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Derrotas consecutivas | CL | int | [0–10] | Valor de `consecutive_losses` en prevState |
| Intensidad de entrenamiento | I_train | float | [0–100] | Valor de `training_intensity` en prevState |
| Umbral de desesperación | T_desperation_threshold | float | 50 | Por debajo → intensity_mod=0, sin daño de C12 |
| Amplitud del drenaje | K_desperation | float | 10.0 | Fitness perdido en el peor caso (CL=10, I_train=100) |
| Exponente | DESPERATION_EXP | float | 1.5 | El daño crece más rápido en rachas largas |

**Rango del output:** −10 a 0 (cero cuando training_intensity ≤ 50)
**Ejemplos:**
- CL = 5, I_train = 80 → intensity_mod = (80−50)/50 = 0.60 → delta = **−2.12** (entrenamiento duro en derrota)
- CL = 5, I_train = 40 → intensity_mod = 0 → delta = **0.0** (manager bajó intensidad — sin sobreentrenamiento)
- CL = 10, I_train = 100 → intensity_mod = 1.0 → delta = **−10.0** (peor caso absoluto)
- CL = 1, I_train = 80 → intensity_mod = 0.60 → delta = **−0.19**

---

### C13: squad_available_pct → team_fitness

`delta_team_fitness_C13 = K_squad_fit × (squad_available_pct - SQ_optimal) / 100`

**Variables:** squad_available_pct [0–100], SQ_optimal = 75, K_squad_fit = 5.0
**Rango del output:** −3.75 a +1.25 / **Ejemplo:** SQ = 60 → delta = **−0.75**

---

### C14: field_quality → match_performance_index (ventaja local)

`delta_match_perf_C14 = K_home_advantage × (field_quality - 50) / 50 + noise(NOISE_C14_AMP)`

**Guard:** `ctx.hasMatchThisWeek === true` — ventaja local solo aplica en semanas de partido.
**Variables:** field_quality [0–100], K_home_advantage = 6.0, NOISE_C14_AMP = 2.0
**Rango del output:** −7 a +7 (sin noise: −6 a +6) / **Ejemplo:** F_q = 80 → delta = **+3.6** ± 1

---

### C15: ticket_price_index → fan_momentum (CONTRAINTUITIVA — erosión acumulativa diferida)

`delta_fan_momentum_C15 = -K_price_erosion × max(0, ticket_price_index - T_price_danger)`

Nota: delay:2 — el efecto llega dos semanas después de la decisión de precio.

**Variables:**
| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Ticket price index | TPI | float | [0–100] | Valor de `ticket_price_index` dos semanas antes |
| Umbral de precio dañino | T_price_danger | float | 65 | Por encima → erosión de lealtad |
| Constante de erosión | K_price_erosion | float | 0.12 | Erosión por punto de precio sobre umbral por semana |

**Rango del output:** −4.2 a 0 (los precios no construyen lealtad — solo la erosionan)
**Ejemplo:** TPI = 80 → delta = **−1.8**/semana / En 10 semanas sostenidas: **−18** de fan_momentum

---

### C16a: player_happiness → team_fitness

`delta_team_fitness_C16 = K_happy_fit × (player_happiness - 50) / 50`

**Variables:** player_happiness [0–100], K_happy_fit = 4.0
**Rango del output:** −4 a +4 / **Ejemplo:** PH = 80 → delta = **+2.4**

---

### C16b: player_happiness → match_performance_index

`delta_match_perf_C16 = K_happy_perf × (player_happiness - 50) / 50`

**Guard:** `ctx.hasMatchThisWeek === true` — el impacto de la felicidad del vestuario en el rendimiento aplica solo en partido. C16a (→ team_fitness) evalúa siempre.
**Variables:** player_happiness [0–100], K_happy_perf = 7.0 (el impacto en partido es mayor que en entrenos)
**Rango del output:** −7 a +7 / **Ejemplo:** PH = 20 → delta = **−4.2** (vestuario infeliz rinde muy por debajo de su nivel físico)

---

### C17: sponsor_quality → player_happiness

`delta_player_happiness = K_sponsor_happy × sponsor_quality / 100`

**Variables:** sponsor_quality [0–100], K_sponsor_happy = 5.0
**Rango del output:** 0 a +5.0 / **Ejemplo:** SQ = 60 → delta = **+3.0**

---

### C18a: Decay semanal de corruption_exposure

`delta_corruption_exposure = -K_corruption_decay × corruption_exposure`

**Variables:** corruption_exposure [0–100], K_corruption_decay = 0.05
**Rango del output:** −5 a 0 (solo cuando prevState.CE < 80; la guard bloquea el decay en BLOCKING)
**Ejemplo:** CE = 60 → decay = **−3.0**/semana / CE = 79 → decay = **−3.95**/semana (último tick antes de BLOCKING en que aplica el decay)

**Condición de guardia (resuelve OQ-CASCADE-05):** C18a **NO evalúa** cuando `prevState.corruption_exposure ≥ 80`. Si la corrupción ya está en zona BLOCKING, el decay comienza desde el tick siguiente al escándalo. Implementación: el edge C18a tiene `guardFn: (prevState) => prevState.corruption_exposure < 80`. Esto garantiza que el ThresholdCrossing BLOCKING se detecta limpiamente sin que el decay del mismo tick lo suavice. Nota: para que una PlayerDecision lleve CE desde un prevState.CE=X a cruzar 80, la PlayerDecision debe ser mayor que `80 - 0.95×X` (el 0.95 refleja que el decay del Paso 2 aplica primero cuando CE < 80). Ejemplo: prevState.CE=78 → decay=−3.9 → 74.1; se necesita PD ≥ +6 para cruzar 80 (PD+8 → 82.1).

### C18b: Escándalo de corrupción (ThresholdCrossing BLOCKING en CE = 80)

Cuando `corruption_exposure` cruza el threshold BLOCKING (80), el event-system genera el evento de escándalo. La Player Decision resultante aplica:
`delta_fan_momentum_scandal = -SCANDAL_FAN_IMPACT` donde `SCANDAL_FAN_IMPACT = 30`

El valor de `corruption_exposure` se gestiona según la resolución del evento (rendición, cobertura, consecuencia) — definido en `event-system.md`.

## Edge Cases

- **Si un edge produce un delta que llevaría un nodo fuera de su rango [min, max]**: el valor se clampea al rango al final del tick (Paso 4 del ciclo). Si múltiples edges escriben al mismo nodo y su suma supera el rango, el clamping aplica sobre el total acumulado.

- **Si `match_performance_index` es exactamente 50**: se usa la rama positiva de C6 (delta = 8.0 × ln(1+0) = 0.0). La rama negativa de C6 aplica estrictamente cuando MPI < 50.

- **Si `training_intensity` ≤ T_desperation_threshold (50) durante una racha de derrotas**: C12 produce delta = 0 en esa semana. El sobreentrenamiento desesperado no ocurre si el manager baja la intensidad. La racha sigue acumulándose en `consecutive_losses` y afecta a C7 (reset) y match-sim, pero no drena fitness vía C12.

- **Si `consecutive_wins` está en 10 (máximo) y se gana otro partido**: el nodo permanece en 10 (clamped). El bonus de C7 se calcula con el valor clampeado.

- **Si `consecutive_wins` es > 0 y ocurre una derrota**: se resetea a 0 y `consecutive_losses` empieza a acumular. El reset es una Player Decision implícita (aplicada en Paso 3). `consecutive_losses` también se resetea a 0 cuando se gana.

- **Si el jugador alterna `training_intensity` entre 90 y 10 semanas alternadas**: la parábola de C4 castiga ambos extremos. El efecto neto en 2 semanas ≈ **−10.5** de team_fitness. La estrategia de oscilación es contraproducente. El preparador físico (ADR-009) alerta de ambos extremos.

- **Si `field_quality` cruza `T_safe_low` (20) de arriba a abajo**: el delta de C1b cambia de zona de peligro (positivo) a zona de campo pésimo (−3.0). La discontinuidad es intencional — el campo ha deteriorado tanto que los jugadores han cambiado su comportamiento.

- **Si `field_quality` cruza `T_safe_low` de abajo a arriba** (campo mejorando): injury_risk empieza a subir — este es el momento contraintuitivo más importante del sistema. El preparador físico debe generar un mensaje ADVISORY al entrar en la zona de peligro mediocre (20–45).

- **Si `corruption_exposure` es empujada a ≥ 80 por un PlayerDecision en el mismo tick**: el ThresholdCrossing BLOCKING se detecta en el Paso 5 de ese mismo tick. El evento de escándalo se genera al final de esa semana — no en el tick siguiente.

- **Si el jugador mantiene `ticket_price_index` alto durante 2 semanas y luego lo baja**: los dos deltas negativos de C15 ya están encolados en el `DelayedEffectsBuffer`. Se aplican cuando vencen aunque el precio ya sea justo. No es posible cancelar un efecto diferido ya encolado.

- **Si `scouting_points` intenta acumular por encima de 100**: clampeado a 100. Con SC_budget=100, el equilibrio calculado sería 187.5 → el clamping actúa como techo natural.

- **Si varios ThresholdCrossings BLOCKING ocurren en el mismo tick**: el advance loop se detiene en esa semana. Todos los crossings se incluyen en `AdvanceResult.thresholdCrossings`. La prioridad de resolución se define en `event-system.md`.

- **Si un nodo del WorldState no tiene template de staff para alguna dirección/tier** (key faltante en ADR-009): el `TEMPLATE_FALLBACK` se activa. El jugador recibe un mensaje genérico. No es un error del motor — es un gap de contenido a completar en `staff-system.md`.

- **Si `fan_momentum` llega a 0 e intenta seguir bajando**: clamped en 0. El ThresholdCrossing BLOCKING (umbral: 20) debería haber parado el advance loop antes de que fan_momentum alcance 0 en circunstancias normales.

- **Si `squad_available_pct` llega a 0**: no es game over. Los partidos se juegan con los jugadores disponibles; match-simulation producirá un `match_performance_index` muy bajo. El motor no falla en este estado.

## Dependencies

### Dependencias upstream (cascade-engine depende de estas)

| Sistema | Tipo | Interfaz específica |
|---------|------|---------------------|
| **ADR-003** — Topología del grafo | Dura | Define `CascadeGraph`, `WorldState`, `evaluateTick()`, `DelayedEffectsBuffer`, `TickResult`. El motor implementa exactamente estas interfaces. |
| **ADR-005** — Persistencia WorldState | Dura | Define cómo se persiste y carga el WorldState entre ticks. El GDD asume que `prevState` siempre está disponible desde la semana anterior. |
| **ADR-008** — World Clock + Event Loop | Dura | Define cuándo se llama `evaluateTick()` y qué hace el sistema con los `thresholdCrossings`. El motor debe exponer `thresholdCrossings` en `TickResult`. |
| **ADR-009** — Staff Message Routing | Blanda | Define cómo se consumen los WorldState diffs post-tick. El catálogo de NodeIds de este GDD es prerequisito para los templates del staff. |

### Dependencias downstream (estos sistemas dependen de cascade-engine)

| Sistema | Tipo | Qué necesitan del motor |
|---------|------|--------------------------|
| **`match-simulation.md`** | Dura | Lee `team_fitness`, `team_skill`, `squad_available_pct`, `field_quality`, `fan_attendance`, `staff_morale`, `player_happiness` (7 nodos). Escribe `match_performance_index` e `injury_risk`. |
| **`economy.md`** | Dura | Lee `fan_attendance`, `fan_momentum`, `sponsor_quality` para revenue. Escribe nodos financieros propios. |
| **`staff-system.md`** | Dura | Lee el WorldState diff completo para generar mensajes. Necesita el catálogo completo de NodeIds. |
| **`event-system.md`** | Dura | Lee `ThresholdCrossings[]` para calendar events dinámicos. Escribe PlayerDecisions como deltas directos al WorldState. |
| **`manager-rpg.md`** | Blanda | Lee `fan_momentum`, `consecutive_wins`, `squad_available_pct` para reputación. El qualityTier del staff modula C10. |
| **`hud-ui.md`** | Blanda | Lee el WorldState para indicadores HUD. Solo lectura. |
| **`league-system.md`** | Dura | Genera los fixture events del calendario que determinan cuándo se evalúan los ticks de partido. **También escribe `fan_momentum` como PlayerDecision post-partido via derby bonus/penalty** (F5 de league-system.md: +5 win / +1 draw / -8 loss). Contrato: estas PlayerDecisions se aplican en el Paso 3 del cascade tick del partido correspondiente, idénticas en mecanismo a las PlayerDecisions del event-system. |
| **`player-management.md`** | Blanda | **Escribe** `squad_available_pct` (% jugadores disponibles) y `team_skill` (media skill del starting_11) como PlayerDecisions en el Paso 3, cada advance(). Estos nodos son la interfaz entre la gestión de plantilla y el motor de cascadas. No lee nodos del WorldState directamente — es writer, no reader. |
| **`tv-rights.md`** | Dura | **Escribe** `corruption_exposure += CORRUPTION_DELTA_PER_WEEK[tier]` (clampeado en 0) como PlayerDecision en cada tick semanal con contrato ACTIVE. **Lee** `TV_SCANDAL_THRESHOLD = 60` como threshold node adicional (distinto del threshold global de escándalo = 80): cuando `corruption_exposure` cruza 60 al alza, cancela el contrato activo. El delta LOCAL es negativo (-0.5/sem) — único contribuyente negativo a `corruption_exposure` en el sistema MVP. |

### fan_momentum — Rutas de recuperación activa

La asimetría de C6 persiste incluso con K_loss/K_win = 1.0 (ratio post-R4) porque las funciones tienen formas distintas (logarítmica para victorias, cuadrática para derrotas). Una temporada de 15V-10E-13L (~50% WR) produce una erosión neta de C6 de ~−73 pts de fan_momentum. Las rutas de recuperación activa documentadas cubren ~33-45 pts/temporada — el déficit neto esperado para un equipo de 50% WR es de ~28-40 pts/temporada, requiriendo que el equipo evolucione hacia >50% WR en temporadas sucesivas. Para que P4 ("Calm Is The Tempo") se cumpla, el sistema debe ofrecer rutas de recuperación activa de fan_momentum que no dependan exclusivamente de ganar partidos:

1. **event-system.md `fan_crisis` opciones**: "Campaña promocional" (+5 FM en 2 semanas, coste 5€K), "Mensaje personal del manager" (+8 FM si reputation ≥ L3), "Reducir precio de entradas" (revierte C15 erosión).
2. **manager-rpg.md career events**: CE-2 (+8 FM en reputation L4) y CE-3 (+15 FM en reputation L5 por lealtad).
3. **ticket_price_index < 65**: elimina la erosión de C15 + puede producir ligero bonus via C8 price_bonus. El jugador puede priorizar la relación con la afición sobre los ingresos — decisión táctica de temporada.
4. **Derby wins** (league-system F5): +5 FM en derbis. En una temporada de 38 partidos con 4-6 derbis posibles, acumulan +20-30 FM disponibles.

**Nota de diseño (R3)**: estas rutas deben estar suficientemente documentadas y señaladas al jugador via staff tier-1 (ver contrato mínimo de señal en Interactions con staff-system.md) para que la crisis de fan_momentum sea un challenge navegable, no un trap loop. (Añadido por /review-all-gdds 2026-05-18.)

### Nota de consistencia bidireccional

Cada GDD dependiente debe listar `cascade-engine.md` en su propia sección Dependencies cuando sea escrito. Los GDDs que dependan de nodos específicos del WorldState deben referenciar los NodeIds exactos de la tabla del Catálogo de Nodos (Sección C).

## Tuning Knobs

Todas las constantes son knobs configurables en `packages/shared/src/sim/cascade-graph.ts`. Cambiar un knob = cambiar una constante en ese fichero — el motor (`cascade-engine.ts`) no se toca.

| Cadena | Constante | Valor MVP | Rango seguro | Si se SUBE | Si se BAJA |
|--------|-----------|-----------|--------------|------------|------------|
| C0 | `K_fit_decay` | 0.05 | [0.02–0.10] | Fitness vuelve al equilibrio muy rápido (explotable) | Fitness tarda en bajar desde valores altos |
| C1a | `K_ground` | 0.30 | [0.20–0.45] | Campo mejora/deteriora demasiado rápido | Campo casi no responde al presupuesto |
| C1b | `T_safe_high` | 75 | [65–85] | Zona de campo "excelente y seguro" más amplia | Campo excelente más difícil de alcanzar |
| C1b | `T_danger_peak` | 45 | [35–55] | Pico de peligro se desplaza hacia calidad menor | Pico hacia calidad mayor |
| C1b | `T_safe_low` | 20 | [10–30] | Zona de campo pésimo-pero-predecible más amplia | Casi no existe zona protectora |
| C1b | `K_danger` | 0.25 | [0.15–0.40] | Zona mediocre más peligrosa | La contraintuitiva pierde efecto |
| C4 | `T_low` | 25 | [20–35] | Zona de infraentrenamiento más estrecha | I_train debe ser muy alto para no perder fitness |
| C4 | `T_high` | 75 | [65–85] | Se puede entrenar más duro sin penalización | Zona de sobreentrenamiento más estrecha |
| C4 | `K_C4` | 8.0 | [5–12] | Sweet spot da demasiado fitness (llega a 100 rápido) | El entrenamiento produce casi nada |
| C4 | `NOISE_C4_AMP` | 2.0 | [0–4] | Varianza alta → jugador no conecta causa-efecto en early game (SNR<1) | Sistema muy mecánico y calculador |
| C6 | `K_win_base` | 8.0 | [5–12] | Victorias construyen momentum demasiado rápido | Fan apathy — victorias no mueven el momentum |
| C6 | `K_loss_base` | 8.0 | [6–10] | Derrotas muy devastadoras (crisis crónica incluso con buen win rate) | Histéresis asimétrica pierde significado — fan momentum se resetea solo |
| C8 | `ATTEND_MAX_BASE` | 60 | [50–75] | Estadios siempre llenos con momentum alto | Momentum alto no produce asistencia suficiente |
| C8 | `MOMENTUM_TOLERANCE_DIVISOR` | 120 | [80–160] | El momentum protege mucho contra precios altos | Asistencia muy sensible al precio siempre |
| C8 | `PRICE_BONUS_K` | 0.25 | [0.1–0.5] | Precios bajos atraen masas (explotable) | Bonus de precio bajo imperceptible |
| C10 | `MORALE_SCALE_MIN` | 0.5 | [0.3–0.7] | Con morale=0 el training aún es 70% efectivo | Con morale=0 el training es solo 30% efectivo |
| C15 | `T_price_danger` | 65 | [55–75] | Solo precios muy altos erosionan lealtad | Precios moderados ya erosionan (muy punitivo) |
| C15 | `K_price_erosion` | 0.12 | [0.05–0.25] | Erosión por precios rápida y visible | Erosión tan lenta que el jugador no la detecta |
| C12 | `T_desperation_threshold` | 50 | [35–65] | Umbral más bajo → C12 activa con intensidad moderada | Rango de seguridad muy amplio — fácil evitar el daño |
| C12 | `K_desperation` | 10.0 | [6–15] | Racha de derrotas con entrenamiento intenso destruye el físico | Sobreentrenamiento imperceptible aunque se entrene duro |
| C18 | `K_corruption_decay` | 0.05 | [0.03–0.10] | Exposición se olvida rápido (fácil limpiar) | Escándalo persiste muchas semanas |
| C18 | `SCANDAL_FAN_IMPACT` | 30 | [20–40] | Escándalo destruye la relación con la afición | Escándalo sin consecuencias reales |

### Interacciones críticas entre knobs

- **K_C4 + K_fit_decay**: si K_C4 = 12 y K_fit_decay = 0.02, el equipo llega a 100 de fitness trivialmente. Cambiar uno implica revisar el otro.
- **K_win_base + K_loss_base**: la proporción de diseño post-R4 es `K_loss_base / K_win_base = 1.0` (8/8). Ratio 1.0 significa que K_loss=K_win, pero la asimetría persiste por la diferencia de forma de las funciones (logarítmica para victorias, cuadrática para derrotas) — un equipo con 50% WR (15V-10E-13L/temporada) perderá ~73 pts de fan_momentum en C6 sin recovery paths. El rango seguro de ratio es 0.8–1.2. Si se sube K_loss_base, verificar que una temporada de 50% WR no lleva fan_momentum a BLOCKING antes de la jornada 30.
- **T_price_danger + K_price_erosion (C15) + MOMENTUM_TOLERANCE_DIVISOR (C8)**: las tres constantes juntas definen cuánto puede cobrar el manager antes de pagar en lealtad y asistencia. Calibrar juntas en playtests de economía.
- **NOISE_C4_AMP + K_C4**: si se sube NOISE_C4_AMP por encima de 2.0, verificar que la señal de C4 en early game (I_train ≈ 40) sigue siendo mayor que el noise (SNR > 1). Con K_C4=8.0, I_train=40 produce delta ≈ +5.1 con SM=60 — el noise debe ser < 2.5 para mantener SNR > 2.

### Workflow de playtest recomendado

1. Usar el Admin/Debug Interface (`POST /admin/cascade-run`) para testear cada cadena de forma aislada
2. Ajustar un knob a la vez
3. Correr los acceptance tests automatizados (Sección H) para verificar que los ACs siguen pasando
4. Registrar el valor anterior en el commit de tuning con nota del motivo del cambio

## Visual/Audio Requirements

No aplicable. El cascade engine es computación pura del lado del servidor — no tiene efectos visuales ni auditivos propios. El WorldState que produce es consumido por `hud-ui.md` (indicadores de estado) y `isometric-world.md` (estado de la ciudad), que definirán sus propios requisitos visuales y auditivos.

## UI Requirements

El cascade engine no tiene UI de jugador. La única interfaz específica de este sistema es el Admin/Debug Interface, una herramienta de desarrollo:

- **Ruta**: `POST /admin/cascade-run` — solo disponible con `NODE_ENV !== 'production'`
- **Request**: `{ worldState: Record<string, number>, weeks: number, seed: string, decisions?: Record<string, number> }`
- **Response**: `TickResult[]` — uno por semana simulada, incluyendo `nextState`, `newDelayedEffects`, `log` y `thresholdCrossings`
- **UI HTML (opcional, no bloqueante para MVP)**: página `/admin/cascade` con sliders por nodo, botón "Simular N semanas" y tabla de resultados. El endpoint raw es suficiente para pruebas automáticas en el vertical slice.
- **Seguridad**: el endpoint lanza `403 Forbidden` si `NODE_ENV === 'production'` (ver AC-ADM-05)

Los nodos del WorldState que el HUD de juego debe visualizar y las reglas de display se especifican en `hud-ui.md` (dependiente de este GDD).

## Acceptance Criteria

Todos los ACs de Unit/Integration residen en `tests/unit/sim/cascade-engine.test.ts` salvo que se indique otra ruta. Los ACs de serialización van en `tests/unit/db/sim-persistence.test.ts`. Los de Admin Interface en `tests/integration/admin/cascade-run.test.ts`.

---

### Categoría 1: Determinismo

**AC-DET-01**
GIVEN el WorldState por defecto y la seed `"test:det:1"`, WHEN se llama a `evaluateTick()` dos veces con exactamente los mismos argumentos, THEN ambos `TickResult.nextState` son idénticos en todos los 20 NodeIds.

**AC-DET-02**
GIVEN el WorldState por defecto y la seed `"test:det:2"`, WHEN se avanza 50 ticks en dos runs independientes, THEN el WorldState del tick 50 en el run A es idéntico al del run B para todos los nodos.

**AC-DET-03**
GIVEN un WorldState con `training_intensity = 80` y `catering_budget = 20`, WHEN se evalúa un tick con seed `"test:det:3"`, THEN el `CascadeLog[]` tiene los mismos `edgeId`, `fromValue` y `delta` en ambas invocaciones.

---

### Categoría 2: Seguridad de ciclos

**AC-CYC-01**
GIVEN el `CASCADA_FC_GRAPH` completo con WorldState por defecto y seed `"test:cycle:1"`, WHEN se evalúan 100 ticks sin decisions del jugador, THEN todos los nodos en el tick 100 permanecen dentro de su rango `[min, max]`.

**AC-CYC-02**
GIVEN el ciclo activo `fan_momentum → fan_attendance → match_performance_index → fan_momentum` con `fan_momentum = 100` y `match_performance_index = 100`, WHEN se evalúan 100 ticks con seed `"test:cycle:2"`, THEN `fan_momentum` nunca excede 100 ni cae por debajo de 0.

**AC-CYC-03**
GIVEN `fan_momentum = 1` y `match_performance_index = 0`, WHEN se evalúan 100 ticks con seed `"test:cycle:3"`, THEN `fan_momentum` no cae por debajo de 0 en ningún tick.

---

### Categoría 3: Delays

**AC-DEL-01**
GIVEN `groundskeeper_budget = 80` y buffer vacío en tick W=1 (edge C1a tiene delay:1), WHEN se evalúa el tick W=1, THEN `nextState.field_quality` no cambia respecto a prevState (C1a es delay:1 — su efecto aún no llegó), Y `newDelayedEffects` contiene 1 efecto con `applyAt=2`, `toNode="field_quality"`, `delta=+9.0`. NOTA: en W=1 sí ocurren otros cambios — C3 y C14 evalúan `field_quality=50` del prevState (delay:0) y producen deltas sobre `team_fitness` y `match_performance_index`. Este THEN se refiere exclusivamente a field_quality como nodo destino de C1a.

**AC-DEL-02**
GIVEN el tick W=2 con el buffer del AC-DEL-01, WHEN se evalúa el tick W=2, THEN `nextState.field_quality` ha incrementado (el efecto diferido se aplicó), y el efecto `applyAt=2` ya no aparece en `newDelayedEffects` del tick W=2.

**AC-DEL-03**
GIVEN un buffer con `applyAt=5` evaluando el tick W=3, WHEN se llama a `evaluateTick()`, THEN el efecto con `applyAt=5` NO se aplica al nextState en W=3.

**AC-DEL-04**
GIVEN `ticket_price_index = 80` (sobre T_price_danger=65) con edge C15 (delay:2), WHEN se evalúan los ticks W=1, W=2, W=3, THEN en W=1 se encola efecto `applyAt=3` con `delta=-1.8`; en W=3 ese efecto aplica sobre `fan_momentum` reduciendo su valor en 1.8.

**AC-DEL-05**
GIVEN `scouting_budget = 30` activo durante 4 semanas, WHEN se evalúan 4 ticks, THEN `scouting_points` empieza a acumular en el tick W=2 (delay:1 de C9a); `squad_available_pct` no muestra el incremento de C9b hasta al menos W=4 (delay adicional de 2w cuando scouting_points supera 50).

---

### Categoría 4: Composición aditiva

**AC-ADD-01**
GIVEN un WorldState donde múltiples edges escriben a `team_fitness` en el mismo tick, WHEN se evalúa el tick, THEN `nextState.team_fitness` es la suma de `prevState.team_fitness` más los deltas de todos los edges (C0, C3, C4, C12, C13, C16a) calculados de forma aditiva, aplicando clamping solo al final del tick. (Nota: C12 solo escribe cuando training_intensity > T_desperation_threshold y consecutive_losses > 0. Nota: C5a tiene delay:1 — no contribuye al nextState del mismo tick en W=1; su delta llega en W=2.)

**AC-ADD-02**
GIVEN exactamente dos edges con deltas conocidos de +3.0 y +2.0 sobre `team_fitness`, WHEN se evalúa el tick, THEN `nextState.team_fitness = clamp(prevState.team_fitness + 5.0, [0, 100])` — el delta combinado es exactamente +5.0 antes del clamping.

**AC-ADD-03**
GIVEN `fan_momentum = 98` con C6 (delta +2.7) y C7 (delta +0.55) activos, WHEN se evalúa el tick, THEN `nextState.fan_momentum = clamp(98 + 2.7 + 0.55, [0, 100]) = 100.0`.

---

### Categoría 5: Clamping

**AC-CLM-01**
GIVEN `fan_momentum = 99` y PlayerDecision de +5, WHEN se evalúa el tick, THEN `nextState.fan_momentum = 100` (no 104).

**AC-CLM-02**
GIVEN `team_fitness = 1` con delta neto de al menos -10, WHEN se evalúa el tick, THEN `nextState.team_fitness = 0` (no negativo).

**AC-CLM-03**
GIVEN `injury_risk = 99` con `field_quality = 40` (zona mediocre → C1b genera delta +1.25), WHEN se evalúa el tick, THEN `nextState.injury_risk = 100` (no 100.25).

**AC-CLM-04**
GIVEN `consecutive_wins = 10` (max) y una victoria, WHEN se evalúa el tick, THEN `nextState.consecutive_wins = 10`; el bonus de C7 usa valor clampeado 10 → delta máximo de +2.0.

**AC-CLM-05**
GIVEN `scouting_points = 95` con C9a generando delta +15.0, WHEN se evalúa el tick, THEN `nextState.scouting_points = 100` (no 110).

---

### Categoría 6: PlayerDecisions

**AC-PLD-01**
GIVEN `groundskeeper_budget = 50` en prevState y PlayerDecision que lo fija a 80, WHEN se evalúa el tick, THEN el edge C1a evaluó usando `prevState.groundskeeper_budget = 50` (las decisions aplican en el Paso 3, DESPUÉS de los edges del Paso 2); `nextState.groundskeeper_budget = 80`.

**AC-PLD-02**
GIVEN C15 evaluó en Paso 2 con `ticket_price_index = 80` encolando un efecto diferido, y PlayerDecision baja el precio a 40 en Paso 3, WHEN se evalúa el tick, THEN `nextState.ticket_price_index = 40`, PERO el efecto diferido con delta calculado en base a precio 80 sigue en `newDelayedEffects` (no es retroactivo).

**AC-PLD-03**
GIVEN PlayerDecision que añade +12 a `corruption_exposure = 75` (prevState.CE=75 < 80 → decay aplica: 75×0.95=71.25; +12 → 83.25 > 80), WHEN se evalúa el tick, THEN `TickResult.thresholdCrossings` contiene un crossing con `nodeId="corruption_exposure"`, `priority="BLOCKING"`, `direction="above"`. (La PD debe ser suficientemente grande para superar el decay: para CE=75, PD necesita ser > 80 − 71.25 = 8.75, i.e., PD ≥ 9.)

**AC-PLD-04**
GIVEN `consecutive_wins = 3` y una victoria en el tick actual, WHEN se evalúa el tick, THEN `nextState.consecutive_wins = 4` y `nextState.consecutive_losses = 0`.

**AC-PLD-05**
GIVEN `consecutive_wins = 2` y una derrota en el tick actual, WHEN se evalúa el tick, THEN `nextState.consecutive_wins = 0` y `nextState.consecutive_losses = 1`.

---

### Categoría 7: ThresholdCrossings

**AC-THR-01**
GIVEN `fan_momentum = 22` y un delta que lo lleva por debajo de 20 (umbral BLOCKING), WHEN se evalúa el tick, THEN `TickResult.thresholdCrossings` contiene exactamente 1 entry con `nodeId="fan_momentum"`, `priority="BLOCKING"`, `direction="below"`, `previousValue >= 20`, `newValue < 20`.

**AC-THR-02**
GIVEN `fan_momentum = 73` y delta acumulado de +4.0 (cruza ADVISORY en 75), WHEN se evalúa el tick, THEN `TickResult.thresholdCrossings` contiene 1 entry con `nodeId="fan_momentum"`, `priority="ADVISORY"`, `direction="above"`.

**AC-THR-03**
GIVEN que en el mismo tick `player_happiness` cae de 30 a 22 (cruza BLOCKING en 25) Y `injury_risk` sube de 65 a 72 (cruza ADVISORY en 70), WHEN se evalúa el tick, THEN `TickResult.thresholdCrossings` contiene exactamente 2 entries con sus respectivos nodeIds y priorities.

**AC-THR-04**
GIVEN `fan_momentum = 18` (YA por debajo del BLOCKING de 20) y un delta que lo baja a 14, WHEN se evalúa el tick, THEN `TickResult.thresholdCrossings` NO contiene ningún crossing para `fan_momentum` (no hay nueva transición — ya estaba cruzado).

**AC-THR-05**
GIVEN `corruption_exposure = 82` (YA por encima del BLOCKING de 80) y PlayerDecision que añade +5, WHEN se evalúa el tick, THEN `TickResult.thresholdCrossings` NO contiene crossing para `corruption_exposure`.

**AC-THR-06**
GIVEN WorldState en valores por defecto, `ctx.hasMatchThisWeek = false` (sin partidos), sin decisions del jugador, WHEN se evalúan 100 ticks con seed `"test:no-crossing"` y `rng()` que devuelve exactamente 0.5 en todos los calls (noise term = 0), THEN `TickResult.thresholdCrossings` está vacío en todos los ticks. (Justificación: con guards en C11/C14/C16b y sin partidos, `match_performance_index` permanece en 50 → C6 produce delta=0 → `fan_momentum` estable en 60; C0 decay de team_fitness converge a equilibrio en 70; ningún nodo acumula suficiente cambio para cruzar un umbral en 100 semanas. Precondición clave: `ctx.hasMatchThisWeek=false` previene que C11+C16b acumulen MPI.)

---

### Categoría 8: Cadenas contraintuitivas

**AC-CTI-C1b — Campo mediocre más peligroso que campo pésimo**

GIVEN `field_quality = 40` (mediocre, entre T_safe_low=20 y T_danger_peak=45), WHEN se evalúa C1b, THEN delta sobre `injury_risk` es positivo: `(45-40) * 0.25 = +1.25`.

GIVEN `field_quality = 10` (pésimo, por debajo de T_safe_low=20), WHEN se evalúa C1b, THEN delta sobre `injury_risk` es **negativo**: `-3.0` (K_safe_low). **Verificación cruzada obligatoria**: el delta con F_q=40 es mayor (peor) que con F_q=10.

GIVEN `field_quality = 80` (excelente, por encima de T_safe_high=75), WHEN se evalúa C1b, THEN delta sobre `injury_risk` es `-6.0` (K_safe_high).

**AC-CTI-C4 — Extremos de training_intensity dañan el fitness**

GIVEN `training_intensity = 25` (límite T_low), `staff_morale = 60`, sin ruido, WHEN se evalúa C4, THEN delta sobre `team_fitness` es `0.0` (cero de la parábola en T_low).

GIVEN `training_intensity = 80` (sobre T_high=75), sin ruido, WHEN se evalúa C4, THEN delta es **negativo** ≈ `-2.82` (sobreentrenamiento).

GIVEN `training_intensity = 10` (bajo T_low=25), `staff_morale = 60`, sin ruido, WHEN se evalúa C4, THEN delta es **negativo** = `-9.984` (infraentrenamiento): K_C4_eff = 8.0 × 0.8 = 6.4; delta = 6.4 × (10−25) × (75−10) / 625 = 6.4 × (−975/625) = **−9.984**. **Verificación**: extremo alto Y extremo bajo producen delta negativo; solo el sweet spot (40–60) produce delta positivo.

**AC-CTI-C6 — Histéresis asimétrica**

GIVEN `match_performance_index = 70` (victoria), WHEN se evalúa C6, THEN delta sobre `fan_momentum` ≈ `+2.71`.

GIVEN `match_performance_index = 30` (derrota, misma distancia de 50 que la victoria anterior), WHEN se evalúa C6, THEN delta sobre `fan_momentum` ≈ `-9.28`: P_loss=0.4, delta = −8.0 × (1+0.16) = **−9.28**. **Verificación cruzada obligatoria**: `|−9.28| >> |+2.71|` — la derrota cuesta ≈3.4× más que lo que gana la victoria equivalente (asimetría estructural por diferencia de forma de las funciones, no de K).

**AC-CTI-C8 — Fan momentum modula sensibilidad al precio**

GIVEN `fan_momentum = 80`, `ticket_price_index = 70`, `fan_attendance = 55`, WHEN se evalúa C8, THEN `price_penalty ≈ 6.67`, `attendance_target = (80/100×60+5) - 6.67 = 46.33`, delta = 46.33 − 55 = **−8.67** (impacto moderado por alto momentum).

GIVEN `fan_momentum = 20`, `ticket_price_index = 70`, `fan_attendance = 55` (mismo precio, momentum bajo), WHEN se evalúa C8, THEN `price_penalty ≈ 16.67` → delta mucho más negativo. **Verificación obligatoria**: el delta con F_m=20 es MAYOR (peor) que con F_m=80 para el mismo precio.

**AC-CTI-C12 — Sobreentrenamiento desesperado (agencia del jugador)**

GIVEN `consecutive_losses = 5`, `training_intensity = 80` (sobre T_desperation_threshold=50), WHEN se evalúa C12, THEN: intensity_mod = (80−50)/50 = 0.60; delta = −10.0 × (5^1.5)/(10^1.5) × 0.60 = −3.536 × 0.60 = **−2.12** sobre `team_fitness`.

GIVEN `consecutive_losses = 5`, `training_intensity = 40` (bajo T_desperation_threshold=50), WHEN se evalúa C12, THEN intensity_mod = max(0, 40−50)/50 = 0 → delta = **0.0**. **Verificación de agencia**: bajar la intensidad evita completamente el sobreentrenamiento desesperado.

GIVEN `consecutive_losses = 1`, `training_intensity = 80`, WHEN se evalúa C12, THEN delta ≈ **−0.19** (intensity_mod=0.60, (1^1.5)/(10^1.5) = 0.0316). **Nota para QA**: este es el comportamiento correcto — el daño crece con la racha Y con la intensidad mantenida.

**AC-CTI-C15 — Precios sostenidos erosionan fan_momentum con delay**

GIVEN `ticket_price_index = 80` durante semanas W=1 y W=2, WHEN se evalúa el tick W=3, THEN el efecto del tick W=1 (delta=-1.8) aplica sobre `fan_momentum`, aunque las victorias intermedias hayan generado deltas positivos.

GIVEN el mismo escenario pero precio baja a 40 en W=2, WHEN se evalúan los ticks, THEN el efecto encolado en W=1 (applyAt=3) SIGUE aplicándose en W=3 — los efectos diferidos ya encolados no se cancelan retroactivamente.

**AC-CTI-C1b-ascendente — Transición campo mejorando desde pésimo a mediocre**

GIVEN `field_quality = 15` (bajo T_safe_low=20) en tick W=N (prevState para tick W=N+1), WHEN C1b evalúa en W=N+1 con `prevState.field_quality = 25` (campo mejoró a zona mediocre), THEN delta de C1b sobre `injury_risk` es **positivo**: (45−25) × 0.25 = +5.0. **Verificación**: el tick anterior (con FQ=15) producía delta = −3.0 (campo pésimo = seguro); ahora con FQ=25 el campo mediocre es MÁS peligroso que cuando estaba pésimo.

**AC-C10-interaction — Multiplicador de staff_morale sobre C4**

GIVEN `training_intensity = 50` (sweet spot), sin ruido, WHEN se evalúa C4 con `staff_morale = 0` (leído de prevState), THEN K_C4_eff = 8.0 × (0.5 + 0×0.5) = 4.0; delta = 4.0 × 1.0 = **+4.0**.
GIVEN los mismos inputs con `staff_morale = 100` (leído de prevState), THEN K_C4_eff = 8.0 × 1.0 = 8.0; delta = **+8.0**. **Verificación**: el multiplicador se lee de `ctx.prevState.staff_morale`, NO del `staff_morale` ya modificado en el nextState del mismo tick.

**AC-CTI-C18 — Escándalo de corrupción**

GIVEN `corruption_exposure = 75` y PlayerDecision que añade +10, WHEN se evalúa el tick, THEN: C18a evalúa con prevState.CE=75 < 80 → decay = −0.05×75 = −3.75 → 71.25; PlayerDecision +10 → 81.25; nextState.CE=81.25 > 80 → crossing BLOCKING para `corruption_exposure`, Y la PlayerDecision del evento de escándalo aplica `delta_fan_momentum = -30`.

---

### Categoría 9: Equilibrio del sistema

**AC-EQL-01**
GIVEN WorldState con todos los nodos en sus valores `default`, `ctx.hasMatchThisWeek = false` (sin partidos en ninguno de los 52 ticks), sin decisions del jugador, WHEN se evalúan 52 ticks con seed `"test:equilibrium:1"` y `rng()` que devuelve exactamente 0.5 en todos los calls (noise term = 0), THEN ningún nodo alcanza 0 ni 100 durante los 52 ticks. (Con guards activas en C11/C14/C16b, `match_performance_index` permanece en 50 → C6 produce delta=0. `fan_momentum` estable en 60. `scouting_points` converge a ~56. Precondición clave: sin partidos.)

**AC-EQL-02**
GIVEN `team_fitness = 90` (sobre el equilibrio de C0 en 70), con el WorldState configurado para aislar C0: `training_intensity = 25` (C4 = 0 en T_low), `player_happiness = 50` (C16a = 0), `squad_available_pct = 75` (C13 = 0), `catering_budget = 50` (C5a = 0), `field_quality = 50` (C3 = 0), `consecutive_losses = 0` (C12 = 0), `ctx.hasMatchThisWeek = false`, sin decisions del jugador, WHEN se evalúan 20 ticks, THEN `team_fitness` converge hacia 70: en el tick 20 su valor está entre 68 y 72.

**AC-EQL-03**
GIVEN `team_fitness = 50` (bajo el equilibrio), con los mismos valores de aislamiento que AC-EQL-02 (training_intensity=25, player_happiness=50, squad_available_pct=75, catering_budget=50, field_quality=50, consecutive_losses=0, hasMatchThisWeek=false), sin decisions del jugador, WHEN se evalúan 20 ticks, THEN `team_fitness` sube hacia 70: en el tick 20 su valor está entre 68 y 72 (C0 genera delta positivo cuando TF < 70).

**AC-EQL-04**
GIVEN `scouting_budget = 30` constante durante 50 ticks, WHEN se evalúan 50 ticks, THEN `scouting_points` converge a un valor entre 54 y 59 (equilibrio teórico ≈ 56.25).

---

### Categoría 10: Performance

**AC-PERF-01**
GIVEN el `CASCADA_FC_GRAPH` completo (20 nodos, ~40 edges, incluyendo evaluación de ThresholdCrossings y gestión del DelayedEffectsBuffer), WHEN se mide el tiempo de 100 llamadas a `evaluateTick()` con `performance.now()`, THEN el **promedio** de las 100 llamadas es inferior a **5ms** en Node.js dev.

**AC-PERF-02**
GIVEN el grafo completo, WHEN se simulan 1000 ticks consecutivos en un mismo test (sin I/O — estado en memoria), THEN el tiempo total medido con `performance.now()` es inferior a **2 segundos** en Node.js dev.

---

### Categoría 11: Serialización/Deserialización (ADR-005)

Archivo: `tests/unit/db/sim-persistence.test.ts`

**AC-SER-01**
GIVEN un WorldState con los 20 nodos incluyendo valores con decimales (`fan_momentum = 58.123456789`), WHEN se llama a `serializeWorldState()` y luego `deserializeWorldState()`, THEN el valor de `fan_momentum` es idéntico con precisión de 6 decimales significativos.

**AC-SER-02**
GIVEN un WorldState serializado vía `serializeWorldState()`, WHEN se llama a `deserializeWorldState()` con esa serialización, THEN el resultado es un **objeto plano** `Record<NodeId, number>` con las mismas keys + valores que el original. ⚠ NO usar `Map<NodeId, number>` — `Map` no es JSON-serializable (`JSON.stringify(new Map())` produce `{}`), y control-manifest 2026-05-19 (cross-cutting rule) lo prohíbe explícitamente. Slice valida este patrón. *Fix post-sprint-planning 2026-05-19: alineado AC con manifest + slice; versión anterior decía `result instanceof Map === true` que rompía el round-trip JSON.*

**AC-SER-03**
GIVEN un objeto JSON corrupto (un nodo con valor `null`), WHEN se llama a `WorldStateJsonSchema.parse()` (Zod), THEN Zod lanza un error de validación — no silencia la corrupción.

**AC-SER-04**
GIVEN un `DelayedEffectsBuffer` con 3 efectos (incluyendo deltas negativos), WHEN se serializa y luego parsea con `DelayedEffectsJsonSchema`, THEN el array parseado tiene exactamente 3 objetos con los mismos `applyAt`, `toNode` y `delta`.

**AC-SER-05**
GIVEN un WorldState completo después de `evaluateTick()`, WHEN se llama a `saveTickResult()` y luego `loadCurrentWorldState()` contra PostgreSQL real (puerto 5433), THEN el WorldState cargado es idéntico al guardado (test de integración — marcado con `@integration`).

---

### Categoría 12: Admin/Debug Interface

Archivo: `tests/integration/admin/cascade-run.test.ts`

**AC-ADM-01**
GIVEN `POST /admin/cascade-run { worldState: {...20 nodos...}, weeks: 1, seed: "debug:1" }`, WHEN se llama en entorno dev, THEN respuesta `200 OK` con `TickResult[]` de longitud 1 que incluye `nextState`, `newDelayedEffects`, `log` y `thresholdCrossings`.

**AC-ADM-02**
GIVEN `weeks: 10` con seed fija, WHEN la petición es exitosa, THEN respuesta contiene exactamente 10 `TickResult`; el `nextState` del tick N es el prevState del tick N+1.

**AC-ADM-03**
GIVEN dos peticiones idénticas con el mismo `worldState`, `weeks` y `seed`, WHEN se ejecutan, THEN ambas respuestas son idénticas (endpoint determinista).

**AC-ADM-04**
GIVEN un WorldState con un nodo inválido o faltante, WHEN se llama al endpoint, THEN respuesta `400 Bad Request` con error descriptivo.

**AC-ADM-05**
GIVEN `NODE_ENV=production`, WHEN se llama al endpoint `/admin/cascade-run`, THEN respuesta `403 Forbidden` o `404 Not Found` — no expuesto en producción.

---

### Categoría 13: Ruta de recuperación desde escándalo de corrupción (C18)

**AC-C18-01**
GIVEN `corruption_exposure = 78` (< 80, la guard de C18a NO se activa) y PlayerDecision que añade +8, WHEN se evalúa el tick, THEN: C18a decay aplica en Paso 2 (prevState.CE=78 < 80) → 78×0.95 = 74.1; PlayerDecision +8 en Paso 3 → 82.1; en Paso 5: prevState=78 < 80 y nextState=82.1 > 80 → crossing `{nodeId:"corruption_exposure", priority:"BLOCKING", direction:"above"}`. (Nota: para PlayerDecision ≤ +5, el decay absorbe suficiente que nextState < 80 y NO se detecta crossing — diseño intencional documentado en la guard de C18a.)

**AC-C18-02a**
GIVEN `corruption_exposure = 85` (prevState.CE ≥ 80, guard de C18a activa), sin PlayerDecisions, WHEN se evalúan 3 ticks, THEN: tick1 CE=85 → guard activa → no decay → CE=85; tick2 ídem → CE=85; tick3 ídem → CE=85. `TickResult.thresholdCrossings` vacío en los 3 ticks (CE ya está sobre BLOCKING, no hay nueva transición).

**AC-C18-02b**
GIVEN `corruption_exposure = 85` (guard activa), Y PlayerDecision de −10 en tick 1 (ej: director deportivo reduce exposición activamente), WHEN se evalúa tick 1, THEN: guard activa → no decay (prevState.CE=85≥80); PD −10 en Paso 3 → nextState.CE=75 < 80. En tick 2: guard NO activa (prevState.CE=75<80) → decay = −0.05×75 = −3.75 → CE=71.25. `TickResult.thresholdCrossings` del tick 1 contiene crossing `{nodeId:"corruption_exposure", priority:"BLOCKING", direction:"below"}` (CE baja de 85 a 75, cruzando el umbral 80 hacia abajo).

**AC-C18-03**
GIVEN `fan_momentum = 60` en el momento del escándalo con `SCANDAL_FAN_IMPACT=30`, WHEN la PlayerDecision del evento aplica `delta_fan_momentum = -30`, THEN `nextState.fan_momentum = 30`.

GIVEN `fan_momentum = 25` (cerca del BLOCKING en 20) en el momento del escándalo, WHEN el escándalo aplica -30, THEN `nextState.fan_momentum = 0` (clamped), Y `TickResult.thresholdCrossings` contiene un crossing BLOCKING adicional para `fan_momentum`.

**AC-C18-04**
GIVEN `corruption_exposure = 60` y una PlayerDecision de reducción activa de -10 (via director deportivo tier 3), WHEN se evalúa el tick, THEN `nextState.corruption_exposure = 47` (Step 2 aplica C18a decay = −0.05 × 60 = −3 primero; Step 3 aplica la PlayerDecision −10; resultado: 60 + (−3) + (−10) = **47**). El motor aplica el delta de PD sin conocer su origen — la composición aditiva con el decay es automática. *Fix post-sprint-planning 2026-05-19: la versión anterior decía `nextState=50` que asumía decay=0; era inconsistente con la nota de la línea 523 "el decay del Paso 2 aplica primero cuando CE < 80" (factor 0.95×X). Slice + manifest implementan la versión corregida.*

---

### Nota de implementación para QA

Para ACs con fórmulas que incluyen ruido aleatorio (C4, C6, C14), construir la seed de forma que `ctx.rng()` devuelva exactamente `0.5` en el primer call — esto cancela el noise term `(rng - 0.5) * AMP = 0` y permite verificar los valores exactos. Usar el `CascadeLog[]` del `TickResult` para verificar deltas individuales por edge antes del clamping acumulado.

## Open Questions

1. **OQ-CASCADE-01**: ¿El patrón `ctx.prevState` (necesario para C8 y C10) requiere un ADR propio o basta con documentarlo en el control manifest como extensión de `SimContext`? — Resolver antes de implementar el epic de cascade-engine.

2. **OQ-CASCADE-02** ~~RESUELTO~~ (R2, 2026-05-18): C10 como multiplicador de K_C4 es una **excepción documentada** al principio aditivo de ADR-003. El control manifest debe registrar explícitamente: "C10 no es un delta aditivo sino un modificador del coeficiente de C4 — el implementador debe leer `ctx.prevState.staff_morale` para calcular K_C4_eff antes de evaluar C4." No se requiere nodo intermedio. La opción (a) está aceptada.

3. **OQ-CASCADE-03**: ¿El Admin/Debug Interface necesita autenticación propia (token de admin) o basta con el guard de `NODE_ENV !== 'production'`? — Resolver con security engineer antes del epic.

4. **OQ-CASCADE-04**: ¿Cuántas cadenas adicionales (C19+) están previstas para v1.1+ y dónde se documentarán? La arquitectura las soporta sin tocar el motor; el template library de ADR-009 necesitará actualizarse. — Registrar en scope-creep-log.md si se propone añadir en MVP.

5. **OQ-CASCADE-05** ~~RESUELTO~~ (R2, 2026-05-18): El decay de C18a **NO aplica** en el tick donde `prevState.corruption_exposure ≥ 80`. Implementación: edge C18a tiene `guardFn: (prevState) => prevState.corruption_exposure < 80`. Ver sección de C18a en Formulas. Este comportamiento está cubierto en AC-C18-01 y AC-C18-02.
