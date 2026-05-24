# ADR-006: Arquitectura de Renderizado Isométrico (PixiJS 8)

## Status
Accepted

## Date
2026-05-16 (accepted 2026-05-16 after /architecture-review · mobile spike TR3 todavía pendiente, no bloquea acceptance de la arquitectura)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — PixiJS 8.x (renderer rewrite vs. v7) |
| **Domain** | Frontend / Rendering |
| **Knowledge Risk** | MEDIUM — PixiJS v8 cambió la API de init, Graphics, y Assets vs. v7 |
| **References Consulted** | `docs/engine-reference/web/deprecated-apis.md` §PixiJS v7→v8, `docs/engine-reference/web/modules/web-game-patterns.md` §Canvas Rendering Tips, `docs/engine-reference/web/current-best-practices.md` |
| **Post-Cutoff APIs Used** | `app.init()` async, `Graphics.fill({ color })`, `Assets.get()` post-load — todos documentados en engine-reference |
| **Verification Required** | Medir FPS en dispositivo móvil de referencia con la escena de máxima carga (estadio lleno + ciudad Tier 3 + 22 jugadores); target: 60 FPS en iPhone 13 / Pixel 6 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-001 (Web Stack — SvelteKit + Vite), ADR-005 (WorldState persistence — las variantes visuales se derivan del WorldState) |
| **Enables** | `isometric-world.md` GDD, `hud-ui.md` GDD (el canvas es el contexto del HUD) |
| **Blocks** | Epic de mundo isométrico — no puede comenzar sin este ADR Accepted |
| **Ordering Note** | `isometric-world.md` GDD debe referenciar este ADR para el budget de state variants y los thresholds de tier |

## Context

### Problem Statement

El Visual Identity Anchor "Lived-In Pixel" requiere un mundo isométrico 2D con state-driven rooms (cada espacio renderiza su estado según el WorldState), ciclo día/noche, y progresión visual discreta por tiers de ciudad. Sin definir la arquitectura de renderizado:

1. El Art Director no puede especificar el budget de state variants por room (¿cuántos sprites? ¿cuántas variantes?)
2. El implementador no sabe si usar PixiJS para el HUD o solo para el canvas del mundo
3. El mobile performance constraint (TR3) no tiene números concretos que guíen el diseño de assets

### Constraints

- PixiJS 8 tiene breaking changes vs v7 (async init, Graphics API, Assets API) — ver `deprecated-apis.md`
- En Svelte 5, las instancias de PixiJS deben usar `$state.raw` (no proxied por reactividad)
- Mobile PWA target: iPhone 13 iOS 17 / Pixel 6 Android 13
- El mundo isométrico es una ruta de SvelteKit — el PIXI.Application debe destruirse al abandonar la ruta
- El HUD de gestión (paneles, mensajes de staff) es DOM + CSS, no canvas — PixiJS solo para el mundo visual

### Requirements

- Máximo **200 sprites visibles simultáneamente** en la escena en la carga máxima (estadio lleno, tier 3 ciudad)
- Máximo **100 draw calls por frame** en dispositivo mobile de referencia
- Cada room/espacio soporta al menos **4 variantes de estado** (vacío, parcial, lleno, especial)
- El ciclo día/noche no duplica sprites — se implementa como overlay de color
- Las transiciones de tier de ciudad son discretas y tienen un timing definido

## Decision

**Un PIXI.Application por ruta de gameplay. Mundo isométrico en capas (Tilemaps + Entities + Overlay). State variants via texture atlas con swap de textura. Día/noche via tinting de un overlay Container. Budget de 200 sprites / 100 draw calls para mobile.**

### Layer Architecture

```
PIXI.Application (canvas)
└── root: Container
    ├── ground: Container                    ← tiles del suelo (cacheAsTexture ✓)
    │   ├── TileSprite (tile 0,0)           ← grid isométrico base
    │   ├── TileSprite (tile 1,0)
    │   └── ...
    ├── buildings: Container                 ← estructuras (estadio, oficina, comercios)
    │   ├── BuildingSprite (estadio)        ← Sprite con textura = f(estado, tier)
    │   ├── BuildingSprite (bar)
    │   └── ...
    ├── entities: Container                  ← NPCs, jugadores en entreno, transeúntes
    │   ├── EntitySprite (jugador_1)        ← pool de sprites reutilizables
    │   └── ...
    └── daynight: Container                  ← overlay de tinting (alpha 0-0.6)
        └── Graphics rect (pantalla completa, fill darkness color)
```

### Isometric Coordinate System

