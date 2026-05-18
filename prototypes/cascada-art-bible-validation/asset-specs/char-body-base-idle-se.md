# Asset Spec — `char-body-base-idle-se.png`

> **Category**: Character (capa Base corporal)
> **Used in**: Sistema composición §5.2 — base layer para TODOS los personajes individuales del mundo (manager, jugadores, staff)
> **Bible refs**: §3.1 (canon 16×24) · §5.2 (composición 6 capas) · §5.5 (expresiones) · §5.6 (LOD)
> **Crítico**: este es el sprite del que dependen TODAS las composiciones de personajes

## Especificación técnica

| Campo | Valor |
|---|---|
| **Dimensiones** | 16×24 px |
| **Formato** | PNG-8 indexed con 1-bit alpha |
| **Bordes** | Silueta humanoide; fondo transparente |
| **Frames** | 1 frame por (pose × dirección) |
| **Variantes pose** | 3: `idle`, `walk`, `action` (§5.2) |
| **Variantes dirección** | 8: `se`, `sw`, `ne`, `nw`, `s`, `n`, `e`, `w` |
| **Total sprites de esta capa** | 1 cuerpo × 3 poses × 8 dirs = 24 sprites |
| **Filename** | `char-body-m01-idle-se.png` (este = body model 01 / idle / south-east) |
| **Atlas destino** | `atlas-chars.png` |

## Canon de proporciones (§3.1)

```
   ___        ← y=0  (top of head)
  |   |       ← cabeza 6×6 px (área facial)
  |___|       ← y=6
  |     |     ← hombros 8 px ancho
  |     |     ← cuerpo 10 px alto
  |_____|     ← y=16
   |   |      ← piernas 8 px ancho
   |   |      ← piernas 8 px alto
   |___|      ← y=24 (base/pies)
```

- **Cabeza**: 6 px ancho × 6-7 px alto (30-35% altura total)
- **Hombros**: 10 px ancho aprox
- **Cuerpo**: 8 px ancho × 10 px alto
- **Piernas**: 8 px ancho (juntas) × 8 px alto
- **Centro de masa**: x=8 (centrado horizontalmente)

## Paleta utilizada (capa base — sin color de piel ni ropa)

| Hex | Rol |
|---|---|
| `#FF00FF` Magenta sentinel | Placeholder para zonas de piel (será reemplazado por capa skin) |
| `#FE00FE` Magenta secundario | Placeholder para zonas de ropa (será reemplazado por capa shirt) |
| `#2E2018` Sombra interior | Outline mínimo + sombra bajo barbilla y bajo brazos |
| `#1A1410` Negro profundo | Pelo (capa hair sobrescribirá esto) |

**Crítico**: la capa `base` usa **magenta sentinel** (`#FF00FF` y `#FE00FE`) en las zonas que serán pintadas por capas superiores en runtime. El script `build:validate-palette` reconoce magenta como excepción válida-condicional (§8.8).

## Rasgos visuales clave — Habbo-íntimo proportions

- **Cabeza ligeramente cabezuda**: 6 px ancho hace que la cabeza sea visualmente prominente sin ser super-deformed
- **Cuello implícito**: NO se dibuja cuello — la cabeza se sitúa directamente sobre los hombros
- **Hombros redondeados**: 2 px en cada lado del cuerpo, suavizan la silueta para que no parezca robot
- **Piernas distinguibles**: hay 1 px de gap entre piernas en idle (no son una sola masa)
- **Pies pequeños**: 2 px ancho cada uno, sutilmente diferenciados del cuerpo
- **Pose idle SE (south-east)**: vista 3/4 — un hombro ligeramente más adelante que el otro

## Pose `idle` específica

- Postura relajada, peso ligeramente sobre una pierna
- Brazos pegados al cuerpo sin extenderse
- Cabeza ligeramente inclinada hacia la dirección de mirada (SE)
- Sin animación en este sprite — `idle` se anima por 4-frame loop (frames separados)

## AI generation prompt

```
isometric pixel art character, 16x24 pixels, Habbo Hotel proportions,
slightly chibi head (6px wide, 30% of height), small rounded shoulders,
generic humanoid base in idle pose facing south-east 3/4 view,
NO clothing color (use magenta #FF00FF placeholder for skin and clothes zones),
black short hair, simple geometric silhouette, no facial details (those are separate layer),
no outline except subtle dark shadow under chin,
clean readable silhouette at 50% zoom (8x12 must be identifiable as human),
pixel-perfect, no anti-aliasing, no gradient, palette restricted to magenta placeholders + dark hair color
```

**Negative prompt**:
```
3d, photorealistic, anime, manga, large eyes, super deformed, chibi extreme,
no body articulation, single-color blob, robot, mecha, gradient shading,
anti-aliasing, blur, outline thick, comic style
```

## Manual cleanup checklist

- [ ] Dimensiones exactas 16×24 px
- [ ] Cabeza ocupa 30-35% de altura (6-7 px de los 24)
- [ ] Magenta `#FF00FF` ocupa zonas piel (cara, manos, pies si descalzo)
- [ ] Magenta secundario `#FE00FE` ocupa zonas ropa (cuerpo, piernas)
- [ ] Test legibilidad: a 50% zoom (8×12 px) sigue siendo identificable como humano
- [ ] Test silueta: en negativo (silueta pura) la forma es humanoide sin ambigüedad
- [ ] Alineación píxel-perfect: la versión `idle-se` debe coincidir píxel a píxel con `idle-sw` (mirror), `walk-se` (cuerpo pose diferente), etc. — el sistema de capas requiere alineación absoluta
- [ ] NO contiene colores de paleta §4 (la base es SOLO magenta sentinel + sombra)

## Validación contra bible

- **§3.1 canon**: ✓ 16×24 px, cabeza 6px, proporción 30-35%
- **§5.2 composición**: ✓ magenta sentinel en zonas a teñir
- **§5.5 expresión**: ✓ cara NO en esta capa (capa face superpone)
- **§5.6 LOD**: ✓ legible a 50% zoom
- **§7.4 frame**: capa base recibe overlay frame del retrato cuando se compone como portrait
- **§8.4 naming**: ✓ `char-body-m01-idle-se.png`
- **§8.8 anti**: ✓ magenta sentinel es excepción válida-condicional documentada

## Sprites relacionados de esta familia (24 sprites de capa body)

```
char-body-m01-idle-se.png   ← THIS SPEC
char-body-m01-idle-sw.png
char-body-m01-idle-ne.png
char-body-m01-idle-nw.png
char-body-m01-idle-s.png
char-body-m01-idle-n.png
char-body-m01-idle-e.png
char-body-m01-idle-w.png
char-body-m01-walk-se.png
char-body-m01-walk-sw.png   ... (etc)
char-body-m01-action-se.png ... (etc)
```

**Body model 02 (portero/robusto)**: 1 px más ancho en hombros = canon 17×24 (excepción permitida del grid solo para esta variante).

## Notas de producción

- Este sprite es la INFRAESTRUCTURA. Cualquier error de alineación o proporción se propaga a TODAS las composiciones de TODOS los personajes
- Las 24 variantes de capa body se baten en `atlas-chars.png`
- Pelo, cara, ropa, overlay de estado son sprites separados que se componen runtime sobre esta base via PixiJS Container
- En testing, validar composición: cargar body + skin + shirt + hair + face + overlay → resultado pixel-perfect sin halos
