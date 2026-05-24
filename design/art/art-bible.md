# Art Bible — Cascada FC

> **Status**: ✅ **COMPLETE** — all 9 sections approved 2026-05-16
> **Author**: user + art-director (delegated by /art-bible) + ux-designer (Section 7) + technical-artist (Section 8)
> **Last Updated**: 2026-05-16
> **Template**: Art Bible — Visual Identity Specification
> **Engine binding**: PixiJS 8 (canvas) + DOM (management UI) per ADR-006 / ADR-012
> **Accessibility binding**: WCAG 2.1 AA per `design/ux/accessibility-requirements.md` § Color-safe constraint
> **Visual seed**: "Lived-In Pixel" anchor from `design/gdd/game-concept.md` §Visual Identity Anchor
> **Art Director Sign-Off (AD-ART-BIBLE)**: skipped — Lean mode (per `production/review-mode.txt`). Sign-off available on demand if user invokes `--review full`.

This document is the binding visual specification for Cascada FC. Every asset produced — sprite, tile, icon, UI element, particle — must satisfy these rules. Every `/asset-spec` invocation references this bible. Every `/consistency-check` validates GDDs against it.

The bible narrows the solution space deliberately: in exchange for visual coherence and production discipline, future design decisions inherit the constraints documented here.

---

## 1. Visual Identity Statement

> **Approved**: 2026-05-16 (user lock-in + 2 observations applied)
> **Authored by**: art-director (delegated by /art-bible)

### 1.1 Regla visual única

**Todo lo que se ve acusa recibo — cada píxel que cambia le dice al jugador que algo en el mundo respondió a su decisión.**

Esta es la prueba canónica que aplica cualquier decisión visual: *¿acusa recibo de algo real, o es solo decoración?*

### 1.2 Principios visuales de soporte

#### Principio 1 — Pixel Habitado *(Pilar 2: The World Is The Scoreboard)*

El mundo isométrico es el informe de progreso. Cada cambio de estado con significado en la simulación tiene una expresión visual discreta y cuantizada: no barras de progreso flotantes, sino césped que sustituye a tierra, gradas que aparecen donde había valla, banderines del patrocinador donde había pared gris. Los cambios se producen en umbrales, no en degradados continuos — el jugador *ve el momento* en que algo cambia.

*Test de diseño*: Cuando hay que representar "el club mejora su estadio", este principio elige un sprite de grada nueva con gente visible, no un porcentaje en una barra.

#### Principio 2 — Paleta que Respira *(Pilar 4: Calm Is The Tempo)*

La identidad de color no es la del estado óptimo — es la del estado *actual*. El inicio es marrón-ceniza, desolación de campo de tierra en tarde nublada de un pueblo chico. El color llega con el progreso: los colores del club tiñen los elementos del estadio, la ciudad gana saturación por barrios, el ciclo día-noche y el clima dan ritmo cromático sin urgencia. Ningún elemento visual pulsa, destella ni reclama atención compulsiva. Cálido como una tarde de domingo en una taberna de barrio — no como el amanecer tropical de un juego de móvil free-to-play.

*Test de diseño*: Cuando un elemento necesita destacar, este principio elige contraste estático sobre animación llamativa.

#### Principio 3 — Legibilidad a Pulgar *(Pilar 1: Tinkering Beats Optimization)*

Personajes, edificios y tokens de estado son legibles a resoluciones pequeñas (mínimo 16×16 px para personajes, 32×32 px para edificios de un tile). El estilo es Habbo-íntimo: proporciones ligeramente cabezudas, siluetas inequívocas, animaciones de 2-4 frames que comunican actividad sin coste de atención. El jugador debe leer el estado del mundo en un vistazo, porque está pensando en cascadas, no en descifrar sprites.

*Test de diseño*: Cuando un sprite es ambiguo a 50% de zoom, este principio elige simplificar la forma sobre añadir detalle.

#### Principio 4 — Animación Funcional, con Vida Ambient Controlada *(Pilar 1 + Pilar 2)*

> **Revisado 2026-05-21** (decisión Pablo): el principio original prohibía toda
> animación sin "razón simulada". Esto se ha relajado para habilitar el Pilar 2
> *"The World Is The Scoreboard"* y la promesa de un mundo isométrico vivo
> (Habbo / SimCity / Theme Park). La regla se sustituye por tres clases con
> presupuestos y prioridades claras. Ver `design/gdd/world-life.md` para el
> catálogo operativo.

Hay tres clases de animación, con prioridad descendente:

**Clase A — Animación funcional (prioridad máxima).** Anclada a un evento o estado de
simulación. Ejemplos: árbitro caminando al centro = partido por empezar; manager
levantándose al escritorio = career milestone; crowd-tile convergiendo al estadio =
matchday; coche del club estacionado tras fichaje firmado. Estas SIEMPRE se
renderizan si están activas — no compiten por presupuesto.

**Clase B — Crowd ambient estático (prioridad media).** Crowd-tiles con loop de
2 frames (movimiento de hombros) en gradas, plazas, calles. NO se desplazan por el
mapa. Densidad escala con tier (city-progression §3.1) y fan_momentum.

**Clase C — Vida ambient en movimiento (prioridad baja).** Peatones individuales,
ciclistas, patinetes, coches genéricos, perros con dueño. Se desplazan por paths
predefinidos. NO requieren tener un rol simulado, PERO:

1. Su densidad escala monotónicamente con tier (más vida → más prosperidad
   percibida, anclando al Pilar 2).
2. Tienen un presupuesto duro: **máximo 20 entidades Clase-C simultáneas** en
   pantalla, **máximo 40 totales activas en el mundo**.
3. Si una animación Clase-A o Clase-B necesita un tile, las Clase-C se
   desvían del path (rerouting trivial; o desaparecen al borde si no caben).
4. Variantes nocturnas: muchas menos Clase-C entidades (~30% de la diurna),
   coherente con Pilar 4 "Calm Is The Tempo".
5. En lluvia: paraguas (variante sprite) reemplaza la cabeza expuesta;
   patines y bicis desaparecen del pool (realista).

*Test de diseño revisado*: Cuando se propone una animación:
1. ¿Es Clase A (rol simulado)? → sí, render unconditional.
2. ¿Es Clase B (crowd-tile estático con loop)? → sí, render según densidad de tier.
3. ¿Es Clase C (vida ambient en movimiento)? → sí, sujeta al presupuesto §3 de
   `world-life.md`. No "decora vacío" — *amplifica la sensación de mundo vivo*.
4. ¿Es algo más (UI sparkles, parpadeos, partículas de gol)? → **PROHIBIDO**.
   Principio 4 sigue sin tolerar "feedback compulsivo" ni "spectacle gratuito"
   (ver §1.4 "Lo que esta identidad NO es").

#### Principio 5 — Manager Visible, Carrera Acumulada *(Pilar 3: You Grow Like Your Club)*

El manager no es un avatar mudo: es un personaje cuya progresión RPG se manifiesta visualmente. Tu sprite en el despacho cambia con el tiempo (experiencia acumulada, vestimenta, postura). El despacho mismo acumula objetos: trofeos en estantes, fotos enmarcadas de fichajes históricos, banderines de ciudades visitadas, cartas de alcaldes que llamaron. El staff que has contratado tiene presencia visual diferenciada según su `qualityTier` (ADR-009) — un ojeador novato es un sprite genérico; un director deportivo experimentado tiene retrato propio. La carrera vive en el cuarto, no en una hoja de stats.

*Test de diseño*: Cuando se propone representar "progreso del manager", este principio elige cambios visuales en el despacho o sprite del manager sobre un nivel numérico en HUD.

### 1.3 Identidad visual en un párrafo *(para outsourcing y quoting)*

> Cascada FC es pixel art isométrico habitado: cálido como una taberna de barrio un domingo, funcional como un cuadro de mandos analógico. El mundo empieza en ceniza y marrón —un campo de tierra, una ciudad fantasma— y adquiere color y vida exactamente donde las decisiones del jugador lo merecen, en umbrales discretos que se ven y se sienten. Ningún píxel es decoración: si se mueve, es porque algo en la simulación lo mueve; si cambia de color, es porque el club o la ciudad cambiaron. El propio manager y su despacho acumulan visualmente la carrera del jugador. El estilo Habbo-íntimo garantiza legibilidad a tamaño pequeño y en pantallas de 375px, sin sacrificar la calidez de un mundo que respira al ritmo de sus habitantes. Esta es la prueba que aplica cualquier decisión visual: *¿acusa recibo de algo real, o es solo decoración?*

### 1.4 Lo que esta identidad NO es

- **NO pixel-art contemplativo / nature-pixel.** Esta no es la paleta lavanda y verde menta de *Stardew Valley* ni el silencio de *A Short Hike*. El mundo tiene vida de barrio, no de campo abierto — ruido visual controlado, no serenidad nórdica.
- **NO flat UI / ilustración vectorial.** Los elementos de management que viven en el DOM son funcionales y tipográficamente limpios, pero no compiten en estética con el canvas isométrico. Ningún icono de UI imita el estilo isométrico del mundo — son herramientas, no arte.
- **NO feedback visual compulsivo.** Prohibidos: partículas que llueven al marcar un gol, flashes de pantalla en notificaciones, números que flotan y desaparecen sobre personajes, UI que pulsa para reclamar atención. El refuerzo visual existe — pero es estático, breve y proporcional al peso de la decisión.
- **NO 3D / 2.5D rendered.** *Two Point Hospital*, *RimWorld* y similares tienen "look isométrico" pero son 3D con cámara fija o sprites rendereados desde 3D. Cascada FC es pixel art puro a 2D, dibujado píxel a píxel, sin pipeline 3D. Esto es decisión técnica (ADR-006 commits a PixiJS 8 con sprites 2D) y estética (la calidez del pixel art genuino vs. el "uncanny" del 3D-faking-2D).

---

## 2. Mood & Atmosphere

> **Approved**: 2026-05-16 (user lock-in + Onboarding Estado 7 added)
> **Authored by**: art-director (delegated by /art-bible) + Estado 7 extended

Esta sección define el *carácter emocional* de cada estado de juego visible. No es guía de animación ni de color (esas son las secciones 3 y 4) — es el mapa de sensaciones que ancla todas las decisiones visuales y sonoras de cada estado. Cada estado tiene un "estado de ánimo de referencia" que cualquier asset reviewer puede usar como test: *¿este sprite / color / movimiento pertenece a este estado de ánimo?*

### Estado 1 — Dashboard (rutina diaria)

| Campo | Valor |
|---|---|
| **Emoción primaria** | Curiosidad habitada — el jugador husmea sus propios dominios sin urgencia, como un dueño de taberna que revisa el género un martes por la mañana |
| **Carácter lumínico** | Tarde de entre semana · temperatura cálida media (3800–4200K analógico) · contraste bajo-medio · luz fill dominante sobre key, sin sombras duras |
| **Descriptores atmosféricos** | Polvoriento-familiar · silenciosamente ocupado · gastado con cariño · manejable · de andar por casa |
| **Nivel de energía** | Contemplative |
| **Portador visual clave** | El panel lateral: tipografía y cifras tienen el peso visual justo para ser leídas, no para ser sentidas — la jerarquía dice "está todo bajo control" |
| **Cue sonoro** | Music dominante (BPM ~70–80, instrumental); Ambient en segundo plano (rumor de ciudad/estadio lejano); SFX solo en confirmación de acción |

### Estado 2 — Match Day (domingo de partido)

| Campo | Valor |
|---|---|
| **Emoción primaria** | Tensión contenida — la expectativa de quien ha preparado todo lo que podía y ahora solo puede mirar, como un entrenador con los brazos cruzados en el banquillo |
| **Carácter lumínico** | Tarde de domingo, 16:00 · luz rasante de octubre sobre las gradas · contraste cielo gris lavado / césped verde saturado · ratio key/fill 3:1 — sombras largas definen la hora |
| **Descriptores atmosféricos** | Cargado como víspera de examen · estático pero vivo · solemne de barrio · pesado en silencio · honesto |
| **Nivel de energía** | Alert |
| **Portador visual clave** | Las sombras largas sobre el rectángulo de césped — la luz rasante convierte el campo en el centro gravitacional de la pantalla |
| **Cue sonoro** | Ambient protagonista (murmullos de grada, botines, viento); Music reducido o ausente durante simulación; SFX reactivo (silbato, ovación contenida) |

### Estado 3A — Aftermath: Victoria

| Campo | Valor |
|---|---|
| **Emoción primaria** | Satisfacción tranquila — el alivio silencioso del que esperaba ganar y lo confirma, no euforia de papelitos; como salir del campo con el resultado correcto bajo el brazo |
| **Carácter lumínico** | Transición a atardecer · cálida alta (2700–3200K analógico) · contraste suave · hora dorada, no flash de celebración |
| **Descriptores atmosféricos** | Dorado sin exceso · liberado · calmadamente satisfecho · como taberna llena de gente que habla bajito |
| **Nivel de energía** | Measured |
| **Portador visual clave** | El sprite del manager en el despacho: postura erguida, un detalle de celebración acumulativa (trofeo nuevo, foto nueva en la pared) — el mundo absorbe el resultado discretamente |
| **Cue sonoro** | Music sube levemente a melodía mayor (BPM sin cambio); Ambient de festejo contenido (palmas distantes, conversaciones); SFX al añadirse el nuevo objeto al despacho |

### Estado 3B — Aftermath: Derrota

| Campo | Valor |
|---|---|
| **Emoción primaria** | Peso sin drama — la derrota duele como duele en la realidad: en silencio, pensando en qué salió mal, sin teatralidad |
| **Carácter lumínico** | Anochecer gris · fría (5500–6500K analógico) · contraste ligeramente elevado · sin luz de relleno cálido |
| **Descriptores atmosféricos** | Silencioso-pesado · ceniza de lunes · honesto sin flagelación · frío de vestuario vacío · contenido |
| **Nivel de energía** | Subdued |
| **Portador visual clave** | El dashboard sin cambios positivos: los números hablan, ningún elemento del mundo se mueve — la quietud *es* el mensaje |
| **Cue sonoro** | Music menor o ausente; Ambient mínimo (silencio de estadio vacío); SFX solo en interacciones explícitas del jugador |

### Estado 4 — Threshold Crossing (cambio de tier del mundo)

| Campo | Valor |
|---|---|
| **Emoción primaria** | Asombro específico — no maravilla genérica, sino el reconocimiento concreto de "esto lo construí yo"; como ver por primera vez una obra tuya terminada |
| **Carácter lumínico** | Momento de ruptura: en el instante del cambio, la escena recibe un corte de luz no-destructivo — un frame o dos de más contraste que señala "algo cambió" antes de asentarse al carácter lumínico del nuevo tier |
| **Descriptores atmosféricos** | Específico · irreversible · concreto · breve · ganado |
| **Nivel de energía** | Vibrant — contenido a 2–4 frames de animación, luego regresa a Measured |
| **Portador visual clave** | El sprite del tile nuevo: único elemento que cambia; el resto del mundo permanece quieto para que el ojo vaya exactamente ahí. Cambio cuantizado — un frame es tierra, el siguiente es césped |
| **Cue sonoro** | SFX protagonista: sonido de firma único por tipo de threshold (construcción, campo, ciudad); Music sube brevemente con melodía principal y regresa al BPM de dashboard |

### Estado 5 — AI Narrative Event (lectura de Inbox)

| Campo | Valor |
|---|---|
| **Emoción primaria** | Atención lectora — el jugador se concentra en texto, no en mundo; como leer una carta que esperabas en el buzón de casa |
| **Carácter lumínico** | El canvas isométrico se mantiene visible pero con brightness reducida al 70% — no desaparece, está presente como contexto; la UI de lectura es DOM blanco-cálido sobre ese fondo tamizado |
| **Descriptores atmosféricos** | Íntimo · atento · privado · tranquilo · como carta en mano |
| **Nivel de energía** | Contemplative |
| **Portador visual clave** | El encabezado del remitente: el retrato del NPC (sprite pequeño, expresión neutra-contextual) junto al nombre del rol — ancla "de quién viene esta presión" |
| **Cue sonoro** | Music reducido a volumen mínimo; Ambient silenciado; SFX solo en acción de abrir/cerrar mensaje (papel doblado, tono sutil) |

### Estado 6 — Manager Office / RPG Progress

