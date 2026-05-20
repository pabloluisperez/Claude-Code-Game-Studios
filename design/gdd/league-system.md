# Sistema de Liga (League System)

> **Status**: Approved (post /design-review + revisión en sesión 2026-05-17 — ver design/gdd/reviews/league-system-review-log.md)
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-17
> **Implements Pillar**: P1 (Tinkering Beats Optimization) · P4 (Calm Is The Tempo) · P3 (You Grow Like Your Club)
> **ADR References**: ADR-011 (League / Competition Schema) · ADR-008 (World Clock + Event Loop) · ADR-007 (Sport-Agnostic Match Sim) · ADR-002 (Determinismo del Simulador)

## Overview

La liga Cascada es el marco competitivo que estructura el largo plazo de Cascada FC: dos divisiones de 20 clubs cada una, con ascenso y descenso al final de cada temporada, conectadas por un calendario de fixtures pre-generados que son los puntos de parada naturales del advance loop. Al inicio de cada temporada, `season-service` genera los 380 fixtures del double round-robin (20 clubs × 38 matchdays) y los inserta en la tabla `calendar_events` como eventos de tipo `match` con prioridad `STOP` — cada partido es un punto en el que el tiempo se detiene (ADR-008). El resultado de cada partido actualiza la tabla de clasificación (`standings`) en tiempo real: puntos, goles, victorias. Al final de la temporada, `season-service` lee la clasificación final, asciende los 3 primeros de División 2 y desciende los 3 últimos de División 1, y genera la siguiente temporada. El jugador parte en División 2 con el club en ruinas; el soft win-condition del MVP es ganar División 1. El esquema de datos completo (clubs, leagues, divisions, seasons, fixtures, standings) está definido en ADR-011. Este GDD especifica las reglas de puntuación, los criterios de desempate, la estructura del calendario, la generación de clubs rivales, y las consecuencias deportivas y económicas del ascenso/descenso.

## Player Fantasy

La liga es el marcador largo del juego: no el partido de hoy, sino la historia de la temporada.

El jugador empieza en División 2 con un club que no tiene estadio digno, que no tiene hinchada, que no tiene nombre en el mapa. La clasificación no miente: en la primera semana estás undécimo. Los clubs de arriba tienen mejor infraestructura, mejores jugadores, más historia. La diferencia es visible en la tabla — y también en el WorldState: `team_skill` bajo, `fan_momentum` frío, `sponsor_quality` en cero.

Pero la liga no es un obstáculo — es el reloj que mide el progreso. Cada victoria suma 3 puntos y calienta a la afición. Una racha de victorias dispara `consecutive_wins`, que alimenta `fan_momentum`, que llena las gradas, que aumenta los ingresos, que permite fichar mejor. El ascenso no es una estadística abstracta — es la directiva de otro club llamándote, el alcalde inaugurando una plaza, el estadio de tierra siendo arrasado para construir el de cemento.

Y cuando el jugador está en D1, mirando la clasificación a mitad de temporada en posición 6, con los grandes al lado, la liga cambia de registro: ya no es el reto del ascenso sino el terror al descenso. Los 2 últimos vuelven a D2 — y todo lo que construiste en economía, en equipo, en reputación personal como manager, está en la cuerda floja cada jornada de la segunda vuelta.

La fantasy es la de **la saga deportiva**. No un partido, sino la historia de varias temporadas con sus protagonistas, sus remontadas, sus catástrofes. La clasificación final de temporada 1 es el "antes" que el jugador recuerda cuando gana la División 1 en temporada 3.

> **Alcance MVP vs fantasía completa:** El MVP entrega la temporada como unidad dramática — el ascenso/descenso como apuesta de identidad del club. La saga multi-temporada con rivalidades acumuladas, protagonistas emergentes y memoria histórica entre temporadas pertenece a v1.1+. Lo que el MVP sí establece son los cimientos arquitectónicos que hacen posible esa expansión: el event log persistente, el `rivalClubId`, y el registro de resultados por temporada.

## Detailed Design

### Core Rules

**1. Estructura de la liga:**
Liga Cascada MVP = 2 divisiones españolas reales / 20 clubs por división / 40 clubs totales. La base de datos se siembra con datos reales: Primera División (20 clubs) y Segunda División (20 clubs). El sistema soporta datos reales o generados mediante el mismo seed script (tabla `clubs` con `name`, `shortName`, `city`, `colors`, `rivalClubId`).

