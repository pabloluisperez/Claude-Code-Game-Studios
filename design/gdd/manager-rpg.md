# Manager RPG

> **Status**: In Review (R1 — 2026-05-18 — 11 blockers resolved in session)
> **Creative Director Review (CD-GDD-ALIGN)**: Skipped — Lean mode. Review manually before production.
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-17
> **Implements Pillar**: P3 (You Grow Like Your Club) · P1 (Tinkering Beats Optimization) · P4 (Calm Is The Tempo)
> **ADR References**: ADR-010 (Manager-RPG Progression Model) · ADR-009 (Staff Message Routing) · ADR-008 (World Clock + Event Loop) · ADR-005 (Persistence)

## Overview

El sistema Manager-RPG es la segunda espina dorsal de progresión de Cascada FC ("Tú creces junto a tu club" — Pilar 3). El manager es un personaje con cinco habilidades específicas — `tactical_insight`, `man_management`, `financial_acumen`, `scouting_network` y `reputation` — que avanzan de nivel 1 a 5 mediante XP ganada automáticamente por resultados del juego: victorias de partido, meses financieros positivos, fichajes completados, reuniones del board superadas, ascensos de temporada. No hay grind manual ni menú de "invertir puntos" — el manager mejora mientras el jugador gestiona su club (Pilar 4). La mecánica central del sistema es la resolución arquitectónica de la tensión Pilar 1 ↔ Pilar 3: el nivel de `reputation` determina la calidad máxima de staff contratables (`getMaxHirableStaffQuality()`), y los staff de mayor calidad perciben las cascadas del WorldState con mayor precisión (ADR-009 `qualityTier`), entregando mensajes más específicos y tempranos al jugador. El grafo de cascadas nunca se expone directamente — solo se hace más visible a través del staff experto que el manager merecidamente puede contratar. La arquitectura de persistencia, el ciclo de XP y el esquema de datos están definidos en ADR-010; este GDD especifica los valores de diseño: qué efecto concreto produce cada habilidad en cada nivel, la tabla completa de fuentes de XP con amounts calibrados, la curva de progresión, y los eventos de carrera que marcan los hitos del manager como personaje.

## Player Fantasy

El jugador de Cascada FC experimenta el Manager-RPG en dos registros simultáneos.

El primero es **directo y silencioso**: la notificación `"Reputación: nivel 2"` llega en el mismo advance que el tercer board meeting superado. No hay fanfare — es una línea más en el feed de eventos, como los resultados del partido. Pero cambia el mercado: donde antes solo aparecían ayudantes novatos con CV de texto genérico, ahora hay un preparador físico con experiencia en clubes medianos que "nota patrones que los demás no ven". El jugador conecta las piezas: *contratar a este tipo, a este nivel de reputación, es lo que desbloquea este tipo de feedback.* No se lo dice el juego — lo infiere.

El segundo registro es **indirecto y más poderoso**: tres semanas después de contratar al preparador físico experto, ese mismo preparador envía un mensaje que el anterior nunca habría enviado — "llevas cuatro semanas con training en 78, el equipo está perdiendo físico sin que los números lo muestren todavía". El jugador no sabe que ese mensaje existe porque subió de nivel. Solo sabe que ahora su staff ve más. La cadena invisible que conectó "aprobar board meetings" → "reputación nivel 2" → "staff experto disponible" → "más señales del grafo" nunca se expone — y eso es exactamente la fantasía de Pilar 1: el descubrimiento es tuyo, no de la UI.

La fantasía emocional del Manager-RPG es la de **convertirte en alguien que merece la información que recibe**. No desbloqueas un tooltip — desbloqueas una relación de confianza con profesionales mejores que antes no te habrían dado su tiempo. Y con esa confianza llegada, el alcalde del siguiente pueblo también sabe tu nombre.

## Detailed Design

### Core Rules

1. El manager tiene **5 skills** (`tactical_insight`, `man_management`, `financial_acumen`, `scouting_network`, `reputation`), cada una con nivel [1–5] y XP [0, xpToNextLevel). La arquitectura de persistencia y XP está definida en ADR-010 — este GDD especifica los valores de diseño.

2. **Los bonuses de habilidad son silenciosos** (Pilar 1): se aplican automáticamente cada semana como PlayerDecisions implícitas en el Paso 3 del cascade tick, sin notificación en el feed. El jugador no ve "man_management lv2: +2 player_happiness aplicado" — solo nota que el vestuario parece más estable. La conexión skill → efecto es un descubrimiento, no un tooltip.

3. **La única notificación es el level-up**: cuando una skill sube de nivel, aparece una entrada `NOTIFY` en el feed semanal — una línea, sin fanfare (Pilar 4). El perfil del manager (accesible desde el HUD) muestra los bonuses activos para el jugador que quiere confirmar lo que sospecha.

4. **XP automática por resultados** (tabla completa en Sección D): el jugador nunca elige dónde invertir XP ni puede grindear fuera del juego normal. Cada acción del juego contribuye a las skills relevantes.

5. **Sin regresión de nivel**: los niveles no bajan nunca. XP más allá del nivel 5 se descarta silenciosamente (ADR-010 Risk R4).

6. **Career events en hitos de reputation**: eventos NOTIFY especiales en umbrales de `reputation.level` (ver §Career Events). En MVP, rechazar una oferta de otro club genera un loyalty XP bonus — aceptarla no es una opción implementada (feature v1.1+).

---