| Campo | Valor |
|---|---|
| **Emoción primaria** | Orgullo acumulado — el jugador recorre su propia historia visual sin que nadie se la cuente; como repasar el álbum de fotos de una familia |
| **Carácter lumínico** | Interior · luz de lámpara de escritorio (2400–2800K) · contraste alto en zonas de objeto (trofeos, fotos iluminados) · penumbra cálida en periferias |
| **Descriptores atmosféricos** | Como linterna de keroseno en cabaña de montaña · acumulado · personal · irreproducible en otro save · vivido |
| **Nivel de energía** | Contemplative |
| **Portador visual clave** | Los objetos del estante posterior: cada trofeo, foto o carta es un punto de datos visual de la carrera; la densidad de objetos comunica años de gestión más que cualquier número |
| **Cue sonoro** | Music en versión acústica/reducida de la melodía principal; Ambient de despacho (tictac, lluvia lejana si es noche); SFX al inspeccionar objeto (tacto de papel, cristal) |

### Estado 7 — Onboarding (primeras 2 semanas in-game)

| Campo | Valor |
|---|---|
| **Emoción primaria** | Curiosidad descubridora protegida — la sensación de las primeras horas en un trabajo nuevo donde sabes que se te perdonan los errores; el jugador husmea sin miedo a romper nada |
| **Carácter lumínico** | Variación del Dashboard (3800–4200K) pero con un punto extra de cielo abierto — luz más alta, sombras más cortas, sensación matutina; las primeras escenas son cuando la luz aún promete que el día está empezando |
| **Descriptores atmosféricos** | Permisivo · enseñante sin pedantería · primer-día · "puedes tocarlo todo" · tranquilizadoramente vacío |
| **Nivel de energía** | Measured — más alerta que Dashboard estándar porque el jugador está aprendiendo, sin urgencia |
| **Portador visual clave** | Pistas contextuales diegéticas: el staff hace gestos hacia el espacio que merece atención (el ojeador apunta hacia el campo cuando hay que entrenar, el director financiero abre un libro cuando hay que mirar finanzas) — el tutorial es la postura de un NPC, no un overlay |
| **Cue sonoro** | Music ligeramente más arriba que Dashboard (BPM 80–85, melodía con más espacio); Ambient limpio (pocos NPCs, eco de pueblo despoblado); SFX de descubrimiento al desbloquear un nuevo panel (campana suave, no fanfarria) |

La salida del estado Onboarding no es cinemática: simplemente sucede al final de la semana 2 cuando el dashboard se expande con los paneles restantes y los NPCs del staff regresan a su actividad de fondo. Cumple Pilar 4 (sin teatro de "tutorial completado") y Pilar 3 (el crecimiento del manager justifica la expansión del UI sin necesidad de premiarla con un evento).

### Transiciones entre estados

Las transiciones en Cascada FC no son jamás cortes instantáneos ni flashes. P4 (*Calma es la feature*) dicta que el cambio de estado de ánimo llega como llega el clima — el jugador lo siente antes de verlo explícitamente.

El protocolo de transición es el mismo para todos los estados: **fade de música en 800–1200ms, cruce de Ambient en 400ms, cambio de temperatura lumínica en 2–3 frames de interpolación del color de fondo del canvas**. Ningún elemento de UI hace transición animada — solo el audio y el fondo del canvas.

La excepción es el Estado 4 (Threshold Crossing): P2 (*El mundo es el marcador*) exige que ese umbral sea *sentido*. El SFX de firma rompe el silencio ambiental durante exactamente el tiempo del tile-swap animation (2–4 frames), y la música sube durante 3–5 segundos antes de volver al BPM de dashboard. La brevedad *es* el respeto a P4: el mundo registra el hito y sigue adelante — no hace confetti.

### Anti-estados de ánimo

El juego NUNCA alcanza estos estados emocionales visuales:

**1. Urgencia frenética.** Ningún estado activa feedback visual pulsante, contadores en cuenta atrás con color rojo, o animaciones de llamada de atención compulsiva. Hacerlo violaría P4 de forma estructural y convertiría el juego en un gestor de ansiedad, no de placer. *Si un jugador siente que "tiene que actuar ya" por una señal visual, hay un bug de diseño, no una feature.*

**2. Distancia irónica o estética "lo-fi chill".** Cascada FC no es un simulador de estética. El tono es comprometido, no cool — el manager *quiere ganar de verdad*. Una paleta demasiado desaturada o referencias visuales que guiñen el ojo ("pixel art retro" como pose cultural) traicionarían la fantasía central del constructor-fundador que sí se lo toma en serio.

**3. Celebración espectacular post-victoria.** La victoria no genera fuegos artificiales, confeti, ni música de fanfarria. El mundo absorbe el resultado con la misma calma con que el jugador tomó sus decisiones. La euforia vacía es el lenguaje de los juegos F2P que necesitan enganchar — Cascada FC confía en que el jugador siente la victoria porque entiende lo que costó construirla.

---

## 3. Shape Language

> **Approved**: 2026-05-16 (user lock-in + 2 fixes applied)
> **Authored by**: art-director (delegated by /art-bible)

La forma es el primer mensaje. Antes de que el jugador lea una etiqueta o procese un color, el contorno de un sprite o la curva de un panel ya ha comunicado jerarquía, intención y estado. En Cascada FC, cada decisión de forma sirve a la legibilidad funcional primero y a la estética segundo — nunca al revés.

### 3.1 Filosofía de Silueta de Personajes

**Principio rector** *(P1 — Tinkering)*: El jugador manipula su mundo identificando piezas. La silueta es el handle de la pieza.

**Regla de legibilidad a tamaño thumbnail.** Todo sprite de personaje individual debe ser identificable a **16×24 px** sin color. En el estilo Habbo-íntimo esto equivale a una cabeza de 6px de ancho, hombros de 10px, y cuerpo-pierna de 10px de alto. La cabeza ocupa entre el 30-35% de la altura total del sprite — deliberadamente grande, al modo chibi — para que la expresión y la dirección de mirada sean legibles a esa escala.

**Rasgos distintivos por arquetipo:**

| Arquetipo | Señal de silueta | Lógica |
|---|---|---|
| **Jugador** (futbolista) | Cuerpo atlético, piernas largas proporcionales, sin accesorio en cabeza | La forma más "neutra" — es el elemento más numeroso y debe fundirse en la plantilla visual |
| **Manager** (el jugador) | Mismo canon que el futbolista pero siempre con accesorio de cabeza (gorra, auricular, portapapeles bajo el brazo) | El jugador necesita encontrarse a sí mismo en la fila de staff en match-day sin leer el nombre |
| **Staff técnico** (médico, preparador) | Accesorio visible: bolsa médica o cono de entrenamiento en mano; silueta más compacta | La herramienta en mano distingue función sin necesitar color |
| **Director deportivo** | Silueta con tablet/carpeta prominente, postura más erguida y estática | El nivel de abstracción es mayor — administra, no corre |
| **Prensa / Patrocinadores / Alcaldes** | Solo aparecen en inbox portraits (64×64 px): fondo ovalado de color institucional, rasgo de prop único (micrófono, traje distinto, insignia de ciudad) | No son sprites de mundo; su lenguaje puede ser más ilustrativo sin romper coherencia |

**Vocabulario de poses.** Cada arquetipo de mundo (Manager, Jugador, Staff de campo) tiene **3 poses base**: idle (weight shift sutil, 4 frames), acción contextual (caminar / gesticular, 6 frames), y reacción emocional (celebración contenida o cabeza baja, 4 frames). Las reacciones emocionales son las únicas poses que rompen la silueta-base: el manager con brazos levantados, el jugador de rodillas. Esto refuerza la lectura de estado (Section 2 — Victoria / Derrota) sin texto.

*Test operacional*: Cuando el diseñador coloca el sprite del manager junto a 10 jugadores en la línea de match-day, ¿el manager se distingue en 0.5 segundos en una captura a 320px de ancho? Si no, añadir un prop de cabeza más alto o aumentar contraste de accesorio.

**Crowd vs Individual.** Un personaje es un sprite individual si necesita ser seleccionable, recibe un nombre o estado, o expresa una emoción dirigida al jugador. Todo lo demás es crowd-tile: una loseta de 32×32 px con 2-4 cabezas integradas en la textura, con animación de loop de 2 frames (movimiento de hombros). Las gradas del estadio y las calles de la ciudad usan exclusivamente crowd-tiles. No se mezclan sprites individuales y crowd-tiles en la misma zona visual salvo en la banda de match-day (donde el manager es individual sobre un fondo de crowd-tile).

### 3.2 Geometría del Entorno

**Principio rector** *(P2 — World Is Scoreboard)*: El mundo acumula evidencia de decisiones. La geometría debe ser lo suficientemente ordenada para que el cambio sea visible, lo suficientemente variada para que el crecimiento tenga carácter.

**Forma dominante: el cuboid Habbo.** Todos los edificios se construyen sobre una base isométrica de 32×16 px de huella, apilable en módulos de 16px de altura. La fachada frontal es siempre rectangular. Los tejados son planos o con una sola inclinación lateral — sin formas complejas en MVP. Esto crea la ilusión de orden urbano que el jugador puede "leer" como progreso (el estadio crece en módulos de altura visible).

**Edificios.** Todos los buildings tienen esquinas a 90° en planta. Las variaciones de carácter vienen por la **silueta de tejado** (plano, voladizo de 4px, antena/bandera) y por **distribución de ventanas**, no por cambios de planta. Un estadio de Tier 1 tiene un tejado plano; uno de Tier 3 tiene un anillo de luz y una bandera de 8px en el centro — la diferencia es aditiva, no una remodelación total.

**Vegetación.** Los árboles tienen **silueta geométrica fija**: copa oval de 16×12 px con tronco de 2px. No hay árboles de silueta libre o fractal. La variación es por color de copa (estación / zona climática) y tamaño (S/M/L usando escalado ×1.5). Esto mantiene la legibilidad del tile map sin confundir silueta de árbol con silueta de edificio.

**Paths y ground.** Las losetas de suelo son siempre grid-aligned (32×16 px isométrico). La variación de textura en una loseta individual puede usar hasta 3 valores de luminosidad dentro de la paleta de la zona — nunca colores distintos. Los caminos se construyen encadenando tiles de path; las curvas son en L (45°), nunca orgánicas. Esta rigidez sirve a P1 (Tinkering): el jugador entiende intuitivamente que los elementos encajan como piezas.

**Verticality rule.** Ningún edificio supera **6 módulos de altura (96px)** en el canvas a zoom ×1. El estadio en Tier máximo llega a exactamente 6 módulos. Esto garantiza que el edificio más alto cabe holgadamente en un viewport mobile portrait típico (568px+ altura) sin necesidad de scroll vertical del canvas.

*Test operacional*: Cuando un edificio nuevo se construye, ¿su silueta de tejado es reconocible en el minimap de ciudad (escala ×0.5)? Si la diferencia entre Tier 1 y Tier 2 desaparece a esa escala, el rasgo de tejado debe aumentar en al menos 4px.

### 3.3 Gramática de Formas UI (DOM)

**Principio rector** *(P1 — Tinkering / P4 — Calm Tempo)*: La UI es el tablero de mandos de un manager; debe sentirse más cerca de un formulario técnico bien diseñado que de una app de consumo. No compite con el canvas — lo sirve.

**Corner radius.** `2px` en todos los componentes DOM. Esto equivale a 1 píxel del grid del canvas, creando una resonancia sutil sin imitar el pixel art. Excepción justificada: los modales de confirmación usan `4px` para indicar mayor jerarquía y separación del flujo principal — están en una categoría distinta a los componentes de acción.

**Regla de jerarquía por categoría de componente**:
- **Componentes de acción** (botones, toggles, sliders): la jerarquía se expresa por **peso visual** (tamaño, padding, weight tipográfico, background-color) — NUNCA por corner radius. Los 5 variants de Button mantienen `2px` uniformemente; un Primary se distingue de un Secondary por filled vs outlined, no por forma.
- **Componentes de wrapping** (modales, side panels): la jerarquía puede expresarse por **corner radius diferenciado** (`4px` en confirmación vs `2px` en panel rutinario) — porque el wrapper *es* un cambio de contexto, no solo una acción.

**Borders.** Sin border visible en estado default. La separación entre elementos se logra con `gap` y background-color diferencial (un paso de luminosidad dentro de la paleta de la zona). El border aparece únicamente en estado `focus` (accesibilidad WCAG 2.1 AA: `2px solid` con color de contraste mínimo 3:1 sobre el fondo) y en estado de error (un único borde izquierdo `3px solid` con el color de estado de alerta de la paleta).

**Cards y panels.** Rectangulares. La variación de jerarquía se expresa por **anchura y padding**, no por forma: una Entity Card de jugador es `width: 100%` con `padding: 12px`; un Stat Display es un inline-block de `padding: 4px 8px`. No hay cards con formas recortadas, hexagonales, ni diagonales.

**Relación DOM ↔ Canvas.** Los dos layers nunca se mezclan visualmente: el canvas ocupa su región del viewport y el DOM ocupa la suya, separados por un borde invisible. La única zona de contacto es el **HUD de match-day**: un strip DOM de 48px de alto en la parte inferior del canvas que muestra marcador y tiempo. Este strip usa fondo semitransparente con `backdrop-filter: blur(4px)` — la única excepción al DOM opaco — para mantener la lectura del canvas sin interrumpirlo.

*Test operacional*: Cuando el diseñador de UI crea un nuevo componente, ¿puede describirlo usando solo rectángulo + corner-radius-2px (o 4px si es wrapper) + background-differential + border-on-focus? Si necesita una forma diferente, requiere aprobación del art director con justificación de pillar.

### 3.4 Hero Shapes vs. Supporting Shapes

**Principio rector** *(P1 — el jugador siempre sabe qué mira)* *(con anclaje en P3 — Office accumulation)*: El jugador debe siempre saber qué está mirando y por qué importa. La jerarquía visual no es decoración — es navegación.

**Categorías hero globales.** En Cascada FC, las formas que acaparan atención por diseño son dos: **(1) la silueta humana individual** (manager, jugador destacado, NPC con nombre) y **(2) el tejado del estadio**. Todo lo demás existe para hacer que esas dos categorías sean más legibles.

**Lo que retrocede por diseño:** crowd-tiles, ground texture (variaciones de luminosidad, sin contraste de forma), props ambientales (bancos, farolas — formas simples sin variación de silueta), y el texto de datos en DOM que no requiere acción inmediata.

**Jerarquía hero por mood state** *(cross-ref con Section 2)*:

| Mood State | Hero shape | Por qué |
|---|---|---|
| **Dashboard** | Tejado del estadio (canvas) + card de próximo partido (DOM) | Orienta al jugador en el tiempo y el espacio de su club |
| **Match Day** | Silueta del manager en la banda | El jugador se ve a sí mismo en el momento de mayor tensión |
| **Victoria** | Siluetas de jugadores con pose de celebración | El mundo festeja — los humanos son el protagonismo |
| **Derrota** | El campo vacío / jugadores con pose de derrota | El silencio de la forma (menos sprites activos) comunica el estado |
| **Threshold** | Card de decisión en DOM (plano hero del panel de acción) | El momento de mayor peso narrativo lo toma el DOM, no el canvas |
| **Inbox** | Retrato del sender (64×64 px en esquina superior) | El mensaje tiene un remitente concreto — la cara es el anchor |
| **Office** | El despacho acumulado (props de carrera visibles) | El progreso de P3 es literal: los objetos que llenan el espacio |
| **Onboarding** | El manager sprite en primer plano | El jugador se está conociendo a sí mismo — su avatar es el centro |

**Regla compositional de hero findability.** El hero shape siempre cumple al menos dos de estas tres condiciones: **(a)** posición en el tercio superior del canvas o en el primer elemento del DOM scrollable, **(b)** mayor contraste de luminosidad respecto a sus vecinos inmediatos (mínimo 40% de diferencia L en HSL), **(c)** la única forma animada dentro de un radio de 64px en el canvas. Si ninguna de las dos condiciones se cumple en una pantalla, la composición requiere revisión antes de aprobación de asset.

*Test operacional*: Cuando un QA tester hace una captura de cualquier pantalla y la convierte a escala de grises, el hero shape debe ser identificable en menos de 2 segundos. Si el tester necesita más tiempo o tiene dudas, la jerarquía de luminosidad o la posición del hero fallan y el asset vuelve a iteración.

---

## 4. Color System

> **Approved**: 2026-05-16 (user lock-in + 3 user-driven additions: césped no uniforme + gradas escaladas + asistencia visible)
> **Authored by**: art-director (delegated by /art-bible)
> **Binding references**: `accessibility-requirements.md` §2 · ADR-006 (PixiJS) · ADR-012 (DOM/canvas frontier) · Sections 2-3 of this bible
> **Validation pending**: WCAG luminance + Coblis deuteranopia/protanopia simulation (post-authoring, non-blocking)

El sistema de color de Cascada FC tiene una sola dirección narrativa: **la paleta es el marcador acumulado del jugador**. El mundo empieza en ceniza-marrón y gana color exactamente donde el club gana vida. Esto convierte cada hex definido aquí en un contrato de producción — los colores de Tier 0 deben ser verificablemente desolados; los de Tier 3, verificablemente ganados.

