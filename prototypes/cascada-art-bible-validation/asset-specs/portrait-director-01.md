# Asset Spec — `portrait-director-01.png`

> **Category**: NPC Portrait (64×64 sprite-art en DOM)
> **Used in**: Event Inbox sender header — Director Deportivo del club del jugador
> **Bible refs**: §5.3 (staff + qualityTier) · §5.4 (NPC visual) · §7.4 (diegetic DOM)
> **Critical**: este es el primer retrato 64×64 sprite-art que vive en DOM — establece el lenguaje visual de todos los portraits

## Especificación técnica

| Campo | Valor |
|---|---|
| **Dimensiones** | 64×64 px |
| **Formato** | PNG-8 indexed con 1-bit alpha |
| **Bordes** | Cuadrado completo; fondo institucional cubre todo el 64×64 |
| **Frames** | 1 frame estático |
| **Variantes expresión** | 8 (las §5.5 — Neutral / Concentrado / Satisfecho / Preocupado / Alerta / Cansado / Orgulloso / Sorprendido) |
| **Filename** | `portrait-director-01.png` (este = Neutral default) |
| **Atlas destino** | `atlas-ui.png` |
| **Producción** | **ARTE HUMANO OBLIGATORIO** — NO AI per §8.6 (NPCs con nombre) |

## Paleta utilizada

**Fondo institucional del rol (§5.3 staff backgrounds)**:
| Hex | Rol |
|---|---|
| `#2E3A4A` Azul pizarra | Fondo del retrato — sala de reuniones del director deportivo |

**Personaje (paleta §4 + §5.2 capas)**:
| Hex | Rol |
|---|---|
| `#FDDBB4` Tono piel claro | Cara, manos visibles |
| `#2E2018` Sombra interior | Pelo, sombras de cara, traje oscuro |
| `#7A5230` Madera envejecida | Detalles del cuello del traje |
| `#C4B49A` Cal fachada | Camisa interior visible |
| `--club-primary` (ej. `#C0392B`) | Pequeño pin del club en solapa — 2×2 px |

## Composición visual (64×64)

```
0,0 ┌──────────────────────────────────────────────┐ 64,0
    │                                              │
    │   [fondo azul pizarra #2E3A4A]               │  ← Top 8px: fondo + ambiente
    │                                              │
    │           ┌──────────┐                       │
    │           │ pelo     │                       │  ← y=12-24: cabeza
    │           │ #2E2018  │                       │
    │           │          │                       │
    │           │ ┌─────┐  │                       │
    │           │ │cara │  │                       │  ← y=18-36: rostro
    │           │ │piel │  │                       │
    │           │ └─────┘  │                       │
    │           └──────────┘                       │
    │       ╱      cuello      ╲                   │  ← y=36-44: cuello + collar
    │      ╱   #2E2018 + camisa ╲                  │
    │     │                       │                │
    │     │   [TRAJE OSCURO]      │ [pin club]    │  ← y=44-64: hombros + traje
    │     │   con detalle pin     │   2×2 px      │
    │     │                       │                │
0,64└──────────────────────────────────────────────┘ 64,64
```

## Rasgos visuales clave

- **Postura erguida**: el director está sentado/de pie en posición de autoridad sutil. Hombros nivelados, cabeza centrada
- **Expresión Neutral (default)**: ojos abiertos, boca línea horizontal, sin emoción dirigida — el director observa y juzga
- **Vestimenta**: traje formal oscuro con camisa más clara visible en el cuello. NO corbata excesiva (sería corporativo, no modesto)
- **Pin del club**: 2×2 px en `--club-primary` en la solapa izquierda — único elemento del club color en el retrato
- **Sombras faciales**: bajo barbilla y bajo mejillones (1-2 px de `#2E2018` semi-transparente)
- **Pelo**: corto, oscuro `#2E2018` — sin detalle de mechones individuales (escala no lo permite)

## NO se incluye en este sprite

