# Trophies & History — Game Design Document

> **Status**: 🟢 **Drafted — pending Pablo review** (2026-05-24 autonomous authoring)
> **Layer**: Presentation
> **Owner**: game-designer + narrative-director + ux-designer
> **Pillars**: P2 *World Is The Scoreboard* (primary), P3 *You Grow Like Your Club* (secondary)
> **Engine binding**: Web (TypeScript) — Drizzle + Hono + SvelteKit · **`/city` route reconvertida** (v1.1)
> **ADR refs**: ADR-005 (WorldState), ADR-014 (canvas pipeline)
> **Scope**: v1.1 (reemplaza el gameplay de city-progression en `/city`)
> **Last Updated**: 2026-05-24

---

## 1. Overview

Trophies & History es el sistema de **memoria del club**: una galería visual + timeline narrativo que reemplaza el gameplay anterior de la ruta `/city`. Como dato, agrega información ya existente en `WorldState` (trofeos ganados, milestones de carrera del manager, items de estadio completados, fichajes históricos) sin escribir nada nuevo — es **read-only sobre el resto del juego**. Como experiencia, es **el museo de lo que has construido**: cada trofeo es un objeto físico en la vitrina; cada banner cuelga de una pared; cada fichaje histórico tiene su placa con foto del jugador. La ruta `/city` deja de ser el sitio "donde gestiono cosas" y se vuelve **el lugar donde celebro lo que ya hice**.

Esta reconversión libera presupuesto de gameplay (city-progression gameplay queda absorbido por stadium-upgrades.md, que es el verdadero driver de city tier-up) y resuelve la duda OQ-09 del overnight 2026-05-22 ("¿/city canvas HD integration?") con una respuesta concreta: `/city` no es gameplay, es **post-game contemplative space**. WorldState (ADR-005) provee la lectura; el pipeline de canvas (ADR-014) la renderiza.

---

## 2. Player Fantasy

> *"Han pasado seis temporadas. Subiste de 5ª a 1ª. Ganaste la copa regional en la temporada 3. Vendiste a Carlos Méndez al Madrid por 12 millones en la 4. Llevas a Pablo Pérez como hijo del club desde la cantera. Cuando entras a `/city`, no hay nada que decidir. La cámara dolly entra por la calle, pasa frente a la fachada del estadio, gira a la izquierda hacia el museo del club. Adentro: la copa de la regional con polvo simulado; un banner con la primera alineación del ascenso; una foto pixel-art enmarcada de Carlos el día del fichaje; el balance económico de tu mejor temporada grabado en una placa. No estás jugando. Estás recordando. Y el club lo recuerda contigo."*

Anclajes a Pilares:

- **Pilar 2 (World Is The Scoreboard) — PRIMARIO**: trofeos son objetos físicos, no entradas en una tabla. El museo es la versión más pura del pilar — todo está renderizado, nada en menú.
- **Pilar 3 (You Grow Like Your Club) — SECUNDARIO**: el museo cuenta tu carrera. Cuando llamen alcaldes de otros clubes (manager-rpg), el museo es lo que ellos vieron antes de marcar.
- **Pilar 4 (Calm Is The Tempo) — REFUERZO**: no hay acción, no hay decisión. Es el espacio contemplativo más explícito del juego.

### Capas de la experiencia

**Capa 1 — Achiever** (Bartle)
*"Lo gané. Está ahí."* El logro tiene un objeto. El trofeo regional no es un texto que dice "Copa Regional 2027". Es una copa pixel-art con la fecha grabada.

**Capa 2 — Narrative** (Bartle)
*"Esta es la historia que escribimos."* Cada trofeo tiene un texto contextual generado por la IA narrativa (post-v1.2) o templated (v1.1). El museo es una novela emergente sobre el club.

**Capa 3 — Social** (futuro MMO)
*"Mira lo que tengo en mi club."* En v1.1 single-player el museo es privado. En MMO futuro, otros managers pueden visitar tu `/city` y recorrer tu museo. Screenshot-friendly desde el día 1.

### Anti-fantasías

- **NOT un editor de museo** (à la Animal Crossing layout). El museo se llena automáticamente; el jugador no decide qué dónde.
- **NOT un trophy room sólo de fútbol**. Incluye fichajes históricos, milestones financieros, jugadores de cantera promocionados, items de estadio completados.
- **NOT achievements estilo Steam**. No hay logros artificiales tipo "Gana 100 partidos". Sólo logros que importan al club ficcional.
- **NOT un menú**. Si dudamos entre lista DOM y galería isométrica explorable, este sistema elige **siempre** la galería.

