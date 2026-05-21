# Total Soccer Manager — Press Kit v1.0

**Estado**: Draft (overnight 2026-05-22). Lista de assets, boilerplate y datos
ready para journalists, streamers, content creators o reviews.

---

## Quick Facts

| | |
|---|---|
| **Nombre del juego** | Total Soccer Manager |
| **Subtítulo** | Tu carrera, tu club |
| **Género** | Sports / Simulation · Management |
| **Plataforma** | Web (navegador), desktop + mobile |
| **Idioma** | Español (MVP); más en v1.1+ |
| **Precio** | Gratuito (soft-launch v1.0, sin micropagos) |
| **Edad mínima** | 13+ |
| **Tamaño** | < 500 KB initial JS bundle |
| **Cuenta requerida** | Sí (email único + password) |
| **Multijugador** | No (single-player career; multiplayer en v2.0+) |
| **Tiempo de partida típico** | 5-15 minutos por sesión casual; horas en sesión larga |
| **Developer** | Indie solo dev (Donchitos) + Claude Code |
| **Stack** | TypeScript · SvelteKit · Hono · PostgreSQL · Socket.IO |
| **Open source** | MIT License (código en GitHub) |
| **Lanzamiento v1.0** | TBD (post Pablo go-live decision) |

---

## Boilerplate / About

### En 50 palabras

Total Soccer Manager es un juego de gestión de fútbol por navegador. Eliges
un club humilde, decides la alineación cada semana, gestionas la economía y
acompañas a tu manager temporada tras temporada. El estadio crece visualmente
contigo. Sin instalación, sin trackers, sin pagos.

### En 100 palabras

Total Soccer Manager es un manager de fútbol por navegador que respeta tu
tiempo. Coges un club de pueblo, decides cada jornada y ves cómo tu estadio
crece literalmente desde un campo de tierra hasta un coliseo Anfield-style.
Plantilla, fichajes, alineación, partido, temporada — todos los elementos
clásicos del género, pero con una interfaz calmada que no pulsa ni reclama
atención compulsiva. La simulación es server-authoritative (determinista,
sin trampas). Funciona en cualquier navegador moderno, sin instalación, sin
trackers, sin loot boxes. Gratuito en su lanzamiento v1.0. Multilenguaje y
multiplayer llegan en futuras versiones.

### En 250 palabras

Total Soccer Manager nace de una observación: los manager grandes del
género se han vuelto enormes, opacos y hostiles al jugador casual. Hay
menús dentro de menús, tutoriales dentro de tutoriales, microtransacciones
agresivas, energía que te bloquea de tu propio juego.

