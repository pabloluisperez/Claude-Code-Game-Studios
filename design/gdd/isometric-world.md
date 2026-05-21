# Isometric World — Game Design Document

> **Status**: 🟡 **In Progress** (v1.1 design draft — autopilot 2026-05-21)
> **Layer**: Presentation
> **Owner**: technical-artist + game-designer + ux-designer
> **Pillar**: B — *Mundo Isométrico Vivo*
> **Engine binding**: PixiJS 8 (canvas) + DOM coexistence per ADR-012 + ADR-014
> **ADR refs**: ADR-006 (PixiJS choice — reactivated), ADR-014 (canvas pipeline), ADR-015 (day-night), ADR-016 (DOM↔Canvas router), ADR-017 (a11y fallback)
> **Scope**: v1.1 (post-MVP)

---

## 1. Overview

Define el **sistema de renderizado isométrico** sobre el que vive city-progression
y futuras vistas canvas. Es la capa de presentación: no decide qué hay en la
ciudad (eso es city-progression.md), sino *cómo se dibuja, mueve y reacciona
a input*.

Scope:

- Tile grid isométrico (32×16, art-bible.md §3 locked)
- Camera (pan + zoom + bounds)
- Asset loader (sprite atlases, lazy load por tier)
- Day-night cycle + weather
- DOM↔Canvas event routing
- A11y fallback (DOM-equivalent text view)
- Performance budget enforcement

---

## 2. Player Fantasy

> *"Pinzas con el dedo y la ciudad se acerca; muevo la cámara y descubro
> una fuente que no había visto. Se hace de noche y las luces del estadio
> son las primeras que se encienden — porque mi club es lo más vivo de
> esta ciudad."*

Anclajes a Pilares:

- **Pilar 1 (Tinkering)**: la cámara permite *explorar* la ciudad sin
  fricción; el jugador puede mirar lo que quiera, cuando quiera.
- **Pilar 2 (World Is The Scoreboard)**: la presentación es informativa,
  no decorativa. Si algo está visible, *significa algo*.
- **Pilar 4 (Calm Is The Tempo)**: pan/zoom suaves, transiciones cortas,
  ningún VFX gratuito. La cámara no se mueve si el jugador no pide.

---

## 3. Detailed Rules

### 3.1 Tile grid

- **Tile size**: 32×16 pixels (Art Bible §3 locked)
- **Grid type**: diamond isometric (not staggered)
- **Coordinate system**: `(tileX, tileY)` integer pair, world-space
- **Screen projection**: `screenX = (tileX - tileY) * 16; screenY = (tileX + tileY) * 8`
- **Bounds**: 64×64 tiles (4096 tiles total) — suficiente para ciudad T4
  expandida (~50×50 utilizados, resto margen)

### 3.2 Camera

- **Type**: 2D translate + uniform scale (no rotation in v1.1)
- **Default position**: centered on stadium
- **Zoom levels**: 0.5x (overview), 1.0x (default), 1.5x (detail), 2.0x (closeup)
- **Pan**: drag (desktop), 2-finger drag (mobile touch, v1.3+)
- **Zoom**: scroll wheel (desktop), pinch (mobile touch, v1.3+), buttons (always)
- **Bounds clamping**: cámara no puede ver más allá del grid (64×64 *tile_size_px)
- **Focus actions**: keyboard shortcut `F` re-centra en stadium

### 3.3 Asset loader

- **Strategy**: 1 sprite atlas por tier (4 atlases total para city-progression
  tiers 1-4) + atlases compartidos (ambient NPCs, weather effects)
- **Format**: PNG con padding 2px entre sprites, JSON manifest tipo TexturePacker
- **Lazy loading**: tier T2 sólo se descarga si club alcanza T2 (cascade
  watcher en hooks.client.ts dispara fetch async). T1 viene en el bundle inicial.
- **Caching**: HTTP cache 7 días + service worker para offline post-v1.3
- **Budget**: < 300 KB por atlas comprimido (WebP); total < 1.5 MB descargado
  para un jugador en T4

### 3.4 Layer ordering (z-index)

