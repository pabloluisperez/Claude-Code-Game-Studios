# City Progression — Game Design Document

> **Status**: 🟡 **In Progress** (v1.1 design draft — autopilot 2026-05-21)
> **Layer**: Core
> **Owner**: game-designer + systems-designer
> **Pillar**: B — *Mundo Isométrico Vivo* / *The World Is The Scoreboard*
> **Engine binding**: cascade-engine.md (read-only consumer), economy.md (state source), isometric-world.md (presentation)
> **ADR refs**: ADR-014 (canvas pipeline), ADR-015 (day-night model), ADR-006 (PixiJS isometric — re-activated)
> **Scope**: v1.1 (post-MVP)

---

## 1. Overview

City progression define cómo el club + ciudad crecen visualmente como
expresión del estado simulado. **No es un sistema simulado nuevo** — es
una proyección visual de WorldState ya existente (financial_balance,
fan_momentum, prestige, infrastructure_level). NO escribe a WorldState;
sólo lee.

Cuatro **tiers discretos** de progresión. Cada tier es un conjunto de
sprites + transiciones + ambientación. Cross-tier transitions son
animaciones explícitas (NO interpolación continua) — *"el jugador ve el
momento en que algo cambia"* (Art Bible Principio 1).

---

## 2. Player Fantasy

> *"Empiezas con un campo de tierra en un pueblo gris. Una temporada
> después, miras el estadio: tiene gradas que antes eran vallas. Dos
> temporadas más tarde, las gradas están cubiertas. Cinco temporadas
> después, las luces nocturnas iluminan barrios que antes eran descampado.
> No son barras de progreso — es tu ciudad."*

Anclajes a Pilares:

- **Pilar 1 (Tinkering)**: el jugador *descubre* qué decisión disparó el
  cambio visual. La cascade dice qué cambia y por qué; el city
  progression es el espejo.
- **Pilar 2 (World Is The Scoreboard)**: el reporte de progreso vive en
  los sprites, no en la HUD.
- **Pilar 3 (You Grow Like Your Club)**: el manager visible en su
  despacho (manager-rpg.md §Visual Manifestation) es un caso particular
  de city progression — el despacho es un "edificio" más.
- **Pilar 4 (Calm Is The Tempo)**: transitions son discretas + breves
  (1-2s), nunca compiten con la HUD por atención.

---

## 3. Detailed Rules

### 3.1 Tiers de progresión

Cuatro tiers numerados 1-4. Cada tier es un *estado completo* de la
ciudad. Tiers superiores incluyen todo lo del tier inferior + adiciones.

#### Tier 1 — *Pueblo Olvidado*

- **Campo**: tierra árida, líneas a brocha
- **Tribunas**: vallas metálicas oxidadas (capacidad ~500)
- **Vestuarios**: caseta de obra
- **Ciudad alrededor**: 3 edificios bajos (taberna, plaza, iglesia)
- **Paleta**: marrón-ceniza dominante, saturación baja
- **Ambient**: 1-2 NPCs visibles (un viejo en la plaza, un perro)

#### Tier 2 — *Club Emergente*

- **Campo**: parches de césped + tierra
- **Tribunas**: gradas básicas de hormigón (capacidad ~2000)
- **Vestuarios**: edificio de bloque
- **Ciudad alrededor**: +bar deportivo, +primera fila de casas
  remodeladas, +pequeño anuncio del patrocinador inicial
- **Paleta**: marrón con manchas de los colores del club (kit primary)
- **Ambient**: 5-8 NPCs, primer staff visible en su rol

#### Tier 3 — *Club Establecido*

- **Campo**: césped completo, bandera del club en el centro
- **Tribunas**: gradas cubiertas en lateral (capacidad ~8000)
- **Vestuarios**: edificio dos plantas + zona técnica
- **Ciudad alrededor**: barrio del estadio remodelado, comercios,
  iluminación nocturna funcional
- **Paleta**: colores del club tiñen elementos del estadio + luces
- **Ambient**: 15+ NPCs, despacho del manager con primer trofeo visible

#### Tier 4 — *Imperio Local*

- **Campo**: césped premium con corte profesional
- **Tribunas**: 4 lados cubiertos + palco (capacidad ~25000)
- **Vestuarios**: complejo con sala de prensa, gimnasio visible
- **Ciudad alrededor**: alta-densidad: torres residenciales, hotel del
  club, centro comercial pequeño, vías secundarias iluminadas