---

## 3. Detailed Rules

### 3.1 Categorías de memoria

Cinco categorías de objetos en el museo. Cada categoría tiene su propia zona del espacio isométrico.

| Categoría | Source data | Renderizado |
|---|---|---|
| **Trofeos** (Trophies) | `league-system.md`: champions de copa/liga; `event-system.md`: trofeos especiales | Copas pixel-art en vitrinas; tamaño por importancia |
| **Banners** (Memorias visuales) | `league-system.md`: ascensos, derbis ganados; `match-simulation.md`: partidos legendarios | Banderines colgados de paredes; texto en banner |
| **Fichajes históricos** (Hall of fame) | `player-management.md`: jugadores con TOP_5_PLAYER_FLAG (umbral en §7); milestones individuales | Placas con sprite del jugador + stats agregadas |
| **Milestones financieros** | `economy.md`: primer beneficio, primer balance >1M€, primer scandal cleared | Placas grabadas con fecha + cifra |
| **Estadio histórico** | `stadium-upgrades.md`: items `Complete` con `completion_date` | Línea temporal en pared; cada item es una placa con fecha + sprite |

### 3.2 Layout isométrico del museo

`/city` reconvertida se renderiza como **el barrio del club**, no la ciudad completa. Tres edificios accesibles:

1. **Museo** (centro) — galería principal con 5 zonas (una por categoría §3.1)
2. **Estadio** (al lado) — entrada redirige a `/stadium` (no se renderiza el estadio aquí — se ve desde fuera)
3. **Despacho del manager** (al lado) — entrada redirige a `/manager-office` (existing en manager-rpg.md)

**Navegación**:

- Cámara isométrica fija en vista del barrio. Player ve el conjunto.
- Click en museo → cámara dolly al interior, scroll horizontal por las 5 zonas.
- Click en estadio → redirige a `/stadium`.
- Click en despacho → redirige a `/manager-office`.
- Sidebar mantiene navegación rápida entre rutas.

### 3.3 Lógica de aparición de objetos

Objetos se materializan en el museo de forma **automática y deterministica** según WorldState. NO hay player choice de "qué exhibir". Reglas:

#### 3.3.1 Trofeos
- Cada champion de liga/copa registered en `league-system.md` → aparece en zona Trofeos.
- Tamaño del sprite varía: copa regional pequeña, copa nacional mediana, liga grande.
- Fecha grabada en el sprite (texto procedural).
- Polvo simulado: trofeos viejos tienen overlay de polvo (no afecta legibilidad).

#### 3.3.2 Banners
- Cada ascenso de división → banner con dorsales de la alineación del último partido (top 11 por minutos jugados).
- Cada derbi ganado contra rival registrado → banner con resultado.
- Cada partido legendario (`fan_momentum_delta > LEGENDARY_THRESHOLD` en single match) → banner especial.

#### 3.3.3 Fichajes históricos
- Jugadores con flag `TOP_5_PLAYER_FLAG` (top-5 OVR del club en su prime, ver §7) → placa permanente.
- Cada jugador con `transfer_value > LEGEND_TRANSFER_THRESHOLD` (€K, en §7) — vendidos o comprados — → placa.
- Promociones de cantera → placa adicional si el jugador acaba en TOP_5.

#### 3.3.4 Milestones financieros
- Primera vez `balance > 0` post-temporada (escape inicial de números rojos)
- Primer balance `> 1,000` €K (millonarios)
- Primer balance `> 10,000` €K (top D1)
- Recovery de bankruptcy (si ocurrió) — placa con "El club resurge"

#### 3.3.5 Estadio histórico
- Cada item `Complete` de stadium-upgrades.md → placa con: `(item.name, completion_date, cost_paid, sprite)` en línea temporal.
- Items deprecados (§5.14 de stadium-upgrades) siguen apareciendo con flag visual "Obsoleta".

### 3.4 Text generation

Cada objeto tiene un **texto contextual** corto (2-3 frases) que aparece al pasar cursor o tap. Fuentes:

- **v1.1 (MVP)**: templates por categoría con placeholders (e.g., "Ganaste la {league_name} en la temporada {season}. Fue un año de {summary_adjective}.").
- **v1.2+**: `narrative-ai.md` genera texto contextual con LLM local (llama.cpp), usando WorldState como contexto.

### 3.5 Ordering and recency

- Trofeos: ordenados por fecha descendente (más recientes primero, más visibles).
- Banners: ordenados por fecha descendente en una pared scrollable.
- Fichajes: ordenados por `transfer_value` descendente (más impactantes primero).
- Milestones financieros: ordenados cronológicamente.
- Estadio histórico: línea temporal cronológica (más antiguo a la izquierda, más reciente a la derecha).