### Skill Catalog — Efectos por Nivel

Todos los bonuses se aplican como PlayerDecisions implícitas en Paso 3 del cascade tick. No modifican el motor del cascade ni el algoritmo de match-simulation internamente.

**`tactical_insight` — Preparación Táctica**
Bonus semanal a `match_performance_index` en semanas con partido (write directo al WorldState en Paso 3):

| Nivel | Bonus mpi | Equivalencia aproximada |
|-------|-----------|------------------------|
| 1 | +0 | Baseline |
| 2 | +1 | Ligera ventaja táctica |
| 3 | +2 | Preparación de set pieces y presión rival |
| 4 | +3 | Análisis táctico de vídeo pre-partido |
| 5 | +5 | Maestría táctica reconocida — ventaja en partidos igualados |

Nota: mpi_delta de match-sim va de −30 a +30. Un bonus de +5 puede convertir un empate en victoria en partidos muy igualados — significativo pero no determinante.

---

**`man_management` — Gestión del Vestuario**
Bonus semanal a `player_happiness` (write directo al WorldState en Paso 3):

| Nivel | Bonus player_happiness/sem |
|-------|--------------------------|
| 1 | +0 |
| 2 | +1 |
| 3 | +2 |
| 4 | +3 |
| 5 | +4 |

Referencia: C12 (consecutive_losses → team_fitness) puede drenar hasta −10 de team_fitness por semana en rachas malas. Man_management no compensa C12 directamente, pero sí protege player_happiness (que alimenta C16a/C16b), amortiguando el espiral negativo cuando los resultados flaquean.

---

**`financial_acumen` — Negociación de Patrocinadores**
Multiplicador sobre el ingreso semanal de contratos de patrocinio activos (se recalcula cada semana con el nivel actual de financial_acumen):

| Nivel | Multiplicador LEVEL_MODIFIER |
|-------|------------------------------|
| 1 | ×1.00 (sin cambio) |
| 2 | ×1.03 |
| 3 | ×1.06 |
| 4 | ×1.09 |
| 5 | ×1.12 |

Ejemplo: Tier-2 jersey en D3 inicio, nivel 5 financial_acumen: 1.8 × 1.3 × 0.97 × 1.12 ≈ **2.54 €K/sem** (vs 2.27 €K sin bonus — +12% de mejora acumulada en la duración del contrato de 38 semanas ≈ +10.3 €K/temporada).

---

**`scouting_network` — Red de Scouting**
Multiplicador sobre la constante `K_scouting` en la fórmula C9a del cascade engine:

| Nivel | Multiplicador K_scouting | Equilibrio scouting_points (budget=30) |
|-------|--------------------------|---------------------------------------|
| 1 | ×1.00 (K=15.0) | ~56 |
| 2 | ×1.10 (K=16.5) | ~61 |
| 3 | ×1.20 (K=18.0) | ~67 |
| 4 | ×1.28 (K=19.2) | ~72 |
| 5 | ×1.40 (K=21.0) | ~78 |

Referencia: T_scouting_active = 50 (umbral de C9b). Con scouting_level 1 y budget=30, el equilibrio es ~56. Con level 5, mismo budget da equilibrio ~78 — C9b activo con mayor delta hacia squad_available_pct.

**v1.1 cross-ref (2026-05-24)**: `scouting_network` ahora también determina el **pool size visible** en el transfer market — ver `scouting-market.md §F5`. Niveles 1-5 producen pool de 48 a 80 AI players visibles (additivo sobre todos los free agents que están siempre visibles). Este efecto es **ortogonal** al multiplicador K_scouting actual (no double-dip). El skill mantiene su definición original; scouting-market.md sólo lo consume como input.

---

**`reputation` — Reputación del Manager** (definido en ADR-010)
Gates `getMaxHirableStaffQuality()` y desbloquea career events:

| Nivel | Staff máx. contratables | Unlock adicional | Career event |
|-------|------------------------|-----------------|--------------|
| 1 | Tier 1 (novato) | — | — |
| 2 | Tier 1 (novato) | — | — |
| 3 | Tier 2 (experimentado) | — | CE-1: "Contacto de club rival" |
| 4 | **Tier 3 (experto)** | — | CE-2: "Reconocimiento de prensa nacional" |
| 5 | Tier 3 (experto) | **Director de Comunicación** (7º slot exclusivo — genera `career_milestone:press_interview` events; resuelve OQ-RPG-03) | CE-3: "Oferta soñada" |

*(Fuente de verdad para `getMaxHirableStaffQuality()`: ADR-010. Level 1-2 → 1; Level 3 → 2; Level 4-5 → 3.)*

---

### Career Events

Career events se entregan como `NOTIFY` CalendarEvents con opciones de respuesta vía event-system.md.

**CE-1: Contacto de club rival** (reputation.level ≥ 3, trigger único)
- Un club D2 ofrece al manager un contrato
- Opciones: **(A) Rechazar activamente** → +10 XP a `reputation` (loyalty bonus) · **(B) Dejar expirar en 4 semanas** → `fan_momentum -3` (el club interpreta el silencio como indiferencia) · MVP: no hay "Aceptar"
- Efecto en fan_momentum: opción A = ninguno (el rechazo es privado); opción B = -3 (consecuencia pública de la indiferencia)

**CE-2: Reconocimiento de prensa nacional** (reputation.level ≥ 4, trigger único)
- La prensa nacional menciona al manager; el alcalde envía una carta
- Efecto mecánico: `fan_momentum +8` esa semana (la ciudad se enorgullece)
- No requiere respuesta — NOTIFY puro

