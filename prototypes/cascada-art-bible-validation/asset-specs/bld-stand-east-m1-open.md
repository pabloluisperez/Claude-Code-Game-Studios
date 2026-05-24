# Asset Spec — `bld-stand-east-m1-open.png`

> **Category**: Building module — grada lateral del estadio
> **Used in**: Estadio Tier 1 (primer estadio del jugador después del Threshold T0→T1)
> **Bible refs**: §3.2 (cuboid Habbo) · §4.2.5 (gradas + crowd density) · §6.1 (Spanish modesto)
> **Critical**: este es el primer asset de estadio que el jugador ve después de cruzar Tier 1 — primer payoff visual de Pillar 2

## Especificación técnica

| Campo | Valor |
|---|---|
| **Dimensiones** | 48×32 px (footprint 32×16 + módulo altura 16 + proyección isométrica) |
| **Formato** | PNG-8 indexed con 1-bit alpha |
| **Tipo** | Building base module — 1 módulo de altura |
| **Frames** | 1 frame estático |
| **Variantes estado** | `open` (este), `with-crowd-empty`, `with-crowd-sparse`, `with-crowd-normal`, `with-crowd-full`, `with-crowd-packed` |
| **Filename** | `bld-stand-east-m1-open.png` |
| **Atlas destino** | `atlas-buildings.png` |

## Paleta utilizada (Tier 1 gradas)

| Hex | Rol | % superficie objetivo |
|---|---|---|
| `#8C6B47` Polvo de fachada | Estructura de la grada (paredes laterales) | 40% |
| `#7A5230` Madera envejecida | Bancos/asientos (líneas horizontales) | 30% |
| `#2E2018` Sombra interior | Sombra bajo gradas + interior del paso | 15% |
| `#C4B49A` Cal fachada | Solo en frontal — pintura fresca Tier 1 | 10% |
| `#504844` Ceniza tejado | Borde superior de la grada (sin cubierta en Tier 1) | 5% |

## Composición visual

```
          [escalón superior]      ← y=0-2   Madera envejecida en sombra
        ___________________
       /                   \      ← y=2-8   Cal fachada + sombra Sombra interior
      /  [4 hileras asientos]\
     /  _ _ _ _ _ _ _ _ _ _  \    ← Bancos: 4 líneas horizontales de Madera envejecida 1px alto
    /                          \  ← y=8-16  Polvo de fachada (estructura)
   |  [Estructura lateral]      | ← Sombra bajo estructura
   |____________________________|← y=16-32 Sombra interior bajo grada + base
```

## Rasgos visuales clave Tier 1 — Pueblo modesto

- **Asientos visibles**: 4 hileras de bancos `#7A5230`, 1 px alto cada uno, separadas 2 px verticales
- **Estructura sin pintar**: zonas laterales en `#8C6B47` con marcas leves de humedad (1-2 píxeles más oscuros)
- **Frontal con cal**: panel central pintado con `#C4B49A` — única zona "limpia" — primera mejora del Tier 1
- **Sin cubierta**: Tier 1 las gradas son al aire libre. La sombra de cubierta llegará en Tier 2
- **Sin proyectores**: tampoco hay luces. Tier 3 los añade
- **Banderín del club**: NO en este módulo base. El banderín vive en sprite separado `prop-banderin-club-m1.png` para que el sistema lo añada cuando `--club-primary` esté definido

## AI generation prompt

```
isometric pixel art building module, 48x32 pixels footprint,
spanish modest soccer stadium stand, single tier without cover,
weathered concrete construction in #8C6B47 dust color, fresh white wash on front panel #C4B49A,
4 horizontal rows of wooden bench seats #7A5230,
dark shadow under stand structure #2E2018,
amateur club aesthetic, 1970s-1980s spanish village stadium,
no floodlights, no cover/roof, no advertising boards,
flat shading 3 tones, no outline, no anti-aliasing, no gradient,
palette restricted to 5 brown/cream/dark tones, clean isometric projection
```

**Negative prompt**:
```
3d, photorealistic, modern stadium, professional, Wembley, Camp Nou,
glass, steel, LED screens, glowing, neon, smooth shading,
anti-aliasing, blur, complex roofing, awning, banners
```

## Manual cleanup checklist

- [ ] Dimensiones exactas 48×32 px (footprint 32×16 + proyección iso)
- [ ] Footprint isométrico: bounding box del módulo cabe en 32×16 px (diamond) en planta
- [ ] 4 hileras de asientos visibles y contables a zoom ×1
- [ ] Panel frontal con `#C4B49A` ocupa zona central (no toda la fachada)
- [ ] Sombras `#2E2018` bajo la estructura, no en la cara iluminada
- [ ] NO contiene `--club-primary` ni colores de club (esos son banderines separados)
- [ ] Stackeable: si se duplica verticalmente con offset 16 px, las gradas se ven coherentes (Tier 2 mejora)
- [ ] Test legibilidad: a zoom ×0.5 (24×16) sigue siendo identificable como grada

## Validación contra bible

- **§3.2 cuboid Habbo**: ✓ 32×16 footprint, módulo 16 altura
- **§4.1 paleta Tier 0**: ✓ Polvo fachada + Madera envejecida + Sombra interior
- **§4.2.1 Tier 1 additions**: ✓ Cal fachada presente (primera mejora)
- **§4.2.5 gradas dim 1**: ✓ Tier 1 = "Gradas básicas de un nivel, bancos de madera, sin cubierta"
- **§6.1 Spanish modesto**: ✓ asientos visibles, sin estructura moderna, época 70-80
- **§6.4 storytelling**: ✓ panel frontal con cal = "alguien invirtió en pintarlo" = Tier 1 first sign of investment

## Sprites relacionados de esta familia

- `bld-stand-east-m1-with-crowd-empty.png` (overlay: crowd-tile densidad 0)
- `bld-stand-east-m1-with-crowd-sparse.png` (overlay densidad 1)
- `bld-stand-east-m1-with-crowd-normal.png` (overlay densidad 2)
- `bld-stand-east-m1-with-crowd-full.png` (overlay densidad 3)
- `bld-stand-east-m1-with-crowd-packed.png` (overlay densidad 4 + "de pie" overlay)
- `bld-stand-east-m2-open.png` (Tier 2 — segundo nivel)
- `bld-stand-east-m3-open.png` (Tier 3 — tercer nivel con cubierta)
- `bld-stand-east-m4-open.png` (Tier 3 max — palco VIP)

## Notas de producción

- Esta es la grada **lateral este** del estadio. Hay variantes orientation: `north`, `south`, `west` con el mismo canon
- El stack vertical en Tier 2: este sprite + `bld-stand-east-m2-open.png` apilados con offset 16px = grada de 2 niveles
- En Tier 3: stack de 3 niveles + cubierta + proyectores en mástiles separados (`prop-floodlight-mast.png`)
- Banderines del club son **sprites separados** que se anclan en runtime cuando `--club-primary` está definido
- Este es el primer payoff visual del jugador después del Threshold T0→T1 — el momento donde "tu estadio empieza a existir"
