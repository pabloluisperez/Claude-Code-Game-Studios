# Gestión de Jugadores (Player Management)

> **Status**: In Review (R2 — full review 2026-05-18, all R1 blockers resolved)
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-18
> **Implements Pillar**: P1 (Tinkering Beats Optimization) · P3 (You Grow Like Your Club) · P4 (Calm Is The Tempo)

## Overview

El sistema de gestión de jugadores es el elenco vivo del club: define cada uno de los jugadores de la plantilla como entidades individuales con stats, posición, contrato y estado dinámico (forma, fitness, moral, lesiones), y actúa como puente entre las decisiones de gestión del mánager y los resultados del campo. Es la capa que convierte "el club tiene un presupuesto de 15K€ y necesita un extremo" en un conjunto de opciones concretas con nombres, números y consecuencias contractuales.

El sistema opera en tres dimensiones simultáneas. **La dimensión de rendimiento**: cada jugador tiene un `effective_rating` calculado semana a semana desde cuatro variables (skill, form, morale, effective_fitness), que match-simulation usa directamente para determinar el resultado del partido. **La dimensión económica**: cada jugador tiene un contrato con salario semanal y duración, que economy.md suma en la nómina del club — la plantilla tiene un coste fijo que el mánager no puede ignorar. **La dimensión de construcción**: el mánager ficha, vende, cede, renueva y deja crecer a jugadores a través de temporadas; la plantilla es el proyecto de largo plazo del club, más que cualquier resultado de partido individual.

El sistema entrega datos a tres consumidores críticos: match-simulation (necesita `PlayerState[]` completo para cada partido), economy (necesita contratos activos para calcular la nómina semanal), y cascade-engine (el nodo `team_skill` del WorldState refleja la calidad media de la plantilla; `squad_available_pct` refleja cuántos jugadores están disponibles). La gestión de la plantilla no es un mini-juego separado — es el substrato sobre el que opera todo el sistema de cascadas. Un jardinero con buen presupuesto puede tener el mejor campo de España; si la plantilla tiene cinco titulares lesionados, da igual. La interfaz técnica completa entre este sistema y match-simulation está especificada en ADR-007.

## Player Fantasy

El jugador de Cascada FC construye su plantilla como un jardinero construye un jardín — con paciencia, criterio y la conciencia de que las plantas más valiosas tardan años en crecer. La fantasy no es la del trader de FIFA que busca el meta o el inversor que maximiza valor de mercado: es la del **arquitecto de elenco** que entiende que un portero veterano de 34 años con contratos baratos y mucha experiencia puede ser más valioso para un club en D2 que un joven promesa sobrevalorado que no puedes permitirte mantener.

Hay tres momentos de mayor engagement que este sistema debe entregar:

**El momento de la firma**: el mánager ve a un jugador que "encaja" — no necesariamente el mejor del mercado, sino el que cubre exactamente la necesidad sin arruinar la nómina. Cuando el jugador entiende que puede construir un equipo coherente con presupuesto D2, la firma de ese jugador específico se siente como un movimiento de ajedrez bien calculado, no como un gasto.

**El momento del progreso**: después de varias semanas jugando con regularidad, el `form` de un jugador joven sube en la ficha — el mánager lo ha visto semana a semana, ha observado cómo el equipo gana partidos que antes se perdían. Cuando el staff confirma que "Martínez está en su mejor momento desde que llegó", el mánager ya lo sabía. La satisfacción no es la sorpresa — es la **validación del criterio**: el mánager apostó por ese jugador, invirtió minutos en él, y el sistema confirma que tenía razón. P3 aplicado a la plantilla.

**El momento del dilema**: un club grande ofrece 50K€ por el extremo que el mánager ha desarrollado desde cero. Venderlo resuelve los problemas económicos de la temporada. Mantenerlo preserva la identidad táctica del club. Este es el dilema emocional central de toda gestión deportiva — player-management debe crear las condiciones para que ocurra, con información suficiente para que la decisión sea significativa, no arbitraria.

La fantasía secundaria es la del **mánager que conoce a su plantilla mejor que nadie**: saber que el lateral derecho rinde un 15% mejor en casa que de visitante, que el delantero pierde efectividad si no descansa cada 3 semanas, que el capitán mantiene la moral del vestuario en los periodos difíciles. Este conocimiento no viene de tooltips — viene de semanas de observación y de mensajes del staff que el jugador aprende a leer.

## Detailed Design

### Core Rules

**1. Estructura del jugador (PlayerState)**

Cada jugador de la plantilla tiene:

**Stats comunes** (todas las posiciones):
| Stat | Rango | Default | Descripción |
|------|-------|---------|-------------|
| `skill` | [20–95] | generado | Calidad media ponderada de stats de posición — el número clave que match-simulation usa como input principal |
| `form` | [30–90] | 60 | Rolling average de `match_rating` en los últimos 5 partidos jugados. Se actualiza solo si el jugador ha jugado |
| `morale` | [0–100] | 70 | Estado anímico individual. Sube con victorias del equipo y eventos positivos; baja con derrotas prolongadas y bajos salarios relativos |
| `fitness` | [0–100] | 90 | Estado físico. Baja después de cada partido (según minutos y stamina); se recupera con descanso semanal |
| `stamina` | [40–100] | 70 | Resistencia durante el partido — controla el decay de `effective_fitness` durante los 90 minutos. Stat estático (no varía semanalmente) |
| `age` | [16–40] | — | Edad en años. Determina el arco de desarrollo y la tasa de degradación de skill |

