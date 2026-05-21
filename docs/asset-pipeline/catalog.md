# Asset Catalog — Cascada FC

**Status**: 🟡 Initial catalog (autopilot 2026-05-21)
**Source**: derivado de Art Bible §8.2, city-progression.md, isometric-world.md, world-life.md

Inventario exhaustivo de cada asset visual del juego. Cada fila incluye:

- **ID**: identificador único kebab-case (input al naming §8.4)
- **Categoría** (Art Bible §8.2): tile-ground, tile-prop, building, character, crowd, world-life, portrait, icon
- **Dimensiones**: pixel-exact target
- **AI**: ✅ generable o ❌ manual-only (Art Bible §8.6)
- **Sprint**: cuándo se necesita
- **Variantes**: cuántos sprites distintos contar (incluyendo day/night/weather si aplica)

---

## 1. Tiles de suelo (32×16, AI ✅)

Per `design/gdd/isometric-world.md` §3.1 + Art Bible §4.

| ID | Variantes | Sprint | Notas |
|----|-----------|--------|-------|
| `tile-ground-dirt-dry` | 1 | 22 | T1 base — campo de tierra |
| `tile-ground-dirt-patchy` | 1 | 22 | T2 transición tierra→césped |
| `tile-ground-grass-healthy` | 1 | 22 | T3 base — césped completo |
| `tile-ground-grass-pristine` | 1 | 22 | T4 base — césped premium con corte |
| `tile-ground-pavement-rough` | 1 | 22 | calles pueblo T1 (sin asfaltar) |
| `tile-ground-pavement-cobble` | 1 | 22 | calles T2 (adoquín) |
| `tile-ground-pavement-asphalt` | 1 | 23 | calles T3+ |
| `tile-ground-plaza-stone` | 1 | 22 | plaza estadio |
| `tile-ground-water` | 1 | 23 | charcos / fuente |
| **Variantes lluvia (per tier)** | 4 | 24 | Cada base + overlay charcos |

**Total tiles de suelo**: 9 base + 4 weather = **13 sprites**

---

## 2. Props (4×4 a 16×16, AI ✅ excepto narrativos)

Per Art Bible §6.3 + isometric-world.md.

### 2.1 Genéricos (AI ✅)

| ID | Tamaño | Sprint | Aparece en tier |
|----|--------|--------|-----------------|
| `prop-streetlamp` | 8×16 | 22 | T1-4 |
| `prop-bench-stone` | 16×8 | 22 | T1-4 |
| `prop-trashcan` | 8×8 | 23 | T2-4 |
| `prop-fence-metal` | 16×8 | 22 | T1-2 (oxidada) |
| `prop-fence-wood` | 16×8 | 23 | T2-3 |
| `prop-fence-decorative` | 16×8 | 24 | T4 |
| `prop-tree-deciduous` | 16×24 | 22 | T1-4 |
| `prop-tree-pine` | 16×24 | 23 | T2-4 |
| `prop-corner-flag-club` | 4×16 | 22 | Estadio (tinted con --club-primary) |
| `prop-goal-net` | 16×8 | 22 | Campo |
| `prop-mailbox` | 8×12 | 23 | T2-4 |
| `prop-bus-stop` | 16×16 | 23 | T2-4 |
| `prop-poster-board` | 8×12 | 23 | T2-4 (banderas anuncios) |
| `prop-shop-awning` | 16×8 | 23 | T2-4 (toldo) |
| `prop-table-terrace` | 16×8 | 23 | T2-4 |
| `prop-chair-terrace` | 8×8 | 23 | T2-4 |

**Total props genéricos**: ~16 sprites × ~2 variants (clear/night) = **32**

### 2.2 Narrativos (❌ MANUAL ONLY)

| ID | Tamaño | Razón manual |
|----|--------|--------------|
| `prop-trophy-cup` | 8×12 | Despacho manager — narrativo §5.1 |
| `prop-photo-frame` | 8×8 | Fotos fichajes históricos |
| `prop-mayor-letter` | 8×8 | Carta histórica del alcalde |
| `prop-plaque-dedication` | 8×4 | Reputación 7+ manager |
| `prop-broken-window-paper` | 8×8 | Crisis financiera signal |