**2. Club del jugador:**
Al crear una nueva partida, el jugador elige entre los 20 clubs de Segunda División para gestionar. La selección es sin restricciones — puede elegir cualquier club. El club mantiene sus datos reales (nombre, colores, estadio de origen) pero el jugador controla todas sus decisiones de gestión. *(v1.1+: opción adicional de crear un club personalizado e insertarlo en Segunda.)*

**3. Sistema de puntos:**
Victoria = 3 puntos · Empate = 1 punto · Derrota = 0 puntos.

**4. Desempate por puntos (tiebreaker — estructura UEFA):**
Si dos o más clubs tienen los mismos puntos:
1. Head-to-head points (puntos en enfrentamientos directos entre los clubs empatados)
2. Head-to-head goal difference
3. Overall goal difference (toda la temporada)
4. Goals for (toda la temporada)
5. Sort alfabético por nombre del club (tiebreaker final de último recurso)

**5. Calendario de la temporada:**
Temporada = 38 matchdays (20 clubs × double round-robin = 38 rondas × 10 matches = 380 fixtures por división · 760 total en ambas divisiones). `generateRoundRobin(ctx, clubIds, startWeek=1)` distribuye los 38 matchdays determinísticamente (ADR-002). La temporada abarca ~42 semanas in-game incluyendo pre-temporada y parones internacionales.

**6. Ventanas de fichajes:**
- **Ventana de verano**: semanas 1–4 de la temporada (pre-temporada). Apertura de contrataciones.
- **Ventana de invierno**: semanas 21–23 (pausa de invierno). Refuerzos mid-season.
`season-service` inserta CalendarEvents `transfer_window_open` y `transfer_window_close` al inicio de cada temporada.

**7. Ascenso y descenso:**
- **Descenso de Primera**: los 3 últimos de Primera bajan a Segunda.
- **Ascenso de Segunda**: los 3 primeros de Segunda suben a Primera.
- Puestos 4–6 de Segunda NO juegan playoff en MVP (simplificación). Los playoffs se añaden en v1.1.
- El intercambio de clubs se produce en `processSeasonEnd()` (ADR-011) en una sola transacción DB.

**8. Regla de incomparecencia (forfeit):**
Si en la semana de un partido la `squad_available_pct` del club del jugador es ≤ `FORFEIT_SQUAD_PCT_THRESHOLD` (63%), el partido se registra como derrota 0–3 sin simulación (si el club del jugador es local: `homeScore=0, awayScore=3`; si es visitante: `homeScore=3, awayScore=0`). El event-system genera un NOTIFY event informando de la incomparecencia. La regla aplica también a clubs IA.

`squad_available_pct = (jugadores_disponibles / SQUAD_REGISTERED_SIZE) × 100` donde `SQUAD_REGISTERED_SIZE = 25` (constante del registry). Con plantilla de 25: forfeit si ≤15 jugadores disponibles.

La semana anterior al partido, si `squad_available_pct` cae por debajo del 70%, el staff sanitario emite un NOTIFY ADVISORY al jugador (señal anticipada antes de llegar al threshold de forfeit).

**9. Sistema de derbis:**
Cada club tiene exactamente 1 rival predefinido en `clubs.rivalClubId`. Los derbis reales conocidos están pre-definidos en el seed data (Sevilla vs Real Betis, Atlético vs Real Madrid, Barcelona vs Espanyol, Athletic vs Real Sociedad, etc.). Los clubs sin derby real en la misma división tienen su rival asignado al club geográficamente más cercano disponible.

Efectos en WorldState tras el partido (aplicados como PlayerDecision en el cascade tick post-match):
- Victoria en derby: `fan_momentum += 5`
- Derrota en derby: `fan_momentum -= 8` (asimetría intencional — las derrotas en derbis duelen más que las victorias alegran)

Staff comercial de tier 2+ emite un NOTIFY event una semana antes del derby.

**10. Clubs IA — comportamiento:**
Los 39 clubs IA usan sus stats reales iniciales (`team_skill` derivado del rating real de la plantilla). No toman decisiones de cascade management — sus `team_skill`, `squad_available_pct`, y `match_performance_index` se calculan con variación seeded por temporada (±5 puntos de varianza). Al ascender/descender: ajuste de `team_skill` ±5 para simular mejora/empeora según división.