### 4.1 Paleta Base del Mundo (Tier 0)

| Nombre | Hex | L (HSL) | Rol | Lectura emocional |
|---|---|---|---|---|
| **Tierra seca** | `#5C3D1E` | 24% | Suelo primario, caminos sin pavimentar | Escasez. El piso de siempre, sin adorno |
| **Polvo de fachada** | `#8C6B47` | 42% | Paredes de edificios, mampostería sin pintar | Gastado con tiempo. No abandonado — solo sin inversión |
| **Cielo encapotado** | `#A8A0A0` | 64% | Fondo de cielo, niebla base | Neutro-frío. El cielo que no promete nada pero tampoco amenaza |
| **Sombra interior** | `#2E2018` | 14% | Zonas de sombra en edificios, interior de ventanas | Profundidad. Hace que los otros colores respiren |
| **Madera envejecida** | `#7A5230` | 36% | Vallas, bancos, postes, puertas | Funcional y resignado. La infraestructura que cumple sin presumir |
| **Hierba agostada** | `#6B7A3A` | 35% | Campo de fútbol (Tier 0), vegetación escasa | Verde que no celebra. La hierba es real, no decorativa |
| **Ceniza de tejado** | `#504844` | 29% | Tejados planos, pavimento de calle principal | Urbano-pobre. El color del asfalto y la teja sin mantenimiento |

**Por qué es desolada pero no deprimente.** Los siete colores están en rangos de temperatura cálida (H entre 20° y 50° en los marrones, H alrededor de 70° en el verde-agostado, H 0° con S muy baja en el gris). No hay ningún azul frío ni violeta — esos tonos generan distancia emocional. La desolación de Tier 0 es la de un club que existe pero no florece: polvoriento, sí, pero con temperatura humana. Un gris de hormigón puro (`#888`) sería desolación burocrática — `#A8A0A0` (con mínima componente cálida) es desolación de pueblo con historia.

**Distribución de uso en pantalla (Tier 0):**
- Suelo: 60% de tiles de terreno usan `Tierra seca`. 40% restante alterna `Madera envejecida` (caminos) y `Hierba agostada` (campo).
- Edificios: fachadas en `Polvo de fachada`, tejados en `Ceniza de tejado`, sombras en `Sombra interior`.
- Cielo: `Cielo encapotado` como fondo plano sin gradiente (canvas fill color).

### 4.2 Paleta de Progresión por Tier (T0 → T3)

La progresión es **aditiva**: los colores de Tier 0 no se reemplazan — se complementan con colores nuevos que gradualmente se convierten en dominantes. El mundo conserva memoria visual de donde empezó.

**Colores permanentes (presentes en todos los tiers):**

- `Sombra interior` `#2E2018` — las sombras no cambian. La luz mejora; la oscuridad permanece como ancla.
- `Cielo encapotado` `#A8A0A0` — el cielo es el ciclo climático, no el tier. Cambia con el tiempo, no con el progreso.
- `Tierra seca` `#5C3D1E` — en las zonas sin desarrollar del mapa, siempre presente como recordatorio del estado inicial.

#### 4.2.1 Tier 0 → Tier 1: La primera señal de vida

El club tiene fans, el campo tiene hierba decente, alguna fachada lleva una capa de pintura.

| Nombre | Hex | L (HSL) | Dónde aparece |
|---|---|---|---|
| **Césped vivo** | `#4A9968` | 38% | Campo de fútbol — sustituye `Hierba agostada` solo en los tiles del campo |
| **Cal de fachada** | `#C4B49A` | 71% | Paredes repintadas en los edificios del estadio (no toda la ciudad) |
| **Acento neutro** | `#9E8B6E` | 52% | Detalle de banderín gris-beige, primer elemento del club en la ciudad |

**La transición marrón → verde (especificación de colorblind safety):**

| Color | Hex | Luminancia WCAG (~) | Bajo deuteranopia | Bajo protanopia |
|---|---|---|---|---|
| **Tierra seca (T0)** | `#5C3D1E` | bajo (~L 0.05) | marrón-amarillo oscuro | marrón-amarillo oscuro |
| **Césped vivo (T1)** | `#4A9968` | medio (~L 0.20-0.25) | verde-amarillo claro | amarillo-verde claro |

La diferencia de **luminosidad** se preserva bajo daltonismo rojo-verde (el matiz colapsa, la luminancia no). El gap entre L de Tier 0 y L de Tier 1 es de ~25 puntos HSL — visible incluso si el daltonismo borrara el matiz por completo.

**Segundo canal obligatorio (binding):** El tile de `Césped vivo` usa una textura de puntos de hierba corta (2px dots en `#5BBF7E` sobre base `#4A9968`) ausente en `Tierra seca`. Un jugador daltónico que no distingue los matices distingue la textura. El DOM muestra simultáneamente el cambio de tier name en la breadcrumb del campo: "Campo de tierra" → "Campo con césped".

