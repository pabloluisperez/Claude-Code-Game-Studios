# Stadium Upgrades — Game Design Document

> **Status**: 🟢 **Drafted — pending Pablo review** (2026-05-24 autonomous closeout — all 8 required sections + §9 OQ written)
> **Layer**: Core
> **Owner**: game-designer + systems-designer + economy-designer
> **Pillars**: P2 *World Is The Scoreboard* (primary), P3 *You Grow Like Your Club* (secondary), P4 *Calm Is The Tempo* (tertiary)
> **Engine binding**: Web (TypeScript) — Drizzle + Hono + SvelteKit · `/stadium` route
> **ADR refs**: ADR-005 (WorldState), ADR-008 (World Clock), ADR-014 (canvas pipeline) · *new ADR pending for upgrade module*
> **Scope**: v1.1 (post-MVP)
> **Last Updated**: 2026-05-24

---

## 1. Overview

Stadium Upgrades es el sistema de **compra y mejora de instalaciones del club** — gradas, césped, instalación deportiva, academia juvenil, vestuarios, palco. Como dato, escribe a `WorldState` los contadores que dan forma física al estadio (`stadium_upgrade_count`, `training_facility_level`, `youth_academy_level`), alimentando `infrastructure_level` consumido por `city-progression.md`. Como experiencia, es el momento en que el jugador convierte beneficios en estructura visible: **cada reforma se ve aparecer en el mismo `/stadium` donde se gestiona** — la grada cubierta nueva, el césped pristine, el banner del patrocinador, todos aparecen en el close-up del estadio en cuanto la obra termina. La vista isométrica de `/city` propaga el cambio sólo cuando el conjunto de reformas cruza un **gate de tier** (4 tiers gameplay · 10 niveles visuales internos). A partir de v1.1, completar las reformas requeridas para un tier es el **segundo gate** de subida de city-progression — el primero sigue siendo cumplir las métricas (`prestige`, `financial_balance`, `fan_base`, `currentSeason`, `division`). El reloj del mundo (ADR-008) marca cuándo se completan, WorldState (ADR-005) los persiste, y el pipeline de canvas (ADR-014) renderiza ambas capas — close-up en `/stadium` y propagación a `/city`.

## 2. Player Fantasy

> *"Has cerrado la temporada con beneficios por primera vez. Llevas tres meses mirando cómo el viento entra por el lateral norte del estadio, donde sigue habiendo vallas oxidadas. En el panel de reformas eliges 'Construir grada cubierta lateral norte' — coste: 45.000€, duración: 6 semanas. La decisión se siente pequeña. Vuelves al juego, pasas dos jornadas, hay una victoria en casa, fan_momentum sube. La sexta semana, al entrar a `/stadium`, ahí está: la grada nueva, con sombra, con sponsor, con público sentándose. No salta un modal — está ahí. Coges una captura. La envías al grupo. Es tuya."*

Anclajes a Pilares:

- **Pilar 2 (World Is The Scoreboard) — PRIMARIO**: Stadium Upgrades **es** el progreso renderizado. No hay "+12% capacidad" — hay una grada que antes no estaba. Y la grada aparece en `/stadium`, el mismo sitio donde la encargaste; no hay que ir a buscarla a otro lado.
- **Pilar 3 (You Grow Like Your Club) — SECUNDARIO**: cada reforma es una **decisión del manager con autoría**. La grada cubierta no se construye sola al subir de división — la encargaste tú. El club tiene la forma que tú le has dado, no la que el ranking le impuso.
- **Pilar 4 (Calm Is The Tempo) — TERCIARIO**: la obra tarda semanas. No hay quick-build, no hay timer en tiempo real. Decides cuándo, el reloj te espera. La satisfacción de ver la grada nueva existe **porque** esperaste.

### Capas de la fantasía (multi-tono)

El sistema soporta tres lecturas simultáneas — cada jugador encuentra la suya:

**Capa 1 — Constructor con paciencia (P2)**
*"Estoy construyendo algo."* El jugador con vibe SimCity/Theme Park ve cada reforma como un ladrillo del proyecto. La satisfacción está en el conjunto, en la silueta del estadio cambiando. Mira `/stadium` después de cada obra terminada (la grada nueva, el césped) y `/city` cada cierto tiempo para ver el barrio entero cambiar al cruzar un tier.

**Capa 2 — Capitulario personal (P3)**
*"Ese banner es del ascenso del año pasado."* El jugador narrativo asocia cada reforma a un momento concreto del club. El estadio se vuelve un diario hecho de objetos. Recuerda *cuándo* puso cada cosa y *por qué*.

**Capa 3 — Inversor racional (management feel)**
*"Esta grada se paga sola en 8 partidos."* El jugador min-max ve el sistema como capital allocation con retorno medible: capacidad × precio × fan_attendance = revenue marginal. El placer está en la matemática que funciona.

Las tres lecturas no se excluyen — el mismo jugador puede usar las tres en distintos momentos. **El sistema se diseña para no privilegiar ninguna** sobre las otras.

### Anti-fantasías (lo que el sistema NO es)

- **NOT un editor de estadio libre** (à la PES Stadium Builder). El catálogo es cerrado, hay un orden, hay restricciones. El club tiene personalidad propia.
- **NOT un upgrade tree con +stats abstracto**. No hay "+1 prestige" sin un objeto físico que lo cause.
- **NOT instantáneo**. Las obras tardan; ese es el feature.
- **NOT pay-to-skip**. No hay forma de acelerar una obra con dinero. El reloj es la regla.

## 3. Detailed Rules

### 3.1 Core Rules

#### 3.1.1 Tracks (5)

| Track | Suma a WorldState | Visual locus |
|---|---|---|
| **Estadio – Gradas** | `stadium_upgrade_count` | `/stadium` close-up + capacity |
| **Estadio – Pitch** | `stadium_upgrade_count` | `/stadium` close-up |
| **Estadio – Servicios** | `stadium_upgrade_count` | `/stadium` close-up |
| **Training Facility** | `training_facility_level` | `/city` (no estadio) |
| **Youth Academy** | `youth_academy_level` | `/city` (no estadio) |

Los 3 tracks-Estadio alimentan el mismo contador `stadium_upgrade_count` pero progresan independientemente. El close-up del estadio en `/stadium` recorre **10 niveles visuales internos** (`stadium_visual_level: 0-9`), función combinada del estado de los 3 tracks-Estadio (fórmula en §4).

#### 3.1.2 Items