- Texto del nombre (eso es DOM separado al lado del portrait)
- Frame/border del portrait (eso es DOM `border: 2px solid #2E2018`)
- Indicador de estado (online, urgente, etc. — sería overlay separado)
- Background gradient — el `#2E3A4A` es color sólido plano

## AI generation prompt

❌ **NO USAR AI**. Este sprite es NPC con nombre — producción manual obligatoria per §8.6.

Justificación:
1. Es el primer retrato del primer NPC importante que el jugador encuentra
2. El director deportivo aparece en muchos mensajes — su consistencia visual a través de 8 expresiones requiere coherencia que la AI no garantiza
3. Las expresiones canónicas §5.5 requieren intención narrativa, no solo morfología facial
4. La paleta restringida y el cell-shading 3 tonos son lentos para AI fine-tuned y necesitan cleanup intenso — más barato producir manual

**Workflow recomendado**: Aseprite con referencia visual de Habbo-style portraits + Spanish modesto reference photos.

## Manual production checklist (artist briefing)

- [ ] Dimensiones exactas 64×64 px
- [ ] Fondo `#2E3A4A` cubre TODO el sprite (no transparente)
- [ ] Cabeza centrada horizontalmente, levemente arriba del centro vertical (regla visual: la cara es el anchor)
- [ ] Cara legible: ojos identificables, boca identificable, expresión "Neutral" según §5.5
- [ ] Pin del club visible en solapa izquierda — 2×2 px exacto
- [ ] Traje oscuro pero no negro puro (`#2E2018` no `#000000` — §4.6 anti-rule 7)
- [ ] Camisa visible bajo el cuello del traje
- [ ] Sombras faciales presentes (bajo barbilla, mejillas)
- [ ] NO contiene gradientes — cell-shading 3 tonos por superficie
- [ ] Bordes nítidos — no antialiasing
- [ ] Test contra otras 7 expresiones: el director debe ser **el mismo personaje** en todas las variantes — solo cambian ojos/boca/inclinación

## Validación contra bible

- **§5.3 staff portraits**: ✓ fondo `#2E3A4A` azul pizarra (sala reuniones)
- **§5.3 qualityTier**: ✓ T3 director deportivo tiene retrato propio (vs T1/T2 que tienen icono genérico)
- **§5.5 expresión**: ✓ esta variante es Neutral default
- **§7.4 diegetic DOM**: ✓ pixel art genuino en superficie DOM, frame separado en CSS
- **§8.6 AI**: ✓ producción manual exclusiva
- **§8.4 naming**: ✓ `portrait-director-01.png`

## Sprites relacionados de esta familia

```
portrait-director-01-neutral.png      ← THIS SPEC
portrait-director-01-concentrado.png
portrait-director-01-satisfecho.png
portrait-director-01-preocupado.png
portrait-director-01-alerta.png
portrait-director-01-cansado.png
portrait-director-01-orgulloso.png
portrait-director-01-sorprendido.png
```

= 8 sprites totales para el director deportivo 01.

Si el sistema tiene varios directores en MVP (uno por club rival visible), `portrait-director-02` a `portrait-director-XX` siguen el mismo canon pero con cara distinta + variantes de fondo institucional según ciudad del club.

## Notas de producción

- Este sprite **define el lenguaje visual de TODOS los portraits 64×64 del juego**. Producir bien este antes que cualquier otro
- El frame del portrait en DOM (border 2px solid + corner radius 2px) está en `style-guide.html` §7.4 reference
- Header del inbox combina: portrait 64×64 (este sprite) + nombre/rol en DOM al lado, fondo header DOM = `#2E2018` con texto `#F5F0E8`
- Para AI image gen tools, este sprite es **referencia visual** para que NO se intenten generar — pero NO se debe usar AI para producirlo
- Iterar varias rounds con artista hasta que las 8 expresiones funcionen como **el mismo personaje** — coherencia inter-frame es lo crítico