La propuesta de TSM es la contraria: una experiencia *contemplativa*, como
una tarde de domingo en una taberna de barrio. Una decisión por jornada de
media. La interfaz nunca pulsa ni destella. El idioma es directo ("Sano /
En riesgo / Crisis / En quiebra", no "puntaje financiero 47.3%").

Mecánicamente cubre todo lo esperado: simulación de partidos minuto a minuto,
fichajes con negociación, gestión de cuerpo técnico, economía completa
(taquilla, TV, sponsors, salarios), lesiones, suspensiones, liga de 20
equipos con calendario completo, sistema de experiencia para el manager,
hitos profesionales y reputación con junta/afición/vestuario.

La diferenciación visual está en el crecimiento literal del estadio. El
sprite del campo cambia con cada salto de tier — empieza como un patchy
de césped en un pueblo perdido, pasa por una cancha local con árboles,
luego una regional con jugadores en el campo, y al final un coliseo
tipo Anfield. Cuando llegas al último tier y miras hacia atrás, ves
dónde empezaste. Esa es la idea central.

Sin loot boxes. Sin energy timers. Sin trackers. Soft-launch gratuito
durante v1.0 para recoger feedback de jugadores antes de monetizar.

---

## Visual Assets

Todos los assets viven en `assets/sprites/city-hd/`. 1536×1152 px nativo
(landscape) / 1152×1536 px (character portraits). Render con CSS
`image-rendering: pixelated` o PixiJS `SCALE_MODES.NEAREST`.

### Hero shots (use for thumbnails / store / social)

1. **`stadium-t3-premier.png`** — el "wow shot": coliseo Anfield-style HD.
   Recomendado para thumbnails de YouTube, Twitter card, store hero.
2. **`stadium-t0-amateur.png`** — para mostrar el contraste "de dónde empezaste".
   Side-by-side con el T3 cuenta toda la historia del juego en 2 imágenes.

### Gameplay shots (TBD — capturar de build de producción)

1. Dashboard con economía sana (UI calmada)
2. Vista isométrica de /city (PixiJS canvas con day/night)
3. Match live con confeti (clímax emocional)
4. Tabla de liga (sistema completo funcionando)
5. Pantalla de squad con plantilla (gestión deportiva)

### Branding

- **Logo / app icon**: `apps/web/static/icons/icon-512.png` (1024×1024 master
  en `assets/sprites/_raw/app-icon-master-HD_00001_.png`). Balón de fútbol
  con paneles verde-grass, pixel art.
- **Favicon**: `apps/web/static/favicon.png` (32×32).
- **Color palette**:
  - Primary green: `#1a3e2a` (theme-color, dark grass)
  - Background: `#0e1419` (night sky)
  - Accent: `#9E8B6E` borders / `#C4B49A` warm tones (de art-bible)

### Character art

- `char-manager-sheet.png` — manager sprite sheet, perfecto para "el héroe
  del juego". Multiple poses + portrait icons.
- `char-player-sheet.png` — jugador #10 sheet, multiple animations + portrait.

### Props (for B-roll / decoration in trailer)

- `prop-trophies.png` — para "los logros que vas a ganar"
- `prop-banners.png` — para "los colores que vas a defender"
- `prop-jerseys.png` — para "el kit del club"
- `prop-soccer-balls.png` — para "el corazón del juego"
- `prop-corner-flags.png`, `prop-goalposts.png` — props de field

### Buildings

- `building-mansion.png` — la fantasía del éxito ("tu casa cuando lleguen los millones")
- `building-medical.png`, `building-gym.png`, `building-academy.png`, `building-office.png` — facilities del club
- `building-training-pitch.png` — la cancha de práctica
- `building-parking.png` — el lot del estadio

---

## Press contact

- **Developer name**: Donchitos
- **Project repo**: TBD (privado hasta soft-launch decision)
- **Twitter/X**: TBD
- **Email**: TBD (alias del owner — actualizar en `/terms` §10 antes go-live)
- **Response time**: best-effort solo dev, ~24-48h en weekdays

## Streamer / content creator policy

✅ **Permitido sin restricciones**:
- Streaming en Twitch/YouTube/Kick
- Videos de gameplay con monetización
- Reviews escritas o en video
- Tutoriales y guías de comunidad
- Fan art (atribuir al juego)

❌ **No permitido**:
- Reverse engineering del cliente para crear bots/cheaters
- Vender screenshots/assets del juego como propios (la app es MIT pero los
  assets generados son propiedad del proyecto)
- Sponsor content que implique partnership oficial sin acuerdo explícito

✅ **Apreciado**:
- Mention "[total soccer manager]" en el título del video
- Link al juego en la descripción
- Tag al developer en redes para reshare

## Awards / recognition

Pendiente (lanzamiento soft v1.0). Si tu publicación cubre el juego,
mándame el link — me alegra el día.

---

## Technical info (para press tech-oriented / HN)

- **Stack**: TypeScript 5.4 (strict), SvelteKit 2 + Svelte 5 (runes),
  Hono 4 (server), Drizzle ORM (PostgreSQL), Socket.IO 4 (future MMO ready),
  BullMQ + Pino, Vite, Tailwind + daisyUI.
- **Render**: PixiJS 8 para canvas isométrico de /city. DOM-first para
  management UI (acceso/performance).
- **Persistence**: PostgreSQL. Backups diarios cross-region.
- **Auth**: hand-rolled sessions con `@oslojs/*` (no Lucia, no JWT).
  Password con argon2id (`@node-rs/argon2`).
- **Tests**: 1160+ verdes (977 shared sim + 61 api + 122 web).
  Vitest unit + integration, Playwright e2e, simulación determinista.
- **Sim**: motor puro TypeScript, server-authoritative, seeded PRNG.
  Determinismo verificado por tests.
- **CI/CD**: GitHub Actions, monorepo turbo-cached.
- **Observability**: Sentry opcional (no-op si no SENTRY_DSN), Pino structured logs.
- **Accessibility**: WCAG 2.1 AA verified (todos los P0/P1/P2 cerrados).
- **Bundle size**: 9.4 KB entry JS (cap 500 KB, 1.9% usage).
- **Memory**: 75.4 MB peak en soak test (cap 256 MB, 29% usage).
- **AI-assisted**: ~95% del código y todos los assets fueron generados/
  guiados por Claude Code (Opus/Sonnet) en el framework Claude Code Game
  Studios (49 agents + 73 skills custom). El developer toma todas las
  decisiones de diseño y arquitectura.

---

## License summary

- **Código**: MIT (ver `LICENSE` en repo root)
- **Assets**: propiedad del proyecto, generados localmente con
  SDXL + LoRA `pixel-art-xl`. Reproducible vía `tools/comfyui-mcp/`.
- **Dependencies**: ver `production/releases/rollback-plan.md` §Asset
  attributions para el listado completo (Lucide, daisyUI, Tailwind,
  SvelteKit, Hono, PostgreSQL, etc.).

---

## Press kit changelog

- **2026-05-22**: Draft inicial creado overnight. Hero shots, boilerplate,
  technical info, streamer policy.
- **TBD**: Gameplay shots reales pendientes captura post-build de producción.
- **TBD**: Trailer link pendiente (storyboard en `trailer-storyboard-v1.0.md`).
