# Prompt Templates — ComfyUI Asset Generation

**Status**: 🟡 v1 templates (autopilot 2026-05-21)
**Stack**: SDXL + LoRAs pixel-art + isometric
**Output target**: 1024×1024 → palette quantize → downscale a target tile size

Cada template tiene:

- **Base style** (cadena fija; identidad visual Art Bible §1.2)
- **Modifiers** (variables específicas por asset)
- **Negative prompt** (anti-rules Art Bible §4.6, §8.8)
- **Sampling params** (seed, steps, cfg)

---

## 0. Base style (común a todos los assets)

Cadena prefix que precede a cada prompt específico:

```
pixel art, retro game asset, isometric projection, 26.57 degree angle,
clean nearest-neighbor edges, no anti-aliasing on geometric forms,
limited color palette, cell-shaded with exactly 3 tones per surface,
small detail at 32 by 16 pixel scale, Habbo Hotel inspired chibi style,
warm cozy small-town atmosphere, no neon, no high-contrast spectacle,
quiet contemplative mood,
```

### Base negative (común a todos)

```
photorealistic, 3d render, smooth gradients, blurry, soft shadows,
anti-aliased pixel edges, more than 3 tones per surface, neon glow,
particle effects, decorative animation, flying birds, lens flare,
HDR, complex lighting, modern flat design, vector art with thin lines,
text, watermark, signature, frame, border
```

### Sampling defaults (SDXL)

```
sampler: dpmpp_2m_karras
steps: 30
cfg: 6.5
width: 1024
height: 1024
seed: <deterministic per asset_id>
```

LoRAs aplicadas (orden estricto):

1. `pixel-art-xl` weight 0.8
2. `isometric-pixel-art` weight 0.6 (si disponible)
3. `chibi-character-style` weight 0.4 (solo characters)

---

## 1. Tiles de suelo (32×16)

### Template

```
{base_style}
single isometric tile, ground tile of {GROUND_TYPE},
{WEATHER_VARIANT},
{TIME_OF_DAY_VARIANT},
top-down isometric diamond shape, viewable from 30 degree angle,
no foreground objects, no characters, no buildings,
only the ground texture, palette {TIER_PALETTE},
sharp pixel edges, 32 pixels wide 16 pixels tall,
single tile only no grid
```

### Variables por tier

| Variable | T1 | T2 | T3 | T4 |
|----------|----|----|----|----|
| `TIER_PALETTE` | "ash brown, dust gray, faded ochre" | "warm brown with club color stains" | "club primary tints with green grass" | "high saturation, vibrant club colors" |

### Variables específicas

#### `tile-ground-dirt-dry`

```
{GROUND_TYPE} = "dry dirt with cracked earth pattern"
{WEATHER_VARIANT} = "no puddles, no moisture"
{TIME_OF_DAY_VARIANT} = "midday lighting"
```

#### `tile-ground-grass-pristine`

```
{GROUND_TYPE} = "professional football field grass with diagonal mowing pattern"
{WEATHER_VARIANT} = "dry, sun-lit"
{TIME_OF_DAY_VARIANT} = "afternoon match-day lighting"
```

#### `tile-ground-pavement-cobble` (T2 streets)

```
{GROUND_TYPE} = "cobblestone street tile, small irregular stones, slightly worn"
{WEATHER_VARIANT} = "dry"
{TIME_OF_DAY_VARIANT} = "neutral lighting"
```

---

## 2. Props (4×4 a 16×16)

### Template

```
{base_style}
single small isometric prop, {PROP_DESCRIPTION},
isolated on transparent background,
no shadow on ground (will be composited separately),
silhouette readable at 50% zoom,
sharp pixel edges, palette consistent with city tier {TIER},
size approximately {WIDTH} by {HEIGHT} pixels,
single object only
```

### Ejemplos

#### `prop-streetlamp` (8×16)

```
{PROP_DESCRIPTION} = "iron streetlamp, vintage gas-light style, slightly weathered, with small bulb at top"
{WIDTH} = 8
{HEIGHT} = 16
```

#### `prop-tree-deciduous` (16×24)

```
{PROP_DESCRIPTION} = "small isometric deciduous tree, green leafy canopy, brown trunk, no bird, no decoration"
{WIDTH} = 16
{HEIGHT} = 24
```

#### `prop-corner-flag-club` (4×16, post-tint)

```
{PROP_DESCRIPTION} = "corner flag pole with neutral white flag, thin pole, no club color (color applied at runtime)"
{WIDTH} = 4
{HEIGHT} = 16
```

(Tint del color del club se hace en PixiJS runtime, no en el sprite.)

### Negative específico props

```
{base_negative},
no shadow, no ground beneath prop, no other objects in frame
```

---

## 3. Buildings (módulos 32×16, stack vertical 16px)

### Template

```
{base_style}
isometric building module, {BUILDING_DESCRIPTION},
single module ground level only, no foundation, no roof unless specified,
32 pixels wide and {MODULE_HEIGHT} pixels tall,
window and door details readable at 50% zoom,
materials: {MATERIAL_LIST},
color palette appropriate for tier {TIER} city,
day-time lighting unless specified, sharp pixel edges
```