---

## 4. Formulas

### F1: `legendary_match_qualifies(match) → boolean`

```
legendary_match_qualifies(match):
  return (
    abs(match.fan_momentum_delta) > LEGENDARY_THRESHOLD
    OR match.goals_for - match.goals_against >= LANDSLIDE_THRESHOLD
    OR (match.is_derby AND match.result == "win")
    OR match.is_cup_final
  )
```

**Variables:**

| Variable | Default | Description |
|---|---|---|
| `LEGENDARY_THRESHOLD` | 15 | fan_momentum delta absolute que califica como legendary |
| `LANDSLIDE_THRESHOLD` | 5 | Diferencia de goles para landslide (e.g., 5-0) |

### F2: `top_player_flag(player, club) → boolean`

```
top_player_flag(player, club):
  // Player calificó como TOP_5 si en algún momento de su carrera en el club:
  // estuvo en TOP_5 por OVR entre todos los jugadores del club (incluido youth)
  // por al menos TOP_5_MIN_WEEKS semanas consecutivas.
  return player.career_in_club_history.max_consecutive_weeks_in_top5 >= TOP_5_MIN_WEEKS
```

**Variables:**

| Variable | Default | Description |
|---|---|---|
| `TOP_5_MIN_WEEKS` | 20 | Semanas consecutivas en TOP_5 para flag |

### F3: `legend_transfer_qualifies(transfer) → boolean`

```
legend_transfer_qualifies(transfer):
  return transfer.value_eur_k >= LEGEND_TRANSFER_THRESHOLD[club.division]
```

**Variables:**

| Division | LEGEND_TRANSFER_THRESHOLD (€K) |
|---|---|
| D2 | 500 |
| D1 | 2,000 |

### F4: `museum_objects_count(state) → integer`

```
museum_objects_count = trophies.count
                     + banners.count
                     + legend_transfers.count
                     + financial_milestones.count
                     + stadium_history_items.count
```

**Output Range:** 0 (club recién fundado, sin nada) → ~200+ (club veterano con 20 temporadas, ~15 trofeos, ~30 banners, ~25 fichajes legendarios, ~15 milestones, ~40 stadium items).

### F5: `museum_density(state) → 0..1`

```
museum_density = clamp(museum_objects_count / MUSEUM_FULL_OBJECTS, 0, 1)
```

Usado por el renderer para ajustar layout — museum vacío muestra "futuras vitrinas" placeholder, museum lleno apretuja objetos.

**Variables:**

| Variable | Default | Description |
|---|---|---|
| `MUSEUM_FULL_OBJECTS` | 100 | Objetos para considerar museum "lleno" visualmente |

---

## 5. Edge Cases

### 5.1 Club recién fundado (museum vacío)
Museum se renderiza con vitrinas vacías + placeholder texts ("Aquí descansará tu primera copa"). Es onboarding implícito.

### 5.2 Trofeo perdido por scandal/desclasificación
Si event-system dispara desclasificación de un trofeo (e.g., scandal severo), el trofeo en museum cambia a **"vacío con placa de descalificación"** (no se elimina del museum — la historia se preserva).

### 5.3 Jugador que cumple TOP_5 → vendido → ¿se mantiene la placa?
SÍ. La placa es histórica. Texto contextual cambia a "X jugó aquí desde [year] hasta [year]. Vendido a [club] por [€K]."

### 5.4 Promoción de cantera que después sale del TOP_5
La placa de promoción se mantiene (es un evento del club). Si el jugador después no califica para TOP_5, NO recibe placa adicional de Hall of Fame.

### 5.5 Stadium-upgrades items deprecados
Placa permanece con flag visual "(Obsoleta)" + texto contextual explicativo. Historia se preserva.

### 5.6 Manager change mid-game
Si player despide a su manager (manager-rpg.md career event) y empieza con otro, museum **se mantiene** (es del club, no del manager). Las placas refieren al club, no al manager.

### 5.7 Bankruptcy + recovery
Si club entró en bankruptcy y recuperó, aparece milestone "El club resurge" con fecha. NO se eliminan trofeos pasados.

### 5.8 Datos corruptos / WorldState parcial
Si una placa fallaría por datos faltantes (e.g., player con sprite missing), se renderiza un placeholder genérico con texto "Memoria preservada".

### 5.9 Performance con museum lleno
Si `museum_objects_count > MUSEUM_PERF_CAP` (default 250), el renderer usa LoD: objetos lejanos como sprites estáticos simplificados.