Cada track tiene **4 niveles** (alineados con city tiers T1-T4). Cada nivel tiene **2-4 items concretos**. **Total ~40 items** (5 tracks × 4 niveles × ~2 items). Catálogo representativo (canónico en `design/data/stadium-upgrades-catalog.yaml`):

- **Gradas**: N1 Grada N/S hormigón · N2 Grada E/W hormigón · N3 Cubiertas N/S · N4 Cubierta total · Palco VIP
- **Pitch**: N1 Drenaje · Sembrar · N2 Césped uniforme · Riego · N3 Pristine · Iluminación · N4 Premium · Climatizado
- **Servicios**: N1 Vestuarios bloque · Caseta médica · N2 Sala técnica · Prensa básica · N3 Vestuarios 2 plantas · Gimnasio · N4 Complejo médico · Prensa premium
- **Training**: N1 Cancha · Tácticas · N2 Doble · Casetas · N3 Gym · Vídeo · N4 Completo · Hidroterapia
- **Academy**: N1 Aula · Mini campo · N2 Dorm · Cantina · N3 Pabellón · Staff · N4 Residencial · Tutores

#### 3.1.3 Prerequisitos

Un item está `Available` cuando se cumplen las tres condiciones:

1. **Track prereq**: ≥1 item del nivel previo del MISMO track está `Complete`.
2. **Balance**: `financial_balance >= cost_of_item`.
3. **Queue**: slot libre (siempre =1 en MVP).

**NO hay prereq de city tier ya alcanzado**. El jugador puede empezar items de T3 antes de estar en city T3 — completarlos contribuye al gate de tier-up.

#### 3.1.4 Queue

**1 obra activa a la vez.** Items con prereqs cumplidos pero queue ocupada quedan en estado `Queued` (visibles, no comprables). Justificación: decisión densa, alinea con Pilar 4, evita feature creep. Slots paralelos = v1.2+.

#### 3.1.5 Tier-up gate (segundo gate de city-progression)

Para que `city-progression.md` active el tier N+1, deben cumplirse **AMBAS**:

1. **Métricas** (city-progression §3.2 sin cambios): prestige, balance, fanBase, season, division.
2. **Reformas requeridas**: **X de N items del nivel N están `Complete`** (X y N en §7 Tuning Knobs). Valor inicial: **~70% de items del nivel** (ej. nivel 2 tiene N=10 → X=7).

Anti-yo-yo de city-progression §3.2 sigue aplicando para las métricas. Items completados son monotónicos — no se pierden si las métricas caen.

#### 3.1.6 Cancelación + refund

Cancelar obra en curso → **refund 50% del coste**, inmediato. Restante se considera trabajo perdido. Se loggea staff message ("La obra del [nombre] se ha cancelado").

#### 3.1.7 Quiebra técnica

Bankruptcy (`balance < -500€K`, economy.md F4 / city-progression §5.2) **degrada visuales** pero no borra items del registro. Recuperación restaura visuales sin re-coste.

### 3.2 States and Transitions

FSM por item:

| State | Definición | UI |
|---|---|---|
| **Locked** | Prereqs no cumplidos | Gris, tooltip "Requiere [item X]" |
| **Available** | Prereqs OK + balance OK + queue libre | Botón "Comprar [precio]" activo |
| **Queued** | Prereqs OK pero queue ocupada | Disabled "En cola — espera a [obra actual]" |
| **InProgress** | Obra activa | Barra de progreso N de M semanas (max 1 simultáneo) |
| **Complete** | Terminada, efectos aplicados | Lista "Completadas" + check |
| **Cancelled** | Cancelada mid-progress | Vuelve a `Available` |

**Transitions**:

```
Locked      --[prereqs cumplidos]-->        Available
Available   --[queue ocupada]-->            Queued
Available   --[click Comprar]-->            InProgress   (debita balance, asigna slot)
Queued      --[queue libre]-->              Available
InProgress  --[duration alcanzada]-->       Complete     (commit transactional)
InProgress  --[click Cancelar]-->           Cancelled    (refund 50%, libera slot)
Cancelled   --[implícita]-->                Available
```

**Trigger points**:

- `Locked → Available`, `InProgress → Complete`: evaluados en cada **week-tick** (ADR-008).
- `Available → InProgress`, `InProgress → Cancelled`: instante del POST del usuario.
- `Available → Queued`, `Queued → Available`: instante del cambio de queue.

**Side effects de `Complete`** (todos en una transacción):

1. Incrementar contador correspondiente en `WorldState` (`stadium_upgrade_count` / `training_facility_level` / `youth_academy_level`).
2. Re-calcular `infrastructure_level` (city-progression §4.2).
3. Emitir evento a `cascade-engine` con NodeId delta.
4. Re-evaluar tier-up doble gate (§3.1.5).
5. Re-evaluar items `Locked` que ahora cumplan prereqs.
6. Si tier-up dispara: ejecutar city-progression transition (1.5s).
7. Si `stadium_visual_level` cambió: fade-in del nuevo sprite en `/stadium`.
8. Persistir staff message ("La obra de [nombre] ha terminado").

### 3.3 Interactions with Other Systems

| Sistema | Dirección | Interface |
|---|---|---|
| `economy.md` | read+write | reads `financial_balance` (prereq); write `-cost` on `Complete`, `+50% cost` on `Cancelled` |
| `cascade-engine.md` | write | emite `stadium_upgrade_count` / `training_facility_level` / `youth_academy_level` deltas como NodeIds; dispara cadenas (infraestructura → prestige, fan_satisfaction) |
| `city-progression.md` | provides gate input | expone `completed_items_per_level[N]` para evaluación de doble gate |
| `match-simulation.md` | provides capacity | expone `stadium_capacity = STADIUM_CAPACITY_BASE + Σ(items_gradas × CAPACITY_PER_GRADA_ITEM)` (§4) |
| `staff-system.md` | reads modifier | Director de Instalaciones skill modifica `duration_multiplier` (−20% a +30%, §4) |
| `manager-rpg.md` | reads modifier | Skill "Construction" T3+ modifica `cost_multiplier` (−15%) |
| `event-system.md` | reads | eventos especiales pueden ofertar reformas (e.g., "Empresario paga 50% de una grada") |
| `isometric-world.md` | provides sprites | expone `stadium_visual_level (0-9)` para renderer + `training_facility_visible` / `youth_academy_visible` para `/city` |
| `hud-ui.md` | UI consumer | `/stadium` consume catálogo + queue state; dashboard widget "Obra activa: N semanas" |

