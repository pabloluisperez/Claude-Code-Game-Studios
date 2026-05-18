# Concept Prototype Report: Cascada Engine

> **Date**: 2026-05-16
> **Prototype Path**: HTML (standalone)
> **Concept File**: `design/gdd/game-concept.md` (Cascada FC, working title)

---

## Hypothesis

> *"Si el jugador ajusta variables opacas y ve efectos en cascada vía mensajes contextualizados de empleados del club, querrá seguir experimentando voluntariamente — sin que nadie le explique qué hace cada slider."*
>
> **CONFIRMED si**: el jugador hace ≥3 ajustes en variables diferentes de forma voluntaria dentro de 10 minutos de juego, sin pedir explicación del sistema.
> **REFUTED si**: se frusta, deja de experimentar, o dice "no entiendo qué hace nada".

---

## Riskiest Assumption Tested

**DR1 del game-concept.md** — el balance entre "tinkering fun" y "frustration random". Si las cascadas son demasiado opacas, el sistema se siente como random; si son demasiado claras, el descubrimiento pierde magia. La línea es estrecha.

**Resultado**: la asunción se sostiene cuando los mensajes narrativos de los empleados conectan al jugador con el efecto. Los momentos "ajá" más fuertes vinieron de cascadas **contraintuitivas** (demasiado descanso = peor física) traducidas en lenguaje cotidiano ("los chicos están descansando demasiado, les falta chispa") y de detalles narrativos concretos ("los jugadores se traen el tupper" al bajar el catering).

---

## Approach

Prototipo HTML standalone de un solo fichero (~700 líneas). Self-contained, sin servidor, sin dependencias. Foco exclusivo en el motor de cascadas: 6 sliders opacos, 5 cadenas de cascada con delays variables (1-3 semanas), 6 eventos aleatorios semanales, 5+ "voces" de staff que reportan estado y dan pistas indirectas, sistema de partido simplificado, balance financiero.

**Path chosen:** HTML
**Reason for path:** La hipótesis es lógica de gestión pura — no hay timing, física ni feel de acción. El navegador no miente en este dominio. Coste mínimo, opens-with-doubleclick, sin contaminar el monorepo de producción.

**Shortcuts taken (intentional):**
- Sin arte (pixel art queda para el art bible)
- Sin partido simulado real (resultado por fórmula + random)
- Sin auth/DB/persistencia
- Sin manager-RPG (excluido para aislar la hipótesis del motor de cascadas)
- Sin IA narrativa (mensajes hardcoded con variantes)
- Sin sport-agnosticism (solo fútbol implícito)

---

## Result

**Verdict del jugador**: *"Fue super divertido."*

**Momentos de "click" identificados** (citas directas del debrief):

1. **Cascada contraintuitiva**: *"Al dar demasiado descanso no estaban bien físicamente"* — el descubrimiento de que más descanso ≠ siempre mejor fue uno de los momentos más fuertes del playtesting. Las cascadas contraintuitivas son las que más enganchan.

2. **Narrativa carrying la cascada**: *"Al bajar el catering se trajeron tappers los jugadores"* — el detalle narrativo concreto hace que la cascada se sienta real, no solo numérica. El texto importa tanto como el número.

3. **Delays apreciados como mecánica**: *"Interesante lo de scouting ojeador, que no es directo sino pasa un tiempo"* — el delay de 3 semanas para el scouting fue percibido como diseño positivo, no como bug.

4. **Eventos aleatorios bienvenidos**: *"Al haber fiesta en el barrio subió la asistencia"* — los eventos rompen la monotonía y previenen estrategias dominantes.

**Frustraciones / gaps identificados** (críticas constructivas del jugador):

1. **Falta momentum / inercia histórica**: *"Si bajo el precio de las entradas, viene más gente al estadio y el equipo gana, pues a la siguiente aunque suba el precio la gente estará más contenta y enganchada y vendrá igual. Si perdemos les costará más. No puede ser todo tan obvio, tiene que haber un componente de lo que llevamos arrastrado y con las entradas se va moldeando hacia un sitio u otro."* → la cascada actual es semana-a-semana; falta acumulación emocional.

