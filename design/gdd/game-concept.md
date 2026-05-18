# Game Concept: Cascada FC (working title)

*Created: 2026-05-15*
*Last revised: 2026-05-16*
*Status: Approved (design-review NEEDS REVISION → 4 blockers resolved 2026-05-16)*
*Prototype: cascada-engine PROCEED (2026-05-16) — see prototypes/cascada-engine-concept/REPORT.md*

---

## Elevator Pitch

> Eres un manager de fútbol novato que toma un club en ruinas en un pueblo en ruinas. Cada decisión cae en cascada sobre los sistemas (deportivo, económico, social, urbano) de formas que descubres jugando; tu reputación crece, los alcaldes de otras ciudades te llaman, y a lo largo de generaciones construyes un legado — un mundo isométrico vivo que has esculpido tú mismo.

**Test de los 10 segundos**: *"Football Manager + SimCity + Theme Park, en pixel art isométrico estilo Habbo, donde tú también eres un personaje que crece."*

---

## Core Identity

| Aspecto | Detalle |
| ---- | ---- |
| **Genre** | Sports management sim + light city builder + light RPG |
| **Platform** | Web (browser) primario + Mobile PWA |
| **Target Audience** | Achiever-Explorer 30-50 años (ver Target Player Profile) |
| **Player Count** | Single-player (MVP) → MMO (post-MVP roadmap) |
| **Session Length** | 30-120 minutos = un mes in-game (~4 partidos + fin de mes) |
| **Monetization** | Premium (sin definir definitivamente; F2P-Coop opcional en MMO) |
| **Estimated Scope** | Large (4-6 meses MVP solo · ~18-24 meses visión completa) |
| **Comparable Titles** | Football Manager · PC Fútbol 4 · Theme Park · SimCity · Two Point Hospital · Stardew Valley |

---

## Core Fantasy

> *"Coges un club de cero — campo de tierra, ciudad fantasma — y a lo largo de temporadas lo conviertes en un imperio que ves crecer ladrillo a ladrillo, jugador a jugador, comercio a comercio. Por la mañana ves a tu plantilla entrenar; por la noche, las luces del estadio nuevo iluminan una ciudad que ya no cabe en sí misma. Y por el camino descubres que la sal en las patatas vende más cervezas — y que tú, no solo tu club, eres ahora alguien."*

El jugador es **el visionario que ve lo que otros no ven**: las cadenas invisibles entre sistemas, las oportunidades que se esconden en lo desolado, el potencial de un pueblo perdido. La fantasía emocional es la del **constructor-fundador con paciencia y curiosidad** — más Theme Park que FIFA, más SimCity que Dream League Soccer.

---

## Unique Hook

> *"Como un Football Manager ligero, AND ALSO la ciudad isométrica entera responde a tus resultados, las cascadas entre sistemas son descubribles (no expuestas), tu manager es un personaje que crece junto al club, y una IA local genera la voz del mundo (prensa, rumores, llamadas de alcaldes que te recuerdan) — texto vivo, no scripts."*

Cuatro diferenciadores simultáneos:

1. **Mundo visual creciente** como marcador real (no UI).
2. **Cascadas emergentes** parcialmente ocultas, descubribles, recompensadas.
3. **Manager-RPG**: tu personaje progresa y abre oportunidades de carrera.
4. **IA narrativa local (llama.cpp)** para textura, no para scripts.

Ningún manager actual hace los cuatro a la vez. El producto vive en el cruce.

---

## Player Experience Analysis (MDA Framework)

### Target Aesthetics (lo que el jugador SIENTE)

| Aesthetic | Priority | How We Deliver It |
| ---- | ---- | ---- |
| **Discovery** | **1 (primary)** | Cascadas ocultas, sinergias inesperadas, IA narrativa que sorprende |
| **Expression** | **2** | Tu club, tu ciudad, tu manager — todo customizable y persistente |
| **Fantasy** | **3** | Rol del visionario constructor; mundo pixel-art creíble y cálido |
| **Challenge** | 4 | Dominar el sistema de cascadas y la economía del club |
| **Submission** | 5 | Tempo contemplativo, "Calm Is The Tempo" (Pilar 4) |
| **Narrative** | 6 | Saga generacional (post-MVP); historias emergentes IA |
| **Fellowship** | 7 | Relación con plantilla, board, alcaldes (MVP); MMO real (post-MVP) |
| **Sensation** | 8 | Audio cálido, sprites con vida, ciclo día/noche, animaciones del mundo |

