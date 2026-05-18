# Cross-GDD Review Report — Cascada FC (Re-run)
**Fecha**: 2026-05-18 (Re-run post-R3 staff-system — set MVP completo)
**GDDs revisados**: 9 sistemas + game-concept (10 total)
**Modo**: full (consistency + design theory + scenario walkthroughs)
**Especialistas**: game-designer × 2 (Phase 2 + Phase 3 paralelo)

**Sistemas cubiertos**: cascade-engine (Approved) · economy (Approved) · event-system (Approved) · league-system (Approved) · manager-rpg (Approved) · match-simulation (Approved) · **player-management (Approved — nuevo)** · **staff-system (Approved — era Designed en review anterior)** · hud-ui (Approved) · game-concept (Approved)

---

## Status en Blockers del Review Anterior (2026-05-18)

| Blocker anterior | Estado |
|-----------------|--------|
| entities.yaml fan_momentum default 50→60 | ✅ RESUELTO |
| entities.yaml hysteresis range [-28,+5.5]→[-20,+5.5] | ✅ RESUELTO |
| entities.yaml tv_rights D3→D2 naming | ✅ PARCIAL — constant name OK; nota en league-system.md nota aún dice `tv_rights_annual_d3_eur_k` |
| economy.md F8 scandal fine factor 1.0→0.667 | ✅ RESUELTO |
| event-system.md F4d→referencia F6 como autoritativo | ✅ PARCIAL — nota de autoridad añadida, fórmulas aún producen valores distintos (ver B-01) |
| event-system.md simultaneous BLOCKING events sin orden | ✅ RESUELTO (priority: financial_crisis > scandal > captain_crisis > fan_crisis; AC-EVT-34/35) |
| cascade-engine.md: league-system no listado como writer de fan_momentum | ✅ RESUELTO |

---

## Consistency Issues

### Blocking (resolver antes de /create-architecture)

🔴 **[B-01] event-system.md F4d y economy.md F6 producen valores de préstamo distintos** — [2b]
event-system.md F4d: `max(0, 7 × weekly_costs − balance + 1)` → con costs=18.25, balance=30: **98.75 €K**
economy.md F6: `max(CRITICAL − balance, 0) + LOAN_BUFFER × weekly_costs` → mismos inputs: **97.75 €K**
La `+1` en F4d no existe en F6. F4d usa `7 × costs` (WARNING_THRESHOLD) como base; F6 usa `CRITICAL + BUFFER × costs`. Los ACs de event-system.md testean F4d — un implementador que use F6 en el servidor da al jugador un número distinto al que se muestra.
**Fix:** event-system.md F4d debe mostrar la fórmula de F6 sustituida literalmente, o los ACs deben testar F6. La nota de autoridad no basta.

---

🔴 **[B-02] Regla de forfeit: league-system.md (% squad) vs player-management.md (count absoluto)** — [2b]
league-system.md Rule 8: forfeit si `squad_available_pct ≤ 63%` → con 25 jugadores: forfeit si ≤15 disponibles.
player-management.md Edge Cases + AC-PM-11: forfeit si `available_count < 7` (independiente del squad_size).
Con 15 jugadores totales, 9 disponibles: league-system (60% ≤ 63%) → FORFEIT; player-management (9≥7) → NO FORFEIT. Dos sistemas reclaman ownership de la misma regla con resultados distintos.
**Fix:** Elegir una regla canónica. Opciones: (A) count `<7` de player-management; (B) pct `≤63%` de league-system; (C) dual-gate: count `<7` = FORFEIT hard, pct `≤63%` = ADVISORY warning.

---

🔴 **[B-03] financial_acumen aplica semanalmente (F5) o solo en la firma (AC-RPG-12)** — [2b] — *contradicción interna en manager-rpg.md*
manager-rpg.md F5: *"Semanalmente sobre todos los contratos de patrocinio activos. Si el manager sube de nivel mid-temporada, el multiplicador mejorado aplica desde la siguiente semana."*
manager-rpg.md AC-RPG-12: *"el contrato activo mantiene el revenue calculado con ×1.06 — el nuevo multiplicador solo aplica a la siguiente firma."*
Estas reglas son mutuamente excluyentes. El texto de F5 incluye una justificación ("Firmar antes siempre es igual o mejor") que solo tiene sentido con regla weekly — AC-RPG-12 hace que esperar sea mejor (lock at signing).
**Fix:** Elegir una semántica y eliminar la otra. Lock-at-signing (AC-RPG-12) es más simple y evita retroactividad.