### Ejemplos

#### `bld-stand-east-m1-empty` (32×16, T1 — gradas básicas)

```
{BUILDING_DESCRIPTION} = "small stadium stand, basic concrete bleachers, low height, empty no crowd"
{MODULE_HEIGHT} = 16
{MATERIAL_LIST} = "weathered concrete, metal railings, exposed structure"
{TIER} = 1
```

#### `bld-stand-north-m3-covered` (32×48, T3)

```
{BUILDING_DESCRIPTION} = "three-tier stadium stand with covered roof, modern construction, supporting columns visible"
{MODULE_HEIGHT} = 48
{MATERIAL_LIST} = "concrete pillars, metal roof, painted in club colors (apply tint at runtime)"
{TIER} = 3
```

#### `bld-tavern-m1` (32×16, T1)

```
{BUILDING_DESCRIPTION} = "small village tavern, wooden facade, one window with shutter, weathered look"
{MODULE_HEIGHT} = 16
{MATERIAL_LIST} = "rough wood planks, slate roof, small chimney"
{TIER} = 1
```

#### `bld-hotel-club-m3` (32×48, T4)

```
{BUILDING_DESCRIPTION} = "three-story boutique hotel, modern with rustic touches, club logo placeholder above entrance"
{MODULE_HEIGHT} = 48
{MATERIAL_LIST} = "stucco walls, large windows, metal balconies, awning"
{TIER} = 4
```

### Day/night variants

Para cada building base, generamos:

- **Day** (base prompt)
- **Night** — añadir: `night time, warm interior lights from windows, dark exterior, no glow halo on the building itself just window glow`
- **Rain** — añadir: `rain falling, slick wet surfaces, slight water puddles at base, no rainbow no dramatic effects`

---

## 4. Crowd-tiles (32×32, 2-frame loop)

### Template

```
{base_style}
isometric crowd tile, top-down view of grouped people sitting or standing,
{CROWD_DENSITY} density,
small chibi heads visible (2 to 4 individuals integrated into single tile),
{LOCATION_CONTEXT},
no individual face details (silhouettes only),
shoulder-movement frame {FRAME_NUMBER} of 2,
32 by 32 pixel tile, single tile only
```

### Variables

| `CROWD_DENSITY` | Heads visible |
|-----------------|---------------|
| empty | 0-1 |
| sparse | 2 |
| packed | 4 |
| overflowing | 4 + suggested crowd behind |

| `LOCATION_CONTEXT` | Description |
|--------------------|-------------|
| stadium stand | "on stadium seating, viewed from behind/above" |
| plaza | "standing in city plaza, casual" |
| street | "walking along sidewalk, casual" |

### Frame variation (loop animation)

- Frame 1: shoulders neutral position
- Frame 2: shoulders slightly raised/lowered (≤1px difference)

Per Art Bible §8.2: "movimiento de hombros" — no head movement, no leg
movement, just very slight shoulder shift to suggest breathing/standing.

---

## 5. Characters (16×24 chibi)

### Template

```
{base_style},
chibi pixel character sprite, 16 pixels wide 24 pixels tall,
{ROLE_DESCRIPTION},
{POSE},
{DIRECTION_FACING},
isometric 3/4 view,
head is 30 to 35 percent of total sprite height,
shoulders 10 pixels wide,
neutral expression unless specified,
no background, transparent,
single character only
```

### Variables por rol

#### `char-player-goalkeeper-base`

```
{ROLE_DESCRIPTION} = "football goalkeeper in athletic stance, white kit base color (apply club colors at runtime), gloves"
{POSE} = "idle stance, slightly bent knees, hands ready"
{DIRECTION_FACING} = "facing south-east, 3/4 view"
```

#### `char-staff-coach-quality3`

```
{ROLE_DESCRIPTION} = "experienced head coach, mature adult, professional appearance, club polo shirt (apply tint runtime), holding tablet"
{POSE} = "standing confident, arms crossed"
{DIRECTION_FACING} = "facing south-east, 3/4 view"
```

(Note: char-staff-* son MANUAL per Art Bible §8.6. Estos prompts son para
referencia futura si la política cambia o como base de inspiración para
el artista humano.)

### Directions (8 ortogonales)

Generar las 8 direcciones requeridas (Art Bible §8.4):
`se, sw, ne, nw, s, n, e, w`. Cada dirección es un sprite separado.
Recomendación: generar `se` primero como master, derivar resto con
mirror + manual touch-up.

---

## 6. World-life entities (variants)

### 6.1 Walker base

```
{base_style},
chibi pedestrian walking, 16 wide 24 tall,
average adult in casual clothes (jeans, simple shirt), neutral pose,
walking forward, mid-step animation frame {FRAME},
isometric 3/4 view facing {DIRECTION},
no facial details, just silhouette and clothing colors
```

8 directions × 2 frames = 16 sprites por color paleta. Apply tint runtime
para 4 paletas → 16 sprites total per walker type.

### 6.2 Walker-dog