De más bajo a más alto:

```
0. Sky / background (cielo, según hora del día)
1. Terrain tiles (campo, tierra, césped, agua)
2. Static buildings (estadio, casas, comercios)
3. Mid-ground props (vallas, postes, banderas)
4. Dynamic actors (NPCs, manager, players cuando entrenan)
5. Crowd sprites (sólo match-day, en gradas)
6. Weather overlay (lluvia, niebla — v1.3)
7. Lighting overlay (tint según hora)
8. UI elements (toast "Tier reached", click feedback)
```

Depth sort dentro de cada layer: `(tileX + tileY) * 1000 + zSubOffset`.

### 3.5 Day-night cycle

Ver ADR-015. Resumen aquí:

- **Ciclo**: 1 día in-game = 24 minutos reales en autoplay (v1.1 NO autoplay
  por defecto — ciclo aplica sólo cuando el jugador está en `/stadium`)
- **Estados**: dawn / day / dusk / night (4 buckets, no continuous)
- **Transition**: 30s fade entre buckets cuando el jugador está mirando
- **Lighting**: shader tint sobre todos los layers excepto UI
- **Cuándo se decide**: hora del día se deriva de `WorldState.currentTimeOfDay`
  (nuevo campo, v1.1 addition al WorldState)

### 3.6 Weather

MVP v1.1: 2 estados (clear / rain). Determinado por `WorldState.weather`
(nuevo campo). Cambia ≤ 1 vez por día in-game.

- **Clear**: sin overlay especial
- **Rain**: shader overlay con gotas en movimiento + sonido sutil (audio
  desde HTMLAudioElement DOM, NO PixiJS audio)
- **Pitch effect**: si rain durante un partido, infrastructure_level
  efectivo es -10% por la sesión (mecánica de match-simulation.md)

### 3.7 Input handling

- **Click en tile**: detecta tile bajo cursor; si hay edificio
  interactivo (manager office, stadium entrance), trigger navigation
  a la ruta correspondiente
- **Hover en tile**: tooltip DOM (no canvas) en posición del mouse con
  info del edificio (e.g., "Estadio: capacidad 2000")
- **Keyboard**: arrow keys mueven camera, +/- zoom, F focus stadium,
  Escape vuelve al DOM dashboard

### 3.8 Performance modes

Detección automática + override manual:

- **High** (60fps target): desktop con WebGL 2, no throttle CPU
- **Medium** (30fps target): mobile decente, o desktop con frame drops
- **Low** (no animations, static frame): low-end mobile, accesibilidad
  motion-reduced
- **DOM-fallback** (no canvas): a11y mode obligatorio o `<canvas>` blocked

Detección: 5s de medición al primer load. Si frame rate < 25fps en High,
auto-downgrade a Medium. Setting persistido en localStorage.

---

## 4. Formulas

### 4.1 Tile → Screen projection (isometric diamond)

```
screenX = (tileX - tileY) * TILE_WIDTH_HALF + cameraOffsetX
screenY = (tileX + tileY) * TILE_HEIGHT_HALF + cameraOffsetY

Where:
  TILE_WIDTH_HALF  = 16  (tile width 32 / 2)
  TILE_HEIGHT_HALF = 8   (tile height 16 / 2)
```

### 4.2 Screen → Tile (for click detection)

```
let rx = (screenX - cameraOffsetX) / TILE_WIDTH_HALF
let ry = (screenY - cameraOffsetY) / TILE_HEIGHT_HALF
tileX = floor((ry + rx) / 2)
tileY = floor((ry - rx) / 2)
```

Verificación: la inversa de §4.1 con valores integer.

### 4.3 Depth sort within layer

```
sortKey(tileX, tileY, zSubOffset) = (tileX + tileY) * 1000 + zSubOffset

zSubOffset:
  Terrain: 0
  Building base: 100
  Building roof: 200
  Actor: 300
```

### 4.4 Camera bounds clamping

```
maxOffsetX = GRID_WIDTH * TILE_WIDTH_HALF + viewport.width / 2
minOffsetX = -GRID_WIDTH * TILE_WIDTH_HALF - viewport.width / 2

cameraOffsetX = clamp(cameraOffsetX, minOffsetX, maxOffsetX)
```