**CE-3: Oferta soñada** (reputation.level ≥ 5, trigger único)
- Un club D1 o extranjero contacta al manager
- Opciones: **(A) Rechazar activamente** → `fan_momentum +15` + +20 XP a `reputation` (lealtad legendaria) · **(B) Dejar expirar en 4 semanas** → `fan_momentum -5` (la ciudad sintió que su manager pasó de la oportunidad en silencio) · MVP: "Aceptar" = feature v1.1+

---

### States and Transitions

El manager-rpg no tiene FSM propio. El "estado" del manager es el snapshot de los 5 niveles y XP en `manager_profiles`. Las transiciones son unidireccionales:

```
Nivel 1 ──[XP ≥ 100]──► Nivel 2 ──[XP ≥ 200]──► Nivel 3 ──[XP ≥ 400]──► Nivel 4 ──[XP ≥ 800]──► Nivel 5 (cap)
                                                       ↑
                                         reputation trigger CE-1 + staff tier-2 unlock
```

*(La curva XP 100/200/400/800 es la placeholder de ADR-010. La Sección D calibra los amounts definitivos.)*

---

### Interactions with Other Systems

| Sistema | Dirección | Dato | Cómo |
|---------|-----------|------|------|
| `cascade-engine.md` | → escribe (Paso 3) | `match_performance_index` (+0 a +5) | `tactical_insight` implicit PlayerDecision, solo en semanas de partido |
| `cascade-engine.md` | → escribe (Paso 3) | `player_happiness` (+0 a +4/sem) | `man_management` implicit PlayerDecision, cada semana |
| `cascade-engine.md` | → modifica constante | `K_scouting` en C9a | `scouting_network` multiplier vía SimContext extendido con managerProfile |
| `economy.md` | → modifica en signing | `LEVEL_MODIFIER` de F3 | `financial_acumen` multiplier en momento de firma de patrocinador |
| `staff-system.md` | → gate de contratación | `getMaxHirableStaffQuality(reputation.level)` | Pure function, llamada al abrir mercado de staff |
| `staff-system.md` | → unlock de rol exclusivo | `canHireDirectorDeComunicacion(reputation.level)` → true si level ≥ 5 | Desbloquea el 7º slot con el rol exclusivo Director de Comunicación (reputation level 5) |
| `event-system.md` | → genera | Career events CE-1/CE-2/CE-3 | CalendarEvents NOTIFY en hitos de reputation.level |
| `cascade-engine.md` | ← lee | `fan_momentum`, `consecutive_wins`, `squad_available_pct` | Contexto para career events y ManagerNarrativeContext (ADR-004, deferred) |
| `hud-ui.md` | ← lee | `ManagerProfile` snapshot | Página del manager: niveles, XP bars, bonuses activos |

## Formulas

### F1: Curva XP por skill y nivel

Cada skill tiene su propia curva (evento frecuente → curva más empinada; evento escaso → curva más suave):

`calculateXpToNextLevel(skill, level): level >= 5 ? Infinity : BASE_skill × 2^(level-1)`

| Skill | BASE | Coste L1→2 | L2→3 | L3→4 | L4→5 | Total a L5 |
|-------|------|-----------|------|------|------|-----------|
| `tactical_insight` | 100 | 100 | 200 | 400 | 800 | 1500 |
| `man_management` | 80 | 80 | 160 | 320 | 640 | 1200 |
| `financial_acumen` | 75 | 75 | 150 | 300 | 600 | 1125 |
| `scouting_network` | 50 | 50 | 100 | 200 | 400 | 750 |
| `reputation` | 60 | 60 | 120 | 240 | 480 | 900 |

**Output:** nivel [1–5], XP residual en el siguiente nivel.
**Nota de implementación:** En nivel 5, `xpToNextLevel = Infinity`. UI debe renderizar badge "DOMINADA" en lugar de barra de progreso (ADR-010 Risk R4). Nunca dividir `xp / xpToNextLevel` sin comprobar `level === 5`.

---

### F2: Tabla XP_SOURCES completa

| Evento | Skill | XP | Trigger |
|--------|-------|-----|---------|
| `match_win` | tactical_insight | 10 | Partido ganado |
| `match_draw` | tactical_insight | 5 | Empate |
| `match_loss` | tactical_insight | 5 | Derrota (análisis post-derrota obligatorio — el manager aprende más de las pérdidas) |
| `end_of_month:positive_finances` | financial_acumen | 15 | Mes con balance positivo |
| `end_of_month:negative_finances` | financial_acumen | 5 | Mes con balance negativo pero sobrevivido |
| `sponsor_deal:signed` | financial_acumen | 20 | Firma de contrato de patrocinio (cualquier tier) |
| `transfer_window_close:signed` | scouting_network | 25 | Jugador firmado en ventana de traspasos |
| `transfer_window_close:free_agent_signed` | scouting_network | 10 | Agente libre fichado |
| `player_scouted:report_completed` | scouting_network | 5 | Informe de scouting completado (~4-6/temporada) |
| `player:morale_intervention` | man_management | 15 | Manager habla con un jugador descontento (acción manual) |
| `player:contract_renewed` | man_management | 20 | Contrato de jugador renovado |
| `squad_morale:high_streak` | man_management | 25 | `player_happiness > 70` durante 4+ semanas consecutivas |
| `player:loan_managed` | man_management | 10 | Cesión entrante o saliente gestionada |
| `end_of_week:player_happiness_stable` | man_management | 3 | `player_happiness ≥ 60` esa semana — vestuario estable bajo la gestión del manager |
| `board_meeting:passed` | reputation | 20 | Board meeting de crisis superado |
| `season_end:promoted` | reputation | 50 | Ascenso de división al final de temporada |
| `season_end:won_league` | reputation | 80 | Ganar la liga (no solo ascender) |
| `season_end:survived_relegation` | reputation | 15 | Temporada completada sin descenso |
| `season_end:top_half` | reputation | 25 | Finalizar en primera mitad de la tabla |
| `career_milestone:press_interview` | reputation | 10 | Entrevista de prensa narrativa (~1-2/temporada a partir de reputation L2) |
| `rival_club:offer_received` | reputation | 30 | Oferta de otro club recibida (evento CE-1 o CE-3) |