---

## 3. Buildings (módulos 32×16 × N módulos, AI ✅ genéricos, ❌ landmark)

Per Art Bible §8.2 module stacking system.

### 3.1 Stadium modules (mix AI + manual)

| ID | Módulos altura | Sprint | AI? |
|----|----------------|--------|-----|
| `bld-stand-east-m1-empty` | 1 | 22 | ✅ |
| `bld-stand-east-m1-open` | 1 | 22 | ✅ |
| `bld-stand-west-m2-roofed` | 2 | 23 | ✅ |
| `bld-stand-north-m3-covered` | 3 | 23 | ✅ |
| `bld-stand-south-m3-vip` | 3 | 24 | ✅ (variante T4) |
| `bld-locker-room-m1` | 1 | 22 | ✅ |
| `bld-locker-room-m2` | 2 | 23 | ✅ |
| `bld-press-box-m2` | 2 | 24 | ✅ (T4) |
| `bld-gym-m1` | 1 | 24 | ✅ |
| `bld-floodlight-m4` | 4 | 24 | ✅ (T3-4) |
| `bld-club-store-m1` | 1 | 23 | ✅ |
| `bld-manager-office-m2` | 2 | 22 | ❌ MANUAL (despacho hero §5.1) |

### 3.2 City buildings (T1 desolado → T4 vibrante)

| ID | Módulos | Sprint | Tier |
|----|---------|--------|------|
| `bld-house-small-m1` | 1 | 22 | T1-2 |
| `bld-house-residential-m2` | 2 | 23 | T2-3 |
| `bld-house-apartment-m3` | 3 | 24 | T3-4 |
| `bld-tower-residential-m4` | 4 | 24 | T4 |
| `bld-tavern-m1` | 1 | 22 | T1 |
| `bld-sportsbar-m1` | 1 | 23 | T2 |
| `bld-restaurant-m2` | 2 | 23 | T3 |
| `bld-shop-grocery-m1` | 1 | 22 | T1-4 |
| `bld-shop-corner-m1` | 1 | 22 | T1-4 |
| `bld-shop-modern-m2` | 2 | 23 | T3-4 |
| `bld-hotel-club-m3` | 3 | 24 | T4 (hotel del club) |
| `bld-mall-m2` | 2 | 24 | T4 (centro comercial) |
| `bld-church-m2` | 2 | 22 | T1-4 (siempre presente) |
| `bld-plaza-fountain` | special | 23 | T2-4 |

**Total buildings**: ~26 sprites × ~3 estados (day/night/rain) = **78 sprites**

---

## 4. Characters (16×24 chibi, AI ✅ genéricos, ❌ hero)

Per Art Bible §3.1 + §5.

### 4.1 Manager + staff (❌ MANUAL — hero RPG §5.1)

| ID | Variantes | Razón manual |
|----|-----------|--------------|
| `char-manager-tier0` | 1 estática | RPG progression §5.1 — arte intencional |
| `char-manager-tier1` | 1 | Idem |
| `char-manager-tier2` | 1 | Idem |
| `char-manager-tier3` | 1 | Idem |
| `char-staff-coach-quality1` | 1 | Director con personalidad |
| `char-staff-coach-quality2` | 1 | |
| `char-staff-coach-quality3` | 1 | |
| `char-staff-scout-quality{1..3}` | 3 | |
| `char-staff-medic-quality{1..3}` | 3 | |
| `char-staff-financial-quality{1..3}` | 3 | |

### 4.2 Players (16×24, mix per role)

Players son visuales en /squad y /match. Por simplicidad MVP: 1 sprite genérico per role + variants de color de kit.

| ID | Variantes | AI? |
|----|-----------|-----|
| `char-player-goalkeeper-base` | 1 base + color slots | ✅ |
| `char-player-defender-base` | 1 base | ✅ |
| `char-player-midfielder-base` | 1 base | ✅ |
| `char-player-forward-base` | 1 base | ✅ |

**Total players**: 4 sprites con color slots = **4 sprites**