**11. Soft win-condition:**
Ganar Primera División (terminar 1º en la clasificación final) activa el evento especial de victoria: discurso del presidente, celebración de ciudad (narrative template), y desbloqueo del sandbox post-story. Cierre emocional del arco principal del MVP.

**12. Nota sobre datos reales y licencias:**
La base de datos de clubs y jugadores en desarrollo usa datos reales de La Liga española. Para un lanzamiento comercial, los datos reales requieren licencia de La Liga, RFEF, y FIFPRO. El sistema es agnóstico al origen de los datos (el seed script puede cargarse con datos generados ficticios para la versión sin licencia). Esta decisión debe resolverse antes de cualquier lanzamiento público.

---

### States and Transitions

Ciclo de vida de la temporada:

```
Temporada anterior completa
  │ (processSeasonEnd → promueve/desciende 3 clubs por bando)
  ▼
SEASON_UPCOMING (nueva temporada creada, 380 fixtures generados, calendar_events insertados)
  │ (advance() alcanza el primer fixture de la temporada)
  ▼
SEASON_ACTIVE (primera jornada jugada)
  │ (38 jornadas disputadas, season_end event alcanzado)
  ▼
SEASON_COMPLETED (processSeasonEnd ejecutado)
  │
  ▼
[nueva SEASON_UPCOMING generada]
```

Ciclo de vida de un fixture:
- `scheduled` → partido pendiente de disputarse
- `played` → partido disputado con homeScore, awayScore, matchOutcomeData presentes
- No hay estado "cancelled" — el forfeit es un resultado `played` 0–3

---

### Interactions with Other Systems

**Lee de match-simulation.md:**
- `MatchOutcome` (winner, homeScore, awayScore, worldStateDeltas) — resultado del partido
- `squad_available_pct` del WorldState — para aplicar la regla de forfeit

**Escribe a standings (propio):**
- `updateStandingsAfterMatch()` actualiza wins/draws/losses/goals/points en la misma transacción del advance (ADR-011)

**Escribe a event-system:**
- Inserta CalendarEvents `type='match'` (380 por división, 760 total) con `metadata.fixtureId` al inicio de temporada
- Inserta CalendarEvents `transfer_window_open/close` al inicio de temporada

**Lee de cascade-engine.md:**
- Escribe bonus/penalty de derby a `fan_momentum` como PlayerDecision post-partido vía el cascade tick

**Escribe a economy.md:**
- Al ascender/descender: `DIVISION_TV_MULTIPLIER` cambia — event-system emite `season_end` con metadata de promoción/descenso para que economy.md actualice los derechos de TV
- Derechos TV: Primera = 270 €K/temporada · Segunda = 20 €K/temporada (del registry)

**Provee a hud-ui.md:**
- Tabla `standings` en tiempo real (clasificación) — leída directamente de Postgres
- `nextEventPreview` (partido siguiente) vía ADR-008 AdvanceResult

## Formulas

### F1 — Points System

`points(result) = { win: 3, draw: 1, loss: 0 }[result]`

Output range: {0, 1, 3}.

### F2 — Standings Sort (clasificación)

Ordenación lexicográfica descendente aplicada al conjunto de clubs de la división:
1. `points` DESC
2. `h2h_points` DESC (puntos en enfrentamientos directos, solo entre los clubs empatados)
3. `h2h_goal_difference` DESC
4. `goal_difference = goals_for - goals_against` DESC
5. `goals_for` DESC
6. `name` ASC (sort alfabético — tiebreaker final de último recurso)

### F3 — Head-to-Head Calculation

Para un conjunto de clubs empatados en puntos `{C1, C2, ..., Cn}` (n ≥ 2):

`h2h_points[Ci] = SUM(points(result) for fixtures where homeClubId ∈ {set} AND awayClubId ∈ {set} AND status = 'played')`

`h2h_gd[Ci] = SUM(goals_for_Ci - goals_against_Ci) in h2h_fixtures`

Se calcula sobre el subconjunto exacto de clubs empatados — no sobre el total de la división.

**Recálculo iterativo (estándar UEFA):** Si al aplicar F3 un club escapa del subconjunto empatado (porque su `h2h_points` es único dentro del grupo), el subconjunto se reduce y F3 se recalcula iterativamente sobre el nuevo subconjunto hasta que solo queden 2 clubs o se agoten todos los criterios de F2. Ejemplo: si {A,B,C} están empatados y A escapa por H2H, F3 se recalcula para {B,C} con solo los fixtures B↔C.

