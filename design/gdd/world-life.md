# World Life — Game Design Document

> **Status**: 🟡 **In Progress** (v1.1 design draft — autopilot 2026-05-21, Pablo decision)
> **Layer**: Presentation (Animation / Behavior layer above isometric-world.md)
> **Owner**: technical-artist + game-designer + ux-designer
> **Pillar**: B — *Mundo Isométrico Vivo* / *The World Is The Scoreboard*
> **Engine binding**: PixiJS 8 via ADR-021
> **ADR refs**: ADR-021 (canvas pipeline), ADR-022 (day-night + weather), ADR-024 (a11y)
> **Cross-ref**: `design/art/art-bible.md` §1.2 Principio 4 (revisado 2026-05-21), §6.3 props
> **Scope**: v1.1 (post-MVP)

---

## 1. Overview

`world-life.md` define la **vida ambient en movimiento** del mundo isométrico:
peatones individuales, ciclistas, patinetes, coches, perros con dueño. Es la
capa que distingue una ciudad muerta de una ciudad habitada — el Pilar 2 hecho
de píxeles que se mueven.

Vive sobre `isometric-world.md` (que define grid + camera + asset loader) y
city-progression.md (que define qué tier está activo). NPCs y vehículos
ambient aparecen en función del tier + tiempo + clima + estado del club.