### 4.5 Day-night tint coefficient

```
tint(timeOfDay: number 0..1, weather: 'clear' | 'rain'): { r, g, b, a }
  // timeOfDay: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset

  let baseTint = lerp(NIGHT_COLOR, DAY_COLOR, sin(timeOfDay * 2π))
  if weather === 'rain':
    baseTint.r *= 0.85
    baseTint.g *= 0.85
    baseTint.b *= 0.95  // tinte azulado en lluvia
  return baseTint
```

---

## 5. Edge Cases

### 5.1 WebGL no disponible

Algunos navegadores antiguos o configurados con privacy strict. Detección:
`!canvas.getContext('webgl2')` → fallback inmediato a DOM mode (§3.8) +
toast informativo.

### 5.2 Canvas tamaño 0 al primer mount

SSR de SvelteKit puede montar el componente con `clientWidth = 0`. Pattern:
esperar a `ResizeObserver` callback antes de crear el PIXI Application.

### 5.3 Tab inactivo

Cuando el tab no es visible (Page Visibility API), PIXI paraliza ticker.
Al volver, reanudar sin "saltar" frames del ciclo día-noche (reset baseline).

### 5.4 Asset loading falla mid-tier

Tier T3 unlock event → fetch del atlas T3 falla (network down). Plan:

- Toast "No se pudo cargar gráficos del Tier 3 — reintentando"
- Reintentos exponenciales: 5s, 15s, 60s, 300s, parar
- Fallback: renderizar T2 + texto overlay "Tier 3 desbloqueado (cargando…)"
- Service worker pre-cachea T+1 atlas en background si la conexión lo permite

### 5.5 User abre `/stadium` desde dispositivo low-end

5s de medición detecta < 15fps → no entrar a Medium, ir directo a Low
(static frame). Si el usuario fuerza High desde settings, advertir
"Tu dispositivo podría no soportar este modo".

### 5.6 Click en tile mientras animación de tier transition corre

Click se ignora hasta que la animation termine. Indicador visual: cursor
sin pointer durante la transition. Razón: evitar inputs inconsistentes
con el estado visual.

### 5.7 A11y mode activo (DOM fallback)

Renderizado canvas se omite por completo. En su lugar:

- Página `/stadium` muestra una descripción textual del estado (tier + ambient)
- Lista accesible de edificios interactivos con enlaces a sus rutas
- Toast "Tier reached" sigue funcionando vía DOM live-region

---

## 6. Dependencies

| Sistema | Direction | Concern |
|---------|-----------|---------|
| city-progression.md | extends | tier sprites son data input al renderer |
| match-simulation.md | reads | fixture timing para crowd density + camera dolly |
| event-system.md | reads | events disparan one-shot visual cues (e.g., fireworks en final cup) |
| manager-rpg.md | reads | despacho del manager (room interior) — su propio render |
| ADR-014 (canvas pipeline) | implements | este GDD especifica qué |
| ADR-015 (day-night model) | implements | timeOfDay derived state |
| ADR-016 (DOM↔Canvas router) | implements | click/hover routing |
| ADR-017 (a11y fallback) | implements | DOM mode |
| Sentry (observability.ts) | sends | canvas errors capturados + reportados |

---

## 7. Tuning Knobs

```typescript
GRID_SIZE = 64                    // tiles per side
TILE_WIDTH = 32
TILE_HEIGHT = 16
ZOOM_LEVELS = [0.5, 1.0, 1.5, 2.0]
DEFAULT_ZOOM = 1.0
CAMERA_PAN_SPEED = 8              // pixels per keyboard tick

FRAME_RATE_TARGETS = {
  high: 60,
  medium: 30,
  low: 0,  // static
}
FRAME_RATE_MEASUREMENT_WINDOW_S = 5
FRAME_RATE_DOWNGRADE_THRESHOLD = 25

DAY_NIGHT_CYCLE_REAL_SECONDS = 1440  // 24 min = 24 hours in-game
DAY_NIGHT_BUCKETS = ['dawn', 'day', 'dusk', 'night']
DAY_NIGHT_TRANSITION_MS = 30000  // 30s fade

WEATHER_TRANSITION_MS = 4000
RAIN_PITCH_PENALTY_PCT = 0.10

ASSET_RETRY_MS = [5000, 15000, 60000, 300000]
```