### Key Dynamics (comportamientos emergentes que queremos)

- Los jugadores **experimentan** con decisiones no obvias (subir el sueldo del jardinero a ver qué pasa).
- Los jugadores **toman notas mentales o reales** de cadenas descubiertas — el "cuaderno del manager" es parte del meta-juego.
- Los jugadores **vuelven al día siguiente** para ver el efecto de una decisión tomada antes de cerrar.
- Los jugadores **comparten capturas** del mundo creciendo (efecto SimCity histórico).
- Los jugadores **construyen identidad personal** alrededor de su manager (estilo, ética, ciudad fundadora).

### Core Mechanics (sistemas que construimos)

1. **Simulación determinista de partido** (engine sport-agnostic, plug-in fútbol).
2. **Motor de cascadas** — grafo de relaciones entre sistemas (entreno, finanzas, ánimo, asistencia, ciudad, prensa, etc.) con efectos parcialmente ocultos. Incluye **fan_momentum** como variable raíz de estado emocional acumulado de la afición (ver sección siguiente).
3. **Manager RPG** — habilidades, reputación, eventos de carrera, ofertas externas.
4. **Mundo isométrico vivo** — tile-based pixel art con state variants (día/noche, vacío/lleno, clima, fortuna del club).
5. **IA narrativa local** — llama.cpp server-side genera prensa, rumores, ofertas con voz coherente y memoria del mundo.
6. **Sistema de Mensajes del Staff** — red de comunicación contextual entre el jugador y el mundo del club. Cada empleado percibe su dominio (campo, plantilla, finanzas, afición, scouting) y genera mensajes que pistas sobre las cascadas sin explicarlas directamente. **Esta es la capa de feedback que hace el loop de 30 segundos intrínsecamente satisfactorio antes de que el jugador comprenda el sistema**. La calidad del staff determina la granularidad del feedback: staff novato → mensajes vagos; staff experto → recomendaciones contextuales precisas + avisos de calendario (fiestas, partidos rivales en TV, ventanas de transferencias). Este sistema también conecta directamente con el Manager-RPG: mejorar tu equipo técnico amplía tu visibilidad del mundo.

### fan_momentum — Variable Raíz de Estado Emocional

**fan_momentum** es el estado emocional acumulado de la afición. No es la asistencia de esta semana — es la historia emocional de la relación entre la afición y el club.

**Comportamiento (histéresis asimétrica)**: se construye lentamente (semanas de buenos resultados + precios razonables + ambiente positivo), pero se destruye rápidamente (pocas derrotas o subidas de precio percibidas como injustas). Como la reputación real: cuesta ganarse y es fácil perder.

**Por qué es variable raíz**: fan_momentum modula efectos de otras cascadas. Una subida de precio de entradas con momentum alto tiene impacto diferente que la misma subida con momentum bajo. Sin ella, las cascadas son Markov-1 (estado actual); con ella son path-dependent (historia). Es la variable que hace que "lo que llevamos arrastrado" pese en las decisiones actuales.

**Lectura/escritura (alto nivel)**:
- *Escriben*: resultados de partido, decisiones de precio de entradas, eventos narrativos significativos (ascensos, finales, debuts de fichajes estrella).
- *Leen*: modelo económico (sensibilidad de la afición a cambios de precio), motor de cascadas (multiplicadores de efectos), Manager-RPG (reputación del manager en esa ciudad).

La fórmula concreta pertenece al GDD del sistema económico / motor de cascadas. Esta sección establece la existencia y rol conceptual de fan_momentum como variable raíz.

---

## Player Motivation Profile

### Primary Psychological Needs Served (SDT)

| Need | How This Game Satisfies It | Strength |
| ---- | ---- | ---- |
| **Autonomy** | Sandbox sin meta forzada; tempo a tu ritmo; 3 curvas de progresión paralelas a elegir; cascadas descubribles libremente | **CORE** |
| **Competence** | Manager RPG con habilidades visibles que crecen; maestría del sistema de cascadas; prestigio que abre puertas | **CORE** |
| **Relatedness** | Plantilla con personalidades, board que reacciona, alcaldes que llaman; en MVP limitado a IA narrativa; escala fuerte en MMO post-MVP | **SUPPORTING (CORE en MMO)** |

Triángulo SDT cubierto → motivación intrínseca robusta. Mínima dependencia de recompensas extrínsecas artificiales.