**Stats de posición** (varían según rol):
| Posición | Stats |
|----------|-------|
| **GK** | `reflexes`, `handling`, `kicking` (cada uno [20–95]) |
| **DEF** | `strength`, `tackling`, `positioning` |
| **MID** | `vision`, `passing`, `workRate` |
| **FWD** | `finishing`, `speed`, `dribbling` |

El `skill` es un valor calculado: media ponderada de las stats de posición (pesos definidos en las Fórmulas).

**2. Contrato**

Cada jugador tiene un contrato activo o no tiene contrato (agente libre). El contrato define:
- `wage_weekly_eur_k`: salario semanal en €K
- `contract_ends_season`: temporada en la que expira
- `buyout_clause_eur_k` (opcional): cláusula de rescisión fijada en la firma

**3. Status del jugador**

`PlayerState.status` puede ser: `available` | `injured` | `suspended`
- Solo jugadores con `status === 'available'` pueden ser seleccionados en la alineación
- `squad_available_pct` del WorldState = `(available_count / squad_size) × 100`, calculado cada tick

**4. Alineación y formación**

El mánager selecciona 11 titulares + **7 suplentes** de entre los jugadores disponibles (bench size alineado con match-simulation.md — R4, 2026-05-18). El mánager puede elegir entre cuatro formaciones fijas: **4-4-2**, **4-3-3**, **3-5-2**, **5-3-2**. La formación determina el número de slots por posición (DEF/MID/FWD) en la alineación. Si el mánager no modifica la alineación antes del partido, se usa la alineación del partido anterior (persistida). Los jugadores con `status !== 'available'` no pueden ser seleccionados. Variaciones tácticas personalizadas son v1.1+.

**5. Desarrollo**

`form` se actualiza automáticamente después de cada partido: es el rolling average de `match_rating` en los últimos 5 partidos en que el jugador tuvo ≥ 30 minutos de juego. Si el jugador no ha jugado en las últimas 5 semanas, `form` decae 2 puntos/semana hacia MIN_FORM (30).

`potential_ceiling` existe solo para jugadores con `age < 24` y representa el `skill` máximo alcanzable. Al final de cada temporada:
- Si `minutes_played_season / max_minutes_season >= DEVELOPMENT_THRESHOLD` (≥ 40% de minutos posibles): `skill` sube `min(2, max(0, potential_ceiling - skill))` si `skill < potential_ceiling`.
- Si el jugador no ha jugado suficiente: no desarrolla.

**5b. Degradación de skill (veteranos)**

Al final de cada temporada, para jugadores con `age ≥ 30`:
```
decay = min(SKILL_DECAY_MAX, floor((age - 29) / 2))
skill = max(20, skill - decay)
```

Ejemplos: age=30 → decay=0 (sin cambio, primer año de transición); age=31 → -1/temporada; age=33 → -2/temporada (máximo). La degradación garantiza que el **Momento del dilema** se active naturalmente: el mánager debe decidir cuándo vender a un jugador querido antes de que su valor y rendimiento declinen.

**6. Lesiones**

Cuando match-simulation emite un evento de lesión para un jugador:
- `player.status = 'injured'`
- `player.recovery_weeks_remaining = rng(INJURY_MIN_WEEKS, INJURY_MAX_WEEKS)` usando `ctx.rng()`

Cada tick semanal: `recovery_weeks_remaining -= 1`. Cuando llega a 0: `status = 'available'`. Durante la lesión: el jugador no puede ser incluido en la alineación y no recibe form updates.

**7. Mercado de traspasos**

El mercado opera exclusivamente dentro de las ventanas de fichajes (`transfer_window_open` / `transfer_window_close` del event-system).

Al abrir la ventana, el sistema genera:
- **Jugadores libres**: lista de jugadores sin contrato (solo se paga contrato, sin tarifa de traspaso)
- **Jugadores en clubs IA**: lista de jugadores con `transfer_value` calculado

El mánager puede:
- **Fichar**: hacer una oferta al club IA (si oferta ≥ `transfer_value × 0.9` → acepta; si no → rechaza). No hay negociación multi-ronda en MVP.
- **Vender**: fijar precio de venta en un jugador propio. Los clubs IA generan ofertas automáticamente según el `transfer_value` del jugador. Las ofertas de clubs IA por jugadores propios llegan como eventos STOP (`transfer_offer` event).
- **Ceder**: enviar un jugador propio a un club IA por una temporada. El jugador no computa en la nómina durante la cesión; regresa al final de la temporada.

**8. Renovación y expiración de contratos**

Cuando un contrato tiene ≤ 8 semanas restantes: el staff de scouting emite un aviso ADVISORY. El mánager puede negociar renovación directamente. Si el contrato expira sin renovación: el jugador se convierte en agente libre al final de la temporada.

---

### States and Transitions

```
PlayerState.status:

    AVAILABLE ──── match injury event ────► INJURED
                                              │
         ◄─── recovery_weeks = 0 ────────────┘

    AVAILABLE ──── red_card event ────────► SUSPENDED
                                              │
         ◄─── one_week_elapsed ──────────────┘
```

**form (valor continuo, no estado):**
```
Actualización post-partido (≥30 min jugados):
  new_form = weighted_avg(last_5_match_ratings)

Decay sin jugar (>5 semanas sin partido):
  form = max(MIN_FORM, form - FORM_DECAY_WEEKLY)
```