### 4.3 NPCs ambient (16×24, AI ✅)

Ver §6 abajo (world-life entities).

---

## 5. Crowd-tiles (32×32, AI ✅)

Per Art Bible §8.2 + §6.3.

### 5.1 Stadium stands

| ID | Frame | Sprint |
|----|-------|--------|
| `crowd-stand-north-empty` | 1 | 22 |
| `crowd-stand-north-sparse-f1` | 2 (loop) | 22 |
| `crowd-stand-north-sparse-f2` | 2 (loop) | 22 |
| `crowd-stand-north-packed-f1` | 2 (loop) | 23 |
| `crowd-stand-north-packed-f2` | 2 (loop) | 23 |
| `crowd-stand-north-overflowing-f1` | 2 (loop) | 24 |
| `crowd-stand-north-overflowing-f2` | 2 (loop) | 24 |

× 4 zonas (north/south/east/west) × 4 densities × 2 frames = **32 sprites**

### 5.2 Plaza + calles

| ID | Frames | Sprint |
|----|--------|--------|
| `crowd-plaza-sparse-{f1,f2}` | 2 | 23 |
| `crowd-plaza-packed-{f1,f2}` | 2 | 23 |
| `crowd-street-sparse-{f1,f2}` | 2 | 23 |
| `crowd-street-packed-{f1,f2}` | 2 | 23 |

Variantes lluvia (paraguas reemplazan cabezas):

| ID | Frames | Sprint |
|----|--------|--------|
| `crowd-plaza-sparse-rain-{f1,f2}` | 2 | 24 |
| `crowd-plaza-packed-rain-{f1,f2}` | 2 | 24 |
| `crowd-street-sparse-rain-{f1,f2}` | 2 | 24 |
| `crowd-street-packed-rain-{f1,f2}` | 2 | 24 |

**Total crowd-tiles**: 32 (stands) + 8 (plaza/street) + 8 (rain) = **48 sprites**

### 5.3 Crowd-tile convergente (matchday)

Per Art Bible §6.3 línea 771 — densidad +50% en radio 3 tiles del estadio:

| ID | Frames | Sprint |
|----|--------|--------|
| `crowd-converging-east-{f1,f2}` | 2 | 23 |
| `crowd-converging-west-{f1,f2}` | 2 | 23 |
| `crowd-converging-north-{f1,f2}` | 2 | 23 |
| `crowd-converging-south-{f1,f2}` | 2 | 23 |

**Total convergentes**: **8 sprites**

---

## 6. World-life entities (16×24 + variantes, AI ✅)

Per `design/gdd/world-life.md` §3.1 catálogo.

### 6.1 Peatones

| ID | Variantes color | Sprint |
|----|-----------------|--------|
| `wl-walker-base` | 4 paletas (skin × clothing) | 26 |
| `wl-walker-fast` | 4 paletas + inclinación 5° | 26 |
| `wl-walker-dog` | 4 paletas + perro 8×6 | 26 |
| `wl-walker-bag` | 4 paletas + bolsa 4×4 | 26 |
| `wl-walker-umbrella` | 4 paletas + paraguas (variante rain) | 26 |
| `wl-walker-scarf-club` | 4 paletas + bufanda club color (variante euforia) | 26 |
| `wl-walker-shirt-club` | 4 paletas + camiseta club (variante ascenso) | 26 |

Each tiene 8-direction sprite sheets (Art Bible §8.4: se,sw,ne,nw,s,n,e,w) — Sprint 26.

**Total walkers**: 7 tipos × 4 paletas × 8 direcciones × 2 frames = **448 sprites**.

> Nota: este número es el total absoluto. En la práctica, generamos un master con 4 paletas + 8 dirs + 2 frames per type (64 sprites por type, 448 total). El "var-color" se aplica en runtime con PixiJS tint, no son sprites separados — ajuste real: **7 × 8 dirs × 2 frames = 112 sprites con tint runtime**.

### 6.2 Vehículos personales

| ID | Variantes | Sprint |
|----|-----------|--------|
| `wl-cyclist-base` | 4 paletas | 26 |
| `wl-scooter-e-base` | 4 paletas | 26 |
| `wl-rollerblader-base` | 4 paletas | 26 |