**Hard deps** (no funciona sin): economy, cascade-engine, city-progression, match-simulation.
**Soft deps** (enhanced si existen): staff-system, manager-rpg, event-system, isometric-world, hud-ui.

**Ownership de variables** (registry-bound):

| Variable | Owner | Consumidores |
|---|---|---|
| `stadium_upgrade_count` | **stadium-upgrades.md** | city-progression, cascade-engine |
| `training_facility_level` | **stadium-upgrades.md** | city-progression, cascade-engine, manager-rpg (entreno) |
| `youth_academy_level` | **stadium-upgrades.md** | city-progression, cascade-engine, player-management (cantera) |
| `stadium_capacity` | **stadium-upgrades.md** | match-simulation, economy (revenue) |
| `stadium_visual_level (0-9)` | **stadium-upgrades.md** (compute, no persist) | isometric-world |
| `infrastructure_level` | **city-progression.md** (compute) | cascade-engine |

## 4. Formulas

### F1: `stadium_visual_level(state) → 0..9`

Diez niveles visuales del estadio close-up, función del estado combinado de los 3 tracks-Estadio.

**Expression:**

```
svl_raw = (gradas_items / G_MAX) × W_g + (pitch_items / P_MAX) × W_p + (servicios_items / S_MAX) × W_s
stadium_visual_level = clamp(floor(svl_raw × 9.99), 0, 9)
```

**Variables:**

| Variable | Type | Default | Description |
|---|---|---|---|
| `gradas_items` | int | 0..G_MAX | Items `Complete` en track Estadio–Gradas |
| `pitch_items` | int | 0..P_MAX | Items `Complete` en track Estadio–Pitch |
| `servicios_items` | int | 0..S_MAX | Items `Complete` en track Estadio–Servicios |
| `G_MAX`, `P_MAX`, `S_MAX` | int | 8 / 8 / 8 | Items totales por track (canónico en catalog YAML) |
| `W_g`, `W_p`, `W_s` | float | 0.45 / 0.35 / 0.20 | Pesos visuales (invariante: W_g+W_p+W_s = 1.0) |

**Output Range:** 0 (nada construido) → 9 (todo completado).

**Monotonicidad garantizada**: cada término es no-decreciente al completarse items; `floor` preserva monotonicidad. **Computed value, no persisted** — re-calculado en cada render.

**Example:** Gradas 4/8, Pitch 6/8, Servicios 2/8:

```
svl_raw = (4/8 × 0.45) + (6/8 × 0.35) + (2/8 × 0.20)
        = 0.225 + 0.2625 + 0.05 = 0.5375
stadium_visual_level = floor(0.5375 × 9.99) = floor(5.37) = 5
```

**Rationale de los pesos:** Gradas dominan la silueta del estadio (45%); Pitch es la superficie visible desde la cámara (35%); Servicios son interiores/menos visibles desde fuera (20%).

---

### F2: `duration_weeks(item, director_skill?) → integer`

**Expression:**

```
multiplier = director_multiplier(skill)   // 1.0 si no hay director contratado
duration_weeks = clamp(round(DURATION_BASE[item.tier] × multiplier), DUR_MIN, DUR_MAX)
```

**Director multiplier (piecewise lineal):**

```
director_multiplier(skill):
  if no director hired:     return 1.0
  if skill >= 50:           return 1.0 - (skill - 50) × (1 - MULT_MIN) / 50    // skill 100 → 0.80
  else:                     return 1.0 + (50 - skill) × (MULT_MAX - 1.0) / 50  // skill 0 → 1.30
```

**Variables:**

| Variable | Type | Default | Description |
|---|---|---|---|
| `DURATION_BASE[tier]` | int | {1:2, 2:4, 3:6, 4:8} | Semanas base por tier |
| `skill` | int | 0..100 | Director de Instalaciones skill (0 si no hay) |
| `MULT_MIN` | float | 0.80 | Multiplier a skill=100 (−20% duración) |
| `MULT_MAX` | float | 1.30 | Multiplier a skill=0 (+30% duración) |
| `DUR_MIN` / `DUR_MAX` | int | 1 / 16 | Guard limits |

**Output Range:** 1 a 16 semanas. Práctica con tuning default: T1 = 1-2 sem, T2 = 3-5 sem, T3 = 4-7 sem, T4 = 6-10 sem.

**Snapshot al iniciar:** `duration_weeks` se computa en transición `Available → InProgress` y se persiste con el record de la obra. Cambios posteriores de skill/staff NO afectan obras en curso (§5.3, §5.4).

**Examples:**

- T3 item, skill 80: `multiplier = 1.0 - 30 × 0.20 / 50 = 0.88` → `round(6 × 0.88) = 5 semanas`
- T4 item, skill 15: `multiplier = 1.0 + 35 × 0.30 / 50 = 1.21` → `round(8 × 1.21) = 10 semanas`
- T1 item, no director: `multiplier = 1.0` → `round(2 × 1.0) = 2 semanas`

---

### F3: `infrastructure_level` — **SUPERSEDES `city-progression.md §4.2`**

⚠️ **Cross-system change**. La fórmula anterior daba `max = 200` con los nuevos counts (24/8/8 × 5), rompiendo el rango 0..100 esperado por `city-progression §3.3` (pitch surface thresholds) y `cascade-engine`. Esta GDD redefine la fórmula. Propagación pendiente en Fase 1.3 (`/propagate-design-change`).

**Expression:**

```
stadium_score   = stadium_upgrade_count / STADIUM_ITEMS_MAX     // 0..1
training_score  = training_facility_level / TRAINING_ITEMS_MAX  // 0..1
academy_score   = youth_academy_level / ACADEMY_ITEMS_MAX       // 0..1

infrastructure_level = clamp(
  round((stadium_score × W_STADIUM + training_score × W_TRAINING + academy_score × W_ACADEMY) × 100),
  0, 100
)
```

**Variables:**

| Variable | Default | Description |
|---|---|---|
| `STADIUM_ITEMS_MAX` | 24 | Suma items en 3 tracks-Estadio (canónico en catalog YAML) |
| `TRAINING_ITEMS_MAX` | 8 | Items en track Training Facility |
| `ACADEMY_ITEMS_MAX` | 8 | Items en track Youth Academy |
| `W_STADIUM` | 0.50 | Peso del grupo Estadio |
| `W_TRAINING` | 0.25 | Peso del grupo Training |
| `W_ACADEMY` | 0.25 | Peso del grupo Academy (invariante: W_* sum = 1.0) |