**Clasificación mid-season:** La clasificación H2H en vivo es provisional hasta que todos los partidos directos entre clubs empatados están disputados. Los partidos pendientes entre clubs empatados se marcan implícitamente con `h2h_points = 0` hasta jugarse.

### F4 — IA Club team_skill variance (por temporada)

`ia_team_skill_season(clubId, season) = base_team_skill[clubId] + floor(seedrandom(clubId + ":" + season)() × 11) - 5`

**Variables:**
| Variable | Tipo | Rango | Descripción |
|---|---|---|---|
| `base_team_skill[clubId]` | int | [15, 80] | Rating inicial del club en el seed data |
| `season` | int | [1, ∞) | Número de temporada actual |
| RNG output | float | [0, 1) | PRNG seeded por club+temporada |

**Output range:** `[base - 5, base + 5]` — variación determinista por temporada.
**Ajuste por división:** ascender a Primera: `base_team_skill += 5`; descender: `base_team_skill -= 5`. Post-ajuste: `base_team_skill = clamp(base_team_skill, IA_SKILL_FLOOR, IA_SKILL_CEILING)` = `clamp(value, 15, 100)`.

> **Implementación del seed string:** La concatenación debe incluir el separador explícito para evitar colisiones: `seedrandom(String(clubId) + ":" + String(season))`. Si el separador se omite, `clubId=1, season=12` → `"112"` colisiona con `clubId=11, season=2` → `"112"`.

### F5 — Derby fan_momentum effect

`fan_momentum_delta = { win: +DERBY_WIN_BONUS_FM, draw: +DERBY_DRAW_FM, loss: -DERBY_LOSS_PENALTY_FM }[derby_result]`

Con valores MVP: `{ win: +5, draw: +1, loss: -8 }`.

Aplicado como PlayerDecision en el cascade tick post-partido. Solo aplica si ambos clubs están en la misma división en esa temporada.
**Output range:** {-8, +1, +5}. Asimetría intencional: perder en un derby duele más que ganar alegra. El empate (+1) reconoce que el evento ocurrió sin equiparar su peso a la victoria.

### ~~F6 — TV rights por división~~ ⚠️ DEPRECATED

> **BREAKING CHANGE** — Esta fórmula y la función `getTVRightsWeekly()` han sido reemplazadas por `design/gdd/tv-rights.md` (F-TV1). Al implementar `tv-rights.md`, eliminar `getTVRightsWeekly()` del league-system service y las constantes `TV_RIGHTS_SEGUNDA` / `TV_RIGHTS_PRIMERA` de `constants.ts`. Los ACs AC-LGS-18 y AC-LGS-19 quedan deprecated — usan la fórmula plana incompatible con el nuevo sistema. La autoridad sobre los ingresos TV es `tv-rights.md`.

## Edge Cases

- **Si 3+ clubs están empatados en puntos y el H2H también está empatado en todo**: aplicar secuencialmente overall goal difference → goals for → sort alfabético. Matemáticamente posible pero extremadamente raro. El sort alfabético decide sin playoff.

- **Si el club del jugador asciende a Primera con `team_skill < 40`**: no hay mecanismo de veto. El ascenso es automático. El reto de competir en Primera con un equipo débil es parte de la experiencia de juego.

- **Si `processSeasonEnd()` falla a mitad de transacción DB**: Postgres hace rollback completo. El servidor detecta el estado inconsistente (temporada COMPLETED sin nueva temporada) al siguiente inicio y reintenta `processSeasonEnd()` antes de permitir cualquier advance.

- **Si dos clubs empatan en posición de descenso/ascenso tras todos los tiebreakers**: el sort alfabético decide. El GDD acepta este resultado — no hay desempate en campo en MVP.

- **Si el club rival (derby) de un club está en una división diferente en esa temporada**: los efectos de derby (F5) NO se aplican. El partido contra el rival en otra división no existe (la liga no tiene partidos cross-division). El derby effect se aplica solo cuando ambos compiten en la misma división.

- **Si un club IA acumula descensos hasta `team_skill < 15`**: el valor se clamp a `IA_SKILL_FLOOR = 15` para mantener partidos simulables. No se permite que un club IA llegue a team_skill ≤ 10.