- **Paleta**: máxima saturación + ciclo día-noche notorio
- **Ambient**: 30+ NPCs distribuidos, despacho con 3-5 trofeos y fotos
  enmarcadas

### 3.2 Tier activation triggers

Cada tier se activa cuando el WorldState cumple un set de condiciones.
Tiers se activan **monotónicamente con persistencia** (anti-yo-yo):

Una vez alcanzado un tier, requiere caer por debajo del threshold del
tier MENOR por 4 semanas consecutivas antes de bajar.

Triggers por tier:

| Tier | Condición de activación (TODAS deben cumplirse) |
|------|------------------------------------------------|
| 1 | (default) — siempre se renderiza al menos T1 |
| 2 | `prestige >= 15` AND `financial_balance >= 50` (k€) AND `fan_base >= 1500` |
| 3 | `prestige >= 35` AND `financial_balance >= 200` AND `fan_base >= 5000` AND `currentSeason >= 3` |
| 4 | `prestige >= 60` AND `financial_balance >= 500` AND `fan_base >= 15000` AND `currentSeason >= 6` AND `division IN ('first', 'second')` |

Los thresholds están en tuning knobs §7 — ajustables sin redeploy.

### 3.3 Sub-element states

Algunos elementos del tier cambian dentro del tier basándose en estado:

#### Pitch surface

| Estado | Trigger | Sprite delta |
|--------|---------|--------------|
| Dry (default T1) | infrastructure_level < 20 | Tierra |
| Patchy (T2 default) | infrastructure_level 20-50 | Tierra + parches |
| Healthy (T3 default) | infrastructure_level 50-80 | Césped uniforme |
| Pristine (T4 default) | infrastructure_level > 80 | Césped con corte profesional |

#### Crowd density (match days only)

Visible sólo cuando hay un partido en curso. Densidad = `attendance / capacity`.
Sprites de público con 4 niveles: empty / sparse / packed / overflowing.

#### Lighting

Day-night cycle (ADR-015) afecta a todos los tiers. Tier 1 sin
iluminación nocturna funcional (oscuro hasta T2). Tier 3 y 4 con
luces de estadio que se encienden ante partido nocturno.

#### Weather

Dos estados MVP de v1.1: clear / rain. Lluvia tinta toda la paleta + añade
charcos en pitch. Sin nieve / niebla / tormenta en v1.1.

### 3.4 Transitions

Cuando un tier se activa o desactiva, se ejecuta una transition animation:

- **Duración**: 1.5s (Art Bible Principio 4 — "breve y funcional")
- **Pattern**: cross-fade del tier antiguo → nuevo. Cada elemento nuevo
  *aparece* con un fade-in escalonado (~0.1s offset entre elementos
  para evitar "todo de golpe")
- **Trigger UI**: badge in-app "Tu club ha alcanzado el Tier N!" en el
  centro inferior (toast 3s), NO modal bloqueante
- **Audio**: 1 cue de "milestone reached" (audio-director define en v1.1
  Sprint 25)
- **Persistencia**: si el usuario está mirando otra ruta cuando el tier
  cambia, al volver a la vista isométrica ya se ve el nuevo tier
  directamente (no se repite la animation post-fact)

### 3.5 Rendering scope

City progression NO se renderiza siempre — sólo en rutas específicas:

| Ruta | Render |
|------|--------|
| `/stadium` | Full city + stadium |
| `/match` (live) | Cámara dolly al estadio durante el partido |
| `/manager-office` | Despacho del manager (interior, un edificio del city) |
| Resto (dashboard, finance, squad…) | NO canvas, sólo DOM (perf saving) |

---

## 4. Formulas

### 4.1 Tier activation predicate

```
isTierActive(t: 1..4, state: WorldState, history: TierHistory): boolean

  if t == 1: return true  // siempre activo

  // Condiciones de subida — todas
  let upConditions: boolean = (
    state.prestige >= TIER_THRESHOLDS[t].prestige &&
    state.financial_balance >= TIER_THRESHOLDS[t].balance &&
    state.fan_base >= TIER_THRESHOLDS[t].fanBase &&
    state.currentSeason >= TIER_THRESHOLDS[t].minSeason &&
    DIVISION_REQUIRED[t].includes(state.division)
  )

  // Anti yo-yo: una vez alcanzado, no bajar si la caída es <4 semanas
  let wasActive: boolean = history.everReachedTier >= t
  if (wasActive && !upConditions):
    return history.weeksBelow[t] < ANTI_YOYO_WEEKS  // sigue T-1 weeks

  return upConditions
```