> **Validation pending (no bloqueante)**: validar el par específico con [Coblis](https://www.color-blindness.com/coblis-color-blindness-simulator/) y [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/) antes de stamp final del primer asset de Tier 1. Si el ratio efectivo bajo simulación deuteranopia es < 2.5:1, ajustar `Tierra seca` a `#4A2E0E` (más oscuro, gap más amplio).

#### 4.2.2 Tier 2: El color del club sangra hacia la ciudad

El club tiene afición estable, patrocinadores, y los barrios próximos al estadio cambian.

| Nombre | Hex | L (HSL) | Dónde aparece |
|---|---|---|---|
| **Verde parque** | `#3D8C55` | 34% | Zonas verdes de la ciudad, no solo el campo |
| **Pavimento urbano** | `#7A7060` | 40% | Calles pavimentadas (upgrade de `Tierra seca`) |
| **Club Primary** | *variable* | *ver §4.3* | Fachadas de comercios afiliados, banderines de calle |
| **Club Secondary** | *variable* | *ver §4.3* | Detalle de ventanas, marcos de puerta |

#### 4.2.3 Tier 3: La ciudad tiene identidad

La paleta del club domina visualmente. La ceniza-marrón solo persiste en zonas no-desarrolladas del mapa.

| Nombre | Hex | L (HSL) | Dónde aparece |
|---|---|---|---|
| **Luz de estadio** | *Club Primary + saturación +20%* | — | Proyectores del estadio en noche (Tier 3 night state) |
| **Club Accent** | *variable* | *ver §4.3* | Detalles ornamentales de edificios clave |
| **Asfalto nuevo** | `#5C5650` | 34% | Calles del centro de la ciudad, plazas |

**Color budget por tier (saturación máxima permitida en pantalla):**

| Tier | % superficie con colores de club | S máxima de club color | Paleta base sigue siendo... |
|---|---|---|---|
| T0 | 0% | n/a | 100% colores base §4.1 |
| T1 | 0% (solo césped) | n/a | 85% base + 15% césped/cal |
| T2 | 15-25% de tiles con fachada de club | S ≤ 70% | 60% base, 25% nuevos, 15% club |
| T3 | 40-55% de tiles visibles con color de club | S ≤ 85% (S ≤ 90% solo en proyectores nocturnos) | 40% base, 20% nuevos, 40% club |

El límite de S ≤ 85% en Tier 3 garantiza que el juego no se convierte en una explosión saturada. **Excepción contextual**: los proyectores del estadio nocturno de Tier 3 pueden alcanzar S ≤ 90% — el único momento del juego donde el color habla más fuerte, justificado por ser el spectacle climático visible solo en una porción mínima del frame (los haces de luz).

#### 4.2.4 Wear pattern — el césped lleva uso

P2 (World Is Scoreboard) extendido: el campo no es una superficie uniforme — muestra dónde se juega. Esto se aplica a través de un **overlay de wear** sobre los tiles base de césped:

| Wear zone | Overlay color | Dónde se aplica |
|---|---|---|
| **Zona de juego intensa** (centro del campo, áreas de penalty, bandas) | `#3D7A50` (verde más oscuro que `Césped vivo`, menos saturado) | 25-35% más oscuro en luminosidad → comunica "aquí pisan los jugadores" |
| **Tierra desgastada** (Tier 0/1: dentro de las áreas y centro) | `#5C3D1E` mezclado con `Hierba agostada` `#6B7A3A` | El campo pobre es mosaico hierba-tierra, no verde uniforme |
| **Zona menos pisada** (esquinas del campo, áreas de córner) | `Césped vivo` base sin overlay | El verde "ideal" aparece donde menos se juega — irónico y vivo |

**Implementación técnica**: el wear pattern es un atlas secundario de tiles (32×16 px) con 3 variantes de cada tile de césped (intenso/medio/sin desgaste). El tile-map del campo elige la variante según su posición (precomputed por zona). En Tier 0 el wear es severo: el centro es prácticamente tierra (`Tierra seca`) y las esquinas son `Hierba agostada`. En Tier 1+ el wear es solo modulación de luminosidad (`#3D7A50` overlay), no sustitución por tierra — el césped existe pero muestra uso. **El wear pattern es un sub-canal independiente del tier**: incluso en Tier 3, el campo conserva sus zonas de desgaste — el club rico tiene mejor mantenimiento pero los jugadores siguen pisando el mismo sitio.

#### 4.2.5 Gradas y asistencia visible

P2 + P3: el estadio crece con el club, y la afición visible crece con el resultado del partido. Dos dimensiones separadas que se combinan.

**Dimensión 1 — Gradas por tier de estadio (infraestructura física):**

| Tier estadio | Estructura visible | Color/material |
|---|---|---|
| **Tier 0** | Sin gradas. Vallas básicas alrededor del campo de tierra. | `Madera envejecida` `#7A5230` en las vallas, suelo pelado detrás (`Tierra seca`) |
| **Tier 1** | Gradas básicas de un nivel — bancos de madera o cemento descubiertos. Altura visible 1 módulo (16px). | `Polvo de fachada` `#8C6B47` en estructura, `Madera envejecida` en asientos |
| **Tier 2** | Gradas de dos niveles. Cubierta parcial (techo en un lateral). `Cal de fachada` repintada con `Club Primary` en el frontal. Altura 3 módulos (48px). | Estructura `Cal de fachada` `#C4B49A`, asientos `Club Primary`, techo en `Ceniza de tejado` |
| **Tier 3** | Gradas completas con cubierta total. Palcos VIP visible en lateral. Proyectores (4 mástiles altos). Banderines del club en la parte superior. Altura 5-6 módulos (80-96px). | Estructura `Cal de fachada`, asientos `Club Primary` + `Club Secondary` en zonas alternas, proyectores luminosos en noche con `Luz de estadio` (S ≤ 90%) |

**Dimensión 2 — Asistencia visible (crowd density por partido):**

La densidad de gente en las gradas durante un partido depende de `attendance` del simulador (variable derivada de `fan_momentum`, rival, día, etc.). El crowd-tile (Section 3.1: 32×32 px con 2-4 cabezas integradas) tiene **5 variantes de densidad**, intercambiables tile-a-tile en tiempo real:

| Densidad | Variantes de cabezas por crowd-tile | Cuándo aparece |
|---|---|---|
| **Empty** (0%) | 0 cabezas, solo asientos visibles | Partido sin público, club en crisis grave |
| **Sparse** (1-25%) | 1 cabeza por tile, posiciones randomizadas | Inicio de proyecto, attendance baja |
| **Normal** (26-60%) | 2 cabezas por tile, distribución uniforme | Partido medio, attendance estándar |
| **Full** (61-90%) | 3-4 cabezas por tile, alineación más densa | Partido importante, attendance alta |
| **Packed** (91-100%) | 4 cabezas + crowd "de pie" (overlay encima del tile con 2px más de altura) | Partido decisivo, fan_momentum pico |

**Color de la masa**: los crowd-tiles usan una paleta de 4 colores de "ropa de aficionado" — 60% `Club Primary` (mayoría con camiseta del club), 25% `Club Secondary`, 10% colores neutros (`Madera envejecida`, `Polvo de fachada` — los que vienen sin camiseta del club), 5% color de rival (visible solo en sector visitante, esquina opuesta). Esto convierte la grada en un espectro visible de identidad de afición.

**Implementación técnica**: los crowd-tiles son sprites cuya textura se selecciona en runtime según `attendance` (un número entre 0 y 1). El cambio de densidad es **cuantizado en los 5 buckets** — el público no aparece píxel a píxel, sino tile a tile. La transición entre buckets ocurre solo entre minutos del partido (no continuamente durante un mismo minuto) para preservar la coherencia visual de un instante.

### 4.3 Slots de Color del Club (Club Colors)

El jugador elige los colores de su club en el onboarding. El sistema soporta personalización sin romper la identidad visual del mundo.

**Los tres slots del club:**

| Slot | Nombre técnico | Rol visual | Dónde aparece |
|---|---|---|---|
| `--club-primary` | Club Primary | Color dominante del equipo, fachadas de estadio | Camiseta (siempre), banderines de estadio (T1+), fachadas de comercios (T2+), proyectores nocturnos (T3) |
| `--club-secondary` | Club Secondary | Color secundario, fondos y detalles | Camiseta segunda equipación, marcos y detalles de fachadas (T2+), interior de estadio (T2+) |
| `--club-accent` | Club Accent | Acento — el color que corta — usado con parsimonia | Números de camiseta, línea de detalle ornamental en el estadio (T3), trofeos en el despacho |

**Regla de contraste entre slots:** `--club-secondary` debe tener un ratio ≥ 3:1 contra `--club-primary`. Validado en onboarding: si el jugador elige una combinación que no cumple el ratio, el UI de selección lo señala con un aviso (no es blocking — el jugador puede ignorarlo, pero lo ve).

**Regla de contraste contra el mundo:** Toda aparición de `--club-primary` en fachadas de Tier 2+ ocurre sobre fondos de `Cal de fachada` (`#C4B49A`). El club primary debe tener ratio ≥ 3:1 contra `#C4B49A` (luminancia ~0.47). Esto elimina del espacio válido los colores demasiado claros (beiges, amarillos pastel), que se comerían las fachadas.

**Las 16 paletas pre-set del onboarding (3 ejemplos de inspiración española modesta):**

*Estilo Hospitalet* — inspirado en clubes rojiazules del cinturón industrial:
- Primary: `#C0392B` (rojo) · Secondary: `#1A3A6B` (azul marino) · Accent: `#F0F0F0` (blanco)

*Estilo Villarreal modesto* — inspirado en equipos amarillo-azul de la Comunitat:
- Primary: `#E8C015` (amarillo) · Secondary: `#0D3B7A` (azul oscuro) · Accent: `#2E2018` (referencia a `Sombra interior`)

*Estilo Extremadura* — verde-blanco-negro de tierra adentro:
- Primary: `#2D6A4F` (verde oscuro) · Secondary: `#EAEAEA` (blanco-gris) · Accent: `#1A1A1A` (negro)

### 4.4 Vocabulario de Color Semántico UI (DOM)

El DOM de gestión usa colores semánticos independientes de la paleta del mundo. Estos colores no sangran al canvas — son exclusivos del panel de gestión. Todos los hexes pasan WCAG 2.1 AA (ratio ≥ 4.5:1) contra el fondo de panel estándar `#F5F0E8` (blanco-cálido, inspirado en papel analógico). El panel `#F5F0E8` tiene luminancia WCAG ≈ 0.887.

| Rol semántico | Hex | Ratio vs `#F5F0E8` | Backup channel obligatorio |
|---|---|---|---|
| **Success / Positivo** | `#2D6A4F` | ≈ 10.7:1 ✅ | Check-icon + texto positivo ("Contrato firmado") |
| **Warning / Atención** | `#8C5A00` | ≈ 8.0:1 ✅ | Warning-icon (triángulo) + texto de atención |
| **Error / Bloqueante** | `#8B1A1A` | ≈ 14.6:1 ✅ | Error-icon (X) + texto + borde izquierdo 3px |
| **Destructive** | `#6B0000` | ≈ 30.5:1 ✅ | Destructive-icon + Confirmation Modal |
| **Info / Neutral** | `#2C4A6B` | ≈ 12.5:1 ✅ | Sin icono especial — color + contexto de posición |
| **Disabled** | `#9A9590` | ≈ 2.5:1 ⚠️ | cursor `not-allowed` + texto de razón + opacidad 60% |

**Nota sobre Disabled (2.5:1):** Excepción documentada y aceptada. WCAG 2.1 SC 1.4.3 exceptúa "inactive user interface components" de los requisitos de contraste de texto — esto es práctica de industria estándar. El backup channel (cursor + razón textual + opacidad) compensa la diferencia de contraste insuficiente. Subir el contraste haría que los elementos disabled se percibieran como activos.

**Deuteranopia/protanopia safety**: Los tres estados más críticos (Success verde, Warning marrón-naranja, Error rojo oscuro) convergen en matiz bajo daltonismo rojo-verde — pero sus luminancias percibidas son suficientemente distintas. El backup channel (icono + texto) es siempre el identificador primario, nunca el color.

**Fondos de panel:**

| Fondo | Hex | Uso |
|---|---|---|
| **Panel estándar** | `#F5F0E8` | Management UI background (blanco-cálido, "papel analógico") |
| **Panel oscuro (modal)** | `#2E2018` | Overlay de modal de confirmación — `Sombra interior` del mundo |
| **Panel hover/selected** | `#EDE5D5` | Card seleccionada, fila hover en tabla |

### 4.5 Ciclo Día/Noche y Clima (Tintado del Mundo)

Los tintes de tiempo se aplican como un overlay de color sólido de baja opacidad sobre el canvas completo (PixiJS `ColorMatrixFilter` o tint global en el Container raíz). El mundo no re-pinta sus sprites — recibe una capa de temperatura encima. Respeta el presupuesto de performance del ADR-006 (sin re-bake de atlas por estado de iluminación).

**Los cuatro time slots:**

| Slot | Hora in-game | Tinte overlay | Opacidad | Temperatura resultante | Referencia §2 |
|---|---|---|---|---|---|
| **Madrugada** | 05:00–07:30 | `#0A0A1A` (azul noche) | 35% | 4000K frío, luz mínima | — |
| **Día** | 08:00–16:30 | `#F5D9A0` (ámbar suave) | 8% | 5200K neutro-cálido, luz plena | Dashboard |
| **Tarde** | 17:00–19:30 | `#E8901A` (naranja dorado) | 18% | 3000K caliente, hora dorada | Victoria aftermath |
| **Noche** | 20:00–04:30 | `#0F0820` (índigo oscuro) | 55% | 2200K mínimo (solo luces del estadio y calles) | Despacho interior |

La transición entre slots es **cuantizada en 3 pasos** de interpolación, no un gradiente suave continuo. Cada paso dura 2 frames de canvas (33ms a 60fps). Coherente con el lenguaje de umbrales de §3.1 y P2 — el mundo cambia en momentos, no se derrite. La transición completa slot-a-slot dura ~100ms total.

**Variantes climáticas:**

| Clima | Modificación al tinte base | Efecto visual |
|---|---|---|
| **Soleado** | Sin modificación — tinte base activo | Colores del mundo a luminosidad plena |
| **Nublado** | Añade overlay `#8090A0` (gris-azul) al 12% encima del tinte de slot | Desatura el mundo ~10%, simula luz difusa sin dirección |
| **Lluvia** | Overlay `#8090A0` al 20% + canvas recibe sprite de lluvia (líneas diagonales 1px `#A0B8C8` al 40% opacidad) | Mundo gris-frío, lluvia visible como capa encima de todo excepto HUD |
| **Niebla** | Overlay `#C0C8C0` (blanco-verde) al 30% en los tiles más lejanos (gradient radial desde el centro de cámara) | Distancia se difumina, world edge desaparece |

**Restricción del HUD de match-day:** El strip DOM de 48px (§3.3) está exento de todos los tintes. Su `backdrop-filter: blur(4px)` opera sobre el canvas tintado, por lo que el blur ya "recibe" el color del momento — no necesita modificación adicional.

### 4.6 Anti-Reglas de Color

Estas prohibiciones son tan vinculantes como las especificaciones. Cualquier asset que viole una anti-regla vuelve a iteración sin revisión adicional.

**1. No paletas arco iris.** Ninguna pantalla del mundo de Tier 0 o Tier 1 puede contener más de 4 matices distinguibles simultáneamente. En Tier 2 se permite un quinto matiz (el color del club). En Tier 3, el máximo son 6 matices en pantalla.

**2. No colores neón.** S > 90% está prohibido en todos los contextos. **Excepción única documentada**: el sprite del proyector nocturno de Tier 3 (S ≤ 90%, justificado en §4.2.3). La saturación máxima del DOM es S ≤ 70%.

**3. No gris neutro puro.** `#808080`, `#999999`, `#AAAAAA` y valores de S=0% están prohibidos como colores de diseño. Incluso los grises tienen un matiz mínimo de S ≥ 8% para pertenecer a la paleta cálida.

**4. No mezclar fríos y cálidos sin motivo de estado.** La paleta base es cálida (H 15–80°). Un color frío (H 180–280°) solo puede aparecer en: tintes de madrugada/noche, overlay de lluvia/niebla, y `--club-secondary` de una paleta de club específica.

**5. No colores de UI en canvas, no colores de canvas en UI.** `#2D6A4F` (Success) no puede usarse como color de vegetación. `#4A9968` (Césped vivo) no puede aparecer como color de botón.

**6. No gradientes decorativos.** Prohibidos en sprites de mundo y en UI DOM. Excepciones: gradiente radial de niebla (§4.5) y `backdrop-filter` del HUD match-day.

**7. No blanco puro ni negro puro.** `#FFFFFF` y `#000000` no existen en la paleta. El blanco más claro es `#F5F0E8` (panel background). El negro más oscuro es `#1A1410` (variante profunda de `Sombra interior`).

---

**Nota de implementación (para technical-artist y web-frontend-specialist):**
- Sistema de tinte §4.5: PixiJS `ColorMatrixFilter` o `tint` global en Container raíz. Excepción: sprite de lluvia es capa propia.
- Design tokens §4.4: exportar como CSS custom properties en design-token file de SvelteKit.
- Slots `--club-primary` / `--club-secondary` / `--club-accent`: CSS custom properties que el onboarding escribe en `:root` del documento. Las fachadas "sangran" color de club heredando estas variables CSS en clases de fachada.
- Crowd density §4.2.5: 5 variantes de textura crowd-tile en atlas, runtime swap basado en `attendance` ∈ [0,1].

---

## 5. Character Design Direction

> **Approved**: 2026-05-16 (user lock-in tal cual)
> **Authored by**: art-director (delegated by /art-bible)
> **Cross-references**: §3.1 (siluetas y poses) · §4.2.5 (crowd-tiles) · §4.3 (club colors) · ADR-009 (staff routing + qualityTier) · ADR-010 (manager-RPG progression)
> **Production priority**: §5.2 es el mayor coste de producción del MVP — leer primero.

### 5.1 Progresión Visual del Manager (RPG)

El manager no tiene nivel visible en HUD. Lo que tiene es una apariencia que cambia — y esa apariencia le cuenta al jugador quién es él hoy. La progresión sigue cinco hitos de carrera (alineados con ADR-010 `reputationLevel`). Cada hito es **aditivo**: ningún elemento de Novato desaparece en Leyenda — se acumula, se desplaza, se sustituye por la versión gastada de sí mismo.

| Hito | Reputación | Vestimenta | Accesorio en mano | Expresión idle default | Objeto en despacho |
|---|---|---|---|---|---|
| **Novato** | 1–2 | Polo casual sin logo (color neutro `#8C6B47`) | Portapapeles con bolígrafo visible | Ceño levemente fruncido — concentración, no ansiedad | Escritorio vacío, una sola carpeta |
| **Establecido** | 3–4 | Polo con detalle `--club-primary` en cuello/manga | Carpeta del club (logo visible) | Neutra-confiada | Primera foto de plantilla en pared, un trofeo menor |
| **Reconocido** | 5–6 | Chaqueta ligera + polo `--club-primary` en pecho | Tablet (primer acceso a datos avanzados) | Ligera sonrisa habitual | Varios trofeos, mapa de scouting, banderín de ciudad visitada |
| **Prestigioso** | 7–8 | Chaqueta estructurada, `--club-primary` + `--club-secondary` en detalles | Tablet + auricular bluetooth | Postura erguida, brazo cruzado en idle | Estante lleno, foto con alcalde, copa, carta enmarcada |
| **Leyenda** | 9–10 | Traje entero (director técnico de élite) con pin del club en solapa | Bastón de paseo apoyado en antebrazo | Relajada-solemne, cabeza levemente inclinada | Despacho saturado de historia: museo personal |

**El Novato en día 1 — la regla del técnico humilde.** El sprite debe leer como "rookie capaz, no incompetente". Mecanismos: (a) portapapeles lleno, no vacío — hay notas escritas; (b) la expresión de concentración no es ansiedad — es la de alguien que mira el campo y piensa en el próximo entrenamiento; (c) polo sencillo pero limpio, no raído. Ningún detalle comunica fracaso previo. El despacho vacío comunica "esto empieza ahora", no escasez.

**Detalles `--club-primary`**: A partir de Novato los colores son neutros (el manager no se ha "ganado" los colores aún). Desde Establecido, el color sangra hacia la ropa exactamente como hacia el estadio en §4.2.2 — primero como acento, luego dominante en Leyenda. El token `--club-primary` aplicado a ropa del manager usa la misma regla de contraste contra fondo piel/tela que en §4.3.

### 5.2 Futbolistas — Sistema de Composición por Capas (MVP: ~150 sprites)

Esta es la mayor carga de producción del MVP: ~25 jugadores × ~6 clubs = ~150 sprites. Producirlos como 150 dibujos independientes es inviable. La solución es un **sistema de composición por capas** que genera variación a partir de un conjunto acotado de componentes.

#### Canon de composición

Cada sprite se compone de **6 capas independientes**, pintadas en orden de profundidad:

| Capa | Nombre | Variantes MVP | Descripción |
|---|---|---|---|
| 0 | **Base corporal** | 2 | "Atlético estándar" y "portero" (1px más ancho en hombros). Ambos respetan canon 16×24 de §3.1. |
| 1 | **Tono de piel** | 5 | `#FDDBB4`, `#D4956A`, `#A05C2C`, `#6B3A1F`, `#3D1F0A`. Color fill a zonas de piel de la base. |
| 2 | **Camiseta del club** | 6 (1 por club) | `--club-primary` en cuerpo y `--club-secondary` en mangas/cuello. Número 1–99 en `--club-accent` en espalda. Generable en runtime. |
| 3 | **Pelo / Calva** | 8 | Silueta de pelo sobre 6×6 px cabeza: corto-oscuro, corto-claro, rizado, rapado, crespo, media melena, calvo, cubierto-vendaje. |
| 4 | **Cara** | 6 | Composición ojo-nariz-boca en 6px ancho (ver §5.5). Tokens de reconocimiento, no retratos. |
| 5 | **Estado overlay** | 3 | `none`, `vendaje` (lesión — venda blanca), `brazalete` (capitán — 2px amarillo en brazo izq). |

**Cálculo de cobertura**: 2 × 5 × 6 × 8 × 6 = **2.880 combinaciones**. Sin repetición de pelo+cara dentro de mismo equipo. **Production mínimo: 24 sprites de arte manual + 6 templates de camiseta** (las camisetas se procedural-colorean con los CSS tokens del club).

#### Distinción visual por posición

Solo porteros son visualmente distintos: base "portero" + camiseta de color complementario al equipo (paleta pre-definida: naranja `#D4620A`, verde oscuro `#1E5C2A`, gris grafito `#4A4A52`). Defensas, centrocampistas y delanteros son visualmente iguales — la posición se lee por ubicación en campo, no por sprite.

#### Calidad de jugador — visibilidad mínima

Por Pilar 1, los stats numéricos no se exponen en sprite. Único indicador: **brazalete de capitán** (overlay capa 5) si está designado. No hay aureolas, brillos ni halos de calidad. La excelencia se lee en resultados, no en sprite.

#### Estados visuales de lesión y suspensión

- **Lesionado**: overlay vendaje (capa 5). Thumbnail DOM 32×32 lleva icono vendaje en esquina inferior derecha. En match-day el jugador lesionado no aparece.
- **Suspendido**: no aparece en canvas match-day. Thumbnail DOM lleva icono tarjeta roja. No hay sprite "civil en tribuna" en MVP — se pospone a post-MVP.

#### LOD de jugadores por contexto

| Contexto | Tamaño | Detalle visible |
|---|---|---|
| **Lista plantilla DOM** | 32×32 px thumbnail | Cara + pelo + camiseta (simplificado) |
| **Sprite match-day (canvas)** | 16×24 px (§3.1) | Silueta con camiseta de club, pelo distinguible, sin detalles faciales finos |
| **Retrato detalle DOM** | 64×64 px | Composición completa, expresión visible, número de camiseta legible |
| **Crowd-tile grada** | 32×32 tile (§4.2.5) | No son jugadores — son aficionados |

### 5.3 Staff — Distinción por Rol y Calidad

La regla `tool in hand` de §3.1 es la base. Esta sección la extiende con asignaciones concretas por rol y define cómo `qualityTier` (ADR-009) modifica la presencia visual.

#### Tabla de distinción por rol

| Rol (ADR-009) | Prop en mano | Silueta adicional | Color ropa base |
|---|---|---|---|
| **Entrenador asistente** | Cono de entrenamiento (triángulo naranja 4px) | Polo de club, postura activa inclinada | `--club-primary` en polo |
| **Preparador físico** | Cronómetro/cinta métrica | Ropa deportiva (sin polo), cuerpo más activo | `#4A5568` (gris neutro deportivo) |
| **Médico / Fisio** | Bolsa médica (cruz visible, 4×4 px) | Postura baja en idle | Blanco `#EAEAEA` con detalle rojo en bolsa |
| **Ojeador** | Cuaderno y bolígrafo | Postura observador — cabeza alzada | `#7A5230` (madera envejecida) — no lleva colores del club |
| **Director deportivo** | Tablet prominente (§3.1) | Postura erguida, estática | Chaqueta `#2E2018` + detalles `--club-primary` |
| **Scout academia** | Silbato visible en cuello | Similar a ojeador, ropa más deportiva | Ropa civil + chaleco de club |

#### Calidad visual por `qualityTier` (ADR-009)

| qualityTier | Sprite de mundo | Inbox sender | Retrato propio |
|---|---|---|---|
| **T1 (novato)** | Sprite genérico del rol — sin rasgo individual | Icono de rol (32×32) sin retrato | No |
| **T2 (competente)** | Variante de pelo/cara (capas 3-4 sistema jugadores) | Icono de rol + nombre en cabecera | No |
| **T3 (experto)** | Sprite único con prop más elaborado (ojeador T3 → prismáticos; médico T3 → maletín completo) | Retrato propio 64×64 con fondo institucional del rol | Sí — el retrato es el anchor visual |

Respeta el Principio 5 (§1.2): el staff experto tiene presencia visual diferenciada — su cara es visible, el novato es una función.

#### Retratos de staff en inbox (64×64) — backgrounds por rol

| Rol | Color fondo retrato |
|---|---|
| Ojeador / Scout | `#3D4A2E` (verde oliva oscuro — campo) |
| Médico | `#E8F0EA` (blanco-verde hospitalario, claro) |
| Director deportivo | `#2E3A4A` (azul pizarra — sala de reuniones) |
| Entrenador asistente | `--club-primary` a 60% opacidad sobre `#2E2018` |

Esto garantiza que el jugador distingue a un miembro de su staff de un NPC externo antes de leer el nombre.

### 5.4 NPCs y Personajes Episódicos

Estos personajes viven exclusivamente en el inbox (64×64 px). No tienen sprite de mundo. Su lenguaje visual puede ser más ilustrativo — se ven en contexto de lectura (§2 Estado 5), no en el mundo isométrico.

#### Periodistas / Prensa

Fondo: `#1A1A2E` (azul noche de redacción). Prop: micrófono o grabadora visible. Expresión **neutral-curiosa** por defecto — el periodista no es amigo ni enemigo. El rasgo de personalidad se comunica en texto, no en cara.

#### Alcaldes de otras ciudades (5-10 en MVP)

Fondo: color institucional de ciudad rival (10 colores pre-definidos, distintos entre sí y de las 16 paletas de club). Prop: insignia de ciudad visible en solapa (escudo 4×4 px con color de ciudad). **10 colores × 6 caras (mismo pool que jugadores) = 60 alcaldes únicos sin re-dibujar.** Llevan traje institucional `#3A3A4A` (antracita neutral), no colores del manager.

#### Board Members

Fondo: `#2E2018` (sombra interior — el board vive en penumbra). Traje oscuro, ningún prop en mano (poder abstracto). Expresión por defecto **neutral-evaluativa**. El board no sonríe hasta que el club está en Tier 3 — ese cambio de expresión es un hito visual de relación.

#### Patrocinadores

Dos lenguajes distintos: en inbox = representante corporativo con fondo de color de marca del patrocinador. En banners del estadio = logo del patrocinador sobre `#F5F0E8` (tratamiento institucional, no pixel-art).

### 5.5 Vocabulario de Expresión y Pose

#### Qué cabe en 6 píxeles de ancho

| Elemento | Variantes | Mecanismo |
|---|---|---|
| **Ojos** | Abiertos (2px), semicerrados (1px), cerrados (línea), abiertos-grandes (2px + highlight 1px) | Highlight 1px en esquina superior = "alerta" económica |
| **Boca** | Línea neutra (1px), sonrisa (curva 3px), ceño (curva invertida), abierta (2×2 px dark) | Curva con 3 píxeles a alturas escalonadas |
| **Inclinación cabeza** | Derecha, neutra, izquierda (1px desplazamiento centro gravedad) | Comunica atención o duda sin texto |

#### 8 expresiones canónicas

| Expresión | Ojos | Boca | Cabeza | Cuándo |
|---|---|---|---|---|
| **Neutral** | Abiertos | Línea | Neutra | Idle default |
| **Concentrado** | Semicerrados | Línea | Leve inclinación | Manager pensando, staff trabajando |
| **Satisfecho** | Abiertos | Sonrisa | Neutra | Victoria contenida |
| **Preocupado** | Abiertos | Ceño | Inclinación opuesta | Derrota, lesión de jugador clave |
| **Alerta** | Grandes | Línea | Neutra | Match-day, threshold cruzando |
| **Cansado** | Semicerrados | Ceño suave | Baja | Tras jornada de mucha actividad (Estado 3B) |
| **Orgulloso** | Abiertos | Sonrisa + cabeza alta | Atrás | Leyenda — acumulación |
| **Sorprendido** | Grandes | Abierta | Derecha o izquierda | AI narrative event inesperado |

#### Overlays de expresión sobre poses base

§3.1 definió 3 poses base. Las 8 expresiones son **overlays independientes**: la cabeza es sub-región separable del cuerpo. **3 poses × 8 expresiones = 24 estados por arquetipo sin redibujar el cuerpo**. La cabeza se compone en runtime sobre el cuerpo (o se prebakea el atlas).

#### Anti-estilo de expresión

- **No super-deformed**: las proporciones del cuerpo no colapsan. El chibi-Habbo tiene articulaciones reconocibles.
- **No ojos manga**: el ojo en esta biblia es funcional (2px max), no expresivo-grande.
- **No bocas flotantes**: todos los rasgos están anclados en la región de cabeza de 6px.

### 5.6 Filosofía de LOD (Nivel de Detalle)

| Distancia / contexto | Escala sprite 16×24 | Detalle visible | Expresión legible |
|---|---|---|---|
| **Zoom total ciudad** (minimap) | ×0.3 → ~5×7 px | Solo mancha de color — silueta irreconocible | No |
| **Zoom ciudad normal** | ×0.6 → ~10×14 px | Silueta general, color de ropa visible, prop distinguible | No |
| **Zoom campo** (match-day) | ×1 → 16×24 px | Pelo distinguible, camiseta, prop de cabeza del manager | Mínima — ojo abierto/cerrado |
| **Thumbnail DOM plantilla** | 32×32 px | Cara completa a 12px ancho, todos los rasgos de capa visibles | Sí |
| **Retrato DOM detalle** | 64×64 px | Composición completa, expresión nítida, número legible | Sí |
| **Inbox portrait NPC** | 64×64 px | Carácter máximo — prop prominente, expresión definida | Sí |

**Regla de degradación elegante**: a ×0.3, el sprite colapsa a su color de ropa dominante. La paleta de camiseta del club y el color de ropa del staff hacen el trabajo de identificación a escala de minimap. Por eso los colores de club no pueden ser similares al fondo de tierra (§4.6 anti-regla 2).

**Pliegues de ropa**: nunca. Fuera del presupuesto de detalle del canon 16×24. La ropa se lee por color y contorno, no por textura interna.

**Cross-ref §3.1**: la regla "legible a 16×24 sin color" se valida a ×1. A ×0.6 la silueta ya no es el identificador — el color lo es. A ×0.3 el color-de-ropa es el identificador. Cada distancia tiene su señal primaria, y el diseño de capas garantiza que esa señal sea la más robusta a esa escala.

---

## 6. Environment Design Language

> **Approved**: 2026-05-16 (user lock-in tal cual)
> **Authored by**: art-director (delegated by /art-bible)
> **Cross-references**: §3.2 (geometría locked) · §4.2.5 (gradas locked) · §4.1–4.3 (paleta + tier) · §4.5 (día/noche) · §5.1 (despacho) · ADR-006 (rendering) · ADR-012 (DOM/canvas frontier)

### 6.1 Estilo Arquitectónico — Pueblo Modesto Español

El mundo es un pueblo español de los 80-90 que llegó al presente sin demasiada inversión: no ha caído en ruinas pero tampoco ha sido renovado. La arquitectura no es decorado nostálgico — es el estado real de muchos municipios del interior y de la periferia industrial.

**Tipología de edificios MVP** (todos respetan §3.2: cuboid 32×16 px, 90°, módulos 16px, máx 6 módulos):

| Tipo | Módulos | Rasgo de tejado | Notas producción |
|---|---|---|---|
| **Estadio** | 1–6 (§4.2.5) | Bandera 8px en T3 | Ya specced — esta sección no lo re-spec |
| **Bar de esquina** | 1 | Toldo retractable 2px (no cuenta para módulos) | Edificio identitario; siempre en esquina de grid |
| **Comercio pequeño** | 1–2 | Plano | Persianas bajadas madrugada/noche; rotulación manual en fachada |
| **Vivienda baja** | 1–2 | Voladizo 4px | Más numeroso; masa visual de fondo |
| **Edificio institucional (ayuntamiento)** | 3 | Antena/mástil bandera 8px | Único público MVP; planta doble en módulos 1-2 |
| **Iglesia** | 2–3 + torre 1 | Torre plana con campana (silueta 6px ancho) | Opcional MVP — marca centro del pueblo; única silueta no-cuboid |

**Vocabulario de detalles "español modesto"** (sub-sprites 4–8 px dentro de bounding box de tile):

- **Teja roja descolorida** `#7A3B1E` (terracota desgastada, no naranja vivo). Variación pixel-a-pixel: 2 valores alternados (`#7A3B1E` y `#603020`) simulan desgaste sin textura compleja.
- **Persianas enrollables** (aluminio oxidado) `#8C8070`. Barras de 1px alto. Estados: abiertas día/tarde, mitad noche, cerradas madrugada. En T0 alguna atascada a medias.
- **Zócalo azul** `#3A6B8A` (primeros 8–12 px de fachada). Solo viviendas y bar. Diferencia fachada del suelo sin bordillo explícito.
- **Manchas humedad/desconchados**: overlay textura `#6B4F30` en patrón L descendente bajo ventanas/esquinas bajas.
- **Tendedero con ropa**: 3–5 sprites 2–3 px en balcones T0–T1. Desaparece en lluvia. Colores `--club-primary` mezclados con neutros.
- **Rotulación manual**: lettering 4×4 px solo en bar y comercio principal. Color `#EAEAEA`, pixels deliberados (no tipografía escalada).
- **Farola hierro forjado**: 2px fuste + 4×4 px cabeza, color `#5C4A30`. T0: 1 cada 3-4 tiles. T2+: 2 cada 3 tiles.

**Era de referencia**: pueblo 80-90 que llegó al presente sin reformarse → Seat 127 / Renault 12 aparcados (silueta 2 módulos sin detalle de marca), antenas TV en tejados desde T0, ausencia total de domótica / LED / vidrio-acero. Bar tiene neón interior visible por ventana solo en noche.

**Progresión arquitectónica por tier** (cross-ref §4.2):

| Tier | Qué cambia en el pueblo |
|---|---|
| **T0** | Fachadas `Polvo de fachada` sin pintar. Persianas oxidadas. Tendederos activos. Pocas farolas. Coche frente al bar. Rotulación desvanecida. |
| **T1** | Fachada del bar con cal fresca (`Cal de fachada`). Primer banderín del club en farola frente al estadio. Campo de fútbol con césped real. |
| **T2** | Comercios afiliados adoptan `--club-primary` en toldos/marcos. Terrazas plástico frente al bar. Farolas adicionales. Zócalos azulejo restaurados (más vivos). |
| **T3** | Plaza con `Asfalto nuevo`. Ayuntamiento con bandera del club en mástil. Edificios del entorno con `--club-primary` + `--club-secondary`. Iglesia inmune a colores del club. |

### 6.2 Filosofía de Textura — Pixel Art de Pintura Plana

Cell-shading de 3 tonos con anti-aliasing selectivo. Ningún elemento usa PBR, normal maps, ni texturas fotográficas.

**Dithering**: solo en sombras de suelo (checkerboard 2×2 px entre color base de suelo y `Sombra interior` `#2E2018` al 50% mezcla). En ningún otro contexto — el dithering en sprites compite con la lectura de silueta en minimap.

**Outline**: NO sistemático. La separación visual se logra por contraste de luminosidad (regla del 40% L de §3.4). Solo aparece en estado **hover/selected**: outline 1px `--club-primary` rodeando silueta exterior del tile. Esto evita el "coloring book look" y reserva el outline como señal de interacción.

**Cell-shading**: **3 tonos planos** por superficie — `base`, `sombra` (base – 25% L en HSL), `luz` (base + 20% L). Cara iluminada (izquierda en convención isométrica con luz arriba-izquierda) lleva `luz`. Cara frontal lleva `base`. Tejado en sombra lleva `sombra`. Sin gradientes — límite 1px sin AA.

**Anti-aliasing selectivo**: solo en (a) copas oval de árbol (45°), (b) diagonal de tejado con voladizo, (c) curva de toldo del bar. Prohibido en aristas rectas de edificios (90° o 45° exacto), sprites de personajes (chibi cuadrado por diseño), UI DOM.

**Densidad de detalle por tile 32×16**:
- **Base color fill**: 60% — color plano que establece la lectura de material
- **Detalle (ventana/persiana/textura)**: 30% — elementos que individualizan
- **Sombra y luz (cell-shading)**: 10% en aristas

El 30% es el límite. Tile que excede se lee como "ruidoso" y compite con sprites de personaje (viola §3.4 hero findability).

### 6.3 Densidad de Props por Tipo de Área

Los props son sprites auxiliares 4–16 px sobre tiles de suelo o anclados a fachadas. **Cuentan una historia, no llenan un espacio**.

| Área | Props per 32×16 | T0 | T2+ | Noche | Lluvia |
|---|---|---|---|---|---|
| **Campo + vestuario + oficina** | 1–2 interiores | Banderín club, red portería | Trofeo en pasillo, foto plantilla, tabletón táctica | Sin cambio | Sin cambio |
| **Plaza exterior estadio** | 2–3 cada 4 tiles | Valla metálica, farola, papelera | Banco piedra, puesto fanzines, farola con banderín | Farola encendida (halo 8×8 px), gente ausente | Charco bajo farola, sin puesto exterior |
| **Calles pueblo — T0** | 0–1 cada 6 tiles | Farola aislada, coche genérico | — | Vacía, farola encendida (50%, otras fundidas) | Charco en intersecciones |
| **Calles pueblo — T2+** | 2–3 cada 3 tiles | — | Terraza bar (3-4 sillas), crowd-tile peatonal, comercio con toldo | Terraza recogida, crowd-tile reducido 50%, neón bar visible | Crowd-tiles con paraguas (variante 3×5 px) |
| **Despacho manager** | Alta (§5.1) | Escritorio vacío, una carpeta, ventana a campo | Estante con trofeos, fotos plantilla, banderines, cartas | Lámpara escritorio (único punto cálido `#FFC87A`) | Sin cambio |
| **Interiores bar/comercio** | 2–4 visibles desde ventana | Barra, taburete, TV colgada (4×4 px brillo) | Mesa dominó, banderín club, fotos liga local | Bar con gente + TV (crowd-tile adaptado interior 16×16) | Vapor condensa en cristal (overlay 2px) |

**Reglas de determinismo**:
1. **Tier**: cada tier suma props al pool. Los de T0 no desaparecen — se complementan.
2. **Time slot** (§4.5): tendedero desaparece en noche/lluvia. Terraza se recoge a 23:00 in-game. Farolas con halo solo en tarde-noche.
3. **Clima**: lluvia retira terrazas/puestos. Paraguas reemplaza crowd-tiles normales.
4. **Matchday**: en radio 3 tiles de entrada del estadio, crowd-tiles normales → crowd-tiles convergentes (desplazamiento hacia estadio), densidad +50%.

**Budget anti-clutter**: **max 3 props simultáneos por tile**. Prioridad: (1) infraestructura fija (farola, banco), (2) narrativos de tier (trofeo, banderín), (3) evento (crowd, puesto).

### 6.4 Environmental Storytelling

Reglas vinculantes (no opcionales) que operacionalizan P1 + P2 + P3 en píxeles.

**"Antes/después" en fachadas:**
- **Cartel arrancado**: rectángulo `Polvo de fachada` más oscuro + restos pegamento 2px en esquinas. Aparece en T0 en 1 de cada 6 tiles comercio. Desaparece T2. *"Aquí hubo un negocio que cerró."*
- **Ventana cristal roto tapado con cartón**: rectángulo `#7A5230` en lugar de cristal. Exclusivo T0. En T1 sin cascada activada en el barrio, 1 de cada 10 ventanas sigue tapada (resquicio de desarrollo desigual).

**Estado del club:**
- **`fan_momentum` bajo**: banderines del club en radio 2 tiles del estadio → estado "flojo" — `--club-primary` a –15% saturación, sprite 1px más corto en extremo libre (cuelga, no ondea).
- **`fan_momentum` alto**: crowd-tiles de plaza estadio (no matchday) → densidad +1 categoría sobre base del tier.
- **Crisis financiera**: ventana de oficina lleva papel pegado 4px (rectángulo `#EAEAEA` con 2 líneas pixel-text ilegible). *"Hay un aviso colgado."*

**Manager carrera (P3, cross-ref §5.1):**
- **Reputación 7+ (Prestigioso/Leyenda)**: frente al banco de plaza estadio aparece placa de dedicatoria — sprite 8×4 px con texto ilegible pero "oficial" (`#9E8B6E` borde, `#C4B49A` fondo).
- **Histórico victorias**: barra del bar más cercano al estadio muestra foto enmarcada en pared (visible por ventana, 4×4 px). Reputación 5+ → foto con borde `--club-primary`.

**Cascadas descubiertas** (P1):
- **"Snacks → asistencia"** activa: puesto de churros en plaza tiene cola (crowd-tile 3-4 personas).
- **"Prensa → turismo"** activa: aparece crowd-tile de aficionado visitante (ropa neutra, mochila 2px) que no estaba antes.
- **No-overcomunicación**: max **1 detalle de cascada por tile**, max **2 detalles cascada en pantalla simultáneamente**. Si más activas, prioridad por `strength` (ADR-003).

**Regla anti-clutter narrativo**: max **2 detalles storytelling por tile** simultáneos. Prioridad: (1) carrera manager — siempre visibles si aplican; (2) cascada — se omite si tile ya tiene 2 de prioridad 1; (3) estado del club — solo si tile tiene < 2 activos.

### 6.5 Tratamiento Interior vs. Exterior

| Espacio | Acceso | Tratamiento visual |
|---|---|---|
| **Despacho manager** | Siempre visible (Estado 6 §2) | Interior con perspectiva isométrica propia — room separado del tilemap. Escala ×1.5 para legibilidad de props acumulados. |
| **Bar / comercio** | Click → micro-panel | Vista "a través de la ventana" — panel DOM superpuesto con ilustración estática 128×64 px (pixel art frontal, no isométrico). |
| **Vestuario** | Panel gestión plantilla matchday | Panel DOM: ilustración estática 128×64 px. No canvas. |
| **Oficinas club** | No visible MVP — abstracción DOM (financiero, contratos) | Sin representación canvas |

**Escala y paleta interiores**: misma paleta que exterior con variación de temperatura lumínica. **El despacho ignora el `ColorMatrixFilter` global** de §4.5 — tiene tinte fijo lámpara `#FFC87A` al 15% + esquinas `Sombra interior` al 40% (penumbra periférica). Resultado: despacho siempre íntimo y cálido independientemente de hora exterior.

**Iluminación interior**: interiores son `Container` PixiJS hijo separado con propia cadena de filtros (decisión técnica delegable a `web-frontend-specialist`).

### 6.6 Mapa del Mundo y Camera Bounds

**Tamaño MVP**: grilla **40×40 tiles isométricos = 1600 tiles totales**

| Zona | % | Tiles (~) | Descripción |
|---|---|---|---|
| **Estadio + instalaciones** | 15% | 240 | Centro gravitacional del mapa |
| **Pueblo (calles, edificios, plaza)** | 45% | 720 | Masa principal habitable y narrable |
| **Naturaleza / borde** | 30% | 480 | Campos agrícolas, terreno sin urbanizar, arbolado |
| **Reserva expansión** (no visible MVP) | 10% | 160 | Tiles de borde ocultos por niebla — superficie para fases futuras |

**Camera bounds**: pan libre dentro de 40×40. No infinito. Al acercarse al borde, cámara frena con easing (`ease-out`), no choca. El jugador nunca ve el tile literal de borde.

**Zoom levels**:

| Zoom | Tiles visibles | Uso |
|---|---|---|
| ×0.5 | ~20×16 | "City level" — estadio + buena parte del pueblo |
| ×1 (default) | ~10×8 | Vista juego estándar — estadio o pueblo, no ambos |
| ×1.5 | ~6×5 | Detalle — props y personajes legibles |
| Máx ×2 | ~5×4 | Detalle máximo — budget ADR-006: no más de 50 sprites simultáneos |

**Minimap**: DOM, 80×60 px en esquina superior derecha (configurable). Muestra:
- Siluetas edificios (color por categoría: `--club-primary` estadio, `Polvo de fachada` pueblo, `Verde parque` naturaleza)
- Posición cámara (rectángulo `#EAEAEA` 30%)
- NO personajes individuales — solo tilemap categórico
- Canvas 2D separado 80×60 px, **downsample del tilemap cada 5 segundos** (no real-time) para no afectar frame budget del canvas principal (ADR-006).

**Tratamiento del borde**: niebla progresiva — overlay `#C0C8C0` (color niebla §4.5) con opacidad creciente en últimas 4 filas: 0% en fila -4, 25% en -3, 55% en -2, 85% en -1. Tile literal de borde invisible. El mapa termina pero el mundo parece continuar.

**Restricción ADR-012 (DOM/canvas frontier)**: minimap es DOM (canvas 2D separado). Niebla de borde es canvas (PixiJS overlay). Pan cámara es canvas. No hay elementos DOM superpuestos al canvas excepto strip match-day HUD (§3.3) y minimap. Funcional además de estética — el canvas tiene budget de compositing y capas DOM extras lo afectarían.

---

## 7. UI/HUD Visual Direction

> **Approved**: 2026-05-16 (user lock-in tal cual)
> **Authored by**: art-director (visual style) + ux-designer (UX alignment) — parallel agents, no conflicts to resolve
> **Cross-references**: §1.4 (anti-flat UI) · §3.3 (DOM shape grammar locked) · §4.4 (UI semantic colors locked) · interaction-patterns.md (18 patterns + Animation Standards + Sound Standards) · accessibility-requirements.md (WCAG 2.1 AA)

### 7.1 Dirección Tipográfica

**Familia: IBM Plex Sans** (no Inter, no DM Sans, no Atkinson Hyperlegible). Plex Sans fue diseñada para sistemas técnicos con carácter humano — exactamente la tensión "tablero de mandos analógico + calidez de barrio modesto". Inter es demasiado corporativa-neutra; DM Sans demasiado redonda-amistosa.

**Fallback stack ESM**: `'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif`

**Subset**: Latin Extended (tildes + ñ). Variable font — bundle inicial solo pesos 400 y 600; 500 en lazy load (FOUT mitigation + budget < 500kb).

**Escala tipográfica** (base 16px = 1rem):

| Token | rem | px | Line-height | Uso |
|---|---|---|---|---|
| `text-caption` | 0.6875rem | 11px | 1.5 | Marcas fecha calendar, badges estado |
| `text-small` | 0.75rem | 12px | 1.5 | Labels campo, unidades stats, secundario |
| `text-body` | 0.875rem | 14px | 1.6 | Inbox, descripciones, contenido principal panel |
| `text-label` | 1rem | 16px | 1.4 | Nombres jugador, etiquetas sección, **botones** |
| `text-heading` | 1.25rem | 20px | 1.3 | Títulos panel, nombre club en header |
| `text-display` | 1.75rem | 28px | 1.2 | Marcador HUD match-day, cifra hero stats financieras |

**Jerarquía de pesos**:
- `400` — cuerpo, contenido inbox, secundario (mayoría del DOM)
- `600` — headings, valores hero, button primary, nombre jugador en card
- `500` — labels sección intermedios, button secondary, tab activo (criterio, no decoración)

**Numérica — tabular figures obligatorio**: `font-variant-numeric: tabular-nums` siempre. Formato español:
- Dinero: `1.250.000 €` (punto millares, símbolo **sufijo** con NBSP — convención RAE/ISO 4217 España). Compacto: `1,25M €`. Prohibido prefijo `€ 1.250.000` (convención anglosajona, rompe localización).
- Fechas: `Dom 15 Mar` (abrev 3 letras día+mes). NO `15/03/2028` (burocrático-frío).
- Marcador: `2 — 1` (em-dash con espacios), `text-display` peso 600.
- Porcentaje: `78%` sin espacio. Alineación derecha en tabla.

**Anti-elecciones tipográficas (binding)**:
- Prohibido peso `300` (light) en cualquier tamaño — ilegible a 12px en pantallas no-Retina
- Prohibido all-caps en headings — connotación marca-lujo o militarista, ajena al tono. Permitida en `text-caption` de badges donde el espacio lo exige (`MED`, `SUP`)
- Prohibido `letter-spacing` negativo — rompe carácter de Plex Sans

### 7.2 Estilo de Iconografía

**Librería: Lucide Icons** (fork mantenido de Feather con scope amplio, stroke balanceado). Tabler demasiado SaaS-literal; Heroicons stroke 2px más bold-moderno; Feather actualización inactiva.

**Especificaciones de trazo**:
- Stroke `1.5px` en tamaño base 20px (no 2px bold, no 1px desaparece en bajo-DPI)
- Line caps `round`, joins `round` (evita ángulo brutal sin redondez infantil)
- Fill `none`; stroke `currentColor` (hereda contexto sin spec manual)

**Buckets de tamaño**:

| Tamaño | Uso |
|---|---|
| `16px` | Inline con texto: junto a label, dentro de badge |
| `20px` | Junto a botón, antes de label de sección (base) |
| `24px` | Standalone (sin texto), tabs navegación principal |
| `32px` | Acción grande: estado vacío de panel, modal hero action |

Retrato 64×64 de inbox = sprite-art, **categoría aparte** (no icono de librería) — ver §7.4.

**Color**: `currentColor` por defecto. Excepción: iconos de acciones branded del club pueden heredar `--club-primary` (solo cuando contexto ya está en ese color).

**Iconos custom MVP (~12)** — necesarios cuando no hay equivalente Lucide o el dominio fútbol-gestión requiere especificidad:

| Icono | Justificación |
|---|---|
| Balón de fútbol | Lucide tiene `circle`, no balón |
| Camiseta de equipo | No existe en ninguna librería |
| Silbato de árbitro | Estado de partido |
| Trofeo modesto | Lucide tiene uno genérico-navideño |
| Banderín esquina | Específico fútbol |
| Tarjeta roja / amarilla | Estado jugador crítico |
| Mástil bandera (tier) | Representación tier club |
| Escudo del club | Customizable colores club — no puede ser Lucide |
| Ojeador (figura con prismáticos) | Diferencia roles staff |
| Calidad jugador (rombos 1-5) | Sistema propio (no estrellas) |
| Campo isométrico mini | Match-view en nav |
| Cascada (flechas encadenadas) | Concepto central del juego |

System icons (settings, save, close, search, sort, filter, chevrons, check, warning, x): todos Lucide sin modificar.

### 7.3 Feel de Animación por Elemento de UI

Tokens locked en interaction-patterns.md §Animation Standards. Esta sección spec'a el *feel* concreto por elemento.

**Button press** (`motion-quick`, 100ms): scale `1.0 → 0.97` ease-in + retorno ease-out; background `darken 8%`. NO shadow, NO icono loading a menos que dispara estado `loading` real. La brevedad es honestidad — el click solo confirma.

**Modal enter** (`motion-medium`, 300ms): scale `0.95 → 1.0` + `opacity 0 → 1` ease-out. El modal "llega" desde ligeramente más pequeño. **Exit en `motion-short`** (200ms, más rápido — las salidas no merecen tanta atención). Reduced-motion: solo fade 100ms sin scale.

**Toast slide-in** (`motion-short`, 200ms ease-out): desktop desde `translateY(+24px)` bottom-center; mobile desde `translateY(-24px)` top (PQ2 resolved en interaction-patterns). Desplazamiento intencionalmente pequeño (24px) — emerge, no "vuela". Exit: fade `motion-quick` sin movimiento.

**Section Tabs swap** (`motion-instant`, 0ms): tab activo cambia peso `400 → 600` + fondo del hover al activo + underline `2px` `--club-primary`. Velocidad comunica navegación entre estados del mismo espacio, no cambio de contexto.

**Inbox icon pulse** (`motion-ambient`, 1.5s loop): solo dot de notificación, opacity `1.0 → 0.7 → 1.0` ease-in-out. **El icono permanece estático**. Reduced-motion: dot estático `--club-primary` sin animación.

**Decision panel commit** (`motion-quick`, 150ms total): fondo del valor confirmado hace flash `background-color: rgba(--club-primary, 0.20)` en 50ms ease-out + decay a `rgba(--club-primary, 0)` en 100ms. **Único momento en que `--club-primary` toca el fondo de dato** — funciona como confirmación sin necesidad de toast.

**Entity Card hover** (`motion-quick`, 100ms): solo background `#F5F0E8 → #EDE5D5`. NO scale, NO shadow. El hover de card no eleva — el sistema es plano. Las cards son tablero de mandos, no elementos "flotantes".

**Stat value update en vivo** (`motion-instant`, 0ms + highlight opcional): número cambia sin ticker. Si el cambio es significativo (gol, tarjeta roja), highlight `rgba(--club-primary, 0.15)` 2s + decay `motion-medium` 300ms. **NO animación de número subiendo píxel a píxel** — eso es feedback compulsivo (§1.4 anti).

**Sidebar panel expand/collapse** (`motion-short`, 200ms): `width` ease-in-out. Contenido interno aparece/desaparece en `motion-instant` — solo contenedor anima, no contenido (evita FOUC).

**Calendar strip day advance** (`motion-quick`, 100ms): día activo cambia background instantáneo en nuevo día + anterior recupera. NO desplazamiento horizontal — el tiempo avanza, no se desplaza.

### 7.4 Momentos Diegéticos — Cuando el DOM Toca el Canvas

Regla general: separación total (§3.3). Estas son las excepciones controladas.

**Inbox sender portraits (64×64 sprite-art en DOM)**: única superficie DOM con pixel art genuino. Mismo vocabulario visual del canvas — cell-shading 3 tonos, paleta del mundo, formas de cara de §5.5.

Frame:
- `border: 2px solid #2E2018` (Sombra interior)
- Fondo: color institucional del rol (§5.3-§5.4)
- `border-radius: 2px` (coherente §3.3)
- **NO** textura de papel, NO esquinas dobladas, NO efecto "fotografía analógica" — la ilusión de "carta recibida" la crea el texto que rodea el retrato, no el retrato mismo

Separación visual del contexto: bloque retrato+nombre+rol usa `background: #2E2018` con texto sender en `#F5F0E8`. Header oscuro + body claro = frontera entre "quién habla" y "qué dice".

**Threshold crossing moments (§2 Estado 4)**: el threshold vive en canvas (tile-swap + SFX firma + música breve). El DOM recibe el evento como **mensaje al inbox con delay de 1 minuto in-game** — carta de "comunicado oficial del club", mismo formato que cualquier mensaje, retrato del director deportivo como sender. **NO hay DOM celebration card separada**. La celebración vive en el canvas (el mundo cambió — ese es el spectacle); el inbox confirma formalmente. Respeta P4 (sin teatro) y refuerza P2 (el mundo ya lo dijo primero).

**Manager portrait en Dashboard**: en MVP **NO hay hero shot del manager en DOM**. La presencia del manager en DOM es solo nombre + cargo/reputación en breadcrumb header (`text-label` peso 600 + `text-small` debajo). La cara del manager vive en canvas (despacho, banda partido). *Post-MVP*: posible "Director's Cut" end-of-season screen con sprite 128×128 px — fuera de scope MVP.

### 7.5 Visibilidad de Estados de Interacción (UX binding)

Cada elemento interactivo requiere diferenciación visual en **8 estados**, y **nunca** depende exclusivamente del color:

| Estado | Diferenciación visual mínima |
|---|---|
| **Idle** | Base, sin decoración adicional (§3.3 no border default) |
| **Hover** | Background-differential (un paso L en paleta) + `cursor: pointer`; revelación opcional info suplementaria (nunca crítica per Reveal Tooltip pattern) |
| **Focus** | **2px solid ring ≥3:1 contraste** contra fondo circundante; visible solo-teclado |
| **Pressed/Active** | Opacidad reducida o desplazamiento visual; sin animación que requiera prefers-reduced-motion desactivado |
| **Selected** | Cambio de forma O peso adicional al color (underline, borde lateral, ícono de check); **nunca solo color** |
| **Disabled** | Opacidad 40-50% (excepción WCAG documentada §4.4: 2.5:1 permitido en inactive components); `cursor: not-allowed`; razón discoverable via Reveal Tooltip o texto inline |
| **Loading** | Spinner indeterminado dentro del elemento; bloqueo de interacción; **sin shift de layout** |
| **Error** | Icon + texto inline + borde de estado (3px solid izquierdo `#8B1A1A`); nunca solo color rojo |

### 7.6 UX Constraints Vinculantes (cross-ref accessibility-requirements.md)

**Legibilidad mínima**:
- Body text ≥ 14px desktop AND mobile (no excepción en mobile)
- Metadata `text-small 12px` solo si no-accionable y existe canal alternativo (tooltip/etiqueta)
- Cualquier combinación texto/fondo nueva valida contra §4.4 antes de production
- Line-length max **70 caracteres** (rango 60-80) para bloques de texto narrativo
- Line-height mínimo body: **1.5× font-size**

**Touch (mobile binding)**:
- Targets ≥ **44×44 px**
- Spacing ≥ **8px** entre adjacentes
- Cualquier propuesta visual que comprima esto entra en conflicto directo con accesibilidad

**Carga cognitiva**:
- Max **7±2 acciones primarias visibles** por Decision Panel (interaction-patterns rule)
- **Max 2 niveles tipográficos activos simultáneamente** en panel (previene spreadsheet feel)
- **1 elemento dominante por panel** (jerarquía perceptual clara)
- Progressive disclosure: Novato ve menos paneles activos que Leyenda — el espaciado y el silencio visual SON parte del diseño

**Navegación**:
- Skip-link visible en focus con contraste ≥ 4.5:1, posición fija top viewport
- Active route en main nav: peso + marcador no-color (underline / indicador lateral / icon) además de cambio de color
- Botón retroceso: posición consistente entre pantallas (top-left desktop / zona thumb mobile)

**Mobile-specific (breakpoints 768px / 375px)**:
- 768px: densidad comparable a desktop con controles táctiles 44×44 ya respetados
- 375px (snack mode): **densidad reducida aceptable** — columnas colapsan, paneles apilados, jerarquía simplificada
- La dirección visual debe definir explícitamente qué componentes colapsan/omiten en mobile — no asumir que CSS lo resuelve solo

### 7.7 UI Anti-Referencias y Pro-Referencias

**❌ Anti-referencias (qué la UI NO debe ser)**:

| Referencia | Por qué se rechaza |
|---|---|
| **iOS / Material Design 3** | Too consumer — optimized para engagement. Rounded cards flotantes, FABs, haptic visual = vocabulario de delivery app. Nuestro jugador es un manager, no un usuario de app |
| **Dashboard SaaS moderno** (Vercel / Linear / Notion) | Excelente diseño pero frío. Blanco brillante, grays neutros, spacing-silencioso sin personalidad. Funcional sin alma. UI debe tener temperatura `#F5F0E8` papel analógico, no monitor de oficina |
| **Pixel-art UI** | Viola §1 anti. Botones con sprites pixel-art, frames NES-style, bitmap fonts. Confunde estética del canvas con funcionalidad del DOM |
| **Skeuomorphic** | No textures pretending physical (madera, papel, cuero). El UI es herramienta, no objeto fotográfico |
| **Brutalist** | Anti-design "too cool" — incompatible con calidez modesto |

**✅ Pro-referencias (qué tomar de cada una)**:

| Referencia | Qué tomar | Qué evitar |
|---|---|---|
| **Football Manager** (versiones recientes) | Densidad de información sin agobio · jerarquía de paneles de plantilla · presentar muchos números sin crear ansiedad visual | Su estética azul corporativa · tooltips de texto denso · falta de carácter cromático |
| **Civilization VI** (panels de informe ciudad) | Datos como "documentos de estado" con peso de papel · lenguaje de "consultar registro" en lugar de "interactuar con app" · cómo los datos se sienten archivo histórico | Complejidad visual excesiva · tono war-map (no aplica a pueblo modesto) |
| **Return of the Obra Dinn** (Lucas Pope, Journal) | Claridad absoluta de interfaz con reglas propias · coherencia desde primera pantalla a última · restricciones claras = más memorable y legible | Estilo monocromático · estética de artefacto austero (Cascada es deliberadamente cálido) |

---

## 8. Asset Standards

> **Approved**: 2026-05-16 (user lock-in + PNG-8 default + PNG-32 excepción documentada)
> **Authored by**: art-director (visual standards) + technical-artist (engine binding) — 1 conflict resolved (PNG format)
> **Hard deadline CLOSED**: tile base size **32×16 px isométrico** locked formally en §8.1
> **Cross-references**: §3.1-§3.2 (canon dimensions) · §4 (palette) · §5.2 (sprite composition) · §6 (environment) · §7 (UI/HUD) · ADR-006 (PixiJS rendering) · technical-preferences.md (performance budgets)

### 8.1 Tile Size — Lock-In Formal (deadline closer)

**Especificación bloqueada**. Cualquier asset de canvas producido después de esta fecha usa estas dimensiones sin excepción.

**Tile base isométrico (diamond layout)**:
- `tile_width = 32 px`
- `tile_height = 16 px`
- Ratio W:H = 2:1 (estándar industria, proyección isométrica verdadera a 26.57°)

**Módulo de apilado vertical**:
- `module_height = 16 px`
- Apilable hasta 6 módulos = 96 px altura máxima edificio
- Cada módulo = una "lectura narrativa" (planta baja, primer piso, cubierta)

**Justificación de escala** — por qué 32×16:

| Escala candidata | Tiles visibles 375px @zoom ×1 | Problema |
|---|---|---|
| 48×24 px | ~7 × 6 | Mapa demasiado vacío mobile; cada tile pesa demasiado para densidad T1 |
| **32×16 px** | **~11 × 9** | **Sweet spot: estadio T1 cabe completo con contexto urbano** |
| 64×32 px | ~5 × 4 | Imposible mostrar estadio + entorno mobile sin scroll constante |

A 32×16 px base, el campo T1 (~12×8 tiles footprint) ocupa ~384 px ancho en proyección isométrica — justo al límite del viewport 375px a zoom ×1. El jugador ve el estadio completo sin scroll horizontal.

**Implicación de producción**: herramientas tileset (Tiled, Aseprite) deben configurarse a `tile_width=32, tile_height=16`. Reescalados en build no se aceptan.

### 8.2 Sprite Categories — Production Spec

| Categoría | Dimensiones canvas | Frames | Notas |
|---|---|---|---|
| **Tile base (suelo)** | 32×16 px | 1 estático por variante | Variantes zona/clima. NO degradados continuos — borde nítido entre tiles |
| **Tile decoración (props)** | 4×4 a 16×16 px | 1, máx 4 si actividad simulada | Anclados a tile, no rompen silueta más allá de 16 px altura |
| **Building base (módulo único)** | Footprint 32×16 × 16 px módulo | 1 por estado | Stack vertical de N módulos con offset 16 px. Max 6 módulos |
| **Character individual** | 16×24 px (§3.1) | 3 poses × 8 dirs × por capa | Sistema composición §5.2 (6 capas independientes, fondo transparente, alineación píxel-perfect) |
| **Crowd-tile** | 32×32 px | 2 frame loop ambient (offset aleatorio entre tiles para evitar sincronía) | 5 density variants §4.2.5, cada una sprite independiente |
| **Portrait inbox (sprite-art)** | 64×64 px | 1 estático | Cell-shading 3 tonos. **NUNCA AI** — solo arte humano (§8.6) |
| **UI icon custom (~12)** | SVG escalable, base 16×16 grilla | 1 | `currentColor` fill por defecto. Excepción: escudo club con `--club-primary` |
| **HUD strip match-day** | 48 px alto × viewport ancho | DOM con `backdrop-filter: blur(8px)` sobre canvas | NO renderizado PixiJS |

**Restricción crítica para characters (§5.2)**: TODAS las capas del mismo `variant_id` con píxeles alineados al mismo grid 16×24. Desalineación 1 px = bug producción bloqueante.

### 8.3 File Formats

**Sprites de canvas (pixel art) — PNG-8 indexed por defecto, PNG-32 como excepción documentada**

Decisión del usuario (2026-05-16): **PNG-8 indexed con 1-bit alpha** es el formato default. El art bible ya prohíbe transparencia parcial en bordes (§4.6 anti-regla 6, §8.8) — bordes solo alpha 0 o 255 — por lo que PNG-8 1-bit alpha es técnicamente compatible sin halos en composición. Ahorro de tamaño 3-4× respecto a PNG-32, crítico para mobile.

**Excepción documentada — PNG-32 permitido caso a caso** si el asset requiere:
- Overlay con gradiente alpha controlado (ej. estado loading con glow sutil — no en MVP)
- Highlight de gol o threshold con halo radial (no en MVP)
- Otros casos requieren aprobación explícita de art-director con justificación

Cada sprite PNG-32 producido lleva sufijo `-rgba` en filename (`bld-stadium-roof-m6-night-rgba.png`) para que el validation script identifique excepciones y bloquee uso indiscriminado.

**Source master**: **Aseprite (`.aseprite`)**. Masters en `assets/source/` (fuera del bundle). Aseprite exporta sprites individuales + Spritesheet JSON con metadata frames/animations en un paso. Único formato master aceptado para pixel art. Photoshop `.psd` en la anti-lista (§8.8).

**Texture atlas — Spritesheet JSON estándar PixiJS 8**:
- Formato: TexturePacker JSON Hash compatible con `@pixi/spritesheet`
- Campos requeridos: `frames` (con `frame {x,y,w,h}`, `sourceSize`, `spriteSourceSize`, `rotated: false`), `animations` (para multi-frame), `meta.image`, `meta.size`, `meta.scale: "1"`
- `rotated: false` obligatorio — rotación introduce sub-pixel rendering incompatible con nearest-neighbor
- Herramienta: **Free Texture Packer** (open source) o TexturePacker Pro si licenciado

**UI icons DOM**: SVG individuales inline via Vite plugin (`vite-plugin-svg` o equivalente). Lucide entrega SVGs individuales; los ~12 custom siguen el mismo formato. `currentColor` heredado del CSS padre. NO sprite sheet SVG (CORS + shadow DOM workarounds en SvelteKit).

**Audio — OGG Vorbis primario** (Safari moderno lo soporta desde 2022, MP3 fallback ya no estrictamente necesario para target evergreen últimas 2 versiones).

### 8.4 Naming Convention

Pattern base: `[category]-[entity]-[variant]-[state].[ext]` (kebab-case per technical-preferences.md)

| Categoría | Pattern | Ejemplos |
|---|---|---|
| Tile suelo | `tile-ground-[zona]-[clima].png` | `tile-ground-dirt-dry.png`, `tile-ground-grass-worn.png` |
| Props decoración | `prop-[nombre]-[variante].png` | `prop-bench-standard.png`, `prop-flag-corner.png` |
| Edificios | `bld-[nombre]-m[N]-[estado].png` | `bld-stand-east-m1-open.png`, `bld-main-office-m2-night.png` |
| Character (por capa) | `char-[capa]-[variant_id]-[pose]-[dir].png` | `char-body-m01-idle-se.png`, `char-shirt-tpl01-walk-sw.png` |
| Crowd | `crowd-[zona]-[densidad]-[frame].png` | `crowd-stand-north-full-01.png` |
| Portraits | `portrait-[rol]-[id].png` | `portrait-director-01.png`, `portrait-mayor-t2-01.png` |
| Iconos SVG | `icon-[nombre].svg` | `icon-shield.svg`, `icon-ball.svg`, `icon-cascade.svg` |
| Audio SFX | `sfx-[evento].ogg` | `sfx-threshold-cross.ogg` |
| Audio música | `music-[estado]-[variante].ogg` | `music-dashboard-morning.ogg`, `music-matchday-loop.ogg` |
| Excepción PNG-32 | `[base]-rgba.png` | `bld-stadium-roof-m6-night-rgba.png` (overlay con gradient alpha) |

**Capas character**: `body`, `skin`, `shirt`, `hair`, `face`, `overlay`
**Direcciones**: `se`, `sw`, `ne`, `nw`, `s`, `n`, `e`, `w` (8 ortogonales + diagonales)

**Estructura de carpetas**:
```
assets/
├── source/          # Masters .aseprite — NO bundled
│   ├── chars/
│   ├── tiles/
│   └── buildings/
├── sprites/         # PNG individuales exportados — input al atlas bake
│   ├── chars/
│   ├── tiles/
│   ├── props/
│   ├── buildings/
│   ├── crowds/
│   └── portraits/
├── atlas/           # Atlas PNG + JSON generados (build output)
├── icons/           # SVG iconos custom
└── audio/           # OGG (+ MP3 si necesario futuro)
```

Bundled al cliente: `apps/web/static/assets/` (static) o `apps/web/src/assets/` (con procesamiento Vite). Atlas bake = build-time; servidor NO procesa imágenes runtime.

### 8.5 Texture Atlas Strategy

**5 atlases por categoría** (no monolítico):

| Atlas | Contenido | Tamaño |
|---|---|---|
| `atlas-tiles.png` | Tiles suelo + props pequeños | 1024×1024 px (~4 MB GPU RGBA32) |
| `atlas-buildings.png` | Módulos de edificio | 2048×1024 px (~8 MB GPU) |
| **`atlas-chars.png`** | **6 capas character × variantes × 24 frames** | **1024×1024 px (~4 MB GPU)** — reconciliación de propuestas |
| `atlas-crowds.png` | Crowd-tiles todas densidades + zonas | 1024×512 px (~2 MB GPU) |
| `atlas-ui.png` | Portraits + sprite-art DOM | 512×512 px (~1 MB GPU) |

Cálculo chars atlas: ~552 sprites × 16×24 px con padding 2px → ~212K píxeles. Cabe holgadamente en 1024×1024.

**Padding entre sprites**: 2 px extrude (copia pixel borde) + sin gap adicional. Evita bleeding GPU sin desperdiciar espacio.

**Re-bake**: build-time exclusivamente. Pipeline: `aseprite --batch` + Free Texture Packer CLI en script `build:assets`. Sin hot-reload de atlas en Vite (decisión del technical-artist si se implementa watcher).

**Prohibición runtime atlas dinámico**: PixiJS 8 soporta `Assets.load()` de spritesheets runtime, pero policy es pre-baked. Escudos de club son SVG inline (no sprites atlas) → evitar re-bake al crear nuevos clubs.

### 8.6 AI Generation Tool Usage

**Aceptable para base manual cleanup**:
- Tile suelo standard (dirt, grass, pavement) en paleta §4 con dithering §6.2
- Props genéricos (banco, farola, valla) sin carga narrativa
- Crowd sprites densidad media (detalle individual mínimo)
- Variantes climáticas de tiles existentes

**Condición no negociable — cleanup pass obligatorio** verifica:
1. Todos los píxeles coinciden con paleta §4 (script `build:validate-palette`)
2. Dithering sigue §6.2 (solo en transiciones de material o cambio iluminación)
3. Cell-shading 3 tonos por zona (sin gradientes suaves)
4. Silueta legible a 50% zoom (test §3 principios)

**NUNCA AI — producción manual obligatoria**:
- Logotipo y escudo del club (SVG paramétrico, no sprites)
- Retratos hero del manager (progresión RPG §5.1 — arte con intención narrativa)
- Props narrativos: placa dedicatoria, foto enmarcada despacho, carta histórica alcalde, trofeo específico
- Portraits NPCs con nombre (director deportivo, alcalde, periodista recurrente)
- Assets de threshold crossing moments (§2 Estado 4)

**Herramientas**: Aseprite con paleta de referencia es la base preferida. Si AI: Stable Diffusion fine-tuned pixel art con ControlNet + paleta constraint. Output se importa Aseprite, se retoca píxel a píxel. **NO directos**: Midjourney, DALL-E (resolución/estilo no controlables a pixel level).

### 8.7 LOD Asset Strategy — Escala dinámica desde atlas único

**Nearest-neighbor obligatorio (no negociable)**:
- `PIXI.SCALE_MODES.NEAREST` siempre — confirmado ADR-006
- Anti-aliasing en escalado prohibido: produce halos grises que destruyen cell-shading §6.2
- Aplica tanto zoom in (×1.5, ×2) como zoom out (×0.75, ×0.5)

**Un único sprite por escala** — no sprites LOD separados:
- ×0.5 (vista ciudad T3+): sprite escalado 50% — character 16×24 → 8×12 px. Test §1.2.P3 legibilidad 50% se aplica
- ×1.0 (estándar): native resolution atlas
- ×1.5 (despacho, detalle): nearest-neighbor preserva nitidez

Si un sprite falla test 50% zoom → se simplifica el sprite, no se crea variante LOD.

**Excepción documentada** (no en MVP): crowd-tiles en zoom ×0.25 o menor (vista macro) podrían usar variante 16×8 px abstracta. Requiere aprobación art-director.

**Mipmapping**: prohibido (§8.8 anti-standard).

### 8-Tech.1 PixiJS 8 — Spritesheet y BaseTexture Setup

API Assets v8 (Loader v7 eliminado):

```ts
await Assets.add({ alias: 'tiles', src: '/assets/atlases/world-tiles.json' });
const sheet = await Assets.load<Spritesheet>('tiles');
```

Configuración obligatoria `BaseTexture` para pixel art:
- `scaleMode: 'nearest'` (verificar enum exacto v8 antes de usar)
- Mipmaps desactivados (no se generan por defecto en texturas 2D estáticas v8)
- `resolution: 1` explícito en `Application` (no auto-scale Retina; zoom isométrico via `container.scale.set(factor)`)

### 8-Tech.2 Presupuesto VRAM

| Categoría | Atlas | GPU (RGBA32) |
|---|---|---|
| World tiles | 1024×1024 | ~4 MB |
| Buildings | 2048×1024 | ~8 MB |
| Characters | 1024×1024 | ~4 MB |
| Portraits | 512×512 | ~1 MB |
| Crowds | 1024×512 | ~2 MB |
| UI icons | Inline SVG | 0 GPU |
| **Total estimado MVP** | — | **~19 MB** |

Límite de riesgo mobile (gama media-baja, VRAM compartida): ~80-100 MB. Presupuesto MVP deja margen amplio para T1/T2/T3 assets cargados progresivamente.

### 8-Tech.3 Optimización Draw Calls

**Target conservador: 50 draw calls / frame** mobile (60fps). Desktop tolera 150 pero diseñar para mobile.

PixiJS 8 batchea automáticamente sprites con misma textura GPU + mismo blend mode en mismo Container. Reglas:
- Containers por capa profundidad isométrica: `groundLayer` · `propsLayer` · `characterLayer` · `uiOverlayLayer`
- Sprites de misma capa deben referenciar mismo atlas — mezclar atlases rompe batch
- **`ParticleContainer`** para crowd-tiles + partículas simples (5-10× throughput vs Container) — apropiado para 1600 celdas del world map
- **`Container.cacheAsTexture()`** (v8 API, NO `cacheAsBitmap` v7 deprecated) para paneles estáticos (scoreboard fijo, HUD stats)

### 8-Tech.4 Estrategia de Carga

**T0 Boot (síncrono pre-UI)**:
- Subset IBM Plex Sans (latin básico, ~15 KB woff2)
- 12 SVG icons inline (no GPU)
- Bundle inicial JS DOM dashboard (< 500 KB)

**T1 Entrada canvas (lazy import por ruta)**:
```ts
const { Application } = await import('pixi.js');
await Assets.load(['world-tiles', 'characters', 'props']);
```
Import dinámico activa solo al navegar a canvas world view. PixiJS NO en bundle inicial (~800 KB minified).

**T2/T3 Progresión**: portraits rivales, estadios desbloqueados, música competiciones — on-demand al acceder/avanzar temporada.

**Caching**: `Cache-Control: public, max-age=31536000, immutable` + hash filename (Vite). PWA: Service Worker Cache-First para inmutables.

**Fallback fail**: placeholder magenta sólido 16×16 px (`0xFF00FF`). Log con Pino. No bloquear render.

### 8-Tech.5 Build Pipeline

- **pngquant** pre-build para conversion PNG-32 → PNG-8 indexed (donde aplique, respetando §8.3 default)
- Vite hashing automático en `assetsDir`
- Atlas validation script TypeScript: parsea JSONs Spritesheet, verifica que cada `frame` exista en PNG correspondiente — falla build si refs rotas
- CI bundle size enforcement: `vite-bundle-visualizer` + assertion < 500 KB initial JS gzipped
- Spritesheet JSON propaga hash del PNG en tiempo build

### 8-Tech.6 Audio Engineering

- **Formato**: OGG Vorbis primary (Safari moderno lo soporta desde 2022)
- **Bitrates**: música 128 kbps loops 30s ~480 KB · SFX < 2s 96 kbps ~24 KB cue
- **Presupuesto**: SFX individual máx 100 KB · loops música máx 600 KB · max 2 MB audio simultáneo en memoria
- **Loading**: preload T0 los 3-5 SFX críticos (botón, notificación, silbato). Música streamed on-demand por ruta

### 8-Tech.7 Performance Validation Workflow

- **CI**: bundle size assertion < 500 KB initial JS gzipped (cada PR)
- **Playwright**: FCP < 1.5s en 4G simulado (DevTools throttling), LCP < 3s
- **Manual profiling**: PixiJS DevTools (Chrome ext) + Performance tab — escenarios prioritarios:
  1. Zoom out a 50 sprites simultáneos — verificar draw calls ≤ 50 y frame time < 16ms
  2. Animación crowd-tiles en world map 40×40 completo
- **Asset bloat detection**: warn > 50 KB single PNG, fail build > 1 MB atlas

### 8.8 Anti-Standards (binding pipeline)

- **NO JPEG para sprites** — compresión lossy destruye paleta exacta. PNG-8 (default) o PNG-32 (excepción documentada) son los únicos formatos
- **NO mipmapping para pixel art** — PixiJS importer con `mipmap: PIXI.MIPMAP_MODES.OFF`
- **NO `.psd` masters** — Aseprite es master único (excepción: editor pixel-native equivalente con export PNG + JSON)
- **NO dimensiones fuera del grid** — sprites múltiplo de 4 px (derivado de tile 32×16 + módulo 16 px). Script de validación bloquea
- **NO colores fuera de paleta §4** — `build:validate-palette` compara cada píxel no-transparente contra hex set §4. Excepción: píxeles placeholder magenta `#FF00FF` en slots de camiseta (sentinel de tinte)
- **NO gradientes suaves en sprites canvas** — cell-shading 3 tonos único modo de modelado
- **NO transparencia parcial en bordes silueta** — alpha 0 o 255, nunca 1-254 (script detecta automáticamente)
- **NO `cacheAsTexture` en objetos per-frame** — re-upload GPU = frame drops
- **NO `Filter` en sprites individuales** — usar `sprite.tint` o overlay pre-baked
- **NO mezclar atlases en mismo Container** sin necesidad — 2 atlases = 2+ draw calls mínimo
- **NO PixiJS en bundle inicial** — lazy import obligatorio
- **NO PNG-32 sin justificación documentada** — default PNG-8, excepción con sufijo `-rgba` y aprobación art-director

---

## 9. Reference Direction

> **Approved**: 2026-05-16 (user lock-in tal cual)
> **Authored by**: art-director (delegated by /art-bible)
> **Cross-references**: §1-§8 of this bible · §7.7 already covers Football Manager / Civ VI / Obra Dinn for UI — Section 9 focuses on world / character / atmosphere visual references

### 9.1 Reference Table — Quick Lookup

| Referencia | Qué tomar | Qué evitar |
|---|---|---|
| **Habbo Hotel** | La ocupación del tile: cómo un mueble o un NPC hace que una loseta sea un *lugar*, no un fondo | Los colores chillones y la ausencia de estado — Habbo es siempre fiesta; nosotros somos martes |
| **PC Fútbol 4** | La emoción acumulada del underdog: ese momento en que la clasificación cambia y el silencio dice todo | La pobreza visual de su era — no copiamos sprites de 8 colores, heredamos la sensación |
| **Theme Park** | La forma en que el mundo comunica consecuencias sin tooltip: la cola del quiosco es el dato | La saturación cromática de feria de atracción — su paleta es festejo permanente |
| **SimCity (Classic / 4)** | La densidad visual como recompensa: que un skyline más lleno *se sienta* ganado, no decorativo | La abstracción de datos overhead — nosotros mostramos vidas, no zonas de color |
| **Crusader Kings III** | El envejecimiento del personaje como historia visible: que la cara del manager cuente años sin texto | El rococó heráldico de sus pantallas — coronas y escudos barrocos no son nuestro pueblo modesto |
| **Fotografía social española 80-90** *(anti-ref FM)* | La textura de lo auténtico: paredes con cal, tendederos con ropa de colores del club, luz de tarde de octubre | La gamificación de pantallas de datos — FM convierte el fútbol en hoja de cálculo, nosotros en barrio |

### 9.2 Per-Reference Detail

**Habbo Hotel — La ocupación del tile**

Lo que define a Habbo visualmente no es su paleta ni sus proporciones chibi: es la forma en que un objeto colocado sobre un tile convierte ese tile en un lugar con intención. Una silla orientada hacia una mesa hace una cafetería; la misma silla girada hace un pasillo. Este principio opera en Cascada FC de forma constante: el tendedero sobre el tejado, el coche frente al bar, la placa de dedicatoria en la plaza del estadio — cada prop hace que su tile sea *legible narrativamente* antes de que el jugador lo lea. Lo que tomamos de Habbo es estrictamente eso: la gramática de objetos que construyen lugar.

Lo que evitamos: Habbo es un espacio social sin estado de simulación propio — todo es decoración elegida libremente, todo brilla igual, no hay Tier 0 ni Tier 3. Su paleta es cromáticamente festiva porque su contexto es el ocio social. En Cascada FC cada tile acusa un estado de la simulación; los objetos no se eligen por gusto sino que aparecen o desaparecen como consecuencia de decisiones. Un barrio sin cascadas activadas no tiene puesto de fanzines aunque el jugador lo quiera.

**PC Fútbol 4 — El silencio de la clasificación cambiada**

PC Fútbol 4 no tiene sprites notables, ni paleta interesante, ni UI legible por estándares actuales. Lo que tiene es algo que en 1995 nadie había diseñado en un videojuego de fútbol: la acumulación emocional del underdog journey. Cuando tu equipo de Segunda B asciende después de 40 partidos gestionando plantilla, presupuesto y moral, la pantalla de clasificación con tu nombre subiendo no es espectacular — y esa inexpresividad es exactamente el punto. El jugador siente el ascenso porque lo vivió, no porque la pantalla lo amplifique.

Ese principio de acumulación silenciosa informa directamente el Estado 4 de §2 (Threshold Crossing) y la regla "el mundo absorbe el resultado" de §1.3. La referencia no es visual — es estructural: la recompensa más potente es la que confía en que el jugador ya sabe lo que costó. En producción esto significa que el tile-swap al cruzar un tier es el espectáculo, y el espectáculo dura exactamente 2-4 frames antes de que el mundo siga adelante.

**Theme Park (Bullfrog, 1994) — La cola como dato**

Theme Park tiene una de las interfaces de feedback más elegantes de la historia del diseño de juegos: la cola frente al quiosco de bebidas es más informativa que cualquier gráfico de ventas. Si hay 12 personas esperando y el quiosco de la derecha está vacío, el jugador sabe que tiene que construir otro — sin tooltip, sin alarma. La información vive en el mundo, no en el HUD.

En Cascada FC esto tiene traducción directa: cuando la cascada "snacks → asistencia" está activa, el puesto de churros en la plaza tiene cola (crowd-tile 3-4 personas, §6.4). El jugador que sabe leer el mundo ve el efecto antes de ver el número. Esta es la firma visual de P1 (Tinkering Beats Optimization): las consecuencias son legibles en el entorno para quien mira con atención.

Lo que evitamos de Theme Park: su paleta es de feria permanente — saturada, festiva, sin reposo. El parque de Theme Park nunca tiene un día malo que se vea en los colores. En Cascada FC la paleta baja de saturación con `fan_momentum` bajo (§6.4 — banderines con `--club-primary` a –15% saturación, flácidos), y la plaza se vacía antes de un partido perdido. El mundo de Theme Park es siempre del mismo tono; el nuestro, no.

**SimCity Classic / SimCity 4 — El skyline ganado**

La sensación más poderosa de SimCity no es construir un edificio — es ver cómo la ciudad que has construido existe en su conjunto, con sus luces nocturnas y su densidad propia, como un organismo que ya no necesitas gestionar activamente para que respire. Esa sensación de creación acumulada es la que el zoom-out de Cascada FC debe evocar cuando el jugador aleja la cámara y ve el estadio de Tier 3 iluminando el pueblo.

La referencia técnica es concreta: en SimCity 4, los edificios de alta densidad tienen siluetas más ricas que los de baja densidad — no más coloridos, sino más articulados. En Cascada FC la misma lógica opera: el estadio de Tier 3 tiene 5-6 módulos, bandera, proyectores y palcos visibles; el de Tier 0 es un cuboid plano de 1 módulo con valla. El crecimiento es aditivo y cuantizado (§3.2), y cada módulo añadido al estadio es una lectura de silueta más rica — no más colorida, sino más articulada.

Lo que evitamos: SimCity muestra datos overhead (zonas de color, mallas de tráfico, densidades abstractas). En Cascada FC el dato no es overhead — es el tile mismo. No hay modo de mapa que te muestre "zona de influencia del club" en colores planos; la influencia se lee en los toldos que adoptan `--club-primary` y en la densidad de los crowd-tiles de la plaza.

**Crusader Kings III — El retrato que envejece**

Crusader Kings III ha resuelto un problema de diseño de narración muy específico: cómo hacer que un personaje que vive 60 años in-game acumule visualmente esa historia sin que sea teatral. La respuesta de Paradox es concreta: arrugas en la cara, cicatrices de batallas pasadas, postura más encorvada con la edad, ropa que acumula insignias. El retrato del rey en el año 1200 de tu partida es visualmente distinto al del año 1250, y esa diferencia *cuenta* la partida.

En Cascada FC este principio gobierna la progresión visual del manager (§5.1): desde el polo sin logo del Novato hasta el traje de Leyenda con pin del club en solapa, cada hito es aditivo y cada detalle tiene correlato en la carrera del jugador. El bastón de paseo del manager Leyenda no es arbitrario — es el tipo de detalle que en CK3 diría "este hombre lleva décadas en esto". El despacho del manager acumula objetos de la misma manera: la densidad de objetos en el estante es el retrato de la carrera, sin texto.

Lo que evitamos: CK3 tiene una estética de rococó heráldico — coronas barrocas, fondos ornamentados, paletas de terciopelo y oro. Nada de eso pertenece a un pueblo modesto español. Los fondos de los retratos de inbox de Cascada FC son colores institucionales planos (§5.3), no texturas de tapiz. El manager Leyenda lleva traje, no armadura.

### 9.3 Non-Game Inspirations — El sustrato cultural

**Fotografía documental de fútbol modesto español (años 80-90)**

Antes de que el fútbol fuera espectáculo televisivo en España existía una cultura de imágenes del fútbol de abajo: fotografías de periódico local, folletos de campos de tierra, portadas de Marca con equipos de Segunda B en fondos de gradas de madera. Esa fotografía documental tiene una temperatura de color específica — los positivos de la época tienen tendencia al amarillo-marrón, los cielos están siempre encapotados, los uniformes aparecen con desgaste real. Es la referencia de temperatura emocional de la paleta Tier 0 (§4.1): `Tierra seca` `#5C3D1E`, `Polvo de fachada` `#8C6B47`, `Cielo encapotado` `#A8A0A0` no son colores de diseñador — son la temperatura de esas imágenes traducida a hex.

Lo que honramos: la honestidad del documento frente a la nostalgia manufacturada. El pueblo de Cascada FC no tiene el aspecto de una postal vintage — tiene el aspecto de un municipio que existe de verdad, con sus tendederos y sus antenas y su asfalto sin repintar. El artista debe resistir la tentación de hacer el Tier 0 *cute*: no es cute, es auténtico.

**Spectrum de fútbol modesto (imaginario colectivo 35-45)**

El jugador objetivo de Cascada FC tiene entre 35 y 45 años y jugó al PC Fútbol, el Jon Ritman's *Match Day* en Spectrum, o el primer Sensible Soccer. La referencia no es visual sino mnemónica: ese recuerdo de gestionar un equipo que se siente tuyo aunque los sprites sean 8×8 píxeles. El mundo pixel art de Cascada FC no imita esa estética — la supera en resolución y fidelidad — pero hereda la misma promesa emocional: *esto es tu club, no el de nadie más*. La referencia opera en naming, en el sabor de los textos IA narrativos (prensa de barrio, no telecasta global), y en la ambición de scope (un club humilde en un pueblo pequeño, no el Barça).

**Novelas gráficas y reportajes sobre clubes humildes**

Existe un subgénero de narrativa gráfica — *El arte del fútbol modesto*, crónicas como la de Girona en Segunda antes de su ascenso, el periodismo de Panenka sobre clubes históricos — que tiene una firma compositiva reconocible: planos picados de campos de tierra desde gradas bajas, retratos de aficionados mayores en bufandas del equipo, banderines desgastados contra cielo gris. Esa composición tiene una jerarquía visual clara: los humanos primero, el estadio como fondo, la escasez como contexto. En Cascada FC las siluetas humanas son siempre las hero shapes (§3.4), el estadio es el fondo que crece, y el Tier 0 comienza desde la escasez. No es referencia directa de color o forma — es referencia de jerarquía moral: lo que importa en el cuadro es la gente, no el edificio.

### 9.4 Cómo Operan las Referencias en Producción

Las referencias de esta sección no son un tablón de Pinterest. Son respuestas a preguntas específicas que un artista se hará durante la producción.

| Cuando la pregunta sea... | La respuesta es... |
|---|---|
| "¿Cómo de rico visualmente este tile de fachada en Tier 0?" | **Fotografía documental española** — gastado pero legible, NI cute NI abandonado |
| "¿Cómo expresivo el idle del manager en Leyenda?" | **CK3** — detalle acumulativo que el jugador lee como historia, no decoración. Bastón de paseo porque lleva décadas en esto |
| "¿Añado detalle ambiental en este tile de plaza?" | **Theme Park** — ¿comunica estado real del simulador? Si "snacks→asistencia" no está activa, el puesto de churros no tiene cola |
| "¿Qué altura/diferenciación estadio T3 vs T1?" | **SimCity** — silueta más articulada, no más colorida. Módulos adicionales con rasgo de tejado propio, legibles en skyline ×0.5 |
| "¿Cómo debe sentir el ascenso a Segunda?" | **PC Fútbol 4** — confía en que el jugador ya sabe lo que costó. El espectáculo dura 2-4 frames, no 30 segundos |
| "¿Cómo construyo un tile que el jugador sienta 'lugar'?" | **Habbo Hotel** — la orientación del objeto define el lugar. Una silla mirando a la mesa hace cafetería; girada hace pasillo |
| "¿Qué jerarquía visual elijo en esta escena?" | **Novelas gráficas clubes humildes** — los humanos primero, el estadio fondo, la escasez contexto |

**Regla operativa**: ante una decisión ambigua, pregunta a la referencia más cercana al tipo de elemento en cuestión — Habbo para props y tiles, CK3 para personajes y carrera, Theme Park para feedback emergente, SimCity para escala y progresión de mundo, PC Fútbol para qué NO amplificar, fotografía documental para temperatura y honestidad de paleta. Si ninguna referencia responde la pregunta, la respuesta está en la regla canónica de §1.1: *¿este píxel acusa recibo de algo real?*

---

## Status header (updated as sections complete)

| Section | Status |
|---|---|
| 1. Visual Identity Statement | ✅ Approved 2026-05-16 |
| 2. Mood & Atmosphere | ✅ Approved 2026-05-16 (7 estados + transitions + anti-estados) |
| 3. Shape Language | ✅ Approved 2026-05-16 (silhouettes + geometry + UI grammar + hero hierarchy) |
| 4. Color System | ✅ Approved 2026-05-16 (palette T0-T3 + club slots + UI semántica + tinte día/noche + wear/gradas/asistencia) |
| 5. Character Design Direction | ✅ Approved 2026-05-16 (manager RPG progression + sistema composición 6 capas + staff + NPCs + expression vocabulary + LOD) |
| 6. Environment Design Language | ✅ Approved 2026-05-16 (Spanish modesto vocabulary + texture philosophy + prop density + env storytelling + interiors + 40×40 mapa) |
| 7. UI/HUD Visual Direction | ✅ Approved 2026-05-16 (IBM Plex Sans + Lucide icons + 10 micro-animations + 8 estados + UX constraints + anti/pro-references) |
| 8. Asset Standards | ✅ Approved 2026-05-16 — **TILE SIZE DEADLINE CLOSED** (32×16 lock + PNG-8 default/PNG-32 excepción + atlas 1024² chars + 5 atlases + AI rules + LOD + PixiJS 8 API + ~19MB VRAM + 50 draw calls + audio OGG) |
| 9. Reference Direction | ✅ Approved 2026-05-16 (6 refs + 3 non-game inspirations + decision tree operacional) |
