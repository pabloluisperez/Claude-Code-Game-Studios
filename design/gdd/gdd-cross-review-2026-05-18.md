# Cross-GDD Review Report — Cascada FC
**Fecha**: 2026-05-18
**GDDs revisados**: 7 sistemas + game-concept (8 total)
**Especialistas**: systems-designer (Phase 2), game-designer (Phase 3+4)
**Modo**: full (consistency + design theory + scenario walkthroughs)

**Sistemas cubiertos**: cascade-engine (Approved) · economy (Approved) · event-system (Approved) · league-system (Approved) · manager-rpg (Designed) · match-simulation (Needs Revision) · staff-system (Designed)

---

## Consistency Issues

### Blocking (resolver antes de /create-architecture)

🔴 **[2b] Fórmula de préstamo de emergencia: economy.md F6 vs event-system.md F4d**
economy.md F6: `loan = max(CRITICAL − balance, 0) + 4 × weekly_costs`
event-system.md F4d: `loan = max(0, 7 × weekly_costs − balance + 1)`
Producen valores distintos. **Economy.md F6 es la fuente autoritativa** (tiene tabla de variables completa). event-system.md F4d debe referenciar F6.

🔴 **[2b] Scandal fine factor: economy F8 (1.0) vs event-system F4c (0.667)**
F8 produce range [30, 60 €K]; F4c y registry producen [30, 50 €K]. El registry es correcto (0.667). economy.md F8 tiene factor incorrecto. Fix: economy.md F8 → factor 0.667.

🔴 **[2c] entities.yaml: fan_momentum default = 50 (debe ser 60, cambiado en R2)**
Todo sistema que inicialice desde el registry obtendrá valor incorrecto en WorldState inicial.

🔴 **[2c] entities.yaml: fan_momentum_asymmetric_hysteresis output_range = [-28, 5.5] (debe ser [-20, +5.5] con K_loss_base=10)**
K_loss_base = 10 post R2. Rango real: MPI=0 → -10×(1+1)=-20. Registry sigue publicando rango de K_loss_base=14.

### Warnings

⚠️ **[2a] cascade-engine.md Interactions: no lista league-system como escritor de fan_momentum**
league-system F5 escribe `fan_momentum` via derby PlayerDecisions (+5 win / +1 draw / -8 loss). El contrato de escritura no tiene owner documentado en cascade-engine.md Interactions.

⚠️ **[2b] Timing del bonus táctico (manager-rpg F3) vs worldStateDeltas de match-sim**
match-sim escribe mpi_delta (Paso 2). manager-rpg añade MPI bonus (Paso 3). Aditivos correctamente, pero el GDD no documenta que el bonus se suma encima del delta del partido ni el rango efectivo pre-clamp [0, 105].

⚠️ **[2b] Scandal fine factor inconsistency** (ver Blocking arriba — también afecta como stale reference)

⚠️ **[2c] entities.yaml: tv_rights_annual_d3_eur_k — nomenclatura "D3" no existe**
El juego tiene D1/D2. Debe renombrarse `tv_rights_annual_d2_eur_k`.

⚠️ **[2c] game-concept.md stale: "1 liga (~16 clubs)" y "~10-15 cascade chains"**
league-system tiene 20 clubs por división. cascade-engine tiene 18 chains.

⚠️ **[2d] K_scouting_base ownership: cascade-engine define 15.0, manager-rpg lo modifica sin contrato de interfaz**
manager-rpg dice "via SimContext extendido" pero cascade-engine.md no menciona recibir managerProfile. Interfaz no sellada.

⚠️ **[2e] match-simulation mpi_delta clamp especificación**
El GDD clampea el delta, no el valor resultante. Necesita nota: "cascade engine responsable del clamp final a [0,100]; el delta puede ser cualquier valor."

ℹ️ **[2a] match-simulation.md Dependencies: league-system marcado "Not Started"** — stale label.
ℹ️ **[2f] player-management.md es hard dependency de match-simulation y economy — Not Started** — gap de prerequisito conocido.

---

## Game Design Issues

### Blocking

🔴 **[3d] Asimetría C6 crea trap loop inevitable para managers con ~50% win rate**
Con K_win=8, K_loss=10: win(MPI=70)→+2.71; loss(MPI=30)→-11.6/tick. Pérdida neta por par: ~-8.9 fan_momentum. En 38 matchdays con 50% WR → fan_momentum entra en BLOCKING (<20) antes del final de temporada incluso para managers competentes. No hay ruta de recuperación activa de fan_momentum no-dependiente de victorias documentada. Viola P4. Fix: documentar mecanismo de recuperación activa (evento de community relations, price reduction incentive, etc.) antes de architecture.

🔴 **[4b] Dos eventos BLOCKING simultáneos (fan_crisis + Board Meeting) sin orden de resolución**
fan_momentum < 20 → fan_crisis BLOCKING. balance < 3×costs → Board Meeting BLOCKING. Pueden ocurrir en el mismo tick. event-system.md no documenta: (a) orden de presentación, (b) si opciones de uno consumen recursos del otro, (c) floor de "≥1 opción disponible" con reputation L1 y opciones gateadas. Estado potencialmente inresolvable.

