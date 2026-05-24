# Total Soccer Manager — Trailer Storyboard v1.0

**Estado**: Draft text-only (overnight 2026-05-22). El trailer video real
es out-of-scope para v1.0 launch — opcional según release-checklist §7.

**Duración objetivo**: 45 segundos (sweet spot Twitter video + YouTube short).

**Formato**: 16:9 horizontal (1920×1080 o 1280×720). Vertical 9:16 alterno
para TikTok/Reels/Shorts si vale la pena producirlo aparte.

**Tono**: contemplativo, paciente, pixel art respira. Sin cortes rápidos. Música
acústica suave tipo guitarra de barrio (no épica, no electrónica, no hype).

---

## Estructura (5 actos)

### Acto 1 (0:00 – 0:08) · "El comienzo humilde"

**Visual**:
- Pantalla negra, 0.5s.
- Fade in: `assets/sprites/city-hd/stadium-t0-amateur.png` (1536×1152)
  centrado, escalado 2× con `image-rendering: pixelated`. Fondo negro.
- Cámara estática 3s. Que la imagen respire.

**Audio**:
- Guitarra acústica solitaria, una nota lenta cada 2s.
- (Opcional) ambiente lejano de pueblo: viento, un perro, un campanario.

**Texto on-screen** (typewriter effect, blanco sobre fondo oscuro):
> *Empiezas con un campo de tierra.*

**Duración**: 8s.

---

### Acto 2 (0:08 – 0:15) · "Las decisiones"

**Visual**:
- Cut a screenshot de gameplay del dashboard. Cursor del jugador moviéndose
  lento hacia el botón "Avanzar semana".
- Pausa de 1s antes del clic — para crear tensión.
- Click. Animación de transición a /squad.
- Click otra vez. Animación a /finance.
- Click final. Transición a vista de partido.

**Audio**:
- Mismo loop de guitarra, sumar piano simple en notas alternas.
- Sonido sutil de "click" suave cada vez que el cursor presiona.

**Texto on-screen**:
> *Cada semana decides.*

**Duración**: 7s.

---

### Acto 3 (0:15 – 0:25) · "El partido"

**Visual**:
- Cut a /match en vivo. Match minuto-a-minuto desplegando eventos
  comentados.
- Acumulación dramática con sonidos sutiles: pase, recuperación, tiro a
  portería bloqueado.
- Cut a gol con confeti animation (`production/qa/evidence/confetti-*`
  documenta la animación).
- Hold en el confeti 1.5s.
- Cut a VAR overlay sutil — el árbitro va a revisar.
- Hold 1s.
- Cut a "Gol validado" — sonrisa del manager character.

**Audio**:
- Crescendo gradual. Sumar percusión ligera (palmas, cajón).
- Pico en el confeti.
- Drop a silencio momentáneo para el VAR overlay (suspense).
- Re-entrada de la melodía cuando se valida.

**Texto on-screen**:
> *Y los partidos se viven.*

**Duración**: 10s.

---

### Acto 4 (0:25 – 0:38) · "El crecimiento visible"

**Visual** (este es el corazón del trailer):
- Cut rápido entre los 4 stadium tiers en orden:
  - `stadium-t0-amateur.png` (1s)
  - `stadium-t1-local.png` (1s)
  - `stadium-t2-regional.png` (1s)
  - `stadium-t3-premier.png` (3s, hold en esta)
- Cada transición es un cross-fade lento con un pulso sutil (no zoom, no
  parallax — el sprite habla por sí mismo).
- Background queda en negro durante toda esta secuencia.

**Audio**:
- Melodía principal entra completa. Guitarra + piano + percusión.
- Build-up gradual con cada tier.
- Pico emocional en el T3 hold.

**Texto on-screen** (uno por tier, syncronizado):
> *Pueblo Olvidado*
> *Club Emergente*
> *Club Establecido*
> *Imperio Local*

(Cada uno aparece 1s, fade out al siguiente)

**Duración**: 13s.

---

### Acto 5 (0:38 – 0:45) · "El call-to-action"

**Visual**:
- Cut al logo del juego (app icon HD a 512px) + título "Total Soccer Manager"
  + subtítulo "Tu carrera, tu club".
- Background dark green `#1a3e2a`.
- URL del juego abajo en monospace: `tusoccermanager.example.com` (TBD)
- "Free to play" badge esquina superior derecha.
- Hold 4s.

**Audio**:
- Resolución musical. Última nota larga en guitarra.
- Sin voice-over.

**Texto on-screen** (estático):
> **Total Soccer Manager**
> *Tu carrera, tu club.*
> tusoccermanager.example.com
> Gratis · Sin instalación

**Duración**: 7s.

---

## Total: 45 segundos

## Vertical edit (9:16, 30s) — para TikTok/Reels

Versión recortada del storyboard arriba:
- Acto 1 (3s)
- Acto 2 skip
- Acto 3 condensado (gol + confeti, 6s)
- Acto 4 completo (13s) — el corazón emotivo se queda
- Acto 5 (8s)

**Total vertical**: 30s.

---

## Assets necesarios para producción

Todos disponibles overnight 2026-05-22:

| Asset | Path | Acto |
|---|---|---|
| Stadium T0 sprite | `assets/sprites/city-hd/stadium-t0-amateur.png` | 1, 4 |
| Stadium T1 sprite | `assets/sprites/city-hd/stadium-t1-local.png` | 4 |
| Stadium T2 sprite | `assets/sprites/city-hd/stadium-t2-regional.png` | 4 |
| Stadium T3 sprite | `assets/sprites/city-hd/stadium-t3-premier.png` | 4 |
| Manager sheet | `assets/sprites/city-hd/char-manager-sheet.png` | 3 (sonrisa) |
| App icon | `apps/web/static/icons/icon-512.png` | 5 |

**Por capturar de build de producción** (no disponible overnight):

- Dashboard real con cursor (Acto 2)
- /squad transición real (Acto 2)
- /finance transición real (Acto 2)
- /match live con eventos comentados (Acto 3)
- Confetti animation (Acto 3)
- VAR overlay (Acto 3)

## Soundtrack

**Opciones**:
1. **YouTube Audio Library** — buscar "acoustic guitar contemplative" sin
   atribución requerida.
2. **Producción custom** — un solo dev + guitarra acústica grabada con
   teléfono ya alcanza el tono buscado. ~45s + mezcla mínima.
3. **Música existing del juego** (si la hay) — si Cascada FC tuviera
   intro music compatible, reusarla.

**Decisión recomendada para v1.0**: opción 2, custom. Mantiene el espíritu
indie/contemplative. Aceptable en calidad amateur (no necesita estudio).
Si Pablo no toca guitarra, opción 1 con royalty-free.

## Voice-over (NO)

El trailer NO debe tener voice-over. El silencio + la música + los textos
on-screen son suficientes. Voice-over reclamaría atención e introduciría
un tono más comercial / "hype" que va en contra de la identidad del juego.

---

## Producción overnight: out of scope

Este storyboard es *texto*. El video real requiere:
- Captura de gameplay (necesita build de producción + decisiones de UX en
  vivo). ~2h.
- Edición video (Davinci/Premiere/iMovie). ~3-4h.
- Grabación/selección de música. ~1-2h.

Total: ~6-8h producción. Recomendación: hacer post-launch, cuando ya haya
feedback de jugadores reales para validar que la composición resuena.

Pablo decide cuándo producirlo.
