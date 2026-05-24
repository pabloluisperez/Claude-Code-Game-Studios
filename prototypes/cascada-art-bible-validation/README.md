# Cascada FC — Art Bible Validation Prototype

> **Created**: 2026-05-17
> **Purpose**: Validar el art bible (`design/art/art-bible.md`) con tres deliverables tangibles antes de empezar producción real de assets
> **Status**: Prototype — placeholder sprites, NO arte final

## Qué es este prototipo

Después de completar las 9 secciones del art bible, este prototipo materializa las especificaciones más críticas en 3 deliverables que se pueden ABRIR Y VER (no solo leer):

1. **`index.html`** — PixiJS 8 scaffolding con placeholders. Demuestra que el engine + tile size + paleta + day/night tint funcionan integrados
2. **`style-guide.html`** — DOM design system standalone. Muestra IBM Plex Sans + Lucide icons + paleta UI + Decision Panel + Inbox + Confirmation Modal + Toggles + Sliders + Buttons
3. **`asset-specs/*.md`** — 5 specs production-ready para los assets más críticos (2 tiles + 1 character + 1 building + 1 portrait)

## Cómo usar

### Ver el prototipo PixiJS (1 archivo)

```bash
# Opción A: abrir directamente en navegador
open prototypes/cascada-art-bible-validation/index.html

# Opción B: servir con un dev server (recomendado — CORS friendly)
cd prototypes/cascada-art-bible-validation
python3 -m http.server 8000
# → abrir http://localhost:8000
```

**Qué validas viendo `index.html`**:
- Tile diamond 32×16 px se renderiza correctamente en isométrico
- Character 16×24 con proporciones Habbo-chibi
- Building stack de 3 módulos × 16 px
- 5 crowd-tile density variants (empty / sparse / normal / full / packed)
- Wear pattern en zonas alto-tráfico del campo
- Day/Night ColorMatrixFilter (click los 3 botones)
- NEAREST scale mode (no antialiasing, pixel art crujiente)
- Paleta hex exacta de §4.1

### Ver el style guide DOM

```bash
open prototypes/cascada-art-bible-validation/style-guide.html
```

**Qué validas viendo `style-guide.html`**:
- IBM Plex Sans en todos los tamaños (text-caption a text-display)
- Tabular numerals: cifras se alinean verticalmente
- Formato español: `€ 1.250.000`, `Dom 15 Mar`, `2 — 1`
- 6 colores semánticos UI con WCAG ratios validados
- Lucide icons inline (8 icons demostrados)
- 5 Button variants (Primary / Secondary / Tertiary / Destructive / Icon-only)
- 3 Button sizes (small 32px / default 40px / large 48px mobile)
- Toggle (binario persistente) + Slider (volume)
- Entity Card (jugador con portrait + stats)
- Decision Panel (entreno con 3 acciones primary + buttons)
- Event Inbox (sender header oscuro + body claro)
- Confirmation Modal (destructive action con focus en Cancel)
- Status badges (Disponible / Cansado / Lesionado / Capitán)

### Leer asset specs (5 archivos)

```
asset-specs/
├── tile-ground-dirt-dry.md          # Tier 0 base ground
├── tile-ground-grass-worn.md         # Tier 1 con wear pattern
├── char-body-base-idle-se.md         # Character base layer (sistema composición)
├── bld-stand-east-m1-open.md         # Estadio Tier 1 grada lateral
└── portrait-director-01.md           # NPC portrait 64×64 (NO AI)
```

Cada spec tiene:
- Dimensiones exactas + formato
- Paleta hex utilizada (con % superficie objetivo)
- Composición visual (a veces con ASCII art)
- AI generation prompt + negative prompt (cuando aceptable)
- Manual cleanup checklist
- Validación cross-ref contra secciones del bible
- Sprites relacionados de la misma familia

## Lo que este prototipo NO valida

- ❌ **Pixel art real** — los sprites son rectángulos placeholder. La calidad estética de pixel art requiere artista humano
- ❌ **Performance budget en producción** — el prototipo es minimal; un mundo de 1600 tiles + 50 sprites real requiere profiling
- ❌ **Colorblind safety simulation** — los hex están specced pero Coblis simulation se debe correr antes de stamp final del primer asset Tier 1
- ❌ **Audio assets** — Sound Standards están en §7.3 + §8-Tech.6 pero ningún WAV/OGG existe aún
- ❌ **Cross-browser/device testing** — el prototipo solo se ha probado en Chromium con `image-rendering: pixelated`

## Qué hacer después de validar este prototipo

Si la validación visual + UX feel del prototipo es ✅:

1. **Contratar/asignar artista** para los 5 sprites de las specs (empezando por `char-body-base-idle-se` que desbloquea todo el sistema de composición)
2. **Correr Coblis** sobre el par `#5C3D1E` vs `#4A9968` para confirmar deuteranopia/protanopia safety. Ajustar si <2.5:1 ratio efectivo
3. **Setup proyecto real PixiJS 8** con Vite + Aseprite pipeline + TexturePacker (o Free Texture Packer)
4. **Production specs para los otros assets** vía `/asset-spec` skill cuando los system GDDs (cascade-engine, match-sim) definan los entity types

Si la validación tiene 🔴 issues:

1. Re-runs específicos: `/ux-review` sobre style-guide.html, `/art-bible` sub-section edits específicas
2. Posible re-spec del par marrón→verde si Coblis falla
3. Re-eval del sistema de composición de capas si el test de alineación píxel-perfect no es viable