---

🔴 **[B-04] player_happiness (WorldState) vs PlayerState.morale individual — agregación undefined** — [2b]
cascade-engine.md: `player_happiness` es un WorldState node [0-100] único para todo el squad.
player-management.md F11: calcula `morale` individual por jugador [0-100].
match-simulation.md F2: usa `morale` individual en `effective_rating` (`morale × 0.15`).
cascade-engine.md C16b: `player_happiness` afecta cascades de squad.
La relación entre `PlayerState.morale[]` y el WorldState `player_happiness` no está especificada. Sin esta definición, match-simulation aplica morale individualmente Y cascade-engine aplica player_happiness — ambos modelando morale simultáneamente sin contrato de interfaz. Doble-counting probable.
**Fix:** Definir la función de agregación en player-management.md o cascade-engine.md: `player_happiness = mean(morale for starting_lineup)` o equivalente, con frecuencia de actualización.

---

🔴 **[B-05] form range: match-simulation.md [0,100] vs player-management.md [30,90]** — [2b/2e]
player-management.md: `form ∈ [30, 90]` (propietario de PlayerState).
match-simulation.md F2: `form | [0, 100]` en la tabla de variables. "Rango matemático real: [0,100]" implica form puede ser 0 — imposible per player-management.
El output range declarado "[25, 100] en juego normal" es incoherente con ambas definiciones (con form=30 mínimo, el mínimo real de effective_rating es ~13 per player-management.md F3).
**Fix:** match-simulation.md F2 debe especificar `form ∈ [30, 90]` y recalcular el output range con inputs reales.

---

### Warnings (resolver antes de architecture, no bloquean si hay tiempo)

⚠️ **[W-01] game-concept.md: 3 stale references — 16 clubs y 10-15 cascades** — [2c]
Content Volume, MVP Definition, Scope Tiers: "~16 clubs", "10-15 cascadas". Correcto: 20 clubs/división, 18 cadenas. Quick fix (3 secciones).

⚠️ **[W-02] player-management.md OQ-PM-05 dice 3 formaciones; cuerpo del GDD dice 4** — [2c]
OQ-PM-05 resolución: "3 formaciones fijas: 4-4-2, 4-3-3, 3-5-2." Core Rules §4: "cuatro formaciones fijas: 4-4-2, 4-3-3, 3-5-2, **5-3-2**." match-simulation.md también lista las 4. Quick fix en OQ text.

⚠️ **[W-03] Nomenclatura D3 stale en staff-system.md, entities.yaml y league-system.md** — [2c]
staff-system.md F1: "D3 inicio", "insostenible en D3." entities.yaml `tv_rights_annual_d2_eur_k` nota: "División 3." league-system.md F6 nota referencia `tv_rights_annual_d3_eur_k` (nombre antiguo). Quick fixes en 3 archivos.

⚠️ **[W-04] "Reducir estructura staff" en event-system sin dep. en staff-system.md y economy.md** — [2a]
event-system.md documenta despido forzado de staff como last-resort en financial_crisis. staff-system.md no lista event-system como downstream que puede triggear despidos. OQ-EVT-01 abierto: ¿qué miembro elige el servidor? Pre-blocking para el epic de event-system.

⚠️ **[W-05] scandal "cooperar" fija 30 €K en F4c; economy.md F8 escala con corruption_exposure** — [2b]
F4c "cooperar": `balance -= 30` (flat). F8: `30 × (1 + 0.667 × (exposure−80)/20)` → [30,50] €K. Con exposure=100, cooperar cuesta 30 €K en lugar de los 50 €K que dice F8. Si es intencional (premia early detection), documentarlo. Si no, F4c debe usar F8.

⚠️ **[W-06] stamina floor: player-management [40,100] vs match-simulation [0,100]** — [2b]
`FITNESS_DECAY_MAX = 15 pts` asume stamina=0 — imposible per player-management (floor=40). Max decay real = `15 × (1−40/100) = 9 pts`. Quick doc fix in match-simulation.md.

⚠️ **[W-07] cascade-engine.md no lista player-management.md como writer de WorldState nodes** — [2a]
player-management.md escribe `squad_available_pct` y `team_skill` via PlayerDecisions (Paso 3). cascade-engine.md Interactions no incluye player-management.md como writer. Quick fix.