**Output Range:** 0..100 (integer).

**Comparison vs old formula at milestones:**

| State | Old formula (broken max=200) | New formula (correct max=100) |
|---|---|---|
| Nothing built | 0 | 0 |
| All T1 (6 stadium, 2 training, 2 academy) | (6+2+2)×5 = 50 | round((6/24×0.50 + 2/8×0.25 + 2/8×0.25)×100) = 25 |
| All T2 (12, 4, 4) | (12+4+4)×5 = 100 (clamped) | round((12/24×0.50 + 4/8×0.25 + 4/8×0.25)×100) = 50 |
| Stadium full only (24, 0, 0) | 120 (clamped) | round((1.0 × 0.50)×100) = 50 |
| Everything complete | 200 (clamped) | 100 |

**Pitch surface thresholds re-validated** (city-progression §3.3 — sin cambios necesarios):

- 0-19: Dry (tierra) → pre-T1 / muy early build
- 20-50: Patchy → mid-development (T2 era)
- 50-80: Healthy → established club (T3 era)
- 80-100: Pristine → near T4 complete

**Example:** stadium full (24/24), training half (4/8), academy quarter (2/8):

```
infrastructure_level = round((1.0 × 0.50 + 0.5 × 0.25 + 0.25 × 0.25) × 100)
                     = round((0.50 + 0.125 + 0.0625) × 100) = round(68.75) = 69
→ Pitch state: Healthy (50-80) ✅
```

---

### F4: `cost_of_item(item) → €K`

**Expression:**

```
base_cost = BASE_COST_TIER[item.tier] × TRACK_MULTIPLIER[item.track]

// Modifiers (aplicados en BUY time, no retroactivos):
final_cost = base_cost
             × (1 - CONSTRUCTION_SKILL_DISCOUNT if manager.skill["Construction"] >= 3 else 0)
             × (1 - event_subsidy_pct if active STADIUM_OFFER accepted else 0)
```

**Variables:**

| Tier | BASE_COST_TIER (€K) |
|---|---|
| T1 | 15 |
| T2 | 55 |
| T3 | 130 |
| T4 | 340 |

| Track | TRACK_MULTIPLIER |
|---|---|
| Estadio – Gradas | 1.40 |
| Estadio – Pitch | 0.80 |
| Estadio – Servicios | 0.90 |
| Training Facility | 1.10 |
| Youth Academy | 1.00 |

| Modifier | Value | Source |
|---|---|---|
| `CONSTRUCTION_SKILL_DISCOUNT` | 0.15 | Manager-RPG T3+ "Construction" skill |
| `event_subsidy_pct` | 0..1 | Variable, por payload de evento STADIUM_OFFER |

**Output Range:** 12€K (T1 pitch, sin modifier) → 476€K (T4 gradas, sin modifier). Con modifiers acumulables, mínimo posible ~10€K.

**Rationale:**

- **Tier growth ~3× per tier** (sub-exponential): mantiene la sensación de "semanas de ahorro" constante entre tiers — un T4 cuesta ~3× un T3, igual que T2 cuesta ~3× T1.
- **Track multiplier** refleja realidad de ingeniería civil: Gradas (hormigón/acero/certificación) > Training (equipo especializado) > Academy (baseline residencial) > Servicios (interior fit-out) > Pitch (materiales/mano de obra).
- **Gradas multiplier 1.40 es el lever del payback** de §2 Capa 3 ("8 partidos"). Ver F5 para validación.

**Examples:**

- T1 Gradas N1 ("Grada N/S hormigón"): `15 × 1.40 = 21€K`
- T2 Pitch N2 ("Césped uniforme"): `55 × 0.80 = 44€K`
- T3 Servicios N3 ("Vestuarios 2 plantas"): `130 × 0.90 = 117€K`
- T4 Gradas N4 ("Cubierta total"): `340 × 1.40 = 476€K`
- T4 Gradas con Manager Construction T3 + 30% subsidy: `476 × 0.85 × 0.70 = 283€K`

---

### F5: `stadium_capacity(state, division) → integer asientos`

**Expression:**

```
stadium_capacity = STADIUM_CAPACITY_BASE[division]
                 + Σ over completed Gradas items: CAPACITY_PER_GRADA_ITEM[item.tier]
```

**Variables:**

| Variable | Value | Source |
|---|---|---|
| `STADIUM_CAPACITY_BASE[D2]` | 6,000 | economy.md F1 (autoritative) |
| `STADIUM_CAPACITY_BASE[D1]` | 12,000 | economy.md F1 (autoritative) |
| `CAPACITY_PER_GRADA_ITEM[N1]` | 700 | Per item completed en nivel N1 |
| `CAPACITY_PER_GRADA_ITEM[N2]` | 1,100 | Per item nivel N2 |
| `CAPACITY_PER_GRADA_ITEM[N3]` | 2,000 | Per item nivel N3 |
| `CAPACITY_PER_GRADA_ITEM[N4]` | 2,700 | Per item nivel N4 |

**Output Range:**

| Estado | Capacity |
|---|---|
| D2, no upgrades | 6,000 |
| D2, todos 8 Gradas items | 6,000 + (2×700+2×1100+2×2000+2×2700) = 19,000 |
| D1, no upgrades | 12,000 |
| D1, todos 8 Gradas items | 12,000 + 13,000 = 25,000 ← target city-progression T4 visual |

**Rationale tiered capacity:** Items T3-T4 contribuyen más capacity para "late-game acceleration" que se siente como salto narrativo (gradas cubiertas + palco son visualmente más impactantes que hormigón básico). N1+N2 = +3,600 (small bumps); N3+N4 = +9,400 (sensación de "el estadio explota en tamaño").

**Payback validation (Capa 3 — "se paga sola en 8 partidos"):**

Scenario: D2 mid-season, balance ~200€K, compra T2 Gradas item, 80% attendance, ticket price 12€.

- Cost: `55 × 1.40 = 77€K`
- Marginal revenue per home match: `0.80 × 1,100 × 12 / 1,000 = 10.56 €K/match`
- Payback: `77 / 10.56 = 7.3 matches` ≈ **"8 partidos"** ✅

---

### F6: Tier-up gate (segundo gate de city-progression)

**Expression:**

```
items_required(level)  = ceil(items_in_level(level) × TIER_UP_GATE_PCT)
tier_up_ready(level)   = completed_items_count(level) >= items_required(level)
```

**Variables:**