**squad_available_pct (WorldState node, actualización semanal):**
```
squad_available_pct = (count(players where status='available') / squad_size) × 100
→ Escrita como PlayerDecision en Paso 3 del cascade tick
```

---

### Interactions with Other Systems

**→ `match-simulation.md`** *(lector principal — lee PlayerState[], escribe MatchEvent[])*
- **Lee**: `PlayerState[]` completo (11 titulares + bench) incluyendo skill, form, morale, fitness, stamina y stats de posición
- **Escribe**: `MatchEvent[]` con eventos de lesión (jugador ID + severity), tarjetas rojas, minutos jugados por jugador, `match_rating` individual (usado para actualizar `form`), y resultado del equipo (victoria/empate/derrota) usado en F11 para `result_bonus`
- **Contrato**: match-simulation recibe el lineup del tick del partido como parte de `MatchFixture`. Escribe exactamente el contrato definido en ADR-007.

**→ `economy.md`** *(lector de contratos para nómina)*
- **Lee**: lista de contratos activos → suma `weekly_wage_bill_eur_k`
- **Lee**: `transfer_fee` en operaciones de traspaso → ajusta `balance_eur_k` directamente
- **No escribe** a player-management. El contrato de datos: economy lee `ClubRoster.activeContracts` via DB query semanal.

**→ `cascade-engine.md`** *(lector de squad_available_pct; escritor de team_skill)*
- **Escribe** (via PlayerDecision, Paso 3): `squad_available_pct` = % de jugadores disponibles en la plantilla
- **Escribe** (via PlayerDecision, on transfer/development): `team_skill` = media de `skill` de los 11 titulares habituales (updated on lineup change or end-of-season)
- **No lee** del WorldState directamente. Los efectos de `injury_risk`, `training_intensity` etc. en los jugadores individuales son indirectos: cascade nodes afectan al WorldState agregado, no a PlayerStates individuales.

**→ `event-system.md`** *(receptor de transfer events; emisor de transfer_offer events)*
- **Recibe**: `transfer_offer` STOP events cuando un club IA hace una oferta por un jugador propio
- **Emite**: señal a cascade cuando `player_happiness` cae (via cascade ThresholdCrossings — el vínculo es indirecto vía WorldState)
- **Contrato**: las ventanas de fichajes (`transfer_window_open`/`close`) son CalendarEvents del event-system. Player-management implementa el mercado dentro de esas ventanas.

**→ `staff-system.md`** *(lector del roster para mensajes del scouting director)*
- **Lee**: estado del roster (jugadores por posición, lesionados, contratos próximos a expirar) para generar mensajes del scouting director
- **No escribe** a player-management.

**→ `manager-rpg.md`** *(lector de resultados de traspaso para XP)*
- **Lee**: completions de `transfer` y `contract_renewal` para conceder XP
- **No escribe** a player-management.

## Formulas

### F1: skill (calidad compuesta por posición)

Media ponderada de stats de posición:

```
GK:  skill = reflexes×0.40 + handling×0.35 + kicking×0.25
DEF: skill = tackling×0.40 + strength×0.35 + positioning×0.25
MID: skill = passing×0.35 + vision×0.35 + workRate×0.30
FWD: skill = finishing×0.45 + speed×0.30 + dribbling×0.25
```

**Variables:** todos los stats de posición ∈ [20, 95]
**Rango del output:** [20, 95]
**Ejemplo (FWD):** finishing=80, speed=75, dribbling=70 → skill = 80×0.45 + 75×0.30 + 70×0.25 = 36+22.5+17.5 = **76.0**

---

### F2: effective_fitness (decay durante el partido)

*(Definida en match-simulation.md, registrada en entities.yaml — incluida aquí como referencia)*

`effective_fitness(player, t) = max(0, fitness - (t / 90) × (1 - stamina/100) × FITNESS_DECAY_MAX)`

**Variables:** fitness ∈ [0,100], stamina ∈ [40,100], t ∈ [1,90], FITNESS_DECAY_MAX = 15
**Rango del output:** [0, fitness] (máximo decay con stamina=40: 9 puntos; clamp a 0 cuando fitness < decay)

---

### F3: effective_rating (para match-simulation)

*(Definida en match-simulation.md — incluida como referencia)*

`effective_rating = skill×0.35 + form×0.20 + morale×0.15 + effective_fitness(t)×0.30`

**Rango del output:** [13, 96] (mínimo con skill=20, form=30, morale=0, effective_fitness=0; máximo con skill=95, form=90, morale=100, effective_fitness=95)

---

### F4: form update (rolling average post-partido)

```
match_rating = effective_rating calculado en el minuto final del partido (t=90)
new_form = (sum of match_rating for last min(5, matches_played) games) / min(5, matches_played)
```

**Variables:** match_rating ∈ [25, 100], matches_played ∈ [1, 38]
**Condición**: solo jugadores con ≥ 30 minutos en el partido actualizan su form
**Rango del output:** [25, 100]
**Ejemplo:** últimos 5 ratings: [72, 68, 75, 70, 65] → form = 350/5 = **70.0**

---

### F5: form decay (cuando el jugador no juega)

`form = max(MIN_FORM, form - FORM_DECAY_WEEKLY)` — aplicado cada semana sin partido

**Variables:** MIN_FORM = 30, FORM_DECAY_WEEKLY = 2.0
**Condición**: aplica cuando el jugador lleva > 5 semanas sin jugar ≥ 30 minutos
**Rango del output:** converge a MIN_FORM (30) si nunca juega
**Nota**: la primera semana sin juego no castiga (permite descanso táctico sin penalización inmediata)