### Warnings

⚠️ **[3a] Loop "cascade detective" (P1) invisible durante ~1.5 temporadas early game**
El momento "aha" requiere staff tier-2 → reputation L3 → ~temporada 1.5. Los primeros ~30 ticks el jugador ve soccer manager genérico. Sin hook de discovery early con staff tier-1, abandono probable.

⚠️ **[3c] Training intensity sweet spot (40-60) elimina una dimensión de decisión post-discovery**
Una vez descubierto, el slider queda fijo. Tolerable en diseño, pero no documentado si la predictibilidad post-discovery es intencional o si hay incentivos para explorar fuera del sweet spot.

⚠️ **[3c] Max catering + max groundskeeper es estrategia dominante sin contrapartida obvia**
El balance de budget limitado mitiga, pero sin player-management.md la competencia de budget por transfers no existe.

⚠️ **[3b] 6 focos cognitivos activos simultáneos (umbral recomendado: 4)**
Sliders + staff inbox + balance + event queue + standings + match result = 6 focos. hud-ui.md debe colapsar en ≤3 zonas cognitivas.

⚠️ **[3g] Manager-RPG pasivo: XP automática sin elección activa contradice P3 "tú creces"**
La fantasy de P3 implica agencia sobre el crecimiento. Al menos un momento de elección activa en la progression fortalecería la fantasy.

⚠️ **[3e] Brecha early anxiety / mid-game flow dura ~1.5 temporadas**
Early game (opacidad + presión económica) = anxiety-zone. Mid game (tier-2 staff) = flow-zone. Brecha demasiado larga para new players.

ℹ️ **[3f] Scouting chains decorativas en D2 early hasta que player-management.md exista**
ℹ️ **[3f] Late game (D1 + tier-3) puede volverse trivialmente fácil — sin scaling de IA rivals documentado**
ℹ️ **[3g] CE-2 timing (mid-season vs end_of_season) no especificado en manager-rpg.md**

---

## Cross-System Scenario Issues

**Escenarios evaluados**: 3

### Blockers

🔴 **Scenario 2: fan_crisis BLOCKING + financial CRITICAL simultáneos — activación ambigua**
event-system.md no documenta: orden de presentación, si opciones consumen recursos del otro, floor de ≥1 opción disponible con reputation L1. Comportamiento undefined en escenario natural para early game (club competente pero no dominante).

### Warnings

⚠️ **Scenario 1: Derby win tras high prices — C15 vs C8 en mismo tick sin orden documentado**
Si C15 (price erosion) evalúa antes de C8 (momentum buffer), la victoria en derby no protege el buffer esperado. El jugador puede observar fan_momentum bajando post-derby sin entender por qué.

⚠️ **Scenario 3: Reputation L2→L3 — canal de notificación no especificado**
Ningún GDD documenta cómo el jugador sabe que puede contratar tier-2 staff. La transición tier-1→tier-2 (despedir + contratar) tampoco está documentada como flujo.

ℹ️ **Scenario 3: CE-2 timing mid-season — el jugador puede no poder actuar hasta la siguiente temporada**

---

## GDDs Flagged for Revision

| GDD | Razón | Tipo | Prioridad |
|-----|-------|------|----------|
| `entities.yaml` | fan_momentum default (50→60), hysteresis range ([-28,5.5]→[-20,+5.5]), D3→D2 nomenclatura | Consistency | Blocking |
| `economy.md` | Scandal fine factor F8 (1.0→0.667); loan formula F6 → marcar como autoritativo | Consistency | Blocking |
| `event-system.md` | Loan F4d → referenciar F6; simultaneous BLOCKING handling order spec | Consistency + Design | Blocking |
| `cascade-engine.md` | league-system como writer en Interactions; fan_momentum recovery path | Consistency + Design | Blocking |
| `match-simulation.md` | Stale dependency label (league-system); mpi_delta clamp note | Consistency | Warning |
| `manager-rpg.md` | MPI bonus stacking note; CE-2 timing spec; consider active choice in progression | Design | Warning |

---

## Verdict: FAIL

**4 consistency blockers + 2 design blockers** = 6 blockers totales antes de /create-architecture.

### Acciones requeridas antes de re-run:
1. `entities.yaml`: corregir fan_momentum default (50→60), hysteresis range, renombrar D3→D2
2. `economy.md F8`: cambiar factor 1.0 → 0.667; añadir nota "F6 es autoritativo para monto de préstamo"
3. `event-system.md F4d`: referenciar economy.md F6; añadir spec de orden de resolución de BLOCKING simultáneos
4. `cascade-engine.md` Interactions: añadir league-system como writer; añadir párrafo de mecanismo de recuperación activa de fan_momentum
5. `match-simulation.md` Dependencies: actualizar league-system a Approved

*Los 3 blockers de registry/fórmula (items 1-2) son correcciones rápidas (<30 min). Los 2 de diseño (items 3-4) requieren una decisión de diseño que puede hacerse en la misma sesión. Item 5 es cosmético.*