| Variable | Default | Description |
|---|---|---|
| `TIER_UP_GATE_PCT` | 0.70 | Fracción de items del nivel requerida |
| `items_in_level(level)` | computed | Query al catalog YAML por `level == N` |
| `completed_items_count(level)` | computed | Player state query, items con status=`Complete` AND `level == N` |

**Example:** Nivel 2 catalog tiene 10 items → `items_required(2) = ceil(10 × 0.70) = 7`. Player con 7+ items level-2 `Complete` → este sub-gate satisfecho. Tier-up dispara cuando **TAMBIÉN** se cumplen métricas de city-progression §3.2.

---

### Conflict report (registry pending update)

⚠️ `design/registry/entities.yaml` formula `match_day_revenue` (line ~228) tiene nota: *"D3 defaults: capacity=3000"*. **Esto es stale** — D3 quedó fuera del MVP. Los valores reales son D2=6,000 y D1=12,000 (economy.md F1). Pendiente: actualizar la nota del registry en Fase 1.3.

**Nuevas registry entries pendientes** (post-Fase 1.3):

- `stadium_upgrade_count` (entity/counter) — owner: stadium-upgrades.md
- `training_facility_level` (entity/counter) — owner: stadium-upgrades.md
- `youth_academy_level` (entity/counter) — owner: stadium-upgrades.md
- `stadium_capacity` (computed) — owner: stadium-upgrades.md
- `stadium_visual_level` (computed, 0-9) — owner: stadium-upgrades.md
- `infrastructure_level` (formula) — owner: shifted from city-progression.md to **co-owned** (city-progression compute, stadium-upgrades inputs)
- Constants: `BASE_COST_TIER`, `TRACK_MULTIPLIER`, `CAPACITY_PER_GRADA_ITEM`, `DURATION_BASE`, `TIER_UP_GATE_PCT`, `STADIUM_ITEMS_MAX`, `TRAINING_ITEMS_MAX`, `ACADEMY_ITEMS_MAX`, `W_VISUAL_*`, `W_INFRA_*`

## 5. Edge Cases

### 5.1 Cancelación mid-obra

Cubierto en §3.1.6 — refund **50% del cost original**, inmediato. Si player cancela en la última semana, refund sigue siendo 50% (no escala con progreso restante; feature simple).

### 5.2 Quiebra durante obra activa

Si `financial_balance < BANKRUPTCY_BALANCE_FLOOR` (−500€K, economy.md F4) mientras hay obra `InProgress`, la obra **se pausa** (no progresa, no consume cost adicional). Player puede:
- Recuperar `balance > 0` → obra resume automáticamente en el siguiente week-tick.
- Cancelar manualmente → refund 50% del cost original.
- Esperar indefinidamente — la obra queda en estado virtual `InProgress(paused)` sin avanzar.

### 5.3 Director de Instalaciones cambia mid-obra

El `duration_multiplier` se **snapshotea al iniciar la obra** (transición `Available → InProgress`). Cambiar de staff o subir su skill DURANTE una obra NO la afecta. Aplicará sólo a obras futuras.

### 5.4 Manager-RPG "Construction" skill desbloqueada mid-game

El `cost_multiplier` se evalúa en el momento de la compra. Items futuros se compran con descuento; items ya `InProgress` o `Complete` mantienen su cost original. **No retroactivo.**

### 5.5 Bypass de prereq de track

**No posible**. §3.1.3 prereq #1 enforza que ≥1 item del nivel previo del MISMO track esté `Complete` antes de comprar N+1. Si player intenta saltar via API (POST con `item.tier=4` sin items del track anteriores), el server rechaza con HTTP 400 `INVALID_PREREQ`.

### 5.6 Track prereq satisfecho por items completados hace mucho

Items completados son monotónicos (§3.1.7). Si player completó 1 item T1 hace 10 temporadas y nunca volvió al track, el prereq de N2 sigue válido. **No hay expiración** de prereqs.

### 5.7 Bankruptcy + degradación visual

Cubierto en §3.1.7 — visuales degradan pero items NO se eliminan del registro. `stadium_visual_level` retrocede en `BANKRUPTCY_VISUAL_DECAY` puntos (clamp 0..9). Recuperación restaura. Counter `stadium_upgrade_count` etc. **NO se modifica** — sólo el visual.

### 5.8 Catálogo evolution (post-launch patches)

Items nuevos añadidos en patches futuros llevan `available_from_version`. Tier-up gate (§3.1.5) usa **N = items del nivel disponibles en la versión activa al momento del cálculo**. Player que estaba en N=10 pre-patch y ahora N=12 post-patch ve su X re-calculado (~70% de 12 = 8.4 → 9). Surface en patch notes.

### 5.9 Event-system: reforma subsidiada

Cuando `event-system.md` emite payload `STADIUM_OFFER` con `target_item_id` + `subsidy_pct`, aceptar el evento reduce el cost en el momento del BUY (descuento aplicado al iniciar obra). Si player rechaza, el item se puede comprar después normalmente sin descuento.

### 5.10 Subsidy event mientras hay obra InProgress

Solo 1 obra a la vez (§3.1.4). Eventos `STADIUM_OFFER` que apuntan a items distintos del actual `InProgress` quedan pendientes hasta que el slot libere — o expira el TTL del evento (gestionado por event-system.md).

### 5.11 Player en city tier T2 completa items N4

Perfectamente válido. §3.1.3 permite comprar items de cualquier tier mientras los prereqs de track se cumplan (no hay city-tier prereq). Items completados se mantienen monotónicos. Tier-up dispara sólo cuando AMBOS gates (métricas + reformas) se satisfacen.

### 5.12 Player completa TODOS los items del nivel sin disparar tier-up

Items completados quedan en `Complete`. Gate de reformas (§3.1.5) está satisfecho (X = X). Player espera a que las métricas también lleguen al threshold. En el momento en que crucen, city-progression dispara tier-up sin re-evaluar reformas (ya están satisfechas).

### 5.13 Race condition: dos POST /api/stadium/buy simultáneos

Server gestiona via row-level lock en `WorldState.active_upgrade_id` (DB constraint UNIQUE WHERE active_upgrade_id IS NOT NULL). El segundo POST falla con HTTP 409 `SLOT_OCCUPIED`. Cliente debe re-fetch state.

### 5.14 Items requeridos en patch removidos del catálogo

**No permitido** — política: items publicados son inmortales. Si un item es problemático balance-wise, se ajusta cost/duration, no se borra. Items "deprecados" se mantienen en el catalog YAML con flag `deprecated: true` (no comprables nuevos, pero los completados cuentan para gates).