⚠️ **[W-08] ADR-011 usa 16 clubs per OQ-LGS-02 — stale antes del epic** — [2c]
league-system.md OQ-LGS-02: ADR-011 fue escrito con 16 clubs/división; ahora son 20. Pre-blocking para el epic de league-system.

⚠️ **[W-09] staff-system.md F1: "player wages (~12 €K)" vs economy target 5-8 €K** — [2e]
Sustainability note de staff-system calcula con ~12 €K en player wages. economy.md target starting D2: 5-8 €K/sem. El staff-system sobrestima el pressure económico del tier-3. Quick doc fix: ~12→~6 €K.

⚠️ **[W-10] hud-ui.md: falta AC — COUNTER oculto para equipo local** — [2f]
La regla está documentada pero ningún AC la verifica. Quick addition.

---

## Game Design Issues

### Blocking

🔴 **[D-01] fan_momentum 50% win rate: rutas de recuperación documentadas sin validación cuantitativa** — [3d]
Con K_loss=10, K_win=8, temporada 19V-19D (sin empates), MPI≈70 (vic) y MPI≈40 (der):
- Victorias: 19 × +2.71 = +51.49 fan_momentum
- Derrotas: 19 × −10.4 = −197.6 fan_momentum
- Neto C6 solo: **−146 pts en 38 jornadas**

Las recovery paths documentadas (fan_crisis event options, ticket_price < 65, derby +5, career events) no tienen magnitud especificada. La resolución del blocker anterior documentó el mecanismo pero no verificó que los números cierran.
**Fix:** Añadir a cascade-engine.md una simulación explícita de 38 ticks con distribución realista (13V-13E-12D), mostrando trayectoria de fan_momentum y confirmando que las recovery paths contrarrestan el déficit, o reajustar K_loss_base.

### Warnings

⚠️ **[D-02] Sliders resueltos como problema optimizable — experiencia post-discovery superficial** — [3c]
Sweet spot: training=50, ticket_price=50, catering=100, groundskeeper=70-80, scouting=30. Configuración estable después de ~1.5 temporadas. 8 levers → 3 decisiones activas post-discovery (lineup, staff, mercado). Si es intencional (P1 premia descubrimiento), documentarlo como decisión de diseño.

⚠️ **[D-03] man_management XP time-gated — sube en piloto automático** — [3g]
`end_of_week:player_happiness_stable` (+3 XP/semana) = 114 XP/temporada ≥ L2 threshold (80 XP) sin acciones del jugador. man_management es el único skill que sube automáticamente con gestión básica. Contradice P3.

⚠️ **[D-04] squad_morale:high_streak — mecanismo de implementación undefined** — [3g]
OQ-STAFF-04 abierto: ¿contador en `manager_profiles`, nodo WorldState, o query on-the-fly de 4 snapshots? Afecta la segunda fuente más grande de man_management XP (+25 pts). Pre-blocking para el epic de advance().

⚠️ **[D-05] IA clubs con squads estáticos — market exhaustion en temporada 2-3** — [3d]
Jugadores maduros de alta skill quedan bloqueados en IA clubs (intocables). El techo de `team_skill` queda anclado a jóvenes generados anualmente. Constraint de diseño no documentado. Si es scope intencional de MVP, debe explicitarse.

⚠️ **[D-06] 8 levers cognitivos simultáneos (recomendado: ≤4)** — [3b]
Sliders + lineup/formación + staff management + mercado en ventanas = 8 simultáneos. hud-ui.md organiza en 4 panels (estructura), pero la carga cognitiva de saber qué lever afecta qué cascade permanece.

---

## Cross-System Scenario Issues

**Escenarios evaluados**: 4

### Blockers

🔴 **Scenario 1: Primera semana de partido — Forfeit check undefined**
advance() → ¿league-system (63% pct) o player-management (<7 count) chequea forfeit?
Con 15 jugadores, 9 disponibles: resultados opuestos según GDD. Resolución de B-02 resuelve este escenario.

🔴 **Scenario 2: Vía A single-upgrade cruza WARNING threshold — sin preview UI**
staff-system.md Edge Cases documenta warning modal solo para "formaciones simultáneas que superan WARNING_THRESHOLD." Una formación individual que individualmente proyecta el balance bajo WARNING (ej: head_coach T2→T3 = 12 €K con balance 140 €K, WARNING=127 €K) no tiene warning documentado. El jugador puede disparar un board meeting BLOCKING al ejercer su recompensa de reputation sin advertencia.
**Fix:** staff-system.md debe extender el warning modal a cualquier operación que individualmente proyecte balance bajo WARNING.

