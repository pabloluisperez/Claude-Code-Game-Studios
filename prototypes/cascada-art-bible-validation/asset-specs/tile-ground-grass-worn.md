# Asset Spec — `tile-ground-grass-worn.png`

> **Category**: Tile base (suelo) — variante Tier 1+
> **Used in**: Campo de fútbol Tier 1, zonas verdes pueblo Tier 2+
> **Bible refs**: §3.2 (geometría) · §4.2.1 (Tier 1 colors) · §4.2.4 (wear pattern) · §6.2 (texture)
> **Critical**: este es el par de color con marrón Tier 0 para colorblind safety (§4.2.1)

## Especificación técnica

| Campo | Valor |
|---|---|
| **Dimensiones** | 32×16 px (diamante isométrico) |
| **Formato** | PNG-8 indexed con 1-bit alpha |
| **Bordes** | Diamante completo; transparente fuera |
| **Frames** | 1 frame estático por variante de wear |
| **Variantes** | 3 (sin wear / medio / intenso) — ver §4.2.4 |
| **Filename** | `tile-ground-grass-worn.png` (variante medio) |
| **Atlas destino** | `atlas-tiles.png` |

## Paleta utilizada

| Hex | Rol | Sin wear | Medio wear | Intenso wear |
|---|---|---|---|---|
| `#4A9968` Césped vivo | Color base | 80% | 60% | 40% |
| `#3D7A50` Césped wear | Patches desgastados | 15% | 30% | 45% |
| `#5BBF7E` Highlight hierba | Texturita 2px dots de hierba | 5% | 8% | 5% |
| `#5C3D1E` Tierra (parche descubierto) | Solo en wear intenso (área de penalty, centro) | 0% | 2% | 10% |

## La transición marrón→verde (colorblind safety)

Este tile debe pasar el test de deuteranopia/protanopia simulated contra `tile-ground-dirt-dry.png`:

- `#5C3D1E` (tierra) vs `#4A9968` (césped): luminancia preserved ratio ~4:1 incluso bajo daltonismo rojo-verde
- **Segundo canal obligatorio**: textura 2px dots de `#5BBF7E` PRESENTES en grass-worn, AUSENTES en dirt-dry
- DOM label sincronizado: "Campo de tierra" → "Campo con césped"

**Validación pendiente**: Coblis simulation antes de stamp final del primer asset.

## Rasgos visuales clave

- **Wear pattern** (clave §4.2.4):
  - Variante **medio**: 30% de superficie con tono `#3D7A50` (más oscuro) en patches irregulares
  - Variante **intenso**: 45% wear + algunos parches de `Tierra seca` visibles (centro del campo, áreas de penalty)
- **Hierba como textura**: 2px dots de `#5BBF7E` distribuidos pseudo-aleatoriamente (semilla determinista por tile position → mismo tile siempre se ve igual)
- **NO patrón regular**: los wear patches NO siguen retícula — aspecto orgánico de uso real
- **Sin antialiasing**: bordes nítidos entre `Césped vivo` y `Césped wear`

## AI generation prompt

```
isometric pixel art tile, 32x16 pixels, diamond shape, soccer field worn grass,
green color #4A9968 primary, darker green patches #3D7A50 30%,
small grass highlights #5BBF7E 2px dots, no flowers, no decorative plants,
worn soccer pitch from amateur club, faded but still playable,
spanish modest village field, palette restricted to 3 green tones only,
no outline, no anti-aliasing, cell-shading 3 tones max,
clean diamond edges, transparent corners outside diamond
```

**Negative prompt**:
```
3d, photorealistic, professional turf, manicured lawn, FIFA pitch,
gradient, smooth, anti-aliasing, glow, neon green, blue, yellow,
flowers, sprinklers, white lines (those are separate sprites)
```

## Manual cleanup checklist

- [ ] Wear pattern es asimétrico (no retícula, no patrón geométrico obvio)
- [ ] `#5BBF7E` highlights presentes (≥ 4 dots por tile) — second channel para colorblind
- [ ] Bajo simulación deuteranopia (Coblis), tile sigue distinguible de `tile-ground-dirt-dry.png`
- [ ] Dimensiones 32×16 exactas
- [ ] Paleta validada: 3-4 colores exactos (sin verdes intermedios)
- [ ] 4 copias adyacentes generan campo coherente sin visible repetition
- [ ] Variante "intenso" tiene parches de tierra `#5C3D1E` (cross-contamination zone)

## Validación contra bible

- **§3.2**: ✓ 32×16 diamond
- **§4.2.1 Tier 1**: ✓ Césped vivo + Césped wear + highlights
- **§4.2.4 wear pattern**: ✓ 3 variantes intensidad + tierra en variante intenso
- **§4.6 anti-rules**: ✓ no saturación > 90%, no neon, paleta limitada
- **§6.2 cell-shading**: ✓ 3 tonos planos, sin gradient
- **§8.1 tile lock**: ✓ 32×16

## Variantes derivadas

1. `tile-ground-grass-pristine.png` — Tier 2+ (esquinas del campo, parques de ciudad)
2. `tile-ground-grass-worn-mid.png` — bandas y media cancha
3. `tile-ground-grass-worn-heavy.png` — áreas de penalty + centro del campo
4. `tile-ground-grass-wet.png` — clima lluvia (overlay azul-frío)
5. `tile-ground-grass-snow.png` — invierno (overlay blanco/gris)

## Notas de producción

- En Tier 0 el campo NO usa este tile — usa una mezcla de `tile-ground-dirt-dry` + `tile-ground-grass-dead` (con `Hierba agostada #6B7A3A`)
- El cambio a `tile-ground-grass-worn` es el momento del primer Threshold Crossing visible del campo (§2 Estado 4)
- Las líneas blancas del campo son sprites separados (`prop-field-line-*.png`), NO van en este tile