### 4.2 Sub-element infrastructure score

```
infrastructure_level(state: WorldState): 0..100

  weights = [
    state.stadium_upgrade_count * 5,        // hasta 50
    state.training_facility_level * 5,      // hasta 25
    state.youth_academy_level * 5,          // hasta 25
  ]
  return clamp(sum(weights), 0, 100)
```

### 4.3 Crowd density

```
crowd_density(fixture: Fixture): 0..1
  return clamp(fixture.attendance / fixture.capacity, 0, 1)

crowd_sprite_level(d: 0..1): 'empty' | 'sparse' | 'packed' | 'overflowing'
  if d < 0.15: return 'empty'
  if d < 0.50: return 'sparse'
  if d < 0.90: return 'packed'
  return 'overflowing'
```

---

## 5. Edge Cases

### 5.1 Relegación + caída económica

Si el club desciende a tercera división Y `financial_balance < 0` por
8+ semanas consecutivas:

- Tier puede bajar a T-1 (anti-yo-yo del §3.2 sigue protegiendo de
  oscilación normal — pero la regla de 8 semanas la rompe)
- Visual: elementos del tier superior *se degradan* (gradas con piezas
  que faltan, ciudad con tiendas cerradas) en lugar de desaparecer
- Lore: "Tu club atraviesa tiempos difíciles" — staff message en T3

### 5.2 Quiebra técnica (`balance < -500` k€)

- Tier baja a T1 INSTANTÁNEAMENTE (no anti-yo-yo)
- Transition más dramática: 3s (no 1.5s)
- Staff message: "Las grúas se llevan parte del estadio"
- Si el jugador recupera balance > 0 en < 4 semanas: tier vuelve a su
  nivel previo (cushion para errores reversibles)

### 5.3 Salto de tier doble (T1 → T3)

En teoría posible si el jugador hace algo muy rápido (e.g., cascadas que
disparan ingresos masivos en una temporada). Tratamiento:

- Animación T1 → T2 (1.5s) → pausa 0.5s → animación T2 → T3 (1.5s)
- Total: ~3.5s. Visual encadenado, no salto único.

### 5.4 Nuevo playthrough (semana 1)

- T1 con paleta más apagada todavía ("desolación")
- Después de la primera temporada (semana 40), si T2 unlock conditions
  se cumplen, animación T1 → T2 es uno de los climax narrativos
  esperados

### 5.5 Match-day en T1

T1 NO tiene iluminación nocturna. Partidos programados de noche (post-T2)
en T1 son visualmente apagados con torchlights manuales (sprite de un
operario con foco). Pequeño easter egg.

### 5.6 Cambio de kit primary color mid-tier

Si el jugador rebrand del club (cambiar kit color en v1.3+), los elementos
visuales que usan ese color (banderines, anuncio del patrocinador, etc.)
hacen cross-fade al nuevo color en 5s.

---

## 6. Dependencies

| Sistema | Direction | Concern |
|---------|-----------|---------|
| cascade-engine.md | reads | NodeIds: prestige, financial_balance, fan_base, infrastructure_level |
| economy.md | reads | financial_balance source-of-truth |
| match-simulation.md | reads | fixture.attendance, fixture.capacity, fixture.time_of_day |
| event-system.md | reads | special events que disparan animaciones únicas (e.g., copa) |
| league-system.md | reads | club.division, currentSeason |
| isometric-world.md | extends | tier sprites se renderizan en el sistema canvas |
| manager-rpg.md | reads | manager visible en despacho — manager-rpg expone su sprite progression |
| ADR-014 (canvas pipeline) | extends | tier sprites son assets del pipeline |
| ADR-015 (day-night) | extends | lighting layer sobre el tier base |

---

## 7. Tuning Knobs

Todos los thresholds son configurables en runtime via `config.cityProgression`
(persistido en DB tabla `feature_config`, leído al boot del server).