### Warnings

⚠️ **Scenario 3: Reducción catering en financial_crisis empeora la fan_crisis pendiente**
Resolver financial_crisis reduciendo `catering_budget` empeora C5a → team_fitness → match_performance → potencialmente profundiza fan_crisis de la semana siguiente. Cadena emergente. Si es feature intencional ("cascade cruelty"), documentar explícitamente en event-system.md Edge Cases.

⚠️ **Scenario 4: Ascenso a D1 — transfer window timing vs squad upgrade race**
processSeasonEnd() procesa ascenso. La secuencia "promoción → nueva liga → ventana fichajes" y cuándo el jugador puede mejorar el squad antes del primer partido D1 no está walkthroughed en ningún GDD.

### Info

ℹ️ **Primera semana in-game: posible ausencia de mensajes de staff significativos**
Con WorldState en valores default (equilibrio), los deltas semana 1 pueden estar bajo los umbrales T1. El jugador puede recibir solo STABLE_CHECK o silencio. OQ-STAFF-01 (template library) debe garantizar al menos 1 mensaje informativo en semana 1.

ℹ️ **CE-3 y unlock de communications_director coinciden en reputation L5**
CE-3 es NOTIFY, slot-unlock es system notification — ambos no-BLOCKING. Sin colisión con reglas de BLOCKING ordering.

---

## GDDs Flagged for Revision

| GDD | Razón | Tipo | Prioridad |
|-----|-------|------|----------|
| `event-system.md` | B-01: F4d debe coincidir con F6; W-04: dep. staff-system; W-05: scandal cooperar flat vs F8 | Consistency | Blocking |
| `player-management.md` | B-02: forfeit rule; B-04: player_happiness aggregation; W-02: OQ-PM-05 (3→4 formaciones); W-06: stamina range | Consistency | Blocking |
| `league-system.md` | B-02: forfeit rule; W-08: ADR-011 update (16→20) | Consistency | Blocking |
| `manager-rpg.md` | B-03: financial_acumen weekly vs at-signing | Consistency | Blocking |
| `cascade-engine.md` | D-01: fan_momentum quantitative validation; W-07: player-management como writer | Design + Consistency | Blocking |
| `match-simulation.md` | B-05: form range [0,100]→[30,90]; W-06: stamina decay max recalc | Consistency | Blocking |
| `game-concept.md` | W-01: 16→20 clubs (3 lugares), 10-15→18 cascades | Consistency | Warning |
| `staff-system.md` | W-03: D3→D2; W-09: player wages ~12→~6 €K; Scenario 2: single-upgrade WARNING spec | Consistency | Warning |
| `hud-ui.md` | W-10: AC faltante COUNTER para local | Consistency | Warning |
| `entities.yaml` | W-03: nota `tv_rights` "División 3"→"D2" | Consistency | Warning |

---

## Verdict: FAIL

**5 consistency blockers + 1 design blocker = 6 blockers** antes de /create-architecture.

### Acciones requeridas antes de re-run:

**Decisiones de diseño (requieren input del usuario):**
1. `B-02` — ¿Qué regla de forfeit es canónica? player-management count `<7` ó league-system pct `≤63%` (o dual-gate)
2. `B-03` — ¿financial_acumen aplica semanalmente o al momento de firma? Elegir en manager-rpg.md
3. `B-04` — ¿Cómo agrega player_happiness? Media de los 11 titulares / todos / otra función
4. `D-01` — Simulación de fan_momentum a 50% WR: confirmar recovery paths con cálculo explícito

**Fixes de documentación (resolubles en sesión):**
5. `B-01` — event-system.md F4d: reescribir para coincidir con F6 o reescribir AC
6. `B-05` — match-simulation.md F2: `form ∈ [30, 90]`, recalcular output range
7. `W-01/W-03` — game-concept.md (16→20, 10-15→18); staff-system.md D3→D2; entities.yaml nota
8. `W-02` — player-management.md OQ-PM-05: "3 formaciones" → "4 formaciones"
9. `W-06` — match-simulation.md: stamina floor=40, decay max = 9 pts
10. `W-09` — staff-system.md F1: player wages ~12→~6 €K