Each: 8 directions × 2 frames = 16 sprites + tint runtime. **48 sprites total**.

### 6.3 Vehículos motorizados

| ID | Variantes | Sprint |
|----|-----------|--------|
| `wl-car-generic` | 5 paletas neutras | 26 |
| `wl-car-club` | 1 (--club-primary stripe) | 26 |
| `wl-bus-away` | 1 base + tint stripe del away team | 27 |
| `wl-van-delivery` | 1 base + logo placeholder | 26 |
| `wl-van-embargo` | 1 (variante quiebra) | 27 |
| `wl-van-movers` | 1 (variante 5L racha) | 27 |
| `wl-car-flag-celebration` | 1 (variante derby ganado) | 27 |

Each: 4 directions × 1 frame (cars rotate less) = 4 sprites + tint. **28 sprites total**.

---

## 7. UI icons (SVG, mix)

Per Art Bible §8.2: SVG escalable base 16×16.

### 7.1 Iconos custom (❌ MANUAL — SVG paramétrico)

| ID | Razón manual |
|----|--------------|
| `icon-shield-club` | Paramétrico con --club-primary |
| `icon-ball` | Identidad del juego |
| `icon-cascade` | Signature visual del Pilar 1 |
| `icon-formation` | UI custom |
| `icon-trophy-cup` | UI custom |
| `icon-stadium-mini` | UI custom |

### 7.2 Iconos genéricos (Lucide pre-existente)

Ya cubiertos: chevron, hamburger, calendar, search, etc. NO generar.

---

## 8. Portraits inbox (64×64, ❌ MANUAL ONLY)

Per Art Bible §8.6 — *"portraits NPCs con nombre nunca AI"*.

| ID | Sprint |
|----|--------|
| `portrait-director-deportivo` | 23 |
| `portrait-coach-head` | 23 |
| `portrait-scout-lead` | 23 |
| `portrait-medic-team` | 23 |
| `portrait-financial-officer` | 23 |
| `portrait-mayor-cascada` | 24 |
| `portrait-mayor-rival-{1..5}` | 24 (cuando manager-RPG llama) |
| `portrait-journalist-local-{1..3}` | 24 |
| `portrait-board-chair` | 24 |

**Total portraits**: ~15 sprites manuales.

---

## 9. Asset count summary

| Categoría | AI ✅ | Manual ❌ | Total |
|-----------|-------|-----------|-------|
| Tiles ground | 13 | 0 | 13 |
| Props genéricos | 32 | 5 | 37 |
| Buildings stadium | 11 | 1 | 12 |
| Buildings city | 78 | 0 | 78 |
| Characters manager/staff | 0 | ~16 | 16 |
| Characters players | 4 | 0 | 4 |
| Crowd-tiles | 48 | 0 | 48 |
| Convergent crowd | 8 | 0 | 8 |
| World-life walkers | 112 (con tint runtime) | 0 | 112 |
| World-life vehículos personales | 48 | 0 | 48 |
| World-life vehículos motorizados | 28 | 0 | 28 |
| UI icons | 0 | 6 | 6 |
| Portraits | 0 | 15 | 15 |
| **TOTAL** | **~382** | **~43** | **~425 sprites únicos** |

A 1 sprite/min con generación + cleanup automatizado, **~6h de generación
automatizada para todo el set base**. Realistically con iteración: **2-3
días de batches** para los 382 AI assets + 1-2 semanas de Pablo + artista
para los 43 manuales.

---

## 10. Validation rules (Art Bible §8.2 + §8.6)

Cada asset generado debe pasar:

1. **Palette check**: 100% de píxeles ∈ paleta Art Bible §4
2. **Dimension check**: exact pixel match con §8.2 categoría
3. **Alpha check**: 1-bit alpha (sin gradient transparency) per §8.3
4. **Silueta legible**: visible a 50% zoom (manual review)
5. **Cell-shading**: 3 tonos por zona (§4 paleta tier-aware)
6. **Naming**: matches Art Bible §8.4 pattern

Cualquier fallo → re-generate o pase manual.