**XP expected por temporada (jugador ~50% victorias, sin ascenso en T1):**

| Skill | XP/T1 | L2 reach | L3 reach |
|-------|--------|----------|----------|
| tactical_insight | ~285 (match_loss=5: 9×5=+45 vs antes) | Semana 7 T1 | Semana 27 T1 |
| financial_acumen | ~170 (weekly sobre contratos activos, mismo XP/T1) | T1 temprana | Final T1 |
| scouting_network | ~110 | T1 media | T1 final / T2 inicio |
| man_management | ~125 (nuevas fuentes: ~75 de end_of_week estable + ~50 de otras) | Semana 20 T1 | T2 temprana |
| reputation | ~70 | Final T1 | **T2 media** (career event CE-1 + tier-3 staff en L4) |

---

### F3: Bonus de `tactical_insight` sobre match_performance_index

`mpi_bonus(level) = [0, 1, 2, 3, 5][level - 1]`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Nivel de tactical_insight | level | int | [1–5] | Nivel actual de la habilidad |

**Output Range:** 0 a +5
**Ejemplo (level 4):** +3 al mpi del tick de partido, aplicado como implicit PlayerDecision en Paso 3

---

### F4: Bonus de `man_management` sobre player_happiness

`happiness_bonus(level) = [0, 1, 2, 3, 4][level - 1]`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Nivel de man_management | level | int | [1–5] | Nivel actual de la habilidad |

**Output Range:** 0 a +4/sem
**Ejemplo (level 3):** +2 a player_happiness cada tick semanal (incluso semanas sin partido)

---

### F5: Multiplicador de `financial_acumen` sobre LEVEL_MODIFIER

`fa_multiplier(level) = [1.00, 1.03, 1.06, 1.09, 1.12][level - 1]`

`effective_LEVEL_MODIFIER = LEVEL_MODIFIER_base × fa_multiplier(financial_acumen.level)`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| LEVEL_MODIFIER base | LM | float | [0.8–1.2] | Calculado por economy.md F3 (division_factor + position_factor) |
| Multiplicador FA | fa_mult | float | [1.00–1.12] | Función del nivel de financial_acumen |

**Output Range:** LEVEL_MODIFIER × 1.00 a × 1.12
**Ejemplo (level 5):** Tier-2 jersey en D3 inicio → LEVEL_MODIFIER×1.12 → 2.27 → **2.54 €K/sem** (+12%)
**Cuándo aplica:** En el momento de la **firma del contrato** de patrocinio. El `fa_multiplier` del nivel actual del manager en el momento de la firma se calcula junto con `LEVEL_MODIFIER` y se almacena como parte del ingreso semanal fijo del contrato. Si el manager sube de nivel después de firmar, los contratos activos mantienen el multiplicador del momento de su firma — el nuevo nivel solo aplica a contratos firmados después del cambio. Incentivo de diseño: subir `financial_acumen` antes de negociar un gran patrocinador tiene valor real.

---

### F6: Multiplicador de `scouting_network` sobre K_scouting (C9a cascade)

`sn_multiplier(level) = [1.00, 1.10, 1.20, 1.28, 1.40][level - 1]`

`effective_K_scouting = K_scouting_base × sn_multiplier(scouting_network.level)`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| K_scouting base | K | float | 15.0 | Constante de C9a en cascade-engine.md |
| Multiplicador SN | sn_mult | float | [1.00–1.40] | Función del nivel de scouting_network |

**Output Range:** K=15.0 a K=21.0
**Ejemplo (level 5, scouting_budget=30):** equilibrio scouting_points ≈ 78 (vs 56 en nivel 1)

---

### F7: Loyalty XP bonus y penalizaciones de expiración (career events)

**Al rechazar activamente (opción A):**
- CE-1 (reputation.level 3): +10 XP a `reputation` + ningún efecto en fan_momentum (rechazo privado)
- CE-3 (reputation.level 5): +20 XP a `reputation` + `fan_momentum +15` (lealtad legendaria)

**Al dejar expirar sin responder (opción B):**
- CE-1: `fan_momentum -3` (indiferencia interpretada como falta de orgullo por el club)
- CE-3: `fan_momentum -5` (la ciudad esperaba un rechazo público orgulloso; el silencio decepciona)
- CE-2: no aplica (NOTIFY puro, sin opciones de respuesta)

**Asimetría de diseño:** Rechazar siempre es mejor o igual que expirar. La elección no es "quedarme vs irme" — es "actuar vs no actuar". La inacción tiene coste real.