### Player Type Appeal (Bartle Taxonomy)

- [x] **Achievers** — Trofeos, divisiones, ranking de manager, ciudad evolucionando: marcadores claros de logro. El soft win-condition (ganar la primera división) cierra el arco principal con un "ding" satisfactorio.
- [x] **Explorers** — El motor de cascadas es **el corazón explorador**: cada partida revela cadenas distintas; la IA narrativa añade sorpresa coherente.
- [x] **Socializers** — En MVP: relaciones con plantilla, board, prensa, alcaldes via IA. En post-MVP MMO: el pilar central.
- [ ] **Killers/Competitors** — Secundario en MVP. Primario en MMO (ligas humanas, fichajes entre managers).

### Flow State Design

- **Onboarding curve**: las primeras 2 semanas in-game = tutorial integrado. El club en ruinas obliga a aprender pocas mecánicas a la vez (entreno básico → primer partido → finanzas básicas → primer fichaje).
- **Difficulty scaling**: la curva sube con el club. Más recursos = más decisiones simultáneas. La cantidad de cascadas activas crece orgánicamente con el tamaño del club.
- **Feedback clarity**: cada decisión muestra efectos inmediatos (próximo evento) **y** efectos diferidos (semanas después, con el "ajá" de la cadena). El mundo isométrico reafirma todo cambio significativo visualmente.
- **Recovery from failure**: fracasar no es game over. Un descenso es una historia nueva. Un despido es un evento del RPG manager (te llaman de un club humilde). El sandbox no castiga, **reescribe**.

---

## Core Loop

### Moment-to-Moment (30 segundos)

1. Abrir panel de decisión (entreno · fichajes · finanzas · tácticas · staff · ciudad).
2. Tomar una decisión pequeña.
3. Avanzar tiempo (skip hasta próximo evento).
4. Leer feedback (informe, noticia IA, rumor, reacción).
5. (Opcional) caminar por el mundo isométrico al espacio relevante si el evento lo merece.

### Short-Term (5-15 minutos)

**Semana de partido** como unidad: Lunes-Sábado = entrenos, prensa, decisiones menores; Domingo = partido; resultado cierra el ciclo. Estructura predecible que ancla el ritmo.

### Session-Level (30-120 minutos)

**Un mes in-game (~4 semanas / ~4 partidos)**. Cierre con balance financiero, ranking, evaluación del board, resumen narrativo IA de "lo que pasó este mes". Punto de parada con cierre emocional claro. El próximo gran evento (partido decisivo, fin de ventana de fichajes, asamblea con el alcalde) queda apuntado como gancho para la próxima sesión.

### Long-Term Progression

Tres espinas dorsales que el jugador siente todo el rato:

1. **Manager RPG (tú)** — habilidades + reputación + ofertas de otros clubes.
2. **Club deportivo** — divisiones, trofeos, plantilla, infraestructura.
3. **Ciudad visual** — del barro al esplendor; 4 tiers visibles en MVP.

Curvas de apoyo: relaciones generacionales (post-MVP fuerte) y meta-skill del jugador (cascadas descubiertas, journal mental/real).

**Endgame**: **Soft win-condition + sandbox desbloqueado**. Hay un hito emocional final: ganar la primera división con tu club. En ese momento el alcalde anuncia una plaza con tu nombre, el estadio luce su forma final, y el arco del underdog se cierra formalmente. Después de ese cierre, el sandbox continúa sin fin — más cascadas por descubrir, más temporadas, eventual MMO. Los Achievers obtienen su "ding"; los Explorers siguen viviendo el mundo. No hay game over; hay final de arco y apertura de siguiente capítulo.

### Retention Hooks

- **Curiosity (CORE)**: hiciste un cambio antes de cerrar; quieres ver la cascada. Lo llevas dentro.
- **Anticipated event (CORE)**: el próximo evento esperado siempre está apuntado en el HUD (partido grande, deadline, asamblea).
- **Investment**: tu club, tu manager, tu ciudad — pérdida psicológica de no continuar.
- **Mastery**: cascadas por descubrir, sistemas por dominar, habilidades del manager por subir.

---

## Game Pillars

### Pilar 1: **Tinkering Beats Optimization**
El juego premia experimentar con curiosidad, no min-maxear. Las cascadas están parcialmente ocultas. La diversión es el "ajá, claro". No hay una build óptima — hay muchas configuraciones interesantes para descubrir. Las cascadas deben incluir al menos un nodo contraintuitivo por cadena (el descubrimiento más memorable del prototipo fue "demasiado descanso = peor física").