- **Si el jugador llega al final de la temporada con su club en primera posición de D1 y activa el soft win-condition**: el evento de victoria se genera una sola vez por partida. Las temporadas siguientes continúan como sandbox sin volver a activar el evento.

## Dependencies

### Upstream (este sistema depende de ellos)

| Sistema | GDD | Tipo | Interfaz |
|---|---|---|---|
| Simulación de partido | `match-simulation.md` | Hard | `MatchOutcome` (winner, homeScore, awayScore, worldStateDeltas) para actualizar standings y fixtures |
| Motor de cascadas | `cascade-engine.md` | Soft | Lee `squad_available_pct` para forfeit rule; escribe `fan_momentum` (derby bonus F5) |

### Downstream (dependen de este sistema)

| Sistema | GDD | Qué espera |
|---|---|---|
| Sistema de eventos | `event-system.md` | CalendarEvents `type='match'` (380/div × 2 = 760 total) + transfer_window events |
| Economía del club | `economy.md` | División actual del club (ya no via F6 deprecated — `economy.md` lee `contract.weekly_rate_eur_k` de `tv-rights.md`) |
| Derechos TV | `tv-rights.md` | Lee `current_division` y `prev_season_final_position` para condiciones de desbloqueo en subasta |
| HUD y UI principal | `hud-ui.md` | Tabla `standings` en tiempo real + `nextEventPreview` del partido siguiente |

### ADR dependencies

- **ADR-011** — schema completo (clubs, leagues, divisions, seasons, fixtures, standings); `generateRoundRobin`, `updateStandingsAfterMatch`, `processSeasonEnd` — GDD especifica las reglas que estos servicios implementan
- **ADR-008** — `calendar_events` consumidos por el advance loop; fixtures como STOP events tipo `match`
- **ADR-007** — `SportPlugin.simulateMatch()` devuelve `MatchOutcome`; su interfaz es la que este sistema consume
- **ADR-002** — `generateRoundRobin()` es función pura con `SimContext`; mismo seed → mismo fixture calendar

## Tuning Knobs

| Knob | Valor MVP | Rango seguro | Notas |
|---|---|---|---|
| `CLUBS_PER_DIVISION` | 20 | [8, 24] | Determina el número de matchdays. Cambiar este valor requiere actualizar ADR-011 y el seed data. |
| `N_RELEGATED` | 3 | [1, 4] | Puestos de descenso/ascenso por temporada. 3 = estructura real española. |
| `DERBY_WIN_BONUS_FM` | 5 | [3, 10] | fan_momentum ganado por victoria en derby. Debe ser < `DERBY_LOSS_PENALTY_FM` |
| `DERBY_DRAW_FM` | 1 | [0, 3] | fan_momentum ganado por empate en derby. Reconoce el evento sin igualar la victoria. |
| `DERBY_LOSS_PENALTY_FM` | 8 | [5, 15] | fan_momentum perdido por derrota en derby. Asimetría intencional de diseño. |
| `FORFEIT_SQUAD_PCT_THRESHOLD` | 63 | [50, 75] | Porcentaje mínimo de `squad_available_pct` para evitar forfeit. Con `SQUAD_REGISTERED_SIZE=25`: forfeit si ≤15 disponibles. |
| `SQUAD_REGISTERED_SIZE` | 25 | [18, 30] | Tamaño de plantilla registrada. Denominador de `squad_available_pct`. |
| `IA_SKILL_VARIANCE` | ±5 | [±2, ±10] | Variación de team_skill de clubs IA por temporada. Mayor varianza = más sorpresas |
| `IA_DIVISION_ADJUSTMENT` | ±5 | [±2, ±10] | Ajuste de team_skill al ascender/descender de división |
| `IA_SKILL_FLOOR` | 15 | [10, 30] | team_skill mínimo de clubs IA para mantener partidos simulables |
| `IA_SKILL_CEILING` | 100 | [80, 100] | team_skill máximo de clubs IA. Clamp post-ajuste por división para clubs que acumulan ascensos. |
| `TRANSFER_WINDOW_SUMMER_WEEKS` | 4 | [2, 6] | Semanas de duración de la ventana de verano |
| `TRANSFER_WINDOW_WINTER_WEEKS` | 3 | [2, 4] | Semanas de duración de la ventana de invierno |

## Visual/Audio Requirements