## Edge Cases

- **Si `tactical_insight` level 4 y la semana NO tiene partido**: el bonus mpi_bonus(4)=+3 NO se aplica. El bonus es exclusivo de semanas con partido. Sin partido → sin write a match_performance_index desde esta fuente.

- **Si `man_management` level 3 y `player_happiness = 100`**: el bonus de +2 se escribe a nextState, pero el clamping del cascade (Paso 4) lo mantiene en 100. No hay desbordamiento — el bonus simplemente no produce efecto real esa semana.

- **Si `financial_acumen` sube de nivel durante la temporada y hay un contrato de patrocinio activo**: el multiplicador NO se aplica retroactivamente. Los contratos activos mantienen el `fa_multiplier` calculado en el momento de su firma. Solo los contratos firmados **después** del cambio de nivel usarán el nuevo multiplicador. El jugador que firme un patrocinador importante antes de subir de nivel pierde el beneficio de ese nivel para ese contrato.

- **Si `scouting_network` sube de nivel durante una ventana de fichajes activa**: `effective_K_scouting` se recalcula en el siguiente tick semanal del cascade. Los `scouting_points` ya acumulados no se retroajustan — el efecto del nuevo multiplicador aplica desde la semana siguiente.

- **Si `squad_morale:high_streak` oscila**: player_happiness sube a 71 una semana, baja a 68 la siguiente → el streak contador se reinicia. Solo se dispara el evento (y el XP de man_management) cuando hay 4 semanas **consecutivas** por encima de 70 sin interrupción.

- **Si el jugador rechaza CE-1 y el loyalty XP (+10) lleva reputation a nivel 4 en el mismo tick**: el CalendarEvent `manager_level_up` para reputation se inserta en el mismo advance. CE-2 (reconocimiento de prensa) se disparará en el siguiente advance — cada career event tiene un check de "primera vez" que previene doble-trigger en el mismo tick.

- **Si múltiples skills suben de nivel en el mismo tick**: todos los CalendarEvents `manager_level_up` se insertan simultáneamente. El feed semanal puede mostrar 2-3 level-ups a la vez. No hay restricción de "un level-up por semana".

- **Si `reputation.level` llega a 5 saltándose niveles intermedios** (ej: `season_end:won_league` +80 en temporada 1): CE-1 y CE-2 se marcan como completados sin ejecutarse. Solo CE-3 se dispara. El jugador se saltó los milestones intermedios — diseño aceptable para el caso extremo de un campeón de liga en primera temporada.

- **Si XP de `rival_club:offer_received` (+30) y loyalty bonus (+10) ocurren en el mismo tick**: los dos XP grants se procesan en transacciones separadas (uno pre-decisión del jugador, otro post-decisión). No hay race condition.

- **Si `reputation` está en nivel 5 y el jugador recibe CE-3**: el loyalty XP de +20 queda capped (level 5, XP = Infinity). El `fan_momentum +15` del loyalty SÍ aplica igualmente — no depende del XP cap.

## Dependencies

### Dependencias upstream (manager-rpg depende de)

| Sistema | GDD | Tipo | Interfaz requerida |
|---------|-----|------|--------------------|
| Motor de Cascadas | `cascade-engine.md` | **Hard** | WorldState leído para contexto de career events (`fan_momentum`, `consecutive_wins`, `squad_available_pct`); escribe implicit PlayerDecisions a `match_performance_index` (F3) y `player_happiness` (F4) en Paso 3 |
| Simulación de Partido | `match-simulation.md` | **Hard** | Resultados del partido (`match_win`, `match_draw`, `match_loss`) → XP a `tactical_insight` (F2) |
| Economía del Club | `economy.md` | **Hard** | Eventos mensuales de finanzas → XP a `financial_acumen` (F2); F5 modifica F3 de economy.md en el momento de firma de patrocinador |
| ADR-010 | — | **Hard** | Define arquitectura completa: `manager_profiles` tabla, `applyXpGrants()`, `calculateXpToNextLevel()`, `getMaxHirableStaffQuality()`, Drizzle schema, integración con advance() |
| ADR-009 | — | **Soft** | `StaffPerceptionConfig.qualityTier` es gateado por `reputation.level` (vía ADR-010). El GDD de manager-rpg define el trigger; ADR-009 define el efecto en cascade visibility. |

### Dependencias downstream (otros sistemas dependen de este)

| Sistema | GDD | Qué necesitan | Contrato de datos |
|---------|-----|--------------|------------------|
| Sistema de Staff | `staff-system.md` | `getMaxHirableStaffQuality(reputation.level)` para filtrar el mercado de contratación | Pure function exportada — usable en servidor y cliente |
| Sistema de Eventos | `event-system.md` | Rutear career events (CE-1, CE-2, CE-3) como CalendarEvents NOTIFY con opciones de respuesta | Evento tipo `manager_career_event` con `metadata: { ceId, options[] }` |
| HUD y UI principal | `hud-ui.md` | `ManagerProfile` snapshot: nombre, levels, XP, fa_multiplier activo, career events pendientes | Expuesto via `AdvanceResult` post-advance |
| Sistema de Staff (ADR-009) | `staff-system.md` | `qualityTier` disponible en hire marketplace | Computed vía `getMaxHirableStaffQuality()` — no un campo persistido |

### Notas de bidireccionalidad