*Design test*: Si dudamos entre (a) exponer todas las estadísticas con tooltips y fórmulas o (b) dejar algunas relaciones opacas para descubrir, **este pilar elige (b)**. PERO: si el debate es sobre si un empleado experto da recomendaciones más precisas (revelar cascadas via personaje, no via UI), **el Pilar 3 toma la decisión** — porque la revelación viene del crecimiento del manager, no del sistema rompiendo sus propias reglas.

### Pilar 2: **The World Is The Scoreboard**
El progreso material siempre se renderiza en el mundo isométrico. Subir asistencia significa más gente en las gradas, no un porcentaje. Ascender significa el alcalde inaugurando una plaza, no solo un logro.

*Design test*: Si dudamos entre (a) una estadística "moral del barrio +12%" o (b) cinco transeúntes nuevos y un comercio abierto en la calle del estadio, **este pilar elige (b)**.

### Pilar 3: **You Grow Like Your Club**
El manager es un personaje, no un avatar mudo. Tienes habilidades, reputación, conexiones. Los NPCs te tratan distinto según quién has llegado a ser. Tu carrera es una segunda historia paralela a la del club. La calidad de tu staff (contratado por ti) determina cuántas cascadas son visibles y qué tan específicas son las recomendaciones.

*Design test*: Si dudamos entre (a) una oferta genérica "Club X te quiere fichar" o (b) una llamada IA-narrada del alcalde que recuerda vuestro último encuentro, **este pilar elige (b)**. Y: si el debate es sobre si habilidades del manager revelan más cascadas o dan mejores recomendaciones del staff, **este pilar dice SÍ** aunque Pilar 1 preferiría mantener la opacidad del sistema — porque la visibilidad viene del PERSONAJE que eres (tú fichaste a ese director deportivo experto), no del juego rompiendo su propia opacidad.

### Pilar 4: **Calm Is The Tempo**
La calma es feature. Sin FOMO, sin contadores reales que castigan ausencias, sin urgencia artificial. El tempo es contemplativo. Las decisiones son densas pero el reloj te espera.

*Design test*: Si dudamos entre (a) un deadline de 24h reales para responder a un fichaje o (b) un marcador "evento esperado" que el jugador dispara cuando esté listo, **este pilar elige (b)**.

### Tensión Central: Pilar 1 ↔ Pilar 3

**Tinkering Beats Optimization** (P1) dice: mantén las cascadas parcialmente opacas para que el descubrimiento sea del jugador.
**You Grow Like Your Club** (P3) dice: cuando el manager mejora, su staff también mejora, y ese staff revela más cascadas.

Estos dos pilares están en conflicto real. La regla de resolución:

> **Si la visibilidad de una cascada viene de crecer como manager** (contratar un director deportivo mejor, subir la habilidad de "análisis"), **P3 gana** — es tinkering via tu personaje.
> **Si la visibilidad viene de que la UI simplemente muestre más información** (tooltips, fórmulas expuestas, logs de debug), **P1 gana** — eso no es crecimiento, es trampa.

Este conflicto es el que gobernará las decisiones más difíciles del diseño del Manager-RPG.

### Otras tensiones entre pilares

- **P2 ↔ P1**: el mundo muestra efectos pero no causas. Transparencia de resultados, opacidad de cadenas.
- **P4 ↔ P3**: progresas al jugar, no al farmear. La calma no compite con el crecimiento.
- **P4 ↔ P2**: el mundo respira visualmente pero el reloj te espera. Animaciones vivas ≠ urgencia.

### Anti-Pillars (lo que el juego **NO** es)

- **NOT un manager hardcore tipo EHM/FM** — comprometería P1 (tinkering, no min-max) y P4 (calma, no obsesión por números).
- **NOT un sports arcade con controles directos del jugador** — somos manager, no coach. Si quieres pasar el balón, hay otros juegos.
- **NOT un live-service con FOMO** — comprometería P4. El reloj no nos castiga; nos espera.
- **NOT un single-save career que termina** — comprometería el endgame sandbox.
- **NOT cinemáticas scripteadas pesadas** — las historias salen del sistema y de la IA narrativa, no de cutscenes preescritas.

---

## Visual Identity Anchor