---

## 8. Acceptance Criteria

| ID | Criterion | Test type |
|----|-----------|-----------|
| AC-ISO-01 | Tile→Screen projection (§4.1) e inversa (§4.2) son consistent (property test) | Unit |
| AC-ISO-02 | Camera bounds clamping no permite ver más allá del grid | Unit |
| AC-ISO-03 | Click en tile fuera del grid retorna `null`, NO crashea | Unit |
| AC-ISO-04 | Asset atlas T1 está en el bundle inicial (< 300KB) | Build |
| AC-ISO-05 | Asset atlases T2+ se cargan lazy al alcanzar el tier | Integration |
| AC-ISO-06 | WebGL no disponible → fallback DOM automático | Integration |
| AC-ISO-07 | Frame rate detection downgrade automático tras 5s < 25fps | Integration |
| AC-ISO-08 | Day-night cycle bucket transitions son visibles (test recorder) | Visual |
| AC-ISO-09 | Rain weather aplica tint + reduce infrastructure_level efectivo | Integration |
| AC-ISO-10 | Click en stadium tile → navega a /match (si hay partido) o /stadium-detail | UI |
| AC-ISO-11 | Keyboard arrow keys mueven cámara | UI |
| AC-ISO-12 | Tab inactivo pausa el ticker; reanudar no salta frames | Integration |
| AC-ISO-13 | A11y mode: `/stadium` renderiza descripción textual + enlaces accesibles | A11y (axe-core) |
| AC-ISO-14 | Asset retry sequence sigue intervalos definidos | Unit |
| AC-ISO-15 | Memoria: tras 5 min en `/stadium` con tier T4 + animations, < 256MB heap | Soak |
| AC-ISO-16 | Bundle: total canvas chunks descargados < 1.5MB compressed | Build |

---

## 9. Open Questions

| ID | Question | Bloqueante para |
|----|----------|-----------------|
| OQ-ISO-1 | ¿PixiJS 8 puede compartir context con un segundo canvas (e.g., match-live)? | match-live integration v1.1 Sprint 27 |
| OQ-ISO-2 | ¿Worker thread para offscreen render? Si sí, complica DOM event routing | ADR-016 final design |
| OQ-ISO-3 | ¿Soportamos zoom > 2.0x para accessibility (low vision)? | ADR-017 |
| OQ-ISO-4 | ¿El asset pipeline produce atlases via script (build-time) o manual? | Sprint 19 setup |
| OQ-ISO-5 | ¿Mobile touch gestures (pinch, swipe) son obligatorios en v1.1 o defer a v1.3? | Sprint 21 scope |

---

## 10. Acceptance Criteria — Performance budget

| Métrica | Target | Hard limit |
|---------|--------|------------|
| Frame budget (high mode) | 12ms | 16ms |
| Frame budget (medium mode) | 28ms | 33ms |
| Bundle initial JS (canvas chunks) | < 100KB | 150KB |
| Bundle total canvas (after all tiers loaded) | < 1.5MB | 2MB |
| Cold-start `/stadium` (Fast 3G) | < 4s | 6s |
| Memory (5 min in /stadium T4) | < 150MB heap | 256MB |

---

## 11. Cross-references

- `design/art/art-bible.md` — visual identity (Principios 1-5)
- `prototypes/cascada-art-bible-validation/` — validation prototype
- `prototypes/pixijs8-spike/` (TBD Sprint 18) — perf validation
- ADR-006, ADR-014, ADR-015, ADR-016, ADR-017
- `design/gdd/city-progression.md` — qué se renderiza
- `design/gdd/match-simulation.md` — match-day camera dolly
- `apps/web/src/lib/canvas/` (TBD Sprint 20) — implementation root