El league-system es infraestructura de datos y control de flujo. No tiene requisitos de renderizado canvas ni audio propios. La tabla de clasificación y los resultados son DOM puro (ADR-012). Efectos visuales y audio de partido (celebraciones, silbato final) pertenecen al presupuesto de match-simulation y se especifican en hud-ui.md.

## UI Requirements

**Tabla de clasificación (standings):**
- Columnas: Pos · Club · PJ · G · E · P · GF · GC · DG · Pts (10 columnas en desktop)
- El club del jugador siempre highlighteado visualmente (color de acento del club)
- Línea de separación visual: después del puesto 17 (zona de descenso en D1) · después del puesto 3 (zona de ascenso en D2). La zona de Champions/Europa NO se indica en MVP (no existe en el juego).
- **Actualización:** al consumir el match event, SvelteKit invalida la query de standings y re-renderiza el componente. No se requiere Socket.IO para esta vista en MVP.
- **Mobile (375px):** La tabla colapsa a columnas mínimas: Pos · Club · DG · Pts. Las columnas G · E · P · GF · GC se ocultan en mobile. El spec exacto de colapso (breakpoints, qué columnas) se define en `/ux-design standings-panel` en Pre-Production.
- **Navegación entre divisiones:** El jugador puede ver la clasificación de D1 desde D2 mediante un selector/tab (D1 | D2). La división del jugador es la vista por defecto. Spec de navegación: `/ux-design standings-panel`.

**Vista de resultado de partido:**
- Marcador final destacado: homeScore – awayScore
- Feed de eventos cronológico por minuto: goles, tarjetas, lesiones, subs
- Stats post-partido: posesión, remates, corners. Si un campo no está en `MatchOutcome`, se muestra `--` (placeholder, nunca sección vacía).
- **Botón "Siguiente":** consume el match event y desbloquea el advance. El fixture persiste en estado `resultado_pendiente` hasta que el jugador pulsa "Siguiente" — si el jugador cierra el tab antes de pulsar, al re-entrar al juego se vuelve a mostrar el resultado del partido antes de poder avanzar. El advance loop no puede progresar sin consumir el evento.

**Calendario de fixtures (panel de jornadas):**
- Vista de la jornada actual + próximas **3** jornadas (4 jornadas visibles en total)
- Indicador de derby flag si el rival en el fixture es el `rivalClubId` del club del jugador (solo en fixtures del jugador, no en partidos de otros clubs)
- Estado del fixture: `scheduled` (sin resultado) / `played` (con marcador)

> 📌 **UX Flag — League System**: Tabla de clasificación, vista de resultado de partido y calendario de fixtures son componentes UI sustanciales. Ejecutar `/ux-design` en Pre-Production para crear UX specs (`design/ux/standings-panel.md`, `design/ux/match-result.md`) antes de escribir los epics. Stories que referencien UI de liga deben citar esos specs, no este GDD directamente.

## Acceptance Criteria

> *ACs revisados por `qa-lead` en /design-review 2026-05-17. Reescritas 5 ACs bloqueantes, añadidas 5 ACs de coverage gaps.*

### Bloque A — Generación de temporada y fixtures

- **AC-LGS-01** GIVEN `startSeason()` con 20 clubs en una división, WHEN completa la transacción, THEN `fixtures` contiene exactamente 380 rows, `standings` contiene 20 rows con todos los contadores en 0, y `calendar_events` contiene 380 rows `type='match'` cada uno cuyo `metadata.fixtureId` existe como `id` en la tabla `fixtures` y coincide con el mismo `home_club_id`, `away_club_id` y `match_week` del evento.
- **AC-LGS-02** GIVEN `generateRoundRobin(ctx, 20 clubIds, startWeek=1)` ejecutado dos veces con el mismo `ctx`, WHEN se comparan los resultados, THEN ambas listas de fixtures son idénticas (mismo orden, mismos home/away, misma semana por fixture).
- **AC-LGS-03** GIVEN `generateRoundRobin` con 20 clubs, WHEN se analiza el resultado, THEN cada par de clubs aparece exactamente 2 veces (1 home + 1 away) y ningún club aparece jugando contra sí mismo.

### Bloque B — Actualización de standings post-partido