```
{base_style},
chibi pedestrian walking with small dog on leash,
16 wide 24 tall for human plus 8 wide 6 tall for dog one tile behind,
leash visible as 1 pixel thick line,
{FRAME} of walking cycle, isometric 3/4 view facing {DIRECTION},
neutral expression, dog has visible ears and tail
```

### 6.3 Cyclist

```
{base_style},
chibi cyclist on bicycle, 18 wide 22 tall,
rider seated, hands on handlebars,
bicycle visible with 2 small wheels (8 by 8 pixels each),
wheels in rotation animation frame {FRAME},
isometric 3/4 view facing {DIRECTION},
helmet optional (1 of 4 variants), casual clothes
```

### 6.4 Scooter-e (electric scooter)

```
{base_style},
chibi person on electric kick scooter,
14 wide 24 tall, standing on platform, one foot pushing off,
small wheels visible,
isometric 3/4 view facing {DIRECTION},
helmet, casual clothes, modern style
```

### 6.5 Car-generic (24×16)

```
{base_style},
small isometric car, 24 by 16 pixels,
boxy modest style (no luxury sports), no logos,
{CAR_COLOR} body color,
viewed from 30 degree isometric angle,
no character visible inside,
4 directions only (NE, NW, SE, SW)
```

Color paletas: `desaturated red`, `dusty blue`, `forest green`, `cream
white`, `urban gray`.

### 6.6 Bus-away (matchday)

```
{base_style},
small isometric bus, 36 by 18 pixels,
boxy vintage style, 6 windows visible,
neutral light gray base color (away team color tint applied runtime),
small destination sign over driver's window,
isometric 3/4 view facing {DIRECTION},
no passengers visible in detail
```

### 6.7 Van-embargo (variante quiebra)

```
{base_style},
small isometric utility van, 28 by 16 pixels,
official-looking with siren light on roof (1 pixel red + 1 pixel blue),
plain white body, no logos,
isometric 3/4 view facing {DIRECTION}
```

---

## 7. Tier-aware variants

Para los sprites que cambian con tier (per city-progression.md §3.1), el
mismo asset_id se genera en N versiones:

| Sprite | T1 variant | T4 variant |
|--------|-----------|-----------|
| `tile-ground-grass-*` | dry tones | vibrant green |
| `bld-stand-east-m1-*` | "weathered concrete, rusted metal railings" | "modern concrete, painted railings, sponsor banner" |
| `prop-bench-stone-*` | "weathered stone, moss spots" | "polished granite, brass plaque" |

Aplicar `tier` como modifier del prompt base:

```
{base_style}
{...specific prompt...},
city tier {TIER}: {TIER_DESCRIPTOR}
```

Donde `TIER_DESCRIPTOR`:

- T1: "neglected, abandoned, ash-brown palette, no signs of investment"
- T2: "early signs of growth, mixed states, modest investment"
- T3: "established city, well-maintained, club presence visible"
- T4: "prosperous metropolis, modern infrastructure, club identity everywhere"

---

## 8. Seed strategy (determinism)

Para reproducibilidad:

```
seed(asset_id) = hash(asset_id) modulo 2^32
```

Mismo `asset_id` siempre regenera el mismo sprite. Cambio de prompt
template → mismo seed produce diferente sprite. Útil para A/B tests de
prompt revisions.

`hash` = simple FNV-1a sobre el asset_id en kebab-case.

---

## 9. Iteration protocol

1. Primer batch: 1 sprite por categoría (1 tile + 1 prop + 1 building + 1 char) → review con Pablo
2. Si aprobado → batch completo del Sprint 22 (~30 sprites)
3. Review batch
4. Si aprobado → continúa a Sprint 23 batch
5. Si rechazo: ajuste prompts (este doc) + re-batch

Cada prompt revision se commitea a este doc con el cambio + razón.

---

## 10. Negative prompts adicionales por categoría

### Tiles

```
{base_negative}, no characters, no objects, no shadow, no border around tile, no grid lines, no multiple tiles, just texture
```

### Buildings

```
{base_negative}, no character visible, no vehicle, no flag pole except corner-flag asset, no over-detailed window, no roof gardens, no neon signs
```

### Crowd-tiles

```
{base_negative}, no individual recognizable face, no facial expression, no leg movement, no walking, just shoulder breathing, no clothing patterns (solid colors only)
```

### Characters

```
{base_negative}, no weapons, no over-detailed face, no realistic anatomy proportions, no muscle definition, no shadow on ground, no aura, no glow
```

### World-life entities

```
{base_negative}, no detailed facial features, no logo on clothing (apply at runtime), no helmet for walkers (only cyclists/scooters), no character riding alone in cars
```

---

## 11. Output format expected

ComfyUI output PNG 1024×1024 RGBA → post-process pipeline:

1. Crop a sprite region (auto-detect transparent borders)
2. Palette quantize a paleta Art Bible §4 (script `tools/asset-pipeline/palette-quantize.ts`)
3. Downscale a target size con nearest-neighbor (script `downscale-clean.ts`)
4. Validate (script `validate-palette.ts`)
5. Save a `assets/sprites/<category>/<asset_id>.png`

Output final: PNG-8 indexed con 1-bit alpha per Art Bible §8.3.