### 5.15 UX guard: BUY que llevaría a balance crítico

Si en el momento del BUY se cumple `financial_balance - final_cost < economy CRITICAL_THRESHOLD`, el botón muestra **warning de confirmación** ("Esta compra dejará tu club en estado de riesgo financiero. ¿Confirmar?") en lugar de proceder directamente. **Es UX guard, NO hard block** — un jugador con perfil "investor racional" (§2 Capa 3) puede aceptar el riesgo conscientemente. El servidor procesa el BUY si el cliente confirma (segundo POST con flag `accept_risk: true`).

### 5.16 Refund clasificación contable

El refund 50% de cancelación se clasifica como **"extraordinary income"** en economy.md F-revenue-flow — **NO se incluye en `weekly_income_projection`** ni en `financial_state` smoothing. Esto evita el exploit "comprar T4 → cancelar inmediato → liquidez ficticia" para escapar de Crisis state. (Resolved per economy-designer recommendation, OQ-SU-9.)

## 6. Dependencies

| Sistema | Dirección | Hard/Soft | Interface |
|---|---|---|---|
| `economy.md` | read + write | **HARD** | reads `financial_balance` (prereq + critical-threshold UX guard, §5.15); writes `-cost` on `Complete`, `+50% cost` on `Cancelled` |
| `cascade-engine.md` | write | **HARD** | emite deltas de 3 NodeIds (`stadium_upgrade_count`, `training_facility_level`, `youth_academy_level`); cascade-engine dispara cadenas downstream (infraestructura → prestige, fan_satisfaction) |
| `city-progression.md` | provides input + supersedes §4.2 | **HARD** | expone `completed_items_per_level[N]` para segundo gate de tier-up; **redefine** `infrastructure_level` formula (F3) — propagación pendiente Fase 1.3 |
| `match-simulation.md` | provides capacity | **HARD** | expone `stadium_capacity` que match-sim consume como `fixture.capacity` (reemplaza referencia directa a `STADIUM_CAPACITY_BASE`) |
| ADR-005 (WorldState persistence) | extends | **HARD** | nuevos campos en snapshot: `stadium_upgrade_count`, `training_facility_level`, `youth_academy_level`, `active_upgrade_id`, `weeks_remaining`, `completed_items[]` |
| ADR-008 (World Clock) | reads | **HARD** | week-tick gobierna re-evaluación de `Locked → Available` y countdown `InProgress → Complete` |
| ADR-014 (canvas pipeline) | provides sprites | **HARD** (v1.1+) | 10 sprites por `stadium_visual_level` para `/stadium` close-up; sprites Training/Academy visibles en `/city` |
| `staff-system.md` | reads modifier | SOFT | Director de Instalaciones skill modifica `duration_multiplier` (−20% a +30%, F2) |
| `manager-rpg.md` | reads modifier | SOFT | Skill "Construction" T3+ aplica `CONSTRUCTION_SKILL_DISCOUNT = 0.15` al cost (F4) |
| `event-system.md` | reads | SOFT | eventos `STADIUM_OFFER` con `target_item_id` + `subsidy_pct` reducen cost al BUY |
| `isometric-world.md` | provides sprites | SOFT (v1.1+) | renderer consume `stadium_visual_level (0-9)` + `training_facility_visible` + `youth_academy_visible` |
| `hud-ui.md` | UI consumer | SOFT | `/stadium` route consume catálogo + queue state + close-up sprite; dashboard widget "Obra activa: N semanas restantes" |

### Bidirectional consistency requirements (propagation pending — Fase 1.3)

| Target GDD | Required change |
|---|---|
| `city-progression.md` | (a) §3.2 Tier triggers: añadir doble gate `+ reformas requeridas completadas` por nivel; (b) §4.2 formula: reemplazar por F3 de esta GDD; (c) §6 Dependencies: añadir `stadium-upgrades.md` como writer de `infrastructure_level` inputs |
| `economy.md` | F-revenue-flow: añadir `stadium-upgrades.md` como source de `stadium_capacity` (no más referencia directa a `STADIUM_CAPACITY_BASE` desde match-sim) |
| `cascade-engine.md` | NodeId registry: añadir 3 nuevos NodeIds como writeable (`stadium_upgrade_count`, `training_facility_level`, `youth_academy_level`) |
| `match-simulation.md` | F-attendance/F-revenue: `fixture.capacity` source = `stadium_capacity` (no `STADIUM_CAPACITY_BASE`) |
| `staff-system.md` | Director de Instalaciones role definition + skill stat |
| `manager-rpg.md` | Skill "Construction" T3+ effect: `CONSTRUCTION_SKILL_DISCOUNT` aplicado en cost de stadium upgrades |
| `event-system.md` | Variant `STADIUM_OFFER` payload schema: `{ target_item_id, subsidy_pct, ttl_weeks }` |
| `design/registry/entities.yaml` | (a) update stale STADIUM_CAPACITY_BASE note (D3→D2/D1); (b) añadir ~15 nuevas entries (counters, computed, constants — ver §4 closeout) |

## 7. Tuning Knobs

Todos los valores son configurables en runtime via `config.stadiumUpgrades` (DB tabla `feature_config`, leído al boot del server). Cambios no requieren redeploy.

### 7.1 Cost knobs (F4)

```typescript
BASE_COST_TIER = { 1: 15, 2: 55, 3: 130, 4: 340 }  // €K
TRACK_MULTIPLIER = {
  gradas:    1.40,
  pitch:     0.80,
  servicios: 0.90,
  training:  1.10,
  academy:   1.00,
}
CONSTRUCTION_SKILL_DISCOUNT = 0.15  // Manager-RPG T3+ "Construction"
CANCEL_REFUND_PCT = 0.50
```

**Safe ranges:**
- `BASE_COST_TIER[1]` ∈ [10, 25] €K — fuera trivializa D2 o lo bloquea
- `BASE_COST_TIER[4]` ∈ [250, 400] €K — fuera trivializa T4 o lo hace inalcanzable
- `TRACK_MULTIPLIER[*]` ∈ [0.5, 2.0] — fuera distorsiona payback de F5

### 7.2 Duration knobs (F2)

```typescript
DURATION_BASE = { 1: 2, 2: 4, 3: 6, 4: 8 }  // semanas
DIRECTOR_MULT_MIN = 0.80   // skill 100 → −20% duración
DIRECTOR_MULT_MAX = 1.30   // skill 0   → +30% duración
DUR_MIN = 1
DUR_MAX = 16
```