> **Lived-In Pixel** — *"Todo lo que se ve está vivo y responde — nada es decoración inerte."*

### Principios de apoyo

1. **Habbo-style isometric pixel art**: cálido, íntimo, ligeramente estilizado. Personajes y edificios legibles a tamaño pequeño. Animaciones simples pero presentes.
2. **State-driven rooms**: cada espacio (campo, oficina, bar, calle) renderiza estados según la simulación — vacío/lleno, día/noche, clima, temporada, fortuna del club.
3. **Crecimiento visible y discreto**: los cambios visuales son cuantizados — hay un "antes/después" claro al cruzar umbrales (ascenso → grada nueva; sponsor → banner; mejora del campo → césped sustituye a tierra).

### Color philosophy

Paleta pixel saturada, cálida. El estado inicial está apagado (marrones, grises — desolación, tierra, escasez). El crecimiento introduce los colores del club (identidad customizable del equipo sangra hacia la ciudad). El ciclo día/noche y el clima dan ritmo cromático. La paleta evoluciona con el club como recompensa silenciosa.

### Design test del anchor

Si dudamos entre (a) sprites estáticos hermosos pero idénticos durante toda la partida o (b) sprites más simples pero con múltiples variantes de estado, **este anchor elige (b)**.

Esta sección es la **semilla del art bible** — se desarrollará completa en `/art-bible`.

---

## Inspiration and References

| Reference | What We Take From It | What We Do Differently | Why It Matters |
| ---- | ---- | ---- | ---- |
| **PC Fútbol 4** | Sentir el viaje del club querido desde abajo · skip-por-eventos · semana de partido como ritmo | Mundo isométrico vivo + manager-RPG + IA narrativa + cascadas explícitas | Valida el corazón emocional del concepto (underdog journey) |
| **Theme Park** | Sistemas emergentes con inputs no obvios (sal → bebidas) · diversión por experimentación · curva de descubrimiento | Aplicado al fútbol; cascadas más complejas; layer narrativo IA encima | Valida que la emergencia "ligera" engancha al público generalista |
| **SimCity** | Mundo que crece como recompensa visible · sentido de construir algo a pesar de problemas · paciencia recompensada | Foco deportivo central; un solo club como puerta de entrada a la ciudad | Valida que la progresión visible del mundo tira por sí sola |
| **Football Manager** | Profundidad de simulación · skip-por-eventos eficiente · sensación de carrera larga | Mucho menos estadísticas; sin spreadsheet feel; UI mucho más visual y cálida | Define a quién NO queremos parecernos en tono (no a su densidad numérica) |
| **Habbo Hotel** | Estética pixel isométrica · espacios que son lugares, no menús · sensación de "habitar" | Sin chat directo (en MVP); más simulado; sport-focused | Establece el lenguaje visual y la sensación de "lugar" |
| **Crusader Kings** | Personajes que envejecen · saga generacional · IA narrativa que cuenta historias | Foco deportivo; mucho menos micropolítica; más visual | Inspira el largo plazo post-MVP (multi-gen, dynasties) |

**Non-game inspirations**: cultura popular del fútbol español (PC Fútbol, fútbol modesto, ascensos históricos tipo Leicester / Girona), retro fútbol management de Spectrum, novelas gráficas sobre clubes humildes.

---

## Target Player Profile

| Attribute | Detail |
| ---- | ---- |
| **Age range** | 30-50 (sweet spot 35-45) — la generación PC Fútbol y SimCity, ahora con tiempo limitado y poder de compra |
| **Gaming experience** | Mid-core. Profundidad sí, fricción burocrática no. |
| **Time availability** | Sesiones de 30-120min, varias veces por semana. Móvil PWA para sesiones cortas (10-20min, una semana in-game). |
| **Platform preference** | Web/PC primario; móvil secundario para snacks de gestión. |
| **Current games they play** | Football Manager (frustrados con su complejidad creciente), Stardew Valley, Two Point Hospital, Crusader Kings, Tropico |
| **What they're looking for** | Profundidad de manager **sin** la barrera de entrada hostil; mundo vivo; tempo a su ritmo; agencia creativa real |
| **What would turn them away** | UIs de hoja de cálculo, FOMO/live-service, falta de identidad visual fuerte, simulación tan abstracta que pierdes la sensación de fútbol |

---

## Technical Considerations