- **AC-LGS-04** GIVEN Club A y Club B con `standings.played=0, wins=0, points=0` al inicio de la temporada, y un partido D2 donde Club A gana 2-0 a Club B, WHEN `updateStandingsAfterMatch()` ejecuta en la misma transacción del advance, THEN standings de A: `played=1, wins=1, points=3, goals_for=2, goals_against=0`; standings de B: `played=1, losses=1, points=0, goals_for=0, goals_against=2`.
- **AC-LGS-05** GIVEN un partido que termina 1-1, WHEN `updateStandingsAfterMatch()` ejecuta, THEN ambos clubs reciben `draws=+1, points=+1`.
- **AC-LGS-06** GIVEN N partidos jugados en una división, WHEN se suma `standings.played` para todos los clubs, THEN la suma total es exactamente `2×N`.

### Bloque C — Clasificación y tiebreakers (F2 + F3)

- **AC-LGS-07** GIVEN tres clubs A, B, C con los mismos puntos (ej. 10) y `goal_difference` distintos (A=+5, B=+2, C=-1), WHEN se calcula el sort F2, THEN el orden en la clasificación es A, B, C.
- **AC-LGS-08** GIVEN dos clubs con mismos puntos, mismo GD, pero `goals_for` distintos (A=15, B=12), WHEN se calcula el sort, THEN A aparece en posición superior a B.
- **AC-LGS-09** GIVEN Club A y Club B con los mismos puntos totales (10) y mismo GD global (+3 cada uno), Y los resultados H2H entre ellos son: A ganó 2-0 a B (h2h_points A=3, B=0), WHEN se aplica F3, THEN A aparece en posición superior a B incluso con GD global idéntico. (Tipo: Integration — requiere fixtures H2H en estado `played`.)

### Bloque D — Ascenso/descenso

- **AC-LGS-10** GIVEN que los 3 últimos de D1 son [ClubA, ClubB, ClubC] y los 3 primeros de D2 son [ClubX, ClubY, ClubZ], WHEN `processSeasonEnd()` completa, THEN ClubA/B/C están en D2 en la nueva temporada y ClubX/Y/Z están en D1.
- **AC-LGS-11** GIVEN que el club del jugador termina en los 3 primeros de D2, WHEN `processSeasonEnd()` completa, THEN en la nueva temporada el club del jugador tiene `division_tier = 1`.

### Bloque E — Forfeit rule

- **AC-LGS-12a** GIVEN `squad_available_pct = 60` (≤ `FORFEIT_SQUAD_PCT_THRESHOLD=63`) y el club del jugador es LOCAL en el fixture, WHEN el match event es procesado, THEN el fixture queda en estado `played` con `homeScore=0, awayScore=3` en la tabla `fixtures`. (Tipo: Integration — assertion sobre DB.)
- **AC-LGS-12b** GIVEN el mismo escenario pero el club del jugador es VISITANTE, THEN el fixture queda `played` con `homeScore=3, awayScore=0`.
- **AC-LGS-12c** GIVEN el escenario de forfeit, WHEN el match event es procesado, THEN `SportPlugin.simulateMatch()` NO es invocado. (Tipo: Unit — requiere spy sobre `SportPlugin`. Test independiente del 12a/12b.)

### Bloque F — Derby effects (F5)

- **AC-LGS-13** GIVEN el club del jugador juega contra su `rivalClubId` (ambos en la misma división), `fan_momentum` inicial del WorldState = 50, y el jugador gana el partido, WHEN el cascade tick post-partido aplica las PlayerDecisions de derby, THEN `fan_momentum = 55`. (Tipo: Integration — requiere WorldState inicial explícito + cascade engine activo.)
- **AC-LGS-14** GIVEN el mismo escenario con `fan_momentum` inicial = 50 pero el jugador pierde el derby, THEN `fan_momentum = 42`. (Tipo: Integration.)
- **AC-LGS-15** GIVEN que el `rivalClubId` del club del jugador está en la otra división esa temporada, WHEN se busca el fixture de derby, THEN no existe fixture y no se aplica ningún efecto de derby.

### Bloque G — IA clubs variance (F4)

- **AC-LGS-16** GIVEN el mismo club IA (ej. `clubId=5`, `base_team_skill=60`) ejecutando F4 para las temporadas 1 a 50, WHEN se analizan los 50 resultados, THEN todos los valores están dentro de `[55, 65]` y la distribución cubre al menos el rango `[57, 63]` (confirma que no es función identidad).
- **AC-LGS-17** GIVEN un club IA que desciende de D1 a D2 con `base_team_skill = 18`, WHEN inicia la nueva temporada, THEN `base_team_skill = max(15, 18 - 5) = 15` (clamp aplicado). Para un club con `base_team_skill = 70`, THEN `base_team_skill = 65`.