**Safe ranges:**
- `DURATION_BASE[4]` ∈ [6, 12] — <6 sin peso narrativo, >12 frustración
- `DIRECTOR_MULT_*` rango total <0.50 a >2.0 → desconecta del staff-system

### 7.3 Capacity knobs (F5)

```typescript
CAPACITY_PER_GRADA_ITEM = { N1: 700, N2: 1100, N3: 2000, N4: 2700 }  // asientos
```

**Safe ranges:**
- Suma de los 8 items ∈ [10000, 16000] asientos — fuera rompe payback Capa 3 o el techo visual T4 de 25,000 (D1)

### 7.4 Visual knobs (F1)

```typescript
G_MAX = 8     // catalog max Gradas items
P_MAX = 8     // catalog max Pitch items
S_MAX = 8     // catalog max Servicios items

W_VISUAL_GRADAS    = 0.45
W_VISUAL_PITCH     = 0.35
W_VISUAL_SERVICIOS = 0.20
// Invariant: W_VISUAL_* sum to 1.0
```

### 7.5 Infrastructure level knobs (F3 — superseding city-progression §4.2)

```typescript
STADIUM_ITEMS_MAX  = 24   // 3 tracks-Estadio × 8 items
TRAINING_ITEMS_MAX = 8
ACADEMY_ITEMS_MAX  = 8

W_INFRA_STADIUM  = 0.50
W_INFRA_TRAINING = 0.25
W_INFRA_ACADEMY  = 0.25
// Invariant: W_INFRA_* sum to 1.0
```

### 7.6 Tier-up gate knobs (F6)

```typescript
TIER_UP_GATE_PCT = 0.70  // 70% items level requeridos
```

**Safe ranges:**
- `TIER_UP_GATE_PCT` ∈ [0.50, 0.90] — <0.50 trivializa el gate (cualquier compra basta); >0.90 hace casi obligatorio completar todo

### 7.7 Bankruptcy knobs

```typescript
BANKRUPTCY_BALANCE_FLOOR    = -500    // €K (mirror economy.md F4)
BANKRUPTCY_VISUAL_DECAY     = 3       // visual_level retrocede en N puntos
BANKRUPTCY_RECOVERY_MODE    = "instant"  // o "gradual" (1 visual/week) — OQ-SU-4
```

### 7.8 UX guard knobs

```typescript
CRITICAL_THRESHOLD_WARNING_ENABLED = true  // §5.15: warning si balance - cost < economy CRITICAL_THRESHOLD
```

## 8. Acceptance Criteria

| ID | Criterion | Test type |
|---|---|---|
| AC-SU-01 | Catálogo define 5 tracks (Gradas, Pitch, Servicios, Training, Academy) | Unit (config) |
| AC-SU-02 | Cada track tiene 4 niveles | Unit (config) |
| AC-SU-03 | Total items en catalog ~40 (G+P+S = 24, Training = 8, Academy = 8) | Unit (config) |
| AC-SU-04 | Item está `Available` sólo si prereqs §3.1.3 cumplidos (track prev + balance + queue free) | Unit |
| AC-SU-05 | **GIVEN** un item N+1, **WHEN** ningún item del nivel previo del mismo track está `Complete`, **THEN** POST `/api/stadium/buy` → HTTP 400 `INVALID_PREREQ` | Integration |
| AC-SU-06 | **GIVEN** un item `InProgress`, **WHEN** POST `/api/stadium/buy` segundo item, **THEN** HTTP 409 `SLOT_OCCUPIED` | Integration |
| AC-SU-07 | **GIVEN** item `InProgress`, **WHEN** POST `/api/stadium/cancel`, **THEN** balance += 50% original cost, slot libre, item `Available` | Integration |
| AC-SU-08 | **GIVEN** item `Complete`, **THEN** contador correspondiente (`stadium_upgrade_count` / `training_facility_level` / `youth_academy_level`) incrementa en 1 | Unit |
| AC-SU-09 | F1: `stadium_visual_level` ∈ integer 0..9 para cualquier estado válido | Property test |
| AC-SU-10 | F1: Gradas 4/8, Pitch 6/8, Servicios 2/8 → `visual_level = 5` | Unit (example) |
| AC-SU-11 | F1: monotónico — completar 1 item ⇒ `visual_level_new >= visual_level_old` | Property test |
| AC-SU-12 | F2: T3 item, director skill 80 → `duration_weeks = 5` | Unit |
| AC-SU-13 | F2: T1 item, no director → `duration_weeks = 2` | Unit |
| AC-SU-14 | F2: T4 item, director skill 15 → `duration_weeks = 10` | Unit |
| AC-SU-15 | F2: `duration_weeks` snapshoteado en BUY; cambios de skill durante obra NO modifican `weeks_remaining` | Integration |
| AC-SU-16 | F3: `infrastructure_level` ∈ integer 0..100 para cualquier estado válido | Property test |
| AC-SU-17 | F3: stadium 24/24, training 4/8, academy 2/8 → `infrastructure_level = 69` | Unit (example) |
| AC-SU-18 | F4: T2 Gradas item → `cost = 77€K` (sin modifiers) | Unit |
| AC-SU-19 | F4: Manager Construction T3 aplica × 0.85 al cost en BUY (no retroactivo) | Integration |
| AC-SU-20 | F5: D2 + 0 upgrades → `stadium_capacity = 6,000` | Unit |
| AC-SU-21 | F5: D1 + todos 8 Gradas items → `stadium_capacity = 25,000` | Unit |
| AC-SU-22 | F5: match-simulation consume `stadium_capacity` como `fixture.capacity` (no `STADIUM_CAPACITY_BASE` directo) | Integration |
| AC-SU-23 | F6: Level 2 con 10 items en catalog → `items_required = 7` | Unit |
| AC-SU-24 | **GIVEN** métricas city-progression nivel N cumplidas Y items requeridos nivel N completados, **THEN** city-progression tier-up dispara | Integration |
| AC-SU-25 | **GIVEN** métricas cumplidas pero items requeridos NO completados, **THEN** tier-up NO dispara | Integration |
| AC-SU-26 | **GIVEN** items completados pero métricas NO cumplidas, **THEN** tier-up NO dispara | Integration |
| AC-SU-27 | Bankruptcy: `visual_level` retrocede en `BANKRUPTCY_VISUAL_DECAY` puntos; counters NO se modifican | Integration |
| AC-SU-28 | Bankruptcy recovery: `visual_level` restaurado a valor pre-bankruptcy | Integration |
| AC-SU-29 | **GIVEN** obra `InProgress`, **WHEN** bankruptcy dispara, **THEN** obra `paused`; **WHEN** balance > 0 next tick, **THEN** obra resume | Integration |
| AC-SU-30 | Event `STADIUM_OFFER` aceptado: `subsidy_pct` aplicado al BUY del item target | Integration |
| AC-SU-31 | Determinismo F1+F3: misma input state → mismo output (sin Math.random) | Property test |
| AC-SU-32 | Persistencia: items completados sobreviven server restart (DB snapshot integrity) | Integration (real DB) |
| AC-SU-33 | UI `/stadium`: catálogo muestra estados Locked/Available/Queued/InProgress/Complete correctamente | UI test |
| AC-SU-34 | UI `/stadium`: sprite del `stadium_visual_level` actual visible inmediatamente tras `Complete` (sin necesidad de refresh) | UI test |
| AC-SU-35 | Side effect: `Complete` dispara re-eval de items `Locked` → `Available` que ahora cumplan prereqs | Integration |
| AC-SU-36 | Race condition: dos POST simultáneos `/api/stadium/buy` → segundo HTTP 409 (DB-level UNIQUE WHERE active) | Integration |
| AC-SU-37 | Performance: `/stadium` page-load <500ms con catálogo de 40 items + sprite tier-aware | Perf |
| AC-SU-38 | DOM fallback: si canvas pipeline no disponible (MVP), lista textual del catálogo + sprite visible (a11y) | A11y |
| AC-SU-39 | Refund classification: cancellation refund NO cuenta en `weekly_income_projection` (economy.md edge case requerido) | Integration |
| AC-SU-40 | UX guard: si `balance - cost < economy CRITICAL_THRESHOLD`, BUY button muestra warning antes de confirmar | UI test |