---

### F6: transfer_value (valor de mercado)

```
transfer_value_eur_k = BASE_VALUE_K × skill_factor × age_factor × form_factor
BASE_VALUE_K = 5.0
skill_factor = (skill / 50) ^ SKILL_VALUE_EXP        (SKILL_VALUE_EXP = 1.8)
age_factor = age_curve[age]                            (tabla discreta — ver Tuning Knobs)
form_factor = 0.8 + (form - 60) / 100 × 0.4          (rango: 0.68–0.92)
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| skill | float | [20–95] | `PlayerState.skill` |
| age | int | [16–40] | Edad en años |
| form | float | [30–90] | Forma reciente |
| BASE_VALUE_K | float | — | 5.0 €K (valor de referencia para skill=50, age=24, form=60) |
| SKILL_VALUE_EXP | float | [1.5–2.5] | Exponente — skill alto vale exponencialmente más |

**Rango del output:** ~0.5 €K (joven bajo nivel) a ~250 €K (crack joven en forma)
**Ejemplo:** skill=75, age=22, form=70 → skill_factor=(75/50)^1.8=2.29; age_factor=1.2; form_factor=0.84 → value=5×2.29×1.2×0.84=**11.6 €K**

---

### F7: fitness recovery semanal

`fitness_next = min(100, fitness + FITNESS_RECOVERY_WEEKLY)` — semana sin partido
`fitness_after_match = max(0, fitness - FITNESS_DECAY_MAX × (minutes_played/90) × (1 - stamina/100))`

**Variables:** FITNESS_RECOVERY_WEEKLY = 8.0, FITNESS_DECAY_MAX = 15
**Rango del output:** [0, 100]
**Ejemplo:** sin partido, fitness=65 → fitness_next = **73**

---

### F8: squad_available_pct (WorldState node update)

`squad_available_pct = round((available_count / SQUAD_REGISTERED_SIZE) × 100)`

**Variables:** available_count = jugadores con `status === 'available'`; `SQUAD_REGISTERED_SIZE = 25` (constante fija — denominador canónico para la regla de forfeit per league-system.md Rule 8)
**Rango del output:** [0, 100]
**Nota**: `squad_available_pct` sirve como WorldState node del cascade y como trigger del forfeit. El forfeit se activa cuando `squad_available_pct ≤ FORFEIT_SQUAD_PCT_THRESHOLD` (63%), per **league-system.md Rule 8** — fuente autoritativa del trigger de forfeit. El denominador es `SQUAD_REGISTERED_SIZE = 25` (constante fija, per league-system.md), **no** el `squad_size` dinámico del club. Si el club tiene más de 25 jugadores contratados, el denominador sigue siendo 25 y el forfeit sigue siendo ≤15 jugadores disponibles. player-management calcula el porcentaje con este denominador fijo; league-system decide si hay forfeit.
**Ejemplo:** 14 de 18 disponibles → 14/18×100 ≈ **78**

---

### F9: team_skill (WorldState node update)

`team_skill = round(average(skill for players in starting_11))`

**Variables:** starting_11 = 11 titulares de la última alineación guardada
**Rango del output:** [20, 95]
**Actualización**: PlayerDecision al cambiar alineación o al final de temporada

---

### F9b: player_happiness (WorldState node sync — delta PlayerDecision)

`player_happiness_delta = round(mean(morale for players in starting_11)) − prevState.player_happiness`

Aplicado como **delta PlayerDecision** en Paso 3 del cascade tick (no sobreescritura absoluta). El `player_happiness` final del tick = `prevState.player_happiness + player_happiness_delta + C17_delta + man_management_delta`, clampeado a [0, 100] en Paso 4.

**Variables:** starting_11 = los mismos 11 titulares de la última alineación guardada (mismo conjunto que F9 `team_skill`).
**Rango del delta:** convergencia cada tick hacia el promedio de morale — puede ser positivo o negativo.
**Actualización**: PlayerDecision — se re-evalúa cada advance() junto con `team_skill` (F9). El `morale` individual de los suplentes, lesionados y cedidos **no** contribuye al cálculo.
**Justificación**: `player_happiness` converge hacia el promedio de morale del bloque titular. Los deltas de C17 (`sponsor_quality → player_happiness`) y de `man_management` se acumulan encima en el mismo tick sin sobrescribirse. La convergencia es en un solo tick — el morale del starting_11 del advance() refleja directamente el estado emocional ese tick.

---

### F10: market_wage_reference

`market_wage_eur_k = transfer_value_eur_k × WAGE_VALUE_RATIO` (WAGE_VALUE_RATIO = 0.02)

**Rango típico D2**: 0.10 €K/sem a 0.80 €K/sem. Solo es referencia orientativa — el salario acordado es libre.

---

### F11: morale update (semanal)

```
morale_delta = result_bonus + wage_ratio_bonus + playing_time_bonus

result_bonus:
  +MORALE_WIN_BONUS      si el equipo ganó el último partido
  0                      si empate o semana sin partido
  -MORALE_LOSS_PENALTY   si el equipo perdió el último partido

wage_ratio_bonus:
  +MORALE_WAGE_BONUS     si wage_weekly >= market_wage_reference × 0.9
  -MORALE_WAGE_PENALTY   si wage_weekly < market_wage_reference × 0.6
  0                      en otro caso

playing_time_bonus:
  +1   si el jugador jugó ≥ 30 minutos esta semana
  -1   si status=available pero no fue seleccionado esta semana
  0    si status=injured o suspended (no penalización por circunstancia ajena)