- `cascade-engine.md` no necesita actualización — los implicit PlayerDecisions de manager-rpg son equivalentes a decisiones del jugador desde la perspectiva del cascade engine.
- `match-simulation.md` no depende de manager-rpg — solo genera los events que dan XP. Sin actualización requerida.
- `economy.md` debe añadir una nota en su F3 al aprobarse este GDD: "el LEVEL_MODIFIER efectivo incluye el multiplicador de `financial_acumen` al momento de firma (ver manager-rpg.md F5)."

## Tuning Knobs

| Knob | Valor default | Rango seguro | Si sube demasiado | Si baja demasiado |
|------|--------------|--------------|-------------------|-------------------|
| `BASE_xp[tactical_insight]` | 100 | [70–140] | Progression demasiado lenta — el jugador no siente crecimiento entre partidos | L2 alcanzado en semana 5 — los niveles pierden significado |
| `BASE_xp[man_management]` | 80 | [50–110] | Squad management pasivo nunca recompensa — habilidad ignorada | L2 trivialmente rápido — sin tensión de mantener vestuario |
| `BASE_xp[financial_acumen]` | 75 | [50–100] | Requiere 2+ temporadas para ver mejora — patrocinadores pierden relevancia táctica | Multiplier de patrocinio disponible demasiado pronto |
| `BASE_xp[scouting_network]` | 50 | [30–70] | Jugadores activos en fichajes no perciben crecimiento | K_scouting mejorado disponible desde T1 media |
| `BASE_xp[reputation]` | 60 | [40–80] | Tier-2 staff no disponible hasta T4+ — narrativa de carrera colapsada | Career event CE-1 en semana 8 — demasiado temprano para sentir mérito |
| `XP[match_win]` | 10 | [7–15] | Tactical_insight domina sobre otros skills | Partidos sin impacto perceptible en el manager |
| `XP[sponsor_deal:signed]` | 20 | [12–28] | Financial_acumen sube demasiado rápido | Firmar sponsors no se siente recompensante |
| `XP[season_end:promoted]` | 50 | [30–70] | El ascenso otorga más XP que varias temporadas regulares | El logro más difícil no se siente transformador para el manager |
| `XP[squad_morale:high_streak]` | 25 | [15–35] | Man_management sube sin gestión activa del vestuario | Mantener happiness alta 4 semanas no recompensa significativamente |
| `mpi_bonus[tactical_insight_L5]` | +5 | [+3, +8] | En partidos igualados el bonus garantiza victoria — reduce skill | Bonus imperceptible — el manager no siente que su táctica mejora |
| `happiness_bonus[man_management_L5]` | +4/sem | [+2, +6] | C16a/C16b crean loop demasiado poderoso | Bonus no amortigua caída de happiness en rachas de derrotas |
| `fa_multiplier[financial_acumen_L5]` | ×1.12 | [×1.06, ×1.20] | Sponsors valen 20% más — economía desequilibrada | El 12% de mejora es imperceptible en el revenue semanal |
| `sn_multiplier[scouting_network_L5]` | ×1.40 | [×1.20, ×1.60] | C9b activo trivialmente con budget bajo | Sin diferencia práctica vs nivel 1 |
| `fan_momentum_bonus[CE-3 loyalty]` | +15 | [+8, +25] | Rechazar la oferta soñada puede parecer explotable como fuente de fan_momentum | La lealtad legendaria no produce reacción emocional de la afición |

**Knobs que interactúan entre sí:**
- `BASE_xp[reputation]` + todos los `XP[season_end:*]`: la velocidad de reputation.level 3 determina cuándo el jugador accede a staff tier-2. Ajustar el BASE sin recalibrar los XP de fin de temporada puede acelerar o bloquear el arc narrativo principal.
- `mpi_bonus[tactical_insight_L5]` + cascade `K_win_base=8.0` / `K_loss_base=14.0`: el bonus de +5 mpi puede transformar empates en victorias. Revisar conjuntamente si se ajusta K_win_base.
- `happiness_bonus[man_management_L5]` + cascade `K_happy_perf=7.0` (C16b): con bonus de +4/sem a player_happiness, el efecto compuesto en mpi a través de C16b es notable en temporadas largas. Calibrar juntos.

## Visual/Audio Requirements

El Manager-RPG es un sistema de progresión server-side — no tiene efectos visuales ni auditivos propios. Sus requisitos visuales son los de sus eventos de presentación:

- **Level-up notification**: icono + texto en el feed semanal. Una línea. Misma presentación visual que otros CalendarEvents NOTIFY — no requiere animación especial.
- **Career event panel**: los career events (CE-1/CE-2/CE-3) pueden requerir un modal o inline panel más elaborado que un NOTIFY estándar — definido en `event-system.md` y `hud-ui.md`.
- **Sin VFX**: el sistema de XP no produce partículas, flashes, ni animaciones de progreso. Calm Is The Tempo (Pilar 4).

**Audio (minimal):**
- Un sonido sutil al recibir un level-up NOTIFY (distinto al sonido de resultado de partido o evento de crisis). Corto, positivo, discreto.
- Los career events pueden tener audio diferenciado — definido en `event-system.md`.

## UI Requirements

1. **Feed de nivel-up**: cuando una habilidad sube de nivel, el CalendarEvent NOTIFY aparece en el feed semanal como una línea: `"[Nombre del skill]: nivel [N]"`. Misma UI que otros NOTIFY — sin modal, sin interrupción.