```typescript
// packages/shared/src/sim/iso-math.ts

/** Convierte coordenadas de tile (col, row) a posición de pantalla isométrica */
export function tileToScreen(col: number, row: number, tileW: number, tileH: number): { x: number; y: number } {
  return {
    x: (col - row) * (tileW / 2),
    y: (col + row) * (tileH / 2),
  };
}

/** Convierte posición de pantalla a tile (para click/tap) */
export function screenToTile(
  screenX: number, screenY: number,
  tileW: number, tileH: number,
  originX: number, originY: number
): { col: number; row: number } {
  const relX = screenX - originX;
  const relY = screenY - originY;
  return {
    col: Math.round(relX / tileW + relY / tileH),
    row: Math.round(-relX / tileW + relY / tileH),
  };
}
```

### State-Driven Sprites (State Variants)

Cada building/room tiene una **texture key** compuesta que determina qué sprite mostrar:

```typescript
// Formato de clave de textura para un room con estado
type TextureKey = `${RoomType}_${StateVariant}_${CityTier}`;
// Ejemplo: 'stadium_full_tier2', 'bar_empty_tier1', 'training_pitch_active_tier3'

type StateVariant = 'empty' | 'partial' | 'full' | 'special';
type CityTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';

/** Deriva la variante visual del WorldState */
export function getRoomTextureKey(
  roomType: RoomType,
  worldState: WorldState,
  cityTier: CityTier
): TextureKey {
  const attendance = getNode(worldState, 'fan_attendance');
  let variant: StateVariant =
    attendance > 75 ? 'full' :
    attendance > 40 ? 'partial' :
    'empty';
  // Variante especial (ej: día de partido) se puede sobreescribir
  return `${roomType}_${variant}_${cityTier}`;
}
```

**Budget de state variants por room-type**:

| Room Type | Variantes MVP | Descripción |
|-----------|--------------|-------------|
| `stadium` | 4 | empty, partial, full, match_day |
| `training_pitch` | 3 | idle, training, match_prep |
| `office` | 2 | normal, crisis (balance negativo) |
| `bar` / `shop` | 3 | closed, open, busy |
| `street` | 3 | empty, few_people, crowded |
| **Total por tier** | ~15 variantes × 4 tiers = **60 sprites únicos** | Cargados en atlas |

### City Tier Visual Thresholds

Los cambios de tier son discretos — ocurren al cruzar un umbral en WorldState:

```typescript
// apps/api/src/modules/city-progression/service.ts

export function getCityTier(worldState: WorldState): 1 | 2 | 3 | 4 {
  const prestige = getNode(worldState, 'club_prestige');  // 0-100
  if (prestige >= 75) return 4;
  if (prestige >= 50) return 3;
  if (prestige >= 25) return 2;
  return 1;
}

// El cliente aplica la transición de tier la semana siguiente al cruce
// — nunca mid-week, siempre en el siguiente tick visual
```

**El sistema de thresholds responde la pregunta del AD**: los tiers no son continuos — hay 4 puntos de salto discretos. El art team diseña 4 versiones de cada room; el código selecciona la correcta.

### Performance Budget (Mobile)

```typescript
// Presupuesto verificado antes de cada sprint de arte
const MOBILE_PERF_BUDGET = {
  maxVisibleSprites: 200,      // cuenta total en el viewport
  maxDrawCalls: 100,           // frame budget mobile
  maxAtlasSize: 2048,          // px — textura atlas única por tier
  maxSpriteSize: 128,          // px — tiles individuales
  groundLayerCached: true,     // Container.cacheAsTexture() en ground + buildings estáticos
  entityPoolSize: 30,          // sprites reutilizables en el pool (jugadores, NPCs)
} as const;
```

### SvelteKit Integration (Svelte 5)

```svelte
<!-- apps/web/src/routes/game/world/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Application, Container } from 'pixi.js';
  import type { WorldState } from '@smt/shared/sim/cascade-types';

  // $state.raw: PixiJS instance nunca debe ser proxied por Svelte
  let app = $state.raw<Application | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state(undefined);
  // Flag reactivo separado — $state.raw no trigerrea $effect, así que necesitamos
  // un booleano reactive para que $effect sepa cuándo el app está listo.
  let appReady = $state(false);

  let { worldState }: { worldState: WorldState } = $props();

  onMount(async () => {
    if (!canvas) return;
    const pixiApp = new Application();
    // PixiJS v8: init es ASYNC (v7 era síncrono — deprecated-apis.md)
    await pixiApp.init({
      canvas,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      backgroundColor: 0x1a1a2e,
      resolution: Math.min(window.devicePixelRatio ?? 1, 2), // cap 2x para mobile
      autoDensity: true,
      // NOTA: autoDensity:true → canvas.width es el tamaño físico, no lógico.
      // Event handlers deben dividir coordenadas por app.renderer.resolution.
    });
    app = pixiApp;
    buildScene(pixiApp, worldState);
    appReady = true; // solo ahora el $effect puede actualizar la escena
  });

  onDestroy(() => {
    // PixiJS v8: destroy recibe un único options object (v7 era destroy(removeView, options))
    app?.destroy({ removeView: true, children: true, texture: false, textureSource: false });
    // texture:false — las texturas del atlas sobreviven (gestionadas por Assets, no por el App)
    // Limpiar texturas explícitamente solo si la escena no volverá a cargarse:
    //   await Assets.unload('city-tier1')
    app = null;
    appReady = false;
  });

  // Depende de appReady (reactivo) — garantiza que app está inicializado
  $effect(() => {
    if (!appReady || !app) return;
    updateScene(app, worldState);
  });
</script>

<canvas bind:this={canvas} class="w-full h-full" />
```