## 9. Open Questions

| ID | Question | Bloqueante para | Owner |
|---|---|---|---|
| OQ-SU-1 | ¿Catálogo permite personalización por club (nombres locales, kit-color en sprites)? | v1.2+ feature, NO bloqueante para v1.1 | art-director |
| OQ-SU-2 | ¿UI muestra "estimated completion week" absoluta o sólo "X semanas restantes"? | hud-ui.md `/stadium` spec (Sprint 22-23) | ux-designer |
| OQ-SU-3 | ¿Items completados generan staff messages distintos por tier (más narrativos)? | staff-system.md template extension | narrative-director |
| OQ-SU-4 | ¿Quiebra recovery restaura visuales **instant** o **gradual** (1 visual por semana)? Default actual: `BANKRUPTCY_RECOVERY_MODE = "instant"` | Tuning playtest | game-designer |
| OQ-SU-5 | ¿"Reformas requeridas" para tier-up es flag estático del catalog YAML o cálculo dinámico X de N por `TIER_UP_GATE_PCT`? Decisión: **cálculo dinámico** (F6) — pero requiere que ALL items dentro del nivel cuenten igual. ¿Es deseable? | Catalog schema | systems-designer |
| OQ-SU-6 | ¿Director de Instalaciones max range +30% adecuado, o más generoso (+50%) para clubs sin staff técnico? | Balance — playtest | systems-designer + game-designer |
| OQ-SU-7 | ¿Reformas pueden "obsolescer" entre sí? (e.g., completar "Cubierta total" obsolesce "Cubierta N", "Cubierta S") | Catalog design — probable NO | game-designer |
| OQ-SU-8 | ¿T4 items deben tener prereq adicional de "city tier T3 ya alcanzado"? Recomendación economy-designer: SÍ, para evitar trivializar late-game. Decisión actual: NO (consistencia con §3.1.3). Re-evaluar post-playtest. | Balance | game-designer + economy-designer |
| OQ-SU-9 | ¿Refund de cancelación clasifica como "extraordinary income" (no proyectable) o "operational refund" (proyectable)? Recomendación economy-designer: extraordinary. | economy.md F-revenue-flow edge case | economy-designer |
| OQ-SU-10 | ¿Catálogo MVP final tiene exactamente 40 items o variable? **Lock catalog YAML** antes de implementar para que `STADIUM_ITEMS_MAX` constants sean correctos. | Implementation Sprint 22 | game-designer |
| OQ-SU-11 | ¿Asymmetric per-level CAPACITY (vs flat) introduce variantes de stadium con composición distinta de Gradas (e.g., 2 N1 + 2 N4 vs 8 N2)? ¿Es esto desire feature o bug? | Playtest emergent | game-designer |
| OQ-SU-12 | ¿La transition visual de un Complete (per-reforma feedback en `/stadium`) usa cross-fade del sprite anterior al nuevo, o el sprite nuevo "aparece" con fade-in solo? | art-bible spec | art-director |

### Resolved (during specialist consultation 2026-05-24)

- ✅ **STADIUM_CAPACITY_BASE conflict**: stale registry note (D3=3000) — los valores reales son D2=6000, D1=12000 (economy.md F1).
- ✅ **city-progression §4.2 formula break**: superseded por F3 (normalized weighted sum, max=100).
- ✅ **W_VISUAL distribución**: 0.45/0.35/0.20 — Gradas dominan silueta, Pitch surface visible, Servicios interior.
- ✅ **TRACK_MULTIPLIER**: Gradas (1.40) > Training (1.10) > Academy (1.00) > Servicios (0.90) > Pitch (0.80) — refleja realidad construcción.
- ✅ **Director multiplier piecewise**: skill≥50 → 0.80..1.00, skill<50 → 1.00..1.30 (asymmetric bounds preserved).
- ✅ **Payback validation**: T2 Gradas in D2 paga en 7.3 partidos ≈ "~8 partidos" Capa 3 §2.

---

## Cross-references

- `design/gdd/city-progression.md` — consumer of `infrastructure_level`, `stadium_upgrade_count`; tier triggers ahora con doble gate (métricas + reformas completadas)
- `design/gdd/economy.md` — `STADIUM_CAPACITY_BASE`, `financial_balance` sink
- `design/gdd/cascade-engine.md` — `prestige`, `fan_base` (read), potential writers from this system
- `design/gdd/match-simulation.md` — fixture.capacity feed
- `design/gdd/isometric-world.md` — tier sprites consumer (10 niveles visuales)
- `apps/web/src/routes/stadium/+page.svelte` — UI scaffolding placeholder (Sprint 23+ unlocks)
