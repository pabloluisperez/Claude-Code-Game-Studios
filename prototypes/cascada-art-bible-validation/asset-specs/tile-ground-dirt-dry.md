# Asset Spec — `tile-ground-dirt-dry.png`

> **Category**: Tile base (suelo)
> **Used in**: Tier 0 ground — campo de tierra inicial, calles sin pavimentar
> **Bible refs**: §3.2 (geometría) · §4.1 (paleta Tier 0) · §6.2 (texture philosophy) · §8.1 (tile lock 32×16) · §8.4 (naming)

## Especificación técnica

| Campo | Valor |
|---|---|
| **Dimensiones** | 32×16 px (diamante isométrico, ratio 2:1) |
| **Formato** | PNG-8 indexed con 1-bit alpha |
| **Bordes** | Diamante completo; píxeles fuera del diamante transparentes (alpha 0) |
| **Frames** | 1 frame estático |
| **Paleta** | Estrictamente §4.1 — ver tabla abajo |
| **Filename** | `tile-ground-dirt-dry.png` |
| **Atlas destino** | `atlas-tiles.png` |

## Paleta utilizada

| Hex | Rol | % superficie objetivo |
|---|---|---|
| `#5C3D1E` Tierra seca | Color dominante del tile | 70-80% |
| `#7A5230` Madera envejecida | Variación leve dentro del tile (1-2 píxeles agrupados) | 10-15% |
| `#603020` (variante oscura Tierra seca) | Sombra sutil bajo bordes | 5-10% |
| `#2E2018` Sombra interior | NO usar en este tile (reservado para edificios) | 0% |

## Rasgos visuales clave

- **Diamante puro**: 4 vértices definidos exactos en (16,0), (32,8), (16,16), (0,8)
- **Sin gradientes**: cell-shading 3 tonos como máximo (§6.2)
- **Sin dithering**: solo permitido en sombras bajo edificios, NO en tile base
- **Textura sugerida**: 3-5 píxeles agrupados de `#7A5230` simulando piedras pequeñas o desperfectos del suelo. NO patrón regular (anti-tile-repetition)
- **Sin contorno outline**: §6.2 prohíbe outline sistemático

## AI generation prompt (Stable Diffusion pixel-art fine-tuned)

```
isometric pixel art tile, 32x16 pixels, diamond shape, dry dirt ground,
warm brown color #5C3D1E primary, small clusters of darker pebbles #7A5230,
no grass, no vegetation, no plants, palette restricted to 4 brown tones only,
spanish village dirt road, weathered but not abandoned, flat lighting,
no outline, no anti-aliasing, no dithering, cell-shading 3 tones max,
clean diamond edges, transparent corners outside diamond, Habbo Hotel style isometric tile
```

**Negative prompt**:
```
3d, photorealistic, anti-aliasing, blur, gradient, smooth shading, outline, border,
neon, saturated, green, blue, grass, vegetation, ground texture noise, repeating pattern
```

## Manual cleanup checklist (post-AI)

- [ ] Todos los píxeles no-transparentes coinciden exactamente con paleta §4.1 (validable con `build:validate-palette` script)
- [ ] Dimensiones exactas 32×16 px (no 32×17, no 33×16)
- [ ] Diamante completo: vértices precisos en (16,0), (32,8), (16,16), (0,8)
- [ ] Píxeles fuera del diamante: alpha 0 (transparente puro)
- [ ] Bordes del diamante: alpha 255 (sin transparencia parcial)
- [ ] Test de legibilidad: a scale ×0.5 (16×8) el tile sigue siendo identificable como "suelo de tierra"
- [ ] Test de tileability: 4 copias adyacentes en grid forman patrón coherente sin bordes visibles
- [ ] NO contiene colores fuera de paleta (especialmente: verde, azul, rosa)

## Validación contra bible

- **§3.2 geometría**: ✓ 32×16 diamond, 26.57° iso
- **§4.1 paleta**: ✓ solo Tier 0 base colors
- **§6.2 dithering**: ✓ ningún dithering en superficie de tile
- **§6.2 outline**: ✓ sin outline sistemático
- **§8.1 size lock**: ✓ 32×16 exacto
- **§8.3 format**: ✓ PNG-8 indexed con 1-bit alpha
- **§8.8 anti-standards**: ✓ no JPEG, no mipmap, no transparencia parcial en bordes

## Notas de producción

- Variantes que se derivan de este tile: `tile-ground-dirt-dry.png` (este) → `tile-ground-dirt-wet.png` (con `#A8A0A0` charcos), `tile-ground-dirt-snowy.png` (variante invierno, color overlay).
- Este tile se usa hasta que el club alcanza Tier 1 en el campo — entonces se sustituye por `tile-ground-grass-worn.png` (next spec).
- Tier 0 dirt persiste en zonas sin desarrollar del mapa incluso en Tier 3+.