### 5.10 Save game cross-version
Si player carga save de v1.1 después de v1.2 narrative-ai upgrade, los textos contextuales antiguos (template-based) se regeneran con LLM en background (job BullMQ, no bloqueante).

---

## 6. Dependencies

| Sistema | Dirección | Hard/Soft | Interface |
|---|---|---|---|
| `league-system.md` | reads | **HARD** | trophy winners list, ascensos, derbis registrados |
| `match-simulation.md` | reads | **HARD** | legendary matches (F1 filter), match results |
| `player-management.md` | reads | **HARD** | transfers, TOP_5 history, cantera promotions |
| `economy.md` | reads | **HARD** | balance history para milestones financieros |
| `stadium-upgrades.md` | reads | **HARD** | items completados con completion_date para línea temporal |
| `event-system.md` | reads | SOFT | scandal events que afecten trophy validity |
| `manager-rpg.md` | reads (display) | SOFT | manager career arc puede aparecer en placa de "fundador" del club |
| `narrative-ai.md` (v1.2+) | reads | SOFT | text generation para textos contextuales |
| ADR-005 (WorldState) | reads | **HARD** | toda la historia persistida del club |
| ADR-014 (canvas pipeline) | provides sprites | **HARD** (v1.1+) | trophy sprites, banner sprites, plaque sprites, museum interior |
| `hud-ui.md` | provides nav | SOFT | sidebar incluye nueva entrada "🏛 Museo" o "🏆 Historia" |
| `isometric-world.md` | provides renderer | SOFT (v1.1+) | museum interior + barrio del club renderizado |

### Cross-system propagation requirements (Fase 1.3)

| Target GDD | Required change |
|---|---|
| `hud-ui.md` | Sidebar añade entrada "🏛 Museo" o equivalente; route `/city` ya existe pero refactoriza como museum |
| `city-progression.md` | **Soft deprecation**: gameplay quedó absorbido por `stadium-upgrades.md`; este GDD reemplaza el visual gameplay de `/city`. Mantener como referencia histórica con `Status: Superseded by stadium-upgrades.md + trophies-history.md` |
| `league-system.md` | Add reader entry: trophies-history consume trophy winners |
| `match-simulation.md` | Add reader entry: trophies-history consume legendary match flags |

---

## 7. Tuning Knobs

```typescript
// F1 — Legendary match
LEGENDARY_THRESHOLD = 15           // fan_momentum delta abs
LANDSLIDE_THRESHOLD = 5            // goal diff

// F2 — TOP 5 player flag
TOP_5_MIN_WEEKS = 20               // semanas consecutivas en TOP_5

// F3 — Legend transfer threshold (€K)
LEGEND_TRANSFER_THRESHOLD = {
  D2: 500,
  D1: 2000,
}

// F4-F5 — Museum capacity
MUSEUM_FULL_OBJECTS = 100          // objetos para "lleno" visual
MUSEUM_PERF_CAP = 250              // umbral LoD

// Milestone financieros
FIRST_PROFIT_MILESTONE_THRESHOLD = 0
MILLIONAIRE_MILESTONE_THRESHOLD = 1000      // €K
RICH_CLUB_MILESTONE_THRESHOLD = 10000       // €K

// Text generation
USE_LLM_TEXTS = false              // true en v1.2+ con narrative-ai.md
```

**Safe ranges:**
- `LEGENDARY_THRESHOLD` ∈ [10, 30] — fuera del rango trivializa o casi ningún partido califica
- `TOP_5_MIN_WEEKS` ∈ [10, 40] — <10 inflaciona Hall of Fame, >40 muy restrictivo
- `LEGEND_TRANSFER_THRESHOLD[D2]` ∈ [300, 800] — calibrar contra transfer market real

---

## 8. Acceptance Criteria