2. **Falta contexto en las decisiones**: *"Si vamos segundos y jugamos contra el líder debería recomendarme precio de entradas más altas"* → el sistema necesita awareness de contexto (rival, racha, división) para que las decisiones tengan sentido estratégico, no solo táctico.

3. **Eventos de calendario deberían avisarse**: *"Si son cosas de calendario podrían avisarnos nuestros empleados de estas cosas"* → los eventos como fiestas del barrio o partido rival en TV no son sorpresas que descubrir, son contexto que conocer.

4. **Staff debería recomendar valores**: *"Interesante las recomendaciones en los valores (propuestas por empleados del equipo, si los tenemos contratados y según lo buenos que sean)"* → conexión clave con el Manager-RPG: la calidad de las recomendaciones depende de la calidad del staff contratado.

---

## Metrics

| Métrica | Valor |
|---------|-------|
| Path usado | HTML standalone |
| Iteraciones hasta playable | 1 (one-shot funcional) |
| Duración del prototipo | ~3 horas de implementación |
| Playtesters | 1 (solo dev) |
| Verdict del jugador sobre fun | **"Super divertido"** — engaged |
| Cascadas implementadas | 5 cadenas + 6 eventos aleatorios |
| Verdict de la hipótesis | **CONFIRMED (con learnings de pivot interno)** |

---

## Recommendation: **PROCEED**

La hipótesis central del motor de cascadas está validada. El jugador se enganchó, conectó causa-efecto a través de los mensajes de staff, y los momentos "ajá" surgieron especialmente cuando las cascadas eran contraintuitivas o cuando el lenguaje narrativo daba textura humana al efecto numérico. **El corazón del concepto funciona.**

Sin embargo, el playtest reveló refinamientos importantes que **deben incorporarse a los GDDs** antes de empezar la implementación de producción. No son razones para PIVOT — son features adicionales que enriquecen el diseño en la dirección correcta.

---

## If Proceeding

### Assumptions confirmed by the prototype

- ✅ El jugador deduce causa-efecto desde los mensajes narrativos del staff sin tooltips explícitos.
- ✅ Las cascadas contraintuitivas (más descanso = peor física) son las que más enganchan.
- ✅ Los delays multi-semana (scouting 3w) se sienten como diseño correcto, no como bug.
- ✅ Los eventos aleatorios añaden variedad sin frustrar — son condimentos, no protagonistas.
- ✅ El balance económico (subir precios vs reducir asistencia) crea decisiones reales con tradeoff.
- ✅ Los pilares P1 (Tinkering > Optimization) y P4 (Calm Is The Tempo) son alcanzables con este motor.

### Assumptions to upgrade / refine

- ⚠️ **Cascadas semana-a-semana son insuficientes**: hay que añadir variables de momentum acumulado (fan loyalty, racha emocional, "enganche" de la afición) que módulan los efectos. La cascada actual es Markov-1 (depende solo del estado previo); debe ser path-dependent (depende de la trayectoria).

- ⚠️ **El staff debe ser interfaz contextual, no solo reportero**: los empleados deben *recomendar valores* basados en (a) el contexto del momento (división, rival, racha), (b) eventos de calendario conocidos, (c) la calidad del propio empleado. Esto conecta el motor de cascadas con el Manager-RPG.

- ⚠️ **Eventos de calendario** deben estar predeterminados y anunciados con anticipación, no solo "ocurrir random". Crear distinción entre:
  - **Eventos previsibles** (fiestas anuales, partidos contra rivales fuertes, fin de temporada): anunciados por staff
  - **Eventos imprevistos** (lluvia, gripe, lesiones extra): random, no anunciados

### Emergent mechanics worth formalizing