| Consideration | Assessment |
| ---- | ---- |
| **Recommended Engine** | **Web stack** (TypeScript full-stack monorepo: SvelteKit + Hono + Drizzle + Socket.IO + BullMQ). Confirmado por el usuario. Razón: web es la plataforma nativa, prepara MMO sin replatform, soporta PWA móvil. |
| **Key Technical Challenges** | Simulación determinista server-authoritative · grafo de cascadas con tuning balanceado · inferencia llama.cpp server-side con coste/latencia controlados · pixel art isométrico fluido en mobile PWA |
| **Art Style** | Pixel art 2D isométrico (Lived-In Pixel) — ver Visual Identity Anchor |
| **Art Pipeline Complexity** | Medio. Tile-based + sprite layering para state variants. Posible apoyo de AI tools para bases. |
| **Audio Needs** | Moderado. Ambient layers (ciudad, estadio, vestuario), música por contexto (oficina, partido), SFX UI |
| **Networking** | Server-authoritative desde día 1 (single-player vía API). Socket.IO listo para MMO post-MVP. |
| **Content Volume** | MVP: 2 divisiones × 20 clubs (40 total), ~800 jugadores generados, ~30 staff, ~18 cadenas de cascada, ~50 eventos IA base, 4 tiers de ciudad |
| **Procedural Systems** | Sí: generación de jugadores, eventos narrativos via IA local, cadenas de cascada parametrizadas |

---

## Risks and Open Questions

### Design Risks

- **DR1 [MEDIUM — parcialmente mitigado]** — Balance "tinkering vs frustration": si las cascadas son demasiado opacas parece random; demasiado claras matan el descubrimiento. **El prototipo del motor de cascadas (2026-05-16, PROCEED) validó que este equilibrio es alcanzable** cuando: (a) los mensajes del staff son el interfaz de feedback, (b) las cascadas incluyen nodos contraintuitivos, y (c) fan_momentum crea path-dependency que hace las cadenas menos predecibles. DR1 se convierte en trabajo de tuning fino en los system GDDs.
- **DR2 [MEDIUM]** — 3 curvas de progresión paralelas pueden saturar la UI. Necesitamos UX disciplina (probablemente UI híbrida menu + spatial).
- **DR3 [MEDIUM]** — Convencer al público FM-cansado vs alejar al FM-loyal es un equilibrio de comunicación. El tono visual debe vender la diferencia desde la primera captura.

### Technical Risks

- **TR1 [HIGH]** — Coste e infraestructura de llama.cpp server-side: ¿cuántos tokens/jugador/sesión? ¿Qué modelo mínimo viable? ¿Qué hardware? Necesita prototipo de coste real antes de comprometernos.
- **TR2 [MEDIUM]** — Simulación determinista cross-server-client para MMO futuro: hay que diseñarla desde el principio aunque MVP sea SP.
- **TR3 [MEDIUM]** — Pixel art isométrico fluido en mobile PWA: cámara, performance, UX táctil. Validar en device early.
- **TR4 [LOW]** — Gestión de muchas variantes de sprite: más arte que código.

### Market Risks

- **MR1 [MEDIUM]** — Nicho cruzado puede no encontrar audiencia clara — los compradores potenciales (FM-fatigados, fans SimCity con interés en fútbol) son segmentos pequeños individualmente; el solapamiento es la apuesta.
- **MR2 [LOW]** — Football Manager domina el mental share del manager hardcore. Diferenciación clara visual y de tempo es esencial en marketing.

### Scope Risks

- **SR1 [HIGH]** — La visión completa es **multi-año** (~18-24 meses solo); MVP necesita disciplina feroz para caber en 4-6 meses. Tentación constante de añadir features.
- **SR2 [MEDIUM]** — Arte = bottleneck para solo dev. Plan: AI tools para bases + retoque manual + apoyarse en variantes via composición.

### Open Questions

- **OQ1** — ¿Qué modelo de llama.cpp (tamaño/quant) cubre la calidad narrativa mínima sin matar el coste de hosting? *(Resolver con prototipo TR1.)*
- **OQ2** — ¿Cuántas cascadas son "suficientes" para que el descubrimiento se mantenga ~50h? *(Resolver con prototipo del motor de cascadas + playtests cortos.)*
- **OQ3** — ¿La curva de habilidad del manager RPG escala bien al modelo MMO? *(Resolver antes de pre-producción del MMO.)*
- **OQ4** — ¿Mobile PWA es realmente viable para esta UX isométrica con cámara, o necesita un cliente móvil dedicado? *(Resolver con prototipo TR3 temprano.)*