| ID | Criterion | Test type |
|---|---|---|
| AC-TH-01 | Ruta `/city` renderiza museum + estadio (exterior) + manager office (exterior) | UI test |
| AC-TH-02 | Click en estadio → redirige a `/stadium` | UI test |
| AC-TH-03 | Click en despacho → redirige a `/manager-office` | UI test |
| AC-TH-04 | Click en museum → cámara dolly al interior, 5 zonas accesibles | UI test |
| AC-TH-05 | Cada trophy winner en league-system aparece como sprite en zona Trofeos | Integration |
| AC-TH-06 | Trophy sprite incluye fecha grabada | UI test |
| AC-TH-07 | Trophy viejo (más de N temporadas) tiene overlay de polvo | UI test |
| AC-TH-08 | Cada ascenso de división genera banner con alineación top-11 | Integration |
| AC-TH-09 | Legendary match (F1 cumple) genera banner | Integration |
| AC-TH-10 | TOP_5 player flag (F2) → placa permanente en Hall of Fame | Integration |
| AC-TH-11 | Legend transfer (F3) → placa con sprite del jugador + stats | Integration |
| AC-TH-12 | First profit + millionaire + rich club milestones aparecen con fecha | Integration |
| AC-TH-13 | Cada stadium-upgrade item `Complete` aparece en línea temporal de estadio histórico | Integration |
| AC-TH-14 | Cursor/tap sobre objeto muestra texto contextual (2-3 frases) | UI test |
| AC-TH-15 | v1.1: textos contextuales son templates (no LLM) | Unit |
| AC-TH-16 | Museum vacío muestra vitrinas placeholder ("Aquí descansará...") | UI test |
| AC-TH-17 | Trophy desclasificado por scandal aparece con placa de descalificación, NO se elimina | Integration |
| AC-TH-18 | Jugador TOP_5 vendido conserva placa; texto contextual actualizado | Integration |
| AC-TH-19 | Stadium item deprecated mantiene placa con flag "(Obsoleta)" | Integration |
| AC-TH-20 | Manager change preserva museum (es del club) | Integration |
| AC-TH-21 | Bankruptcy recovery genera milestone "El club resurge" | Integration |
| AC-TH-22 | Performance: `/city` page-load <800ms con museum_objects=100 | Perf |
| AC-TH-23 | Performance: LoD activo si museum_objects > MUSEUM_PERF_CAP | Perf |
| AC-TH-24 | DOM fallback (MVP a11y): lista textual del museum disponible vía `/city-text` | A11y |
| AC-TH-25 | Determinismo: misma WorldState → mismos objetos en museum, mismo orden | Property test |
| AC-TH-26 | Read-only: museum NO escribe a WorldState (es proyección) | Integration |
| AC-TH-27 | Save load cross-version (v1.1 → v1.2 LLM upgrade): textos se regeneran async | Integration |

---

## 9. Open Questions

| ID | Question | Bloqueante para |
|---|---|---|
| OQ-TH-1 | ¿La paleta del museum es invariante (fija) o evoluciona con el club (kit color en banners)? | art-director |
| OQ-TH-2 | ¿NPCs ambient en el museum (visitantes pixel-art simulados que recorren)? | art-director + perf |
| OQ-TH-3 | ¿Trofeos legendarios (e.g., Champions League imaginaria) tienen sprite custom o usan template genérico? | art-director |
| OQ-TH-4 | ¿Música ambient del museum diferente del resto del juego (más solemne)? | audio-director |
| OQ-TH-5 | ¿Player puede screenshot directamente desde `/city` con UI hidden? (screenshot mode) | ux-designer |
| OQ-TH-6 | ¿Hay "easter eggs" en el museum (placas hidden que el player descubre)? | narrative-director |
| OQ-TH-7 | ¿La música/SFX cambia según zona (vitrinas trofeos vs hall of fame)? | audio-director |
| OQ-TH-8 | v1.2 LLM: ¿cuánto detalle puede generar sin contradecir WorldState (hallucinations)? | narrative-director + AI risk |

---

## 10. Decision gate al cierre (v1.1 Sprint 22-24)

Trophies & History es PASS si:

- [ ] Las 5 categorías de objetos renderizan correctamente desde WorldState
- [ ] Performance <800ms page-load con museum lleno (100 objetos)
- [ ] Textos contextuales templated son legibles + sin contradicciones obvias
- [ ] Sentir "es mi museo" en playtest (subjetivo — playtest gate)
- [ ] Screenshot-worthy: al menos 2 momentos del museum producen capturas compartibles

---

## 11. Cross-references

- `design/gdd/stadium-upgrades.md` — provee items completados para línea temporal de estadio histórico
- `design/gdd/league-system.md` — provee trophy winners + ascensos + derbis
- `design/gdd/match-simulation.md` — provee legendary match flags
- `design/gdd/player-management.md` — provee transfers + TOP_5 history + cantera
- `design/gdd/economy.md` — provee balance history para milestones financieros
- `design/gdd/narrative-ai.md` (v1.2+) — provee text generation
- `design/gdd/city-progression.md` — **superseded by this GDD + stadium-upgrades.md** (Fase 1.3 propagation)
- ADR-014 (canvas pipeline) — sprites + renderer
- ADR-005 (WorldState) — source of truth para toda la memoria del club