2. **Página del Manager**: pantalla accesible desde el HUD principal (link o tab). Muestra:
   - Nombre del manager
   - Para cada skill: nombre localizado, nivel actual [1–5], barra de XP (vacía en nivel 5, reemplazada por badge "DOMINADA")
   - **Observación narrativa del staff** (no valores numéricos — Pilar 1): si el manager tiene un staff que puede comentar ese dominio, aparece una línea diegética breve del empleado relevante (ej: asistente técnico sobre tactical_insight: *"Las charlas previas al partido se notan. Los chicos salen más enfocados."*). Sin mencionar el efecto mecánico ni el valor del bonus. El staff observa cambios; el sistema no los documenta.
   - Career events recibidos (histórico, no solo pendientes)
   - **Sin tabla de bonuses numéricos**: los efectos de cada skill son descubribles por el jugador, no expuestos directamente. El perfil del manager muestra quién eres (niveles) y lo que tu equipo observa de ti (texto diegético), no qué produce el sistema internamente.

3. **Career event presentation**: CE-1, CE-2, CE-3 requieren presentación visual mayor que un NOTIFY estándar (potencialmente un inline card en el inbox, con opciones de respuesta). Diseño detallado en `event-system.md` y `hud-ui.md`.

4. **Barra de XP nivel 5**: cuando `level === 5`, renderizar badge "DOMINADA" en lugar de barra de progreso (ADR-010 Risk R4 — `xpToNextLevel = Infinity`). Nunca dividir XP entre Infinity para calcular porcentaje.

5. **Sponsor signing UI**: al presentar una oferta de patrocinio, mostrar el revenue calculado con el multiplicador `fa_multiplier` del manager actual. El jugador debe ver el beneficio de su `financial_acumen` en tiempo real, en el mismo panel de firma.

> 📌 **UX Flag — Manager RPG**: Este sistema tiene requisitos de UI. En Pre-Production, correr `/ux-design manager-profile` para crear la UX spec de la pantalla del manager antes de escribir las epics. Las stories de UI deben referenciar `design/ux/manager-profile.md`, no este GDD directamente.

## Acceptance Criteria

*Todos los ACs [UNIT] van en `tests/unit/manager-rpg/`. Los [INTEGRATION] requieren DB real (no mocks, ADR-002). Ambas categorías son BLOCKING antes de marcar cualquier historia de manager-rpg como Done.*

**AC-RPG-01** `[UNIT]` — F1: Curva XP por skill
GIVEN un manager con `financial_acumen` en nivel 2, WHEN `calculateXpToNextLevel("financial_acumen", 2)` se llama, THEN retorna `75 × 2^1 = 150`.

**AC-RPG-02** `[UNIT]` — F1: Nivel 5 → Infinity
GIVEN un manager en nivel 5 en cualquier skill, WHEN `calculateXpToNextLevel(skill, 5)` se llama, THEN retorna `Infinity`.

**AC-RPG-03** `[UNIT]` — F2: XP cap en nivel 5
GIVEN `tactical_insight` en nivel 5 con XP=0, WHEN `applyXpGrants` otorga `match_win` (+10 XP), THEN el XP actual permanece en 0 y el nivel permanece en 5 — sin carry-over.

**AC-RPG-04** `[UNIT]` — F3: mpi_bonus formula
GIVEN `tactical_insight.level = 4`, WHEN `mpi_bonus` se evalúa, THEN retorna `3` (índice 3 en `[0,1,2,3,5]`).

**AC-RPG-05** `[UNIT]` — F4: happiness_bonus formula
GIVEN `man_management.level = 3`, WHEN `happiness_bonus` se evalúa, THEN retorna `2`.

**AC-RPG-06** `[UNIT]` — F5: fa_multiplier formula
GIVEN `financial_acumen.level = 5`, WHEN `fa_multiplier` se evalúa, THEN retorna `1.12`.

**AC-RPG-07** `[UNIT]` — F6: effective_K_scouting
GIVEN `scouting_network.level = 4` y `K_scouting_base = 15` (constante de cascade-engine.md), WHEN `effective_K_scouting` se calcula, THEN retorna `15 × 1.28 = 19.2` (valor documentado en la tabla del Skill Catalog).

**AC-RPG-08** `[UNIT]` — F7: staff quality gate
GIVEN `reputation.level = 1 ó 2`, WHEN `getMaxHirableStaffQuality()` se llama, THEN retorna `1`. GIVEN `level = 3`, THEN retorna `2`. GIVEN `level = 4 ó 5`, THEN retorna `3`.

**AC-RPG-09** `[INTEGRATION]` — XP sources: match events (todos los outcomes)
GIVEN un partido finaliza con resultado `win`, WHEN el evento se procesa por `applyXpGrants`, THEN `tactical_insight.xp` aumenta exactamente en 10.
GIVEN un partido finaliza con resultado `draw`, WHEN el evento se procesa, THEN `tactical_insight.xp` aumenta exactamente en 5.
GIVEN un partido finaliza con resultado `loss`, WHEN el evento se procesa, THEN `tactical_insight.xp` aumenta exactamente en 5.

**AC-RPG-10** `[UNIT]` — tactical_insight bonus solo en semanas de partido
GIVEN no hay partido en la semana, WHEN el implicit PlayerDecision de tactical_insight se evalúa, THEN el bonus mpi es `0` independientemente del nivel de `tactical_insight`.

**AC-RPG-11** `[INTEGRATION]` — XP sources: eventos financieros
GIVEN el mes cierra con balance positivo, WHEN el evento `end_of_month:positive_finances` se procesa, THEN `financial_acumen.xp` aumenta exactamente en 15.