### ~~Bloque H — TV rights (F6)~~ ⚠️ DEPRECATED

> **AC-LGS-18** y **AC-LGS-19** quedan **deprecated**. La función `getTVRightsWeekly()` y sus ACs son incompatibles con `tv-rights.md` (F-TV1) y deben eliminarse al implementar ese sistema. Ver BREAKING CHANGE en F6 arriba.

### Bloque I — Coverage gaps (añadidos post /design-review)

- **AC-LGS-20** GIVEN un club IA con `squad_available_pct ≤ 63` en la semana de su partido, WHEN el match event es procesado, THEN el fixture queda `played` con el club IA perdiendo 0–3 (el club IA es el que registra el forfeit, igual que el club del jugador). (Tipo: Integration.)
- **AC-LGS-21** GIVEN que `startSeason()` completa para una división, WHEN se consultan los `calendar_events` insertados, THEN existen exactamente 2 rows de tipo `transfer_window_open` y 2 rows de tipo `transfer_window_close` (verano + invierno), cada uno con la `week` correcta según `TRANSFER_WINDOW_SUMMER_WEEKS` y `TRANSFER_WINDOW_WINTER_WEEKS`.
- **AC-LGS-22** GIVEN que el `rivalClubId` del club del jugador tiene un partido programado en la semana siguiente, WHEN el advance avanza a la semana anterior al derby, THEN existe un `calendar_event` de tipo `derby_warning` con `metadata.rivalClubId` correcto emitido por el staff comercial (tier 2+).
- **AC-LGS-23** GIVEN el club del jugador termina la temporada en primera posición de División 1, WHEN `processSeasonEnd()` ejecuta, THEN se genera un event de tipo `soft_win_condition` en la tabla `game_events` (o equivalente según ADR-008) que dispara el flujo de celebración.
- **AC-LGS-24** GIVEN F4 con seeds `seedrandom("1:12")`, `seedrandom("11:2")`, y `seedrandom("1:2")`, WHEN se calculan los valores, THEN los tres resultados son distintos entre sí (verifica ausencia de colisión por separador).

## Open Questions

- **OQ-LGS-01** — **Licencias de datos reales**: el GDD asume datos reales de La Liga española para desarrollo. Antes del lanzamiento comercial, resolver licencias con La Liga, RFEF, y FIFPRO. Alternativa sin licencia: seed data con clubs ficticios de estilo español. *(Prioridad: ALTA antes de cualquier lanzamiento público.)*

- **OQ-LGS-02** — **ADR-011 necesita actualización**: el ADR fue escrito asumiendo 16 clubs por división. Este GDD define 20 clubs (Primera/Segunda División reales). ADR-011 debe actualizarse para reflejar: `clubCount = 20`, `matchdays = 38`, `fixtures = 380/división`. *(Resolver antes de implementation de league-system.)*

- **OQ-LGS-03** — **Derbis cross-division**: cuando Atlético y Real Madrid están en diferentes divisiones (ejemplo: descenso de uno), no hay partido de derby. ¿El sistema debe simular un evento narrativo "el rival está en otra división" o simplemente ignorar el año? *(Provisión: ignorar — sin efectos de derby ese año.)*

- **OQ-LGS-04** — **Playoffs de promoción** (puestos 4-6 de D2): ¿cuándo se añaden? La estructura real de LaLiga incluye playoffs. *(Provisión: v1.1+. MVP solo con ascenso directo top 3.)*

- **OQ-LGS-05** — **Generación de datos de jugadores reales**: los 40 clubs × ~20 jugadores = ~800 player profiles con stats reales derivados de alguna fuente pública (FBref, Sofascore, etc.). ¿Cuál es el pipeline de datos? ¿JSON seed manual, scraping, o API de pago? *(Resolver antes de Technical Setup de league-system.)*

- **OQ-LGS-06** — ~~**Contratos heredados post-descenso D1→D2**~~ **RESUELTA 2026-05-17**: ver `design/quick-specs/relegation-contract-crisis-2026-05-17.md`. El "Relegation Financial Review" es un evento BLOCKING de pre-temporada con 3 opciones (Pacto de Solidaridad / Venta de Pre-Temporada / Voto de Confianza del Propietario). Actualización pendiente en `economy.md §10` y Tuning Knobs.
