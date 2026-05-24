# Total Soccer Manager — Launch Post v1.0

**Estado**: Draft (overnight 2026-05-22). Pablo revisa + decide canales antes de publicar.

---

## Versión corta (para Twitter/X, Bluesky, Mastodon — ~280 caracteres)

> Llega Total Soccer Manager v1.0: un manager de fútbol que respeta tu tiempo.
> Coges un club, decides cada jornada, y ves cómo tu estadio crece desde un
> campo de tierra hasta un coliseo. Browser, sin trackers, gratuito.
>
> 👉 [tusoccermanager.example.com] (TBD)

---

## Versión larga (blog post / itch.io page / Reddit r/footballmanagergames)

### Hoy lanzamos Total Soccer Manager v1.0

Llevamos casi seis meses construyendo un manager de fútbol distinto. Distinto
porque empieza desde abajo del todo — un club de pueblo, un campo de tierra,
una hinchada que cabe en un banco de madera — y porque cada decisión que tomas
queda registrada en el visual del juego.

**Total Soccer Manager** es una versión web, sin instalación, de la fantasía
clásica del manager: plantilla, fichajes, alineación, partido, temporada,
sucesivamente, durante años. Lo nuevo es la *forma*:

- **El estadio crece contigo en pixel art HD.** El sprite del campo cambia
  literalmente cuando subes de tier. No es un número en una pantalla — es una
  imagen visible que pasa de césped parcheado a gradas de madera a estadio
  regional a coliseo tipo Anfield. Cuando llegas al final del recorrido,
  miras hacia atrás y ves dónde empezaste.

- **El partido se vive sin prisa, pero con presencia.** Confeti al marcar en
  casa, VAR ocasional que anula tu gol, pausas estratégicas para cambiar la
  presión. Y cuando el árbitro pita el final, hay un momento de pausa antes
  de la siguiente semana. La interfaz nunca te empuja.

- **La economía importa de verdad.** Salarios, fichajes, derechos de TV,
  patrocinadores. Si gestionas mal, la junta directiva se nota. Si sobrevives
  a un mal arranque, el juego lo recuerda — es uno de los hitos profesionales
  que puede definir tu reputación como manager.

- **Sin trackers, sin loot boxes, sin energía.** Es un juego web que respeta
  tu tiempo y tus datos. No hay monetización predatoria porque no hay
  monetización, punto. Si volvés mañana, vuelves al partido donde lo
  dejaste. Si volvés en seis meses, también.

### ¿Por qué un manager más?

Porque los manager grandes (no diremos cuáles) se han vuelto enormes,
opacos, hostiles al jugador casual. Hay menús dentro de menús, tutoriales
dentro de tutoriales, sponsors agresivos. Nosotros queríamos un manager
que se sintiera como una *tarde de domingo en una taberna de barrio*, no
como el amanecer tropical de un free-to-play.

Concretamente, eso significa:

- **Una decisión por jornada de media**, no quince. Si no querés decidir,
  el juego avanza solo.
- **La interfaz no pulsa, no destella, no reclama atención compulsiva.**
- **El idioma del juego es directo.** "Sano" / "En riesgo" / "Crisis" /
  "En quiebra" — no "puntaje financiero 47.3%".
- **Tu carrera se exporta.** Quieres compartir 25 años de manager en
  Reddit con captura limpia, lo podés hacer (v1.1).

### Cómo empezar

1. Abre [tusoccermanager.example.com] (link TBD)
2. Crea una cuenta — solo necesitamos un email para guardar tu carrera
3. Elige un club. Te tocará uno aleatorio del nivel más bajo de la liga.
4. Decide tu primera alineación.
5. Avanza una semana.

Eso es todo. El primer partido tarda menos de un minuto en jugarse.

### Lo que viene

La v1.1 ya está en diseño y trae:
- **Más profundidad táctica en partido**: instrucciones por jugador, no solo
  por equipo.
- **Modo carrera larga**: relevo generacional, regenerados, hijos de jugadores.
- **Mercado de fichajes expandido**: agentes, cláusulas, opciones de compra.
- **Exportación de carrera**: PDF + tweet-ready snapshots.

La v1.2 explora ciudad-jugable: cada edificio del club (estadio, gimnasio,
cantera, oficina) se puede mejorar individualmente con presupuesto, y eso
afecta a los partidos y a los jugadores que produces.

### Quiénes somos

Total Soccer Manager está hecho por un solo developer (más Claude Code, hay
que decirlo) — un proyecto indie que no busca ser el próximo Football Manager,
solo *un* manager más, hecho con criterio. Si te gusta, mandá feedback. Si
no te gusta, mandá feedback también — eso es más útil.

### Filosofía en una línea

> El estadio que empezó como un campo de tierra ahora tiene gradas.
> Mirá hacia atrás: ese soso eras vos.

---

¡Que disfrutes la temporada!

— Equipo de Total Soccer Manager

---

## Notas de canal (para Pablo)

- **Twitter/X + Bluesky**: usar la versión corta. Adjuntar 1 imagen del
  estadio T3 HD (`assets/sprites/city-hd/stadium-t3-premier.png`).
- **Mastodon**: versión corta, hashtags `#GameDev #IndieGame #FootballManager
  #PixelArt #Svelte`.
- **Reddit r/footballmanagergames**: versión larga. Cuidar reglas del
  sub — algunos prohíben self-promotion sin flair. Buscar megathread de
  alternativas y dejar el link ahí primero.
- **Reddit r/IndieGaming**: versión larga con énfasis en *web-no-install* +
  *no-trackers* + *no-monetization*.
- **itch.io page**: versión larga, descripción, screenshots, "play in browser".
- **HN Show HN**: post separado titulado "Show HN: Total Soccer Manager —
  un manager de fútbol web sin trackers, hecho con Claude Code".
  HN aprecia transparencia técnica: mencionar stack (SvelteKit + Hono +
  PostgreSQL + Socket.IO), arquitectura server-authoritative, 1143 tests.

## Screenshots a adjuntar (priorizar en este orden)

1. Estadio HD T3 — la "wow shot" del crecimiento visible
2. Dashboard con economía sana — muestra la UI calmada
3. Partido en vivo con confeti — muestra la energía del clímax
4. Tabla de liga — muestra el sistema completo funcionando

Ver `assets/sprites/city-hd/MANIFEST.md` para todos los sprites disponibles
para press kit.