---

## MVP Definition

**Core hypothesis**: *"Los jugadores se enganchan más a un manager de fútbol cuando ven crecer el mundo y descubren cascadas ocultas, que cuando solo manipulan hojas de cálculo."*

El MVP responde sí/no a esta pregunta única. Todo lo demás (MMO, dinastías, real-time) son **expansiones que solo tienen sentido si la respuesta es sí**.

### Required for MVP

1. **Motor de partido determinista** (fútbol, plug-in sport-agnostic ya separado).
2. **2 divisiones × 20 clubs (40 total)**, 3-5 temporadas jugables sin agotar contenido.
3. **~18 cadenas de cascada** ocultas y descubribles, recompensa visible.
4. **Manager RPG core**: 5 habilidades × 4-5 niveles, reputación, evento "otro alcalde te llama".
5. **Mundo isométrico** con estado inicial + 3-4 tiers de crecimiento visibles.
6. **IA narrativa light (llama.cpp)**: resúmenes de partido, ofertas, prensa básica, conflictos puntuales.
7. **Skip-por-eventos** + semana de partido + cierre de mes.
8. **PWA móvil funcional** desde el principio (no añadido tarde).

### Explicitly NOT in MVP

- MMO mode (Socket.IO presente pero solo para SP server-auth).
- Real-time season mode.
- Dinastías multi-generacionales completas (jugadores pueden envejecer básico, no se retiran como entrenadores).
- Multi-club career.
- Multi-deporte (engine sport-agnostic pero solo fútbol implementado).
- Sistema de chat / espacios sociales.
- Customización avanzada del estadio (4 tiers fijos, no editor).

### Scope Tiers (si tiempo/budget se aprieta)

| Tier | Contenido | Features | Timeline (solo) |
| ---- | ---- | ---- | ---- |
| **MVP (v1.0)** | 2 divisiones × 20 clubs (40 total), 3-5 temporadas, 18 cadenas de cascada, manager RPG básico, ciudad 4 tiers, IA narrativa light | Core loop completo | 4-6 meses |
| **Vertical Slice** | MVP polido + onboarding refinado + 1 temporada demo curated | Polish + tutorial | +1-2 meses |
| **Alpha (v1.0 expandido)** | + jugadores envejecen + 1ª gen de cantera retira + más cascadas | Light dynasty | +2-3 meses |
| **Beta (v1.5)** | + Real-time season mode (1 liga opt-in) | Tiempo real puente | +2 meses |
| **MMO (v2.0)** | Multiplayer, ligas humanas, fichajes entre managers, espacios sociales | Full MMO | +6-12 meses |

**Total visión completa**: ~18-24 meses solo. **MVP shippeable** en 4-6 meses.

---

## Next Steps

### Completado ✅
- [x] Stack Web scaffolded: `/setup-web-stack` — monorepo TypeScript SvelteKit + Hono + Drizzle + Socket.IO + BullMQ
- [x] Prototipo del motor de cascadas: `/prototype cascada-engine` — PROCEED (2026-05-16). Hipótesis validada.
- [x] Design review del concept doc: `/design-review` — 4 blockers resueltos (2026-05-16).

### Pendiente (en orden)
- [ ] **ADR-001: Estrategia de determinismo del simulador** — definir seeded RNG vs. event-based random antes de cualquier GDD de partido
- [ ] **ADR-002: Topología del grafo de cascadas** — DAG vs. cíclico con ticks discretos; decide la arquitectura de cascade-engine.ts
- [ ] `/gate-check` — confirmar readiness para Systems Design
- [ ] `/art-bible` — desarrollar "Lived-In Pixel" en spec completa (antes del Technical Setup gate)
- [ ] `/map-systems` — decomponer con motor de cascadas como sistema #1 Foundation
- [ ] `/design-system cascade-engine` — primer GDD: incluir fan_momentum, cascadas contraintuitivas, staff visibility, calendar events
- [ ] `/design-system economy` — segundo GDD: incluir escalado por división, fan_momentum fórmula, mecanismo de quiebra
- [ ] `/design-system manager-rpg` — nombrar las 5 habilidades, conectar a variables del sistema
- [ ] `/design-system match-simulation` — motor de partido determinista con seeded RNG
- [ ] `/review-all-gdds` + `/gate-check` — cross-system consistency antes de arquitectura