**AC-RPG-12** `[INTEGRATION]` — financial_acumen: sin retroactividad
GIVEN se firma un contrato de patrocinio con `financial_acumen.level = 3` (×1.06), WHEN `financial_acumen` sube a nivel 4 (×1.09) en la semana siguiente, THEN el contrato activo mantiene el revenue calculado con ×1.06 — el nuevo multiplicador solo aplica a la siguiente firma.

**AC-RPG-13** `[INTEGRATION]` — XP sources: morale events
GIVEN `squad_morale:high_streak` se dispara, WHEN se procesa, THEN `man_management.xp` aumenta exactamente en 25.

**AC-RPG-14** `[INTEGRATION]` — Career event: trigger único
GIVEN `reputation.level` llega a 3 y CE-1 nunca ha disparado, WHEN el level-up se confirma, THEN CE-1 dispara exactamente una vez y el flag `career_events_triggered: ['CE-1']` se persiste en el manager profile.

**AC-RPG-15** `[INTEGRATION]` — Career event: no re-disparo
GIVEN CE-2 ya está en `career_events_triggered` del manager profile (disparado anteriormente), WHEN `advance()` evalúa career events y `reputation.level ≥ 4`, THEN CE-2 no se inserta como CalendarEvent y `career_events_triggered` permanece sin duplicados. *(Nota: reputation.level no retrocede nunca — Core Rule 5. Este test verifica que el flag de "disparado" persiste correctamente en DB y que el check `!career_events_triggered.includes('CE-2')` funciona.)*

**AC-RPG-16** `[INTEGRATION]` — Career event: loyalty XP bonus
GIVEN un career event dispara y el manager lo rechaza activamente, WHEN el rechazo se registra, THEN el loyalty XP bonus se aplica al skill `reputation` en la misma transacción.

**AC-RPG-17** `[INTEGRATION]` — Atomicidad de level-up
GIVEN `tactical_insight` está 1 XP por debajo del umbral de level-up, WHEN `applyXpGrants` otorga suficiente XP en un `advance()`, THEN tanto el update de XP como el CalendarEvent NOTIFY `manager_level_up` se insertan en la misma transacción DB — si la transacción hace rollback, ninguno persiste.

**AC-RPG-18** `[UNIT]` — Determinismo
GIVEN el mismo `ManagerProfile` inicial y la misma lista ordenada de XP grants, WHEN `applyXpGrants` se llama dos veces de forma independiente, THEN ambas llamadas producen outputs idénticos — sin `Math.random()`, sin dependencias de timestamp.

## Open Questions

| ID | Pregunta | Bloqueante para | Target resolución |
|----|----------|-----------------|-------------------|
| OQ-RPG-01 | ¿Cómo se determina si la semana "tiene partido"? **Resolución propuesta**: el cascade engine pasa `hasMatchThisWeek: boolean` en el `AdvanceContext` derivado del fixture de league-system (el fixture ya está disponible en el tick semanal). La implicit PlayerDecision de tactical_insight usa este flag. **Acción pre-implementación**: documentar `hasMatchThisWeek` en el control manifest o en una extensión de ADR-007/ADR-008. | Implementación de tactical_insight bonus | Control manifest o ADR-007 extensión (pre-epic) |
| OQ-RPG-02 | ¿`squad_morale:high_streak` es un event disparado por el cascade engine al detectar 4 semanas consecutivas con player_happiness > 70, o lo genera un worker separado que lee el histórico de WorldState? Si es el cascade, ¿qué nodo trackea el streak count? | Implementación de man_management XP | Al escribir staff-system.md o event-system.md |
| ~~OQ-RPG-03~~ | ~~`career_milestone:press_interview`...~~ **RESUELTO** (2026-05-18, /design-review R1): el Director de Comunicación (7º slot exclusivo desbloqueado en reputation.level = 5) genera los `career_milestone:press_interview` events. Su activación requiere que esté contratado. El event-system los rutea igual que los demás mensajes de staff. | — | ✅ Cerrado |
| OQ-RPG-04 | ¿`player:morale_intervention` (man_management XP) es una acción explícita del jugador en el HUD (botón "Hablar con jugador") o se dispara automáticamente cuando el jugador consume un evento de crisis de moral del event-system? | Implementación de man_management XP | Al diseñar player-management.md y staff-system.md |
| OQ-RPG-05 | ¿La curva `calculateXpToNextLevel` por skill conflicta con ADR-010? **Resolución**: el GDD propone 5 curvas con BASE distintas — el ADR-010 tiene `calculateXpToNextLevel(currentLevel: number)` con BASE=100 hardcodeado. La función debe actualizarse a `calculateXpToNextLevel(skillId: ManagerSkillId, level: number): number` con una tabla de BASE por skill. No es un cambio de schema DB — solo cambia la firma de la función y los constantes. **Acción pre-implementación**: actualizar ADR-010 para soportar la firma multi-skill. | Implementación del epic manager-rpg | Actualizar ADR-010 antes del epic (chore ~15 min) |
| OQ-RPG-06 | ¿El bonus de `tactical_insight` (mpi + N) se aplica también en partidos visitantes? La fórmula del match-performance-index podría tratarlo de forma distinta si queremos que el bonus sea mayor en casa (ventaja del manager en estadio propio). | Balance del sistema | Al escribir el epic de manager-rpg o Quick Design Spec |