## Cross-referencias clave al art bible

| Sección bible | Validado en |
|---|---|
| §1 Visual Identity Statement | (No directamente — es prosa) |
| §2 Mood & Atmosphere | `index.html` Day/Night tint controls (3 mood states demo) |
| §3.1 Character canon 16×24 | `index.html` char + `char-body-base-idle-se.md` |
| §3.2 Tile huella 32×16 | `index.html` tile grid + `tile-ground-dirt-dry.md` |
| §3.3 UI Shape Grammar (2px / 4px corner) | `style-guide.html` buttons + modal |
| §3.4 Hero shape findability | `style-guide.html` Entity Card layout |
| §4.1 Paleta Tier 0 (7 colores) | `index.html` swatches + `tile-ground-dirt-dry.md` |
| §4.2 Tier progression T0→T3 | `tile-ground-grass-worn.md` Tier 1 transición |
| §4.2.4 Wear pattern | `index.html` grid wear + `tile-ground-grass-worn.md` |
| §4.2.5 Gradas + crowd density | `index.html` 5 crowd-tile variants + `bld-stand-east-m1-open.md` |
| §4.4 UI semantic colors | `style-guide.html` swatch grid con WCAG ratios |
| §4.5 Day/Night tinte | `index.html` ColorMatrixFilter buttons |
| §5.1 Manager progression | (Future — no en este prototipo) |
| §5.2 Sistema composición 6 capas | `char-body-base-idle-se.md` capa base + magenta sentinel |
| §5.3 Staff portraits backgrounds | `portrait-director-01.md` fondo `#2E3A4A` azul pizarra |
| §5.4 NPC portraits | `portrait-director-01.md` |
| §5.5 Expresiones 8 canónicas | `portrait-director-01.md` lista de variantes |
| §5.6 LOD | Tabla en `char-body-base-idle-se.md` |
| §6.1 Spanish modesto vocabulary | `bld-stand-east-m1-open.md` Tier 1 sin cubierta, banchos madera |
| §6.2 Texture philosophy (cell-shading) | Todas las specs |
| §7.1 IBM Plex Sans | `style-guide.html` Typography section |
| §7.2 Lucide icons | `style-guide.html` Icon row |
| §7.3 Animation feel | `style-guide.html` button :active scale + hover transitions |
| §7.4 Diegetic moments | `style-guide.html` Inbox sender header design |
| §7.5 Estados interacción | `style-guide.html` button states (hover/focus/disabled) |
| §7.7 Anti-references | (No en prototype — documentado en bible) |
| §8.1 Tile size lock 32×16 | `index.html` tile grid + `tile-ground-*.md` |
| §8.3 PNG-8 default + PNG-32 excepción | Todas las specs especifican formato |
| §8.4 Naming convention | Filenames de specs siguen `[cat]-[entity]-[variant]-[state].png` |
| §8.5 Atlas strategy (5 atlases) | Specs apuntan al atlas destino |
| §8.6 AI rules | Specs distinguen AI-aceptable vs NO-AI |
| §8.7 LOD (nearest neighbor) | `index.html` `app.canvas.style.imageRendering = 'pixelated'` |
| §9 References | (No en prototype — documentado en bible) |

## Files inventory

```
prototypes/cascada-art-bible-validation/
├── README.md                                    ← this file
├── index.html                                   ← PixiJS 8 scaffolding (~360 lines)
├── style-guide.html                             ← DOM design system showcase (~430 lines)
└── asset-specs/
    ├── tile-ground-dirt-dry.md                  ← Tier 0 ground spec
    ├── tile-ground-grass-worn.md                ← Tier 1 ground spec (colorblind safety critical)
    ├── char-body-base-idle-se.md                ← Character composition layer 0
    ├── bld-stand-east-m1-open.md                ← Stadium Tier 1 module
    └── portrait-director-01.md                  ← NPC portrait (NO AI)
```

## Notas técnicas

- **PixiJS 8.6.6** desde esm.sh (CDN) — sin install ni build step
- **IBM Plex Sans** desde jsdelivr CDN — variable font, latin extended subset
- **No dependencies locales** — todo standalone, sin `node_modules`
- **No build pipeline** — abrir HTML directamente o servir con http.server
- **Image rendering pixelated** — true pixel art crisp scaling

## Bugs/limitaciones conocidos del prototipo

- El render de building stack en `index.html` usa simplified geometry (rectangle frontal + diamond superior). El sistema isométrico real necesita projecting 3D cuboid a 2D — esto se hace en producción con sprite atlas, no Graphics primitives
- El crowd-tile placeholder muestra rectángulos para cabezas — en producción cada head es sprite pixel art
- El style-guide.html no implementa keyboard focus trap en modal (sería JS) — solo demuestra visual layout
- Las animaciones del prototipo son CSS-only (no PixiJS animation tickers) — producción usa GSAP o PixiJS ticker per `interaction-patterns.md`

## Próximos pasos sugeridos

Después de validar visualmente este prototipo:

1. **Si APROBADO**: empezar producción real de los 5 sprites por artista humano siguiendo las specs
2. **Si CONCERNS visuales**: iterar specs o revisar art-bible sections específicas
3. **Validación adicional**: Coblis test del par marrón→verde + WCAG contrast checker para todos los colores UI
4. **Setup proyecto real**: scaffold `apps/web/` con PixiJS 8 + Vite + Aseprite pipeline (después del scope cut MVP + primer system GDD)