### Asset Loading (PixiJS v8 Assets API)

```typescript
// apps/web/src/lib/game/assets.ts

import { Assets } from 'pixi.js';

// Cargar atlas por tier — lazy loading cuando el jugador alcanza ese tier
export async function loadCityTierAssets(tier: 1 | 2 | 3 | 4): Promise<void> {
  await Assets.load(`/game/sprites/city-tier${tier}.json`); // texture atlas
}

// PixiJS v8: Assets.get() después de carga (no Sprite.from() con atlas — deprecated)
export function getSprite(textureKey: TextureKey): PIXI.Sprite {
  return new PIXI.Sprite(Assets.get(textureKey));
}
```

## Alternatives Considered

### Alternative A: Three.js / Babylon.js (3D isométrico)

- **Description**: Usar un motor 3D con cámara isométrica orthographic en lugar de sprites 2D.
- **Pros**: Efectos de luz reales, sombras, futura migración a perspectiva libre.
- **Cons**: Pixel art isométrico se ve mejor en 2D puro; el bundle de Three.js/Babylon.js es 3-5× mayor que PixiJS; la complejidad 3D es innecesaria para el estilo "Lived-In Pixel"; mobile performance peor con GPU 3D pipeline.
- **Rejection Reason**: El Visual Identity Anchor especifica pixel art 2D isométrico. Three.js añade complejidad sin beneficio estético dado el estilo elegido.

### Alternative B: CSS Grid + SVG (sin canvas)

- **Description**: Implementar el mundo isométrico con CSS transforms y SVG assets.
- **Pros**: Sin dependencia de PixiJS; accesibilidad nativa; soporte de screen readers.
- **Cons**: El rendimiento de CSS transforms para 200+ sprites en mobile es impredecible; las animaciones de sprites son complejas; la interactividad (click en tile) es difícil de implementar con precisión isométrica.
- **Rejection Reason**: Para animaciones de sprites y un mundo interactivo, canvas (PixiJS) es la herramienta correcta. El HUD de gestión (DOM) y el mundo (canvas) se separan conscientemente.

### Alternative C: Phaser.js

- **Description**: Usar Phaser 3/4 que incluye isometric tile support nativo.
- **Pros**: Soporte isométrico built-in; tilemaps integrados.
- **Cons**: Bundle mucho más grande que PixiJS (Phaser incluye physics, audio, input que no necesitamos); el stack ya decided PixiJS en la setup del monorepo.
- **Rejection Reason**: Phaser es overkill para este caso — no necesitamos physics ni audio desde el canvas. PixiJS es suficiente y ya está instalado.

## Consequences

### Positive

- **Budget claro para el Art Director**: 60 sprites únicos en MVP (15 variantes × 4 tiers), atlas de 2048px, tiles de 128px.
- **Tiers discretos definidos**: `club_prestige >= 25/50/75` → tier 2/3/4. El art team diseña exactamente 4 versiones por room.
- **Ciclo día/noche sin coste de sprites**: un Container de overlay con tinting no duplica ningún asset.
- **Mobile perf budget numérico**: 200 sprites / 100 draw calls. Las escenas pueden diseñarse y validarse contra este número.
- **Separación HUD / Canvas**: los paneles de gestión siguen siendo DOM (accesibles, responsive, SEO). PixiJS es solo el mundo visual.

### Negative

- **Sprite batching manual**: con 60 sprites únicos en un atlas de 2048px, las batches son eficientes, pero el desarrollador debe asegurarse de que todos los sprites de una misma scene estén en el mismo atlas.
- **Lazy loading de atlases por tier**: el jugador puede experimentar un breve loading cuando alcanza tier 2/3 por primera vez. Mitigación: precargar el siguiente tier en background.
- **`cacheAsTexture()` invalida si el ground cambia**: cuando el campo de tierra (Tier 1) transiciona a césped (Tier 2), hay que invalidar el cache de la capa ground. Gestionar correctamente.

### Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| FPS < 60 en mobile con escena llena | MEDIO | ALTO | Hacer el spike de performance antes del sprint de arte; limitar entityPoolSize a 20 en mobile |
| Atlas de 2048px no suficiente para 60 sprites | BAJO | MEDIO | Con tiles 128px isométricos reales (~64×32px effective): 2048² = ~1000 tiles. Suficiente holgura. |
| Transición de tier con flicker | BAJO | BAJO | Cambiar textura en el siguiente tick, no mid-frame; si hay flicker, añadir fade de 300ms |
| Day/night overlay como Graphics invalida cache de ground | BAJO | MEDIO | Usar Sprite con textura sólida semitransparente, no Graphics — Graphics dinámicos invalidan cacheAsTexture del ground layer |
| destroy() v7 signature usada accidentalmente | BAJO | BAJO | Forbidden pattern en control-manifest: `app.destroy(bool, opts)` → usar `app.destroy({ ... })` v8 |
| PixiJS v8 update rompe APIs | BAJO | BAJO | Version-pin en package.json; solo actualizar con /setup-web-stack update |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `isometric-world.md` (pendiente) | Budget de state variants por room | Max 4 variantes por room-type; 60 sprites únicos total en MVP |
| `isometric-world.md` (pendiente) | Ciclo día/noche sin coste de sprites | Overlay Container con tinting, no sprites duplicados |
| `city-progression.md` (pendiente) | Thresholds visuales para tier transitions | `club_prestige >= 25/50/75` → tier 2/3/4; cambio en siguiente tick |
| `hud-ui.md` (pendiente) | Separación entre mundo isométrico y UI de gestión | Canvas solo para el mundo; HUD es DOM + CSS (responsive, accesible) |
| `game-concept.md` §TR3 | Mobile PWA performance del mundo isométrico | 200 sprites / 100 draw calls; `resolution: Math.min(dpr, 2)`; `cacheAsTexture` en capas estáticas |

## Performance Implications

- **CPU**: Actualización de sprites = O(S) donde S = sprites que cambiaron (típicamente <10 por tick). El tick solo re-renderiza lo que cambió.
- **GPU**: 100 draw calls × tile size 128px = presupuesto moderado para mobile GPU. `cacheAsTexture` en ground lo reduce a 1-3 draw calls para la capa base.
- **Memory**: Atlas 2048×2048 × 4 tiers = ~64MB VRAM total. Lazy loading mitiga: solo tier activo + siguiente tier en memory.
- **Load Time**: Tier 1 atlas: ~800KB (primera carga). Tiers 2-4: 800KB cada uno (lazy, en background).
- **Network**: Sprites servidos como static assets desde SvelteKit; CDN-cacheable.

## Migration Plan

No hay código de rendering existente — todo nuevo. El scaffold tiene el stub en `apps/web/src/routes/game/+page.svelte` con un PIXI.Application básico como placeholder. Esta ADR reemplaza ese stub con la arquitectura completa.

## Validation Criteria

```typescript
// Manual — performance spike requerido antes del sprint de arte

// 1. Cargar escena con max sprites (estadio tier 2, ciudad parcial, 22 jugadores)
// 2. Medir FPS con PixiJS Stats plugin en dispositivo móvil de referencia
// 3. Criterio PASS: FPS >= 55 (promedio 5 segundos) en iPhone 13 / Pixel 6
// 4. Criterio FAIL: FPS < 45 → reducir entityPoolSize o simplificar sprites

// Tests automáticos:
it('getRoomTextureKey returns correct variant for attendance > 75', () => {
  const state = new Map([['fan_attendance', 80]]);
  expect(getRoomTextureKey('stadium', state, 'tier2')).toBe('stadium_full_tier2');
});

it('getCityTier returns correct tier for prestige thresholds', () => {
  expect(getCityTier(new Map([['club_prestige', 24]]))).toBe(1);
  expect(getCityTier(new Map([['club_prestige', 25]]))).toBe(2);
  expect(getCityTier(new Map([['club_prestige', 50]]))).toBe(3);
  expect(getCityTier(new Map([['club_prestige', 75]]))).toBe(4);
});
```

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — SvelteKit routing; PixiJS ya instalado en `apps/web`
- [ADR-003](ADR-003-cascade-graph-topology.md) — WorldState incluye `fan_attendance`, `club_prestige` que esta ADR lee
- [ADR-005](ADR-005-worldstate-persistence.md) — WorldState serializado en DB; este ADR lo deserializa para visualizar
- `docs/engine-reference/web/deprecated-apis.md` §PixiJS v7→v8 — APIs concretas que no deben usarse
- `design/gdd/game-concept.md` §Visual Identity Anchor — "Lived-In Pixel" como directriz visual