**Decisión Pablo 2026-05-21**: el Art Bible Principio 4 original ("nada se
mueve sin razón simulada") se ha suavizado. Vida ambient SIN rol simulado
está permitida, sujeta a presupuestos + reglas de density (§3, §7).

---

## 2. Player Fantasy

> *"Miro la ciudad y veo gente. No tantas como en un metro de Tokyo — somos
> un pueblo pequeño. Pero hay una abuela paseando al perro, un chaval en
> patinete que casi se choca con un ciclista, un coche que llega al bar de
> la plaza. De noche, todo se calma. Sólo el bar tiene luz y se ven dos
> sombras sentadas dentro. Cuando llueve, los patines desaparecen y aparecen
> paraguas. **No 'simula nada' específico — pero la ciudad existe sin mí.**"*

Anclajes a Pilares:

- **Pilar 2 (World Is The Scoreboard)**: la cantidad de vida ambient ES un
  indicador del estado del club. T1 (Pueblo Olvidado) tiene casi nada; T4
  (Imperio Local) está lleno de gente porque el club ha traído prosperidad.
- **Pilar 4 (Calm Is The Tempo)**: presupuesto duro evita "ciudad caótica
  estilo GTA". La densidad nunca compite con la atención del jugador en
  la HUD ni con los NPCs funcionales.
- **Pilar 1 (Tinkering)**: cambios sutiles (más bicis = barrio remodelado;
  perro = vecino que se queda) son descubribles, no expuestos.

---

## 3. Detailed Rules

### 3.1 Catálogo de entidades ambient (Clase C)

Inventario de los sprites móviles. Cada uno con sprite spec del Art Bible §5/§6.

| Tipo | Subtipo | Sprite size | Velocidad (px/s @ z=1) | Notas |
|------|---------|-------------|------------------------|-------|
| **Peatón solo** | walker | 16×24 chibi | 12 | Adulto neutro, 4 variantes de paleta |
| **Peatón con prisa** | walker-fast | 16×24 | 24 | Inclinación 5° forward |
| **Peatón con perro** | walker-dog | 16×24 + 8×6 perro | 10 | Perro 1 paso por detrás, correa visible (1px) |
| **Peatón con compra** | walker-bag | 16×24 + bolsa 4×4 | 11 | Bolsa lateral, ocasional bag-swap animation |
| **Ciclista** | cyclist | 18×22 | 32 | Bici 12×8, ruedas con rotación 2-frame |
| **Patinete eléctrico** | scooter-e | 14×24 | 36 | Sin sonido (Pilar 4) |
| **Patines en línea** | rollerblader | 16×24 | 28 | Animación 3-frame loop |
| **Coche genérico** | car-generic | 24×16 | 20 | Color random de 5 paletas neutras |
| **Coche del club** | car-club | 24×16 | 22 | `--club-primary` accent stripe |
| **Bus de visitantes** | bus-away | 36×18 | 14 | Solo en matchday, away-team color stripe |
| **Furgoneta de reparto** | van-delivery | 28×16 | 16 | Logo genérico de empresa local |

**No se incluye en v1.1**:
- Motos (ruido visual + complejidad de sprite); → v1.3+
- Helicópteros / drones (gimmick); prohibido permanentemente
- Animales sueltos (gatos, palomas); → Pilar 4 las excluye
- Niños solos sin adulto (consideración social); el adulto-con-perro cubre

### 3.2 Paths (rutas de movimiento)

Cada entidad sigue un **path predefinido**: una lista de tiles ordenados de
entrada → salida del mapa. Los paths se calculan al cargar la ciudad y se
cachean — no hay pathfinding A* en runtime (overkill para v1.1).

**Tipos de path**:

- **Calle principal**: borde del mapa → plaza estadio → borde opuesto (5-8 tiles)
- **Calle secundaria**: borde del mapa → comercio → borde (4-6 tiles)
- **Camino diagonal**: cruza la ciudad de esquina a esquina (8-12 tiles)
- **Loop interno**: pequeño círculo en plaza central (vuelve al spawn)

Cada path tiene un **`speed multiplier`** asignado: paths principales más
rápidos (cars), secundarios más lentos (peatones).

**Catalogación**: paths se definen en `data/world-paths.json` (data-driven,
fácil de editar sin recompilar). Schema:

```json
{
  "paths": [
    {
      "id": "main-street-north",
      "tiles": [[0, 32], [10, 32], [20, 32], [32, 32], [44, 32]],
      "type": "calle-principal",
      "speedMultiplier": 1.0,
      "minTierRequired": 1,
      "supportedEntities": ["walker", "cyclist", "car-generic", "car-club"]
    }
  ]
}
```

### 3.3 Spawning rules

Cada tile-tick (cada 2s de wall-clock, no game-tick) corre el spawn evaluator:

1. Si total entidades activas >= `MAX_ENTITIES_ACTIVE` (40): skip.
2. Si total entidades en pantalla >= `MAX_ENTITIES_ON_SCREEN` (20): skip.
3. Roll deterministic per path: `pSpawn = baseSpawnRate * tierMultiplier * timeOfDayMultiplier`
4. Si PRNG < pSpawn: spawn entidad random de `supportedEntities` del path
5. Entidad arranca en tile[0], avanza por path, despawn al llegar a final

PRNG seeded por `(playthroughId, week, dayOfSeason, tileTickIndex)` —
mismas condiciones reproducen misma vida ambient (deterministic para
replays + tests).

### 3.4 Density por tier (cross-ref city-progression.md §3.1)

| Tier | Total entidades activas | En pantalla | Mix dominante |
|------|------------------------|-------------|---------------|
| T1 — Pueblo Olvidado | 2-5 | 1-3 | 80% peaton-solo + 20% car-generic |
| T2 — Club Emergente | 8-12 | 4-8 | 50% peatones (mix) + 30% ciclistas + 20% coches |
| T3 — Club Establecido | 18-25 | 10-15 | 40% peatones + 25% bicis/patines + 25% coches + 10% peatón-con-perro |
| T4 — Imperio Local | 30-40 | 18-22 (cap §7) | Mix total: walkers, walker-dog, walker-bag, cyclists, scooter-e, rollerblader, cars (genérico + club), vans |

### 3.5 Time-of-day modulación

Multiplicador del `pSpawn` per bucket (per ADR-022 + isometric-world §3.5):

- **dawn** (~5h-7h in-game): 0.4× (gente madrugadora, repartidor van)
- **day** (~7h-19h): 1.0× (base)
- **dusk** (~19h-21h): 0.8× (vuelta del trabajo, peatón-con-bolsa)
- **night** (~21h-5h): 0.3× (Pilar 4 — ciudad se calma)

Variantes nocturnas: patines y bicis no aparecen en noche (realista).

### 3.6 Weather modulación (per ADR-022 + city-progression §3.3)

- **clear**: base
- **rain**:
  - Patines + ciclistas: removed del pool (no spawning)
  - Walkers: sprite-variant con paraguas (cabeza reemplazada por paraguas 4×5 px)
  - Coches: sin cambio
  - Total density: 0.7× (gente sale menos)

### 3.7 Matchday especial

Cuando hay fixture en el estadio (live):

- Spawn extra: 1 bus-away en main-street, viaje desde borde a stadium tile
- Crowd-tiles convergentes ya cubierto en city-progression.md §3.4
- Aumentar coche genérico density 1.5×
- Tras kickoff: no más spawns hasta full-time

### 3.8 Interacción con Clase A (funcional)

Si una animación Clase A necesita un tile que está ocupado por una entidad Clase C:

1. **Tile bloqueado** → entidad Clase C se desvía al sibling tile más cercano del path
2. **Si no hay sibling** → entidad Clase C "se despide" (fade-out 500ms) y desaparece
3. Spawning evita ese tile durante la duración de la Clase A

Esto garantiza que la vida ambient NUNCA pisa la prioridad de signals del juego.

### 3.9 Accesibilidad

- DOM fallback (per ADR-024) reporta densidad en lista textual:
  *"Hay 18 personas en la calle, 2 bicicletas, 1 coche del club."*
- prefers-reduced-motion: spawn rate × 0.3 (menos sprites en movimiento)
- Color: cada entidad respeta paleta WCAG contrast vs background tier

### 3.10 Modulación por estado del club *(Pilar 2 — el mundo es el marcador)*

**Decisión Pablo 2026-05-21**: la cantidad de vida visible NO es sólo
función del tier (que es estructural y cambia lento). También responde
a la coyuntura — *cómo va el equipo esta semana*.

Estos modificadores se aplican SOBRE `tierMultiplier`. Resultado final
saturado en `[0.1, 2.5]` para evitar valores absurdos.

#### A. fan_momentum (modulador continuo)

Lectura en `WorldState.fan_momentum` 0..100 per cascade-engine.md:

| Bucket | Rango | Modifier | Significado visual |
|--------|-------|----------|-------------------|
| Hundido | 0-20 | × 0.5 | Ciudad apagada tras temporada negra. Mitad de gente. Mayoría peatón-solo, casi sin bicis. |
| Bajo | 20-40 | × 0.75 | Vida cotidiana sin entusiasmo |
| Neutral | 40-60 | × 1.0 | Base |
| Animado | 60-80 | × 1.2 | Más bicis y patines (gente joven sale). Algún coche del club. |
| Eufórico | 80-100 | × 1.5 | Calle llena. Algunos peatones con bufanda/camiseta del club (variante sprite). |

#### B. Resultado del último partido (efecto pulso 24h in-game)

Tras el último partido:

- **Victoria** (full-time + 24h): density × 1.25. Algún peatón-con-bufanda
  del club extra. Coche del club aparece más probable (×1.5).
- **Empate**: sin modulador (base).
- **Derrota** (full-time + 24h): density × 0.8. Sin walker-fast (gente no
  va con prisa). Peatón-con-perro normal aparece (la vida sigue).
- **Derrota dura** (3+ goles encajados, o derbi perdido): density × 0.6
  durante 48h. Ambient muy silencioso.

El pulso se atenúa linealmente — al cumplirse las 24h, el efecto vuelve
a 1.0 progresivamente.

#### C. Racha de resultados

Calculado de `season_form_last_5` en cascade-engine:

| Racha | Modifier | Visual extra |
|-------|----------|--------------|
| 5W de 5 | × 1.4 | Frecuencia 2× de peatones-con-bufanda. Bus-club aparece como spawn ambient (no sólo en matchday) — "el equipo se mueve, los suministros también". |
| 4W de 5 o 3W consec | × 1.2 | Ambient ligeramente más jovial |
| Neutral (mix) | × 1.0 | Base |
| 3L consec | × 0.8 | Menos bicis/patines (jóvenes salen menos) |
| 5L de 5 | × 0.6 | Ciudad en silencio. Variante visual: 1 furgoneta de mudanzas aparece ocasionalmente (cliché futbolero de "el club se hunde, la gente se marcha") — sólo si la racha persiste 4+ semanas. |

#### D. Situación financiera

Lectura en `WorldState.financial_balance`:

| Estado | Modifier | Visual extra |
|--------|----------|--------------|
| Sano (>50k€) | × 1.0 (base) | Coches del club aparecen normalmente |
| En riesgo (-50..50k€) | × 0.9 | Menos vans de reparto (negocios reducen pedidos) |
| Crisis (-200..-50k€) | × 0.7 | Aparece variante "ventana con papel pegado" en 1 comercio cada vez (Art Bible §6.4) |
| Quiebra (<-200k€) | × 0.4 | Furgoneta de embargo (variante van-delivery con sirena 1px parpadeante) recorre main-street 1 vez/semana. Coches del club NO aparecen — flotilla vendida. |

#### E. Ascenso / descenso reciente

Eventos one-shot (1 semana de duración):

- **Tras ascenso**: density × 1.6 durante 7 días, bus-away aparece como
  "bus de aficionados" en main-street. Peatones-con-bufanda triplicados.
- **Tras descenso**: density × 0.5 durante 7 días. Sin peatones-con-bufanda
  (nadie quiere mostrarse). Variante puntual: cartel-arrancado en pared.

#### Cálculo final

```
finalMultiplier = clamp(
  tierMultiplier(state.tier)
  × fanMomentumMultiplier(state.fan_momentum)
  × lastResultPulse(state.lastMatchResult, hoursElapsed)
  × formStreakMultiplier(state.season_form_last_5)
  × financialMultiplier(state.financial_balance)
  × eventOneShot(state.recentPromotion, state.recentRelegation)
  × timeOfDayMultiplier(timeOfDay)
  × weatherMultiplier(weather),
  0.1, 2.5
)
```

Saturación en [0.1, 2.5] garantiza:
- **Floor 0.1**: incluso en quiebra + 5L + lluvia + noche, hay vestigio de
  vida (~1-2 entidades). La ciudad no muere del todo.
- **Ceiling 2.5**: incluso tras ascenso + 5W + euforia + día + clear, el
  cap absoluto (40 active / 20 on-screen) sigue protegiendo Pilar 4.

### 3.11 Variantes sprite extra (Sprint 24 unlocks)

Triggers documentados que añaden sprites al pool sin contar contra cap base:

| Sprite extra | Trigger | Frecuencia |
|--------------|---------|-----------|
| Peatón-con-bufanda-club | fan_momentum >= 60 OR último partido win en 24h | 1 cada 6 peatones |
| Peatón-con-camiseta-club | fan_momentum >= 80 OR ascenso reciente | 1 cada 10 peatones (saturación visual) |
| Bus de aficionados | Ascenso 7 días | 1× por día in-game |
| Furgoneta de embargo | Quiebra (balance < -200) | 1× por semana in-game |
| Coche con bandera | Final ganada / derbi ganado | 1× durante 24h |
| Furgoneta de mudanzas | 5L de 5 racha + 4 semanas | 1× cada 3 días

---

## 4. Formulas

### 4.1 Spawn probability per tile-tick

```
pSpawn(path, state, weather, timeOfDay) =
  baseSpawnRate(path.type)
  × tierMultiplier(state.tier)
  × timeOfDayMultiplier(timeOfDay)
  × weatherMultiplier(weather)
  × pathFreeMultiplier(path)
```

Donde:

```
baseSpawnRate('calle-principal')    = 0.20
baseSpawnRate('calle-secundaria')   = 0.12
baseSpawnRate('camino-diagonal')    = 0.06
baseSpawnRate('loop-interno')       = 0.10

tierMultiplier(1) = 0.3
tierMultiplier(2) = 0.7
tierMultiplier(3) = 1.0
tierMultiplier(4) = 1.4

timeOfDayMultiplier('dawn')   = 0.4
timeOfDayMultiplier('day')    = 1.0
timeOfDayMultiplier('dusk')   = 0.8
timeOfDayMultiplier('night')  = 0.3

weatherMultiplier('clear') = 1.0
weatherMultiplier('rain')  = 0.7

pathFreeMultiplier(path)  = 1.0 if no Clase-A on path, 0.3 otherwise
```

### 4.2 Entity progress along path

```
entity.tileFloat(t) = entity.spawnTime + (t * entity.speed) / TILE_PIXELS
entity.screenPos(t) = lerp(path.tiles[floor(tileFloat)], path.tiles[ceil(tileFloat)], frac(tileFloat))
```

`TILE_PIXELS` = sqrt(TILE_WIDTH² + TILE_HEIGHT²) ≈ 35.78.

Pure function — replay determinístico.

### 4.3 Entity selection from supported list

```
entityType = pickWeighted(path.supportedEntities, weights(tier, weather, timeOfDay), prng)
```

Weights por tier en §3.4 (peatón vs bici vs coche distribution).

---

## 5. Edge Cases

### 5.1 Game pause / tab hidden

Entities frozen — `app.ticker.stop()` (PixiJS native). Al volver, reanudar
sin saltar (entity.spawnTime se desplaza por el delta pausado).

### 5.2 Tier downgrade mid-frame

Si el jugador entra en quiebra y tier baja T4 → T1:

- Existing entities completan su path (no se eliminan abrupto)
- Spawning para a respetar el nuevo cap inmediatamente
- Resultado: en ~30s el mundo se vacía visualmente, coherente con el down-tier

### 5.3 Path desactivado (e.g., bus-only en matchday termina)

Las entidades activas en el path terminan su recorrido. El path queda
inactivo para spawns siguientes.

### 5.4 Performance degradación

Si frame rate < 25fps por 5s (per isometric-world.md §3.8):

- Reducir cap a 50% (Medium mode)
- Si sigue < 25fps: cap a 25% (Low mode)
- Si DOM fallback activo: 0 entities ambient (texto solamente)

### 5.5 Spawn que choca con NPC funcional

Per §3.8: spawn evita ese tile. Si todos los tiles del spawn point están
ocupados, skip el tile-tick.

### 5.6 Múltiples entidades en mismo tile

Permitido hasta 3 entidades simultáneas en un tile. Más → spawn redirected
al next tile del path.

### 5.7 Entidad sale del viewport antes de terminar path

NO se despawnea automáticamente. Sigue avanzando — el jugador la vuelve a
ver si pan/zoom la encuentra. Despawn solo al alcanzar último tile del path.

### 5.8 Replay determinístico

`pSpawn` y `entityType` selection usan PRNG seeded por
`(playthroughId, week, dayOfSeason, tileTickIndex)`. Misma sesión recargada
= misma vida ambient renderizada. Importante para soak tests + bug reports
("aquí vi un coche atravesar el bar"). Pasa el seed al issue + reproducible.

---

## 6. Dependencies

| Sistema | Direction | Concern |
|---------|-----------|---------|
| city-progression.md | reads | tier actual para density tier multiplier |
| isometric-world.md | reads | tile grid, camera, render layers |
| presentation-state (ADR-022) | reads | timeOfDay + weather modulators |
| match-simulation.md | reads | live fixture → bus-away spawn + density boost |
| event-system.md | reads | special events que disparan entity types únicos (e.g., car-mayor en mayor call) |
| Sentry (observability) | sends | path validation errors, perf alerts |
| ADR-021 (canvas pipeline) | implements | sprites renderizados en `actors` layer |

---

## 7. Tuning Knobs

Todos en `feature_config` table runtime-tunable:

```typescript
WORLD_LIFE_ENABLED: boolean                      // master toggle (a11y override)
MAX_ENTITIES_ACTIVE: number                      // 40
MAX_ENTITIES_ON_SCREEN: number                   // 20
TILE_TICK_INTERVAL_MS: number                    // 2000

BASE_SPAWN_RATES = {
  'calle-principal': 0.20,
  'calle-secundaria': 0.12,
  'camino-diagonal': 0.06,
  'loop-interno': 0.10,
}

TIER_MULTIPLIERS = { 1: 0.3, 2: 0.7, 3: 1.0, 4: 1.4 }

TIME_MULTIPLIERS = {
  dawn: 0.4, day: 1.0, dusk: 0.8, night: 0.3
}

WEATHER_MULTIPLIERS = { clear: 1.0, rain: 0.7 }

REDUCED_MOTION_MULTIPLIER: number                // 0.3

ENTITY_SPEEDS_PX_S = {
  walker: 12, 'walker-fast': 24, 'walker-dog': 10,
  'walker-bag': 11, cyclist: 32, 'scooter-e': 36,
  rollerblader: 28, 'car-generic': 20, 'car-club': 22,
  'bus-away': 14, 'van-delivery': 16,
}

MATCHDAY_DENSITY_BOOST: number                   // 1.5
NIGHT_BIKE_SCOOTER_DISABLED: boolean             // true
RAIN_BIKE_SCOOTER_DISABLED: boolean              // true
```

---

## 8. Acceptance Criteria

| ID | Criterion | Test type |
|----|-----------|-----------|
| AC-LIFE-01 | Density T1 < density T2 < T3 < T4 (monotonic) | Property |
| AC-LIFE-02 | Density nocturna = ~30% de density diurna | Statistical |
| AC-LIFE-03 | Bicis + patines no spawn en rain | Integration |
| AC-LIFE-04 | Bicis + patines no spawn en night | Integration |
| AC-LIFE-05 | Max 20 entities on-screen at any time | Integration |
| AC-LIFE-06 | Max 40 entities active in world | Integration |
| AC-LIFE-07 | Spawn determinístico per (playthroughId, week, day, tick) | Property |
| AC-LIFE-08 | Matchday spawns bus-away if fixture is live | Integration |
| AC-LIFE-09 | Tier downgrade: existing entities terminan, spawn caps inmediato | Integration |
| AC-LIFE-10 | Clase-A animation blocks tile → Clase-C entity reroutes | Integration |
| AC-LIFE-11 | DOM fallback reporta densidad textual | A11y |
| AC-LIFE-12 | prefers-reduced-motion reduce spawn × 0.3 | A11y |
| AC-LIFE-13 | Entity speed coincide con ENTITY_SPEEDS_PX_S table | Unit |
| AC-LIFE-14 | Tile-tick interval respeta TILE_TICK_INTERVAL_MS | Integration |
| AC-LIFE-15 | Tab hidden pausa el ticker; resume sin saltar frames | Integration |
| AC-LIFE-16 | Perf: 60fps con 20 entities on-screen en hardware target | Perf |

---

## 9. Open Questions

| ID | Question | Bloqueante para |
|----|----------|-----------------|
| OQ-LIFE-1 | ¿Paths editables por jugador en v1.3+ (e.g., "construye carretera entre X e Y")? | v1.3 scope |
| OQ-LIFE-2 | ¿NPCs ambient pueden tener "personalidades visuales recurrentes" (la abuela del perro siempre paseando) o son anónimos? | Sprint 26 |
| OQ-LIFE-3 | ¿Audio: 1 sonido suave cuando un coche pasa, o silencio total (Pilar 4)? | Audio team v1.1 |
| OQ-LIFE-4 | ¿Click en entidad ambient hace algo? (e.g., tooltip "vecino") | Sprint 27 |
| OQ-LIFE-5 | ¿Cómo se interactúa con vehículo en movimiento desde click→tile (ADR-023)? | Sprint 26 |
| OQ-LIFE-6 | ¿Variantes culturales (e.g., gente con bandera del club en matchday)? Futuro | v1.3 |

---

## 10. Cross-references

- `design/art/art-bible.md` §1.2 Principio 4 (revisado 2026-05-21) — autoriza Clase C
- `design/art/art-bible.md` §5.3 — crowd-tile vs sprite individual rule
- `design/art/art-bible.md` §6.3 — props table per tier (interactúa con paths)
- `design/gdd/city-progression.md` §3.1 — densidad ambient por tier (extiende)
- `design/gdd/isometric-world.md` §3 — render layers (actors layer hosts entities)
- ADR-021 (canvas pipeline)
- ADR-022 (day-night + weather)
- ADR-024 (a11y fallback)