morale_next = clamp(morale + morale_delta, 0, 100)
```

**Variables:**
| Variable | Tipo | Descripción |
|----------|------|-------------|
| `wage_weekly` | float | `PlayerState.wage_weekly_eur_k` del contrato activo |
| `market_wage_reference` | float | F10 calculado sobre el mismo jugador |
| `MORALE_WIN_BONUS` | int | 3 (tuning knob) |
| `MORALE_LOSS_PENALTY` | int | 2 (tuning knob) |
| `MORALE_WAGE_BONUS` | int | 2 (tuning knob) |
| `MORALE_WAGE_PENALTY` | int | 3 (tuning knob) |

**Rango del output:** [0, 100]
**Delta máximo/semana:** +6 (victoria + buen salario + jugó) o −6 (derrota + mal salario + no jugó)
**Ejemplo:** morale=65, victoria (+3), wage=0.40≥ref×0.9 (+2), jugó (+1) → morale_next = clamp(71, 0, 100) = **71**

---

### F12: skill degradation (end-of-season, age ≥ 30)

```
if age >= 30:
  decay = min(SKILL_DECAY_MAX, floor((age - 29) / 2))
  skill = max(20, skill - decay)
```

**Variables:** SKILL_DECAY_MAX = 2 (tuning knob)
**Rango del output:** [20, 95] (floored por el mínimo de skill)
**Nota:** decay=0 en age=30 (sin cambio en el primer año de transición); decay empieza en age=31 (-1/temporada).
**Ejemplos:**

| Edad | decay | skill=72 resultado |
|------|-------|--------------------|
| 30 | 0 | 72 (sin cambio) |
| 31 | 1 | 71 |
| 33 | 2 | 70 (máximo por SKILL_DECAY_MAX) |
| 36 | 2 | 70 (máximo, clampeado) |

## Edge Cases

- **Si la alineación tiene <11 jugadores disponibles el día del partido**: el sistema intenta completar con suplentes disponibles. Si `squad_available_pct ≤ 63%` (`FORFEIT_SQUAD_PCT_THRESHOLD` per league-system.md Rule 8): forfeit automático — resultado 0-3, sin simulación de partido. La regla es porcentual, no de count absoluto — el impacto depende del tamaño del squad registrado.

- **Si un jugador con `status=injured` está en la alineación guardada y no se actualiza antes del partido**: el sistema lo excluye automáticamente y rellena con el primer suplente disponible. No es error — es la regla de "usa la última alineación válida".

- **Si `potential_ceiling` de un jugador joven es menor que su `skill` actual**: `potential_ceiling` se clampea a `max(potential_ceiling, skill)` al cargarlo. No puede haber un jugador "por encima de su techo".

- **Si la ventana de fichajes cierra con operaciones pendientes** (oferta hecha pero no respondida): todas las ofertas pendientes caducan automáticamente. No hay transacciones implícitas al cierre.

- **Si el jugador cedido regresa al final de temporada y la nómina supera lo esperado**: el jugador regresa. No hay cancelación automática — es responsabilidad del mánager.

- **Si `form` llegaría por debajo de MIN_FORM (30)**: clampeado a 30.

- **Si `team_skill` o `squad_available_pct` se intentan calcular con plantilla vacía**: clampeados al mínimo (team_skill=20, squad_available_pct=0). El motor cascade no falla.

- **Si dos clubs IA hacen ofertas por el mismo jugador propio en la misma semana**: el mánager recibe un evento por cada oferta. El mánager acepta máximo una; las demás caducan al resolver la aceptada.

- **Si el mánager ficha cuando squad_size > 25**: permitido en MVP — el límite financiero es el único regulador.

- **Si `transfer_value` resulta < 0** (jugador muy viejo/bajo skill): clampeado a 0.1 €K.

## Dependencies

### Dependencias upstream (player-management depende de estas)

| Sistema | GDD | Tipo | Interfaz |
|---------|-----|------|----------|
| Motor de cascadas | `cascade-engine.md` | Blanda | Lee `injury_risk`, `training_intensity` como contexto para generar lesiones y form; escribe `squad_available_pct` y `team_skill` como PlayerDecisions |
| Simulación de partido | `match-simulation.md` | Dura | Recibe `MatchEvent[]` post-partido: lesiones, tarjetas, minutos jugados, match_rating individual, resultado equipo (win/draw/loss) para F11 |
| Sistema de eventos | `event-system.md` | Dura | Las ventanas de fichajes (`transfer_window_open`/`close`) son CalendarEvents — el mercado solo opera dentro de ellas |
| **ADR-007** | — | Dura | Define `PlayerState`, `TeamState`, `MatchFixture` interfaces que este GDD debe respetar |
| World-generator (spec pendiente) | — | Blanda | Genera N jugadores age 16-18 por división al inicio de cada temporada (D2: N=10; D1: N=15) para reponer el pool del mercado. Spec completa en world-generator GDD (pendiente) — resuelve OQ-PM-04 |

### Dependencias downstream (estos sistemas dependen de player-management)

| Sistema | GDD | Qué necesitan |
|---------|-----|--------------|
| Simulación de partido | `match-simulation.md` | `PlayerState[]` completo para cada partido (11 titulares + bench con todos sus stats) |
| Economía del club | `economy.md` | Lista de contratos activos para calcular `weekly_wage_bill_eur_k`; notificaciones de transfers para ajustar `balance_eur_k` |
| Motor de cascadas | `cascade-engine.md` | `squad_available_pct` y `team_skill` como PlayerDecisions en Paso 3 del tick semanal |
| Sistema de staff | `staff-system.md` | Estado del roster para mensajes del scouting director (jugadores por posición, lesionados, contratos próximos a expirar) |
| Manager RPG | `manager-rpg.md` | Eventos de transfer completado y contract_renewal para XP grants |
| HUD y UI principal | `hud-ui.md` | Vista de plantilla, mercado de fichajes, panel de alineación, historial de contratos |

### Nota de bidireccionalidad

La relación player-management ↔ match-simulation es bidireccional: player-management provee `PlayerState[]` → match-simulation escribe `MatchEvent[]` → player-management actualiza estados individuales. Ambos GDDs deben listarse mutuamente en sus Dependencies. Este GDD es la fuente de jugadores; match-simulation.md es la fuente de resultados.

## Tuning Knobs

| Constante | Valor MVP | Rango seguro | Si sube | Si baja |
|-----------|-----------|--------------|---------|---------|
| `FITNESS_RECOVERY_WEEKLY` | 8.0 | [5–12] | Jugadores se recuperan muy rápido (fitness trivial) | Jugadores siempre fatigados sin descanso programado |
| `FORM_DECAY_WEEKLY` | 2.0 | [1–4] | Form cae rápido si no juegas (obliga rotación constante) | Form casi no decae (bench players permanecen en buena forma) |
| `MIN_FORM` | 30 | [20–45] | El suelo de form es alto (jugadores sin jugar aún son decentes) | Jugadores sin juego caen a niveles muy bajos de form |
| `DEVELOPMENT_THRESHOLD` | 0.40 | [0.25–0.60] | Difícil desarrollar un jugador joven (necesita mucho tiempo de juego) | Fácil desarrollar (cualquier minuto cuenta) |
| `SKILL_VALUE_EXP` | 1.8 | [1.5–2.5] | Los cracks valen exponencialmente más (mercado elitista) | Valor de mercado más lineal (menos diferencia entre jugadores) |
| `BASE_VALUE_K` | 5.0 | [2–10] | Todos los jugadores valen más (mercado inflado) | Valores bajos en general (D2 más realista) |
| `WAGE_VALUE_RATIO` | 0.02 | [0.01–0.04] | Salarios más altos para el mismo skill (presión económica mayor) | Salarios más bajos (economía más laxa) |
| `INJURY_MIN_WEEKS` | 1 | [1–3] | — | — |
| `INJURY_MAX_WEEKS` | 6 | [4–12] | Lesiones más largas (gestión de plantilla más crítica) | Lesiones breves (poca consecuencia de injury_risk alto) |
| `MORALE_WIN_BONUS` | 3 | [1–5] | Las victorias inflan el ánimo rápidamente | Las victorias tienen poco efecto anímico |
| `MORALE_LOSS_PENALTY` | 2 | [1–4] | Las derrotas destruyen el vestuario | El equipo encaja bien las derrotas |
| `MORALE_WAGE_BONUS` | 2 | [1–3] | Un buen salario importa mucho para el ánimo | El salario tiene efecto menor en morale |
| `MORALE_WAGE_PENALTY` | 3 | [2–5] | Un mal salario destroza el vestuario | Los salarios bajos son tolerados |
| `SKILL_DECAY_MAX` | 2 | [1–3] | Los veteranos declinan más rápido (rotación generacional acelerada) | Los veteranos son muy duraderos (mercado de veteranos más estable) |
| `FORFEIT_SQUAD_PCT_THRESHOLD` | 63% | — | *Owned por league-system.md — no ajustar aquí.* Afecta con qué frecuencia las lesiones/sanciones fuerzan un forfeit. Calibrar ajustando `INJURY_MAX_WEEKS` y la frecuencia de suspensiones en conjunción con el squad_size de world-gen. |

### age_curve (F6 — factor de valor por edad)

| Edad | Factor | Notas |
|------|--------|-------|
| 16–18 | 0.7 | Joven incierto — potential_ceiling desconocido por el mercado |
| 19–21 | 0.9 | Promesa joven |
| 22–24 | 1.2 | Pico de valor — joven y ya probado |
| 25–27 | 1.0 | Edad de rendimiento máximo |
| 28–30 | 0.85 | Empieza a declinar |
| 31–33 | 0.60 | Veterano — valor bajo, experiencia alta |
| 34+ | 0.35 | Final de carrera |

### Interacciones críticas entre knobs

- **INJURY_MAX_WEEKS + INJURY_MIN_WEEKS** con `squad_available_pct`: si las lesiones son largas y frecuentes, `squad_available_pct` puede caer por debajo de `FORFEIT_SQUAD_PCT_THRESHOLD` (63%) sistemáticamente. Ajustar junto con los knobs de `injury_risk` en cascade-engine y el squad_size de world-gen.
- **FORM_DECAY_WEEKLY**: interact con `form` en `effective_rating`. Si el decay es alto, rotar la plantilla se vuelve obligatorio, reduciendo el espacio de decisión. Si es bajo, el mánager puede ignorar la rotación sin penalización.
- **DEVELOPMENT_THRESHOLD**: interact con `potential_ceiling` y `skill_factor` de F6. Si el umbral es bajo, los jugadores jóvenes se desarrollan fácilmente y el mercado se infla. Calibrar junto con BASE_VALUE_K.

## Visual/Audio Requirements

N/A — player-management es lógica de datos pura. Sin efectos visuales ni auditivos directos. El HUD y los mensajes del staff consumen los datos; ellos definen la presentación.

## UI Requirements

Las pantallas de gestión de plantilla (mercado, alineación, ficha de jugador) se especificarán en `design/ux/player-management.md` cuando se diseñe hud-ui.md. Este GDD no define la presentación — define los datos disponibles para ser presentados.

## Acceptance Criteria

Todos los ACs de Unit/Integration residen en `tests/unit/player-management/` o `tests/integration/player-management/` salvo que se indique otra ruta.

---

### Categoría 1: PlayerState y stats

**AC-PM-01** `[UNIT]`
GIVEN un jugador FWD con finishing=80, speed=75, dribbling=70, WHEN se calcula `skill`, THEN `skill = 80×0.45 + 75×0.30 + 70×0.25 = 76.0`.

**AC-PM-02** `[UNIT]`
GIVEN un jugador GK con reflexes=90, handling=80, kicking=60, WHEN se calcula `skill`, THEN `skill = 90×0.40 + 80×0.35 + 60×0.25 = 79.0`.

**AC-PM-03** `[UNIT]`
GIVEN un jugador con fitness=70, stamina=80, WHEN se calcula `effective_fitness(player, t=45)`, THEN `effective_fitness = 70 - (45/90) × (1-0.8) × 15 = 70 - 0.5×0.2×15 = 70 - 1.5 = 68.5`.

---

### Categoría 2: Form

**AC-PM-04** `[UNIT]`
GIVEN un jugador con últimos 5 match_ratings [72, 68, 75, 70, 65], WHEN se calcula el nuevo form, THEN `form = (72+68+75+70+65)/5 = 70.0`.

**AC-PM-05** `[UNIT]`
GIVEN un jugador que lleva 6 semanas sin jugar ≥30 minutos, con form=50, WHEN se aplica form decay en la semana 6 (primer tick de decay), THEN `form = max(30, 50 - 2.0) = 48.0`.

**AC-PM-06** `[UNIT]`
GIVEN un jugador con form=32 y 3 semanas sin jugar, WHEN se aplica form decay, THEN `form = max(30, 32 - 2.0) = 30` (clampeado a MIN_FORM).

---

### Categoría 3: Lesiones y status

**AC-PM-07** `[UNIT]`
GIVEN un jugador con `status=available`, WHEN match-simulation emite un injury event para ese jugador con severity que produce recovery_weeks=3, THEN `player.status = 'injured'` y `player.recovery_weeks_remaining = 3`.

**AC-PM-08** `[UNIT]`
GIVEN un jugador con `status=injured, recovery_weeks_remaining=1`, WHEN se avanza un tick semanal, THEN `recovery_weeks_remaining = 0` y `player.status = 'available'`.

**AC-PM-09** `[UNIT]`
GIVEN un jugador con `status=injured` en la alineación guardada, WHEN se construye el lineup para el siguiente partido, THEN el jugador es excluido y reemplazado por el primer suplente con `status=available`. No es error.

---

### Categoría 4: squad_available_pct y team_skill

**AC-PM-10** `[UNIT]`
GIVEN una plantilla de 18 jugadores con 14 `available`, 3 `injured`, 1 `suspended`, WHEN se calcula `squad_available_pct`, THEN `squad_available_pct = round(14/18 × 100) = 78`.

**AC-PM-11** `[UNIT]`
GIVEN un club con `available_count = 10` (usando denominador fijo `SQUAD_REGISTERED_SIZE=25`: `squad_available_pct = round(10/25×100) = 40` ≤ 63%), WHEN llega el día de partido (evaluado por league-system.md Rule 8), THEN el partido se registra como forfeit (0-3) sin llamar a match-simulation. GIVEN `available_count = 16` (`squad_available_pct = round(16/25×100) = 64` > 63%), THEN el partido se disputa normalmente.

**AC-PM-12** `[UNIT]`
GIVEN una alineación de 11 titulares con skills [75, 72, 68, 70, 65, 71, 66, 74, 68, 72, 69], WHEN se calcula `team_skill`, THEN `team_skill = round((75+72+68+70+65+71+66+74+68+72+69)/11) = round(770/11) = round(70.0) = 70`.

---

### Categoría 5: Desarrollo de jugadores

**AC-PM-13** `[UNIT]`
GIVEN un jugador de age=22 con skill=65, potential_ceiling=80, minutes_played_season=1520, max_minutes_season=3420 (38 partidos × 90 min, DEVELOPMENT_THRESHOLD=0.40 → 1368 min necesarios), WHEN se aplica end-of-season development, THEN `skill = 65 + min(2, 80-65) = 67`.

**AC-PM-14** `[UNIT]`
GIVEN un jugador de age=22 con skill=65, potential_ceiling=80, minutes_played_season=1000 (< DEVELOPMENT_THRESHOLD=0.40 × 3420=1368), WHEN se aplica end-of-season development, THEN `skill` no cambia (= 65).

**AC-PM-15** `[UNIT]`
GIVEN un jugador de age=30 (no joven), WHEN se aplica end-of-season development, THEN `potential_ceiling` no aplica; `skill` no cambia automáticamente.

---

### Categoría 6: Transfer value y mercado

**AC-PM-16** `[UNIT]`
GIVEN skill=75, age=22, form=70, WHEN se calcula transfer_value, THEN `skill_factor=(75/50)^1.8≈2.07`, `age_factor=1.2`, `form_factor=0.8+(70-60)/100×0.4=0.84` → `transfer_value = 5×2.07×1.2×0.84 ≈ 10.45 €K`.

**AC-PM-17** `[UNIT]`
GIVEN un jugador con age=40, skill=20, form=30 (valores mínimos del dominio), WHEN se calcula transfer_value, THEN `transfer_value ≈ 0.23 €K` (siempre > 0.1 €K con inputs válidos — el clamp al mínimo de 0.1 €K es guardia defensiva para datos corruptos).

**AC-PM-18** `[INTEGRATION]`
GIVEN una ventana de fichajes abierta y jugador IA con transfer_value=10 €K, WHEN el mánager hace una oferta de 9.0 €K (≥ 10 × 0.9 = 9.0), THEN la operación se acepta: el jugador cambia de club IA al club del mánager, `balance_eur_k -= 9.0`, el contrato propuesto se activa.

**AC-PM-19** `[INTEGRATION]`
GIVEN una ventana de fichajes cerrada, WHEN el mánager intenta hacer una oferta de fichaje, THEN la operación es rechazada con error "Mercado cerrado — no hay ventana de fichajes activa".

---

### Categoría 7: Fitness y recuperación

**AC-PM-20** `[UNIT]`
GIVEN un jugador con fitness=70, stamina=70, que jugó 90 minutos, WHEN se aplica el cálculo de fitness post-partido, THEN `fitness_after = 70 - 15 × (90/90) × (1-0.7) = 70 - 4.5 = 65.5`.

**AC-PM-21** `[UNIT]`
GIVEN un jugador con fitness=65 que no jugó esa semana, WHEN se aplica la recuperación semanal, THEN `fitness_next = min(100, 65 + 8.0) = 73`.

---

### Categoría 8: squad_available_pct como WorldState PlayerDecision

**AC-PM-22** `[INTEGRATION]`
GIVEN una plantilla donde 2 jugadores se lesionan en el partido de esta semana, WHEN se evalúa el cascade tick post-partido (Paso 3), THEN `squad_available_pct` en el WorldState refleja el nuevo conteo de disponibles (2 menos que antes del partido).

---

### Categoría 9: Morale update (F11)

**AC-PM-23** `[UNIT]`
GIVEN un jugador con morale=65, el equipo ganó este partido, `wage_weekly=0.40 €K` (≥ market_wage_reference×0.9), el jugador jugó ≥30 minutos, WHEN se aplica F11 weekly update, THEN `morale_delta = 3+2+1 = 6`, `morale_next = clamp(71, 0, 100) = 71`.

**AC-PM-24** `[UNIT]`
GIVEN un jugador con morale=15, el equipo perdió, `wage_weekly=0.05 €K` (< market_wage_reference×0.6), el jugador tuvo status=available pero no fue seleccionado, WHEN se aplica F11 weekly update, THEN `morale_delta = -2+(-3)+(-1) = -6`, `morale_next = clamp(9, 0, 100) = 9`.

---

### Categoría 10: Degradación de skill (F12)

**AC-PM-25** `[UNIT]`
GIVEN un jugador con age=33, skill=72, WHEN se aplica F12 end-of-season degradation, THEN `decay = min(2, floor((33-29)/2)) = min(2,2) = 2`, `skill = max(20, 72-2) = 70`.

**AC-PM-26** `[UNIT]`
GIVEN un jugador con age=28 (< 30), skill=72, WHEN se aplica F12, THEN no hay degradación: `skill = 72` (F12 solo aplica a age ≥ 30).

**AC-PM-27** `[UNIT]`
GIVEN un jugador con age=22, skill=80, potential_ceiling=80 (en el techo), WHEN se aplica end-of-season development, THEN `skill += min(2, max(0, 80-80)) = 0`; `skill = 80` (sin cambio — en el techo, no supera potential_ceiling).

## Open Questions

1. **OQ-PM-01**: ¿Cuántos jugadores por posición genera el generador de jugadores al inicio de partida? El game-concept dice ~150 jugadores, pero la distribución por posición (cuántos GK, DEF, MID, FWD) no está especificada. — Resolver antes del epic de generación de jugadores.

2. **OQ-PM-02**: ~~¿Cómo se calcula `morale` individual?~~ **RESUELTO**: F11 (fórmula compuesta semanal — result_bonus + wage_ratio_bonus + playing_time_bonus; ver sección Formulas).

3. **OQ-PM-03**: ¿Cómo se presenta el mercado de fichajes? ¿El mánager ve una lista filtrable de todos los jugadores disponibles, o el scouting_network determina cuántos ve? Si scouting_network condiciona la visibilidad del mercado, eso es una interacción con manager-rpg que debe documentarse en ambos GDDs. — Resolver al diseñar hud-ui.md.

4. **OQ-PM-04**: ~~¿Clubs IA con gestión de plantilla?~~ **RESUELTO (stub)**: Clubs IA tienen plantillas estáticas en MVP. El world-generator repone el pool con N jugadores age 16-18 por división al inicio de cada temporada (D2: N=10; D1: N=15). Spec completa en world-generator GDD (pendiente). Los clubs IA no fichan ni venden en MVP — el agotamiento del mercado de elite es una limitación conocida v1.0 que se resuelve en v1.1 con rotación generacional de IA.

5. **OQ-PM-05**: ~~¿Formación MVP fija?~~ **RESUELTO**: 4 formaciones fijas en MVP: 4-4-2, 4-3-3, 3-5-2, 5-3-2. Variaciones tácticas personalizadas son v1.1+.