1. **"Fan momentum" como variable explícita**: una métrica oculta (o semi-visible) que acumula la inercia emocional de la afición — sube con victorias + precios justos, baja con derrotas + precios injustos. Modula sensibilidad a futuros cambios de precio.

2. **Staff as cascade UI**: la calidad de los empleados determina:
   - Qué cadenas son visibles (jardinero malo no detecta riesgos del campo)
   - Cuán específicas son las recomendaciones (preparador físico bueno avisa "esta intensidad va a lesionar a X")
   - Qué eventos de calendario se anticipan (marketing manager bueno avisa de fiestas y subidas recomendadas)
   - **Esto es exactamente el bridge entre el motor de cascadas y el Manager-RPG (Pilar 3)**.

3. **Counter-intuitive cascades as design priority**: el descubrimiento más memorable fue una cascada contraintuitiva. El GDD del motor de cascadas debería tener una sección explícita: *"Cada cadena debe tener al menos un nodo contraintuitivo o un threshold no obvio"*.

4. **Narrative texture as core feature, not polish**: las frases del staff hacen el sistema legible. Esto **no es polish**, es mecánica. El diseño del sistema de mensajes (cuántas variantes por situación, qué tono, qué nivel de detalle) debe formar parte del GDD del motor de cascadas, no del art bible o de un sistema narrativo aparte.

### Core tuning values discovered

- Slider scope: 0-100, mapped a multiplicadores 0.4-0.8x del coste base
- Delay típico para efectos físicos: 1-2 semanas
- Delay para scouting: 3 semanas con threshold de "puntos acumulados"
- Frecuencia de eventos aleatorios: 1 evento ~55% / 2 eventos ~25% por semana
- Random factor en performance: 0.78-1.18 (no demasiado para que el jugador conecte causa-efecto)

### Next steps

1. `/design-review design/gdd/game-concept.md` — validar el concepto con los aprendizajes del prototipo (especialmente: añadir mención de "fan momentum" y "staff as UI")
2. `/gate-check` — confirmar readiness para Systems Design phase
3. `/art-bible` — desarrollar "Lived-In Pixel" (todavía no urgente pero la siguiente skill ideal de fase Concept)
4. `/map-systems` — descomponer el concepto, ahora con motor de cascadas validado como **sistema central**
5. `/design-system cascade-engine` — el primer GDD a escribir, incorporando todos los learnings de este reporte (especialmente fan momentum, staff-as-UI, narrative texture, counter-intuitive priority)

---

## Lessons Learned

- **What assumptions were broken by actually building this?**
  - La asunción de que "delay = bug a evitar" se rompió. Los delays son **feature**, no fricción. El jugador los percibió como capa estratégica añadida.
  - La asunción de que el motor de cascadas era *independiente* del Manager-RPG se rompió. El staff es la interfaz natural del sistema; ambos son inseparables.

- **What surprised us that didn't show up in the brainstorm?**
  - El playtester pidió **menos randomness, no más**: los eventos aleatorios estaban bien, pero las cascadas en sí deberían ser más deterministas (modulables por momentum) — no más random. La frase clave: *"no puede ser todo tan obvio, pero tiene que haber un componente de lo que llevamos arrastrado y con las entradas se va moldeando hacia un sitio u otro"*.
  - El detalle narrativo del "tupper" hizo más por la legibilidad del sistema que cualquier UI numérica.

- **What would we test differently next time?**
  - En el siguiente prototipo (si lo hay antes de implementar producción), probar específicamente el **momentum/inertia mechanic** — añadir fan_loyalty como variable oculta que evoluciona con resultados+precios+ambiente, y validar que el jugador la deduzca sin que se le explique.
  - Probar **staff-quality-as-visibility**: dos versiones del mismo prototipo, una con "staff bueno" (mensajes detallados y específicos) y otra con "staff novato" (mensajes vagos y genéricos), y ver si el jugador prefiere progresar contratando staff.

---

> *Prototype code location: `prototypes/cascada-engine-concept/prototype.html`*
> *This code is throwaway. Never refactor into production.*