```typescript
TIER_THRESHOLDS = {
  2: { prestige: 15, balance: 50,  fanBase: 1500,  minSeason: 1 },
  3: { prestige: 35, balance: 200, fanBase: 5000,  minSeason: 3 },
  4: { prestige: 60, balance: 500, fanBase: 15000, minSeason: 6 },
}

DIVISION_REQUIRED = {
  2: ['first', 'second', 'third', 'fourth', 'fifth'],
  3: ['first', 'second', 'third', 'fourth'],
  4: ['first', 'second'],
}

ANTI_YOYO_WEEKS = 4
RELEGATION_DOUBLE_DECAY_WEEKS = 8
BANKRUPTCY_BALANCE_FLOOR = -500   // k€
TRANSITION_DURATION_MS = 1500
DOUBLE_TIER_PAUSE_MS = 500
```

---

## 8. Acceptance Criteria

| ID | Criterion | Test type |
|----|-----------|-----------|
| AC-CITY-01 | Tier 1 se renderiza por defecto (sin condiciones) | Unit (predicate) |
| AC-CITY-02 | Tier 2 se activa con prestige=15, balance=50, fanBase=1500, season=1 | Unit |
| AC-CITY-03 | Tier 3 requiere season >= 3 (no se activa antes aunque resto verde) | Unit |
| AC-CITY-04 | Tier 4 requiere division IN (first, second) | Unit |
| AC-CITY-05 | Anti-yo-yo: tier no baja antes de 4 semanas consecutivas debajo del threshold | Integration |
| AC-CITY-06 | Quiebra (`balance < -500`) baja tier a T1 instantáneamente | Integration |
| AC-CITY-07 | Recuperación de quiebra en < 4 sem restaura tier previo | Integration |
| AC-CITY-08 | Tier transition animation dura 1500ms ± 100ms | Visual (record video) |
| AC-CITY-09 | Doble tier (T1→T3 en un solo tick) renderiza animaciones encadenadas | Visual |
| AC-CITY-10 | Crowd density 0 cuando no hay partido en curso | Unit |
| AC-CITY-11 | Crowd density usa rangos definidos en §4.3 | Unit |
| AC-CITY-12 | Toast "Tier reached" aparece y desaparece en 3s | UI |
| AC-CITY-13 | Si usuario está en otra ruta, no aparece animation al volver | UI |
| AC-CITY-14 | Tier sprites se cargan lazy (sólo si entra a /stadium o /match) | Perf |
| AC-CITY-15 | DOM fallback: lista textual del tier actual + componentes accesible vía /stadium-text | A11y |
| AC-CITY-16 | Determinismo: dado un WorldState X, el tier resultante es siempre el mismo | Property test |

---

## 9. Open Questions

| ID | Question | Bloqueante para |
|----|----------|-----------------|
| OQ-CITY-1 | ¿La capacidad del estadio sube linealmente con tier o por upgrade individual? | match-simulation fixture.capacity |
| OQ-CITY-2 | ¿Hay un Tier 0 (campo desierto sin gradas) para clubs recién fundados? | Onboarding flow |
| OQ-CITY-3 | ¿El manager-office es siempre visible (interior route) o sólo accesible desde city view? | hud-ui.md route map |
| OQ-CITY-4 | ¿Cuál es la métrica "fan_base" canonical? cascade-engine lo expone? | cascade-engine cross-check |
| OQ-CITY-5 | ¿Cómo se gestiona el cambio de tier cuando el cascade-engine corre durante advance (vs ya commitado)? | ADR-014 transaction boundary |

---

## 10. Decisión gate al cierre (v1.1 Sprint 22-24)

City progression es PASS si:

- [ ] Los 4 tiers son visualmente distinguibles a primer vistazo
- [ ] Los thresholds NO causan oscilación visible en playtests (tested
      con 5 partidas de 5 temporadas)
- [ ] Transiciones se sienten "merecidas" (subjetivo — playtest gate)
- [ ] Performance: 60fps en `/stadium` durante el peor caso (T4 + match
      en curso + crowd overflowing)

---

## 11. Cross-references

- `design/art/art-bible.md` §3 (tile size 32×16) — assets por tier siguen esta especificación
- `prototypes/cascada-art-bible-validation/` — validation prototype previo a v1.1
- ADR-006 (PixiJS isometric) — superseded para detalles de implementación por ADR-014 (v1.1)
- `design/gdd/economy.md` §F5 — `financial_balance` thresholds
- `design/gdd/cascade-engine.md` — `prestige`, `fan_base`, `infrastructure_level` definidos
- `design/gdd/manager-rpg.md` §Visual Manifestation — despacho del manager dentro del city
