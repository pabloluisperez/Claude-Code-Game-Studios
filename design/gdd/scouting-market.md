# Scouting & Transfer Market — Game Design Document

> **Status**: 🟢 **Drafted — pending Pablo review** (2026-05-24 autonomous authoring)
> **Layer**: Feature
> **Owner**: game-designer + systems-designer + economy-designer
> **Pillars**: P1 *Tinkering Beats Optimization* (primary), P3 *You Grow Like Your Club* (secondary), P4 *Calm Is The Tempo* (tertiary)
> **Engine binding**: Web (TypeScript) — Drizzle + Hono + SvelteKit · NEW `/scouting` route
> **ADR refs**: ADR-005 (WorldState), ADR-008 (World Clock), ADR-015 (Special Event Decision Schema — transfer windows), ADR-016 (Player Lifecycle)
> **Scope**: v1.1 (post-MVP) — resolves OQ-PM-03 + OQ-PM-04 from `player-management.md`
> **Last Updated**: 2026-05-24

---

## 1. Overview

Scouting & Transfer Market es el sistema de **descubrimiento y compra de jugadores** del v1.1 — el complemento del stub MVP existente en `player-management.md §7` (mercado básico free-agent + AI players). Como dato, **lee** `scouting_points` y `scouting_network_level` ya existentes (cascade-engine C9a + manager-rpg) para determinar la granularidad de información que el jugador ve sobre cada jugador disponible. Como experiencia, es el momento en que el manager **explora el pool** con información imperfecta, **descubre** talentos según la calidad de su staff, y **negocia** traspasos con clubs IA que ahora también compran y venden (resolviendo la limitación MVP de "AI clubs estáticos"). Tres tiers de visibilidad — Untouched / Scouted / Detailed — y un mercado dual (free agents + AI player pool con auction).

A diferencia de stadium-upgrades (que escribe a WorldState), scouting-market **lee mucho** (player-management, cascade-engine scouting nodes, manager-rpg skill, staff-system scout director) y **escribe poco** (sólo transfers ejecutados y AI club rotations). Su valor está en el filtro y la presentación — convierte el pool genérico en una experiencia de descubrimiento.

---

## 2. Player Fantasy

> *"Has visto el informe del scouting director: 'Un central, 19 años, en el Tarragona. No es famoso pero su físico es atípico para la categoría'. No te dice OVR. No te dice stats. Pero algo en el tono te llama. Mandas a tu director a verlo en directo — un coste de 5k€ y una semana. Vuelve con números más concretos: 'Bueno con balón, lento atrás'. Decides ofertar. 80k€. El Tarragona rechaza. Subes a 120k€. Aceptan. Dos años después, el chaval es titular fijo de tu D1, y cuando viene rival a por él en una ventana, dices que no. Lo descubriste tú. Es tuyo."*

Anclajes a Pilares:

- **Pilar 1 (Tinkering) — PRIMARIO**: la información imperfecta ES la mecánica. El jugador descubre con riesgo, no consulta una hoja de cálculo completa. Subir `scouting_network` (manager-rpg) o contratar mejor director (staff-system) abre más información, igual que los pilares dicen — la transparencia viene del **personaje que eres**, no de la UI.
- **Pilar 3 (You Grow Like Your Club) — SECUNDARIO**: cada fichaje exitoso es una historia personal. El delantero que sacaste de 4ª división y vendiste al Madrid por 12M€ es un capítulo del museo (trophies-history.md Hall of Fame).
- **Pilar 4 (Calm Is The Tempo) — TERCIARIO**: el mercado opera sólo dentro de ventanas (ADR-015 `transfer_window_open/close`). Fuera de ventana = paz. Las decisiones son densas pero acotadas en el tiempo.

### Capas de la fantasía

**Capa 1 — Detective talent-hunter (P1)**
*"Vi algo en él que otros no."* Información parcial + intuición. El jugador descubre patterns (un club regional con bandas viejas suele tener cantera explotable; un agente libre con un año perdido por lesión vale la pena reevaluar).

**Capa 2 — Constructor de equipo (P3)**
*"Necesito un lateral derecho y los míos no convencen."* Búsqueda dirigida. El director scout filtra recomendaciones por posición + necesidad. La búsqueda es planeada, no espontánea.

**Capa 3 — Negociador (management feel)**
*"He hecho una oferta. El Tarragona la ha rechazado. Subo o me retiro."* Tensión de subasta. El precio que pagas afecta el balance económico que afecta la próxima reforma del estadio. Todo conectado.

### Anti-fantasías

- **NOT FM-style ojeo profesional**: no hay informes de 30 atributos individuales. La info se condensa en tiers (general → estimado → detallado).
- **NOT pay-to-win exhaustivo**: gastar más en scouting NO da OVR exacto inmediato — el delay (C9a: 1 semana) y el ruido (NOISE_C9a_AMP) preservan la incertidumbre.
- **NOT spreadsheet farming**: la información granular sólo aparece para JUGADORES OBSERVADOS — no para el pool entero.
- **NOT mercado infinito**: ventanas + roster sizes limitados, igual que el fútbol real.

---

## 3. Detailed Rules

### 3.1 Tiers de información por jugador

Cada jugador del mundo (libre o contratado en club IA) tiene un **tier de visibilidad** desde la perspectiva del manager. El tier determina qué campos ve el jugador en la UI del mercado.

| Tier | Trigger | Campos visibles |
|---|---|---|
| **T0 — Untouched** | Default (sin observación) | `name`, `age`, `position`, `current_club`, `contract_status` |
| **T1 — Listed** | Jugador del pool en `transfer_window_open` actual | T0 + `ovr_band` (e.g., "60-70") + `transfer_value_band` (e.g., "100-200€K") |
| **T2 — Scouted** | Manager ejerció una acción "scout this player" (cuesta `SCOUT_COST_EUR_K`, espera N ticks) | T1 + `ovr_estimate ± 3` + `transfer_value_estimate ± 15%` + `morale_band` (low/mid/high) |
| **T3 — Detailed** | Manager tiene scout director T2+ Y ha hecho T2-scout Y han pasado N ticks adicionales | T2 + `ovr_exact` + `transfer_value_exact` + `morale_exact (0-100)` + `fitness_exact` + recent form (last 5 matches summary) |

**Transición T0 → T1**: automática para todos los jugadores que aparecen en el pool de la ventana actual (free agents + AI players de divisions visibles).

**Transición T1 → T2**: acción de usuario "scout this player". Coste deducido de `financial_balance`. Espera de `SCOUT_DELAY_WEEKS` semanas (default 1) antes de que la info esté disponible.

**Transición T2 → T3**: requiere AMBOS:
- Scout Director del staff-system (rol nuevo en v1.1) con `skill >= T3_SCOUT_DIRECTOR_THRESHOLD` (default 60)
- Un T2-scout previo del mismo jugador en la MISMA ventana de transfer
- Tiempo: `T3_DELAY_WEEKS` adicionales (default 1)

**Persistencia entre ventanas**: T2/T3 expira al cerrar la ventana — la info se considera obsoleta. El jugador debe re-scout en la siguiente ventana.

### 3.2 Pool del mercado por ventana

Cuando `transfer_window_open` (ADR-015 event), el sistema genera el pool visible para el manager:

```
pool_size_total = FREE_AGENTS_VISIBLE
                + AI_PLAYERS_VISIBLE[scouting_network_level]
                + AI_PLAYERS_VISIBLE_FROM_OTHER_DIVISIONS[scouting_network_level]
```

| Source | Default per ventana |
|---|---|
| Free agents (jugadores sin contrato) | TODOS los del mundo (visibles a todos los managers) |
| AI players, división actual del manager | `30 + 5 × scouting_network_level` (L1=35, L5=55) |
| AI players, otras divisiones | `10 + 3 × scouting_network_level` (L1=13, L5=25) |

**Filtros de visibilidad**: el manager NO ve jugadores que:
- Están en clubs IA en `not_for_sale` status (~30% de cada club rotativo)
- Ya rechazaron una oferta del manager en esta ventana
- Son de divisiones por encima de la actual (D1 manager ve TODO; D2 manager NO ve D1)

### 3.3 Acciones del manager

1. **Browse pool**: ver lista paginada filtrada por position / age / ovr_band / transfer_value_band
2. **Scout player** (T1→T2): cuesta `SCOUT_COST_EUR_K` (default 5€K) + `SCOUT_DELAY_WEEKS` (1 semana)
3. **Deep scout** (T2→T3): cuesta `DEEP_SCOUT_COST_EUR_K` (default 15€K) + `T3_DELAY_WEEKS` (1 semana adicional); requiere Scout Director T2+
4. **Make offer** (free agent o AI club player):
   - Free agent: oferta directa de salario + duración → jugador acepta si `wage_offer >= ai_player_wage_expectation × (1 - DESPERATION_DISCOUNT_PCT)` AND `contract_duration ∈ [2, 4]`
   - AI club player: oferta de fee al club + wage al jugador → mecanismo §3.4
5. **Withdraw / re-bid**: una vez rechazada una oferta, manager puede re-bid en la misma ventana hasta `MAX_BIDS_PER_PLAYER` (default 3)

### 3.4 Auction con clubs IA

Cuando manager hace oferta por jugador de club IA:

```
ai_club_acceptance(fee_offered, player) -> { accepted: bool, counter_offer?: number }

  let expected_fee = player.transfer_value × ai_club.bargain_factor  // 0.85..1.20
  let ai_need_factor = compute_ai_need(ai_club, player.position)  // 0..1, 1 = ai_club desperately needs replacement

  if (fee_offered >= expected_fee × (1 + ai_need_factor × 0.3)):
    return { accepted: true }

  if (fee_offered >= expected_fee × 0.85):
    let counter = expected_fee × (1 + (1 - ai_need_factor) × 0.15)
    return { accepted: false, counter_offer: round(counter) }

  return { accepted: false }  // hard reject
```

**Reglas auction**:
- 1 ronda de counter-offer por bid. Manager acepta counter, rechaza, o re-bid (cuenta hacia MAX_BIDS_PER_PLAYER).
- Si manager acepta counter: transfer completes inmediatamente. Player moves to manager's club next tick.
- Si manager rechaza: oferta cierra. Player marked `not_for_sale_this_window` por ESE manager.

**Hidden valuation noise**: `bargain_factor` (0.85-1.20) es un random per-AI-club per-window, hidden from player — preserva imprecisión informativa (Pilar 1).

### 3.5 AI club rotation (resuelve OQ-PM-04)

Cada `transfer_window_open` event, cada club IA ejecuta un mini-loop de gestión:

```
for each ai_club:
  // 1. Sell decisions
  for each player on roster:
    if player.age > AGE_DECLINE_THRESHOLD AND ai_club.player_count > MIN_ROSTER_SIZE:
      mark for_sale (50% probability)
    if player.morale < LOW_MORALE_THRESHOLD AND random() < TRANSFER_REQUEST_PROB:
      mark for_sale (request)

  // 2. Buy decisions (within ai_club budget)
  let budget = ai_club.financial_balance × AI_TRANSFER_BUDGET_PCT  // ~10% by default
  let positions_needed = compute_squad_gaps(ai_club)
  for each position in positions_needed:
    let candidate = pick_random_in_band(division, position, ovr_band)
    if candidate.transfer_value < budget:
      execute_transfer(ai_club, candidate)
      budget -= candidate.transfer_value

  // 3. Youth promotion from world-generator pool
  if ai_club.player_count < TARGET_ROSTER_SIZE:
    promote_n_from_pool(division, 1)
```

Este loop corre **en server** cada vez que se abre ventana de transfer — antes de que el manager pueda actuar. El manager ve un mercado parcialmente "ya en movimiento".

### 3.6 Search filters (UI)

`/scouting` UI provee filtros sobre el pool:

| Filtro | Valores |
|---|---|
| Position | GK / DEF / MID / FWD / ALL |
| Age range | 16-20, 21-25, 26-30, 31+, ALL |
| OVR band (T1+) | 50-, 50-60, 60-70, 70-80, 80+, ALL |
| Transfer value band | <50€K, 50-200, 200-500, 500-1500, >1500, ALL |
| Free agent only | toggle |
| Already scouted | toggle |
| Contract expiring soon (≤6 weeks) | toggle |

**Saved searches**: manager puede guardar hasta 3 filtros nombrados (e.g., "DC joven barato") que persisten entre ventanas.

### 3.7 Scouting Director (staff-system role — extension, NO nuevo)

`scouting_director` **YA EXISTE** como uno de los 6 base staff roles en `staff-system.md` con T1/T2/T3 tiers (cost €K/sem: 0.50 / 1.00 / 2.00). Esta GDD **extiende** lo que sus tiers ENABLE, no crea role nuevo.

| Existing tier | Existing cost | v1.1 NEW capability (este GDD) |
|---|---|---|
| **T1** (default) | 0.50 €K/sem | C9a `K_scouting` baseline + mensajes T1 vagos (sin cambio) |
| **T2** | 1.00 €K/sem | Habilita **T2→T3 deep scout transitions** del market visibility (este GDD §3.1) |
| **T3** | 2.00 €K/sem | Halve `SCOUT_DELAY_WEEKS` (1→0, instant) + 20% discount en `SCOUT_COST_EUR_K` + visibility T3 |

Si manager NO tiene `scouting_director` contratado (despedido): `SCOUT_DELAY_WEEKS` normal; T3 visibility NO disponible; deep-scout returns `INSUFFICIENT_STAFF` error.

**Propagación pendiente a `staff-system.md`**: añadir nota en §Tiers que documenta los nuevos enables v1.1 del `scouting_director` (sin cambiar cost/perception scope).

---

## 4. Formulas

### F1: visibility_tier_of(player, manager_actions, window) → T0|T1|T2|T3

```
visibility_tier(p, m, w):
  if not p.in_pool(w):                       return T0
  if not m.has_scouted(p, w):                return T1
  if not m.has_deep_scouted(p, w):           return T2
  if not m.scout_director_tier >= 2:         return T2
  if (current_week - m.deep_scout_week(p, w)) < T3_DELAY_WEEKS:  return T2
  return T3
```

### F2: free_agent_acceptance(wage_offer, player)

```
free_agent_acceptance(wage_offer, p):
  let expected_wage = p.wage_expectation_eur_k_week
  let desperation = (current_week - p.weeks_unsigned) / 20
  let effective_threshold = expected_wage × (1 - DESPERATION_DISCOUNT_PCT × min(1, desperation))
  return wage_offer >= effective_threshold
```

**Variables:**

| Variable | Default | Description |
|---|---|---|
| `DESPERATION_DISCOUNT_PCT` | 0.25 | Discount máximo en wage expectation después de 20+ semanas sin firmar |
| `wage_expectation_eur_k_week` | computed from player.ovr | OVR/10 €K/semana baseline |

### F3: ai_club_acceptance (counter-offer auction)

Ver §3.4. Variables ya definidas inline.

| Variable | Default |
|---|---|
| `bargain_factor` | random per-club-per-window [0.85, 1.20] |
| `ai_need_factor` | computed: 0 if roster surplus at position, 1 if desperate (no backup) |
| `acceptance_threshold_top` | `expected_fee × (1 + need × 0.3)` |
| `acceptance_threshold_counter` | `expected_fee × 0.85` |
| `counter_offer` | `expected_fee × (1 + (1 - need) × 0.15)` |

### F4: scout_action_cost(action_type)

```
scout_action_cost('scout') = SCOUT_COST_EUR_K
scout_action_cost('deep_scout') = DEEP_SCOUT_COST_EUR_K

// Modifiers (apply at action time):
final_cost = base × (1 - scout_director_t3_discount if director_tier >= 3 else 0)
```

| Variable | Default (€K) |
|---|---|
| `SCOUT_COST_EUR_K` | 5 |
| `DEEP_SCOUT_COST_EUR_K` | 15 |
| `scout_director_t3_discount` | 0.20 (−20% for T3 director) |

### F5: pool_visibility_size(scouting_network_level, club_division)

```
pool_visibility = {
  free_agents: ALL_FREE_AGENTS_COUNT,
  ai_current_div: 30 + 5 × scouting_network_level,
  ai_other_div: 10 + 3 × scouting_network_level,
}
total_pool_visible = free_agents + ai_current_div + ai_other_div
```

**Output range:**
- L1: free_agents + 35 + 13 = +48 + free agents
- L5: free_agents + 55 + 25 = +80 + free agents

### F6: AI club mini-loop

Ver §3.5. Variables:

| Variable | Default | Description |
|---|---|---|
| `AGE_DECLINE_THRESHOLD` | 30 | Edad a partir de la cual jugadores pueden ser puestos a la venta |
| `LOW_MORALE_THRESHOLD` | 30 | Morale bajo el cual jugador puede pedir transfer |
| `TRANSFER_REQUEST_PROB` | 0.15 | Probabilidad de transfer request per week with low morale |
| `MIN_ROSTER_SIZE` | 18 | AI club no vende si caería por debajo |
| `TARGET_ROSTER_SIZE` | 22 | Promociona youth para llegar aquí |
| `AI_TRANSFER_BUDGET_PCT` | 0.10 | 10% del balance disponible para transfers per window |

---

## 5. Edge Cases

### 5.1 Manager intenta scout en window cerrada
HTTP 400 `WINDOW_CLOSED`. Acciones de scouting sólo disponibles durante `transfer_window_open`.

### 5.2 Player firma con otro club entre scout y bid
Manager hace bid → server detecta `player.current_club != original_club_at_scout_time` → HTTP 410 `PLAYER_GONE`. Cost del scout NO se refunda (la info se "perdió").

### 5.3 Manager scout sin balance
`balance < SCOUT_COST_EUR_K` → HTTP 402 `INSUFFICIENT_BALANCE`. Igual que stadium-upgrades §5.15 — UX warning si `balance - cost < CRITICAL_THRESHOLD`.

### 5.4 Deep scout sin Scout Director T2+
HTTP 403 `INSUFFICIENT_STAFF`. Mensaje UI: "Necesitas un Scout Director nivel 2+ para análisis detallado".

### 5.5 AI club mini-loop produce circular transfer
Player A → Club X (sells him next window to Club Y, who sells next to Club Z) — funny but ok. Cada loop step independent.

### 5.6 Free agent rejected, then re-offered
Free agent que rechazó wage_offer_1 puede re-evaluar en la próxima semana si `desperation` ha subido (F2). El manager re-bid es válido SI hay nuevo wage proposed.

### 5.7 Manager offer counter-rejected → manager cancels
Counter-offer cancela tras `COUNTER_OFFER_TIMEOUT_WEEKS` (default 1) sin respuesta. Player vuelve a estado pre-offer.

### 5.8 Manager intenta ver D1 player siendo D2
Player no aparece en el pool (§3.2). HTTP no aplica — simplemente no listado.

### 5.9 Scouting in progress cuando termina window
Scout que estaba en delay (1 week pendiente) **se completa igual**, pero info expira al cerrarse la window. Manager paga el coste pero recibe info sólo si la window sigue abierta cuando el delay termina. **Refund del 50% si el scout se completaba post-cierre** — UX kindness.

### 5.10 AI club rotation deja club con < MIN_ROSTER
World-generator promociona youth automáticamente al cierre del mini-loop si quedó por debajo (§3.5 step 3). Garantiza viabilidad.

### 5.11 Manager con MAX_BIDS exhausted en un jugador
Botón "Make offer" deshabilitado con tooltip "Has alcanzado el máximo de ofertas (3) para este jugador en esta ventana".

### 5.12 Saved search apunta a filtros inexistentes (post-patch)
Saved search se ignora gracefully si algún filtro deprecó. Manager puede re-crearla.

### 5.13 Cascade-engine C9a delay durante action
El sistema scouting-market lee `scouting_points` actual — si está en delay el bonus de scouting_network_level se aplica con el delay natural. No race condition.

### 5.14 Scout director despedido durante deep-scout pendiente
El deep-scout en delay se completa pero **resultado degradado a T2 normal** (no T3 info). UX message: "Tu Scout Director fue despedido — la info detallada no estaba lista a tiempo".

### 5.15 Bankrupt club ofrece deal absurdo (manager IA bug-bait)
Validation hard: si manager IA balance < BANKRUPTCY_FLOOR, NO compra. Sólo vende. Floor protection.

---

## 6. Dependencies

| Sistema | Direction | Hard/Soft | Interface |
|---|---|---|---|
| `player-management.md` | read + write | **HARD** | reads player pool, transfer_value, ovr; writes transfer events (player.current_club change) |
| `cascade-engine.md` | reads | **HARD** | reads `scouting_points` for visibility logic; reads chain C9a/C9b state |
| `economy.md` | read + write | **HARD** | reads balance for prereq; writes -fee on transfer, -scout_cost on action |
| `event-system.md` | reads | **HARD** | reads `transfer_window_open`/`transfer_window_close` events per ADR-015 |
| `manager-rpg.md` | reads modifier | **HARD** | reads `scouting_network_level` for F5 pool size + K_scouting multiplier |
| `staff-system.md` | reads modifier + new role | **HARD** | reads Scout Director skill; defines new T1/T2/T3 role per §3.7 |
| ADR-005 (WorldState) | extends | **HARD** | new fields: `scouted_players[]`, `saved_searches[]`, `pending_offers[]`, `pending_scouts[]` |
| ADR-008 (World Clock) | reads | **HARD** | week-tick governs scout delay countdown + AI club mini-loop on window open |
| ADR-016 (Player Lifecycle) | reads + extends | **HARD** | this GDD resolves OQ-PM-03 + OQ-PM-04; player.transfer_value formula from PM §F6 |
| `hud-ui.md` | UI consumer | SOFT | `/scouting` route consumes pool + filters + offers state |
| `trophies-history.md` | provides input | SOFT | legend transfers (F3 in trophies-history) consume completed transfers history |
| `narrative-ai.md` (v1.2+) | reads | SOFT | will generate "scout report" narrative text v1.2+ |

### Cross-system propagation requirements (Fase 1.3)

| Target GDD | Required change |
|---|---|
| `player-management.md` | Resolve OQ-PM-03 → "scouting-market.md owns market presentation"; Resolve OQ-PM-04 → "AI club rotation handled by scouting-market.md §3.5"; §7 Mercado expanded by reference |
| `staff-system.md` | Add Scout Director role (T1/T2/T3) with skill stat + cost; staff messages templated for scout reports |
| `manager-rpg.md` | Cross-ref §scouting_network_level: F5 pool size formula owner shifts to this GDD; skill effect unchanged |
| `cascade-engine.md` | Add reader entry: scouting-market consumes scouting_points |
| `event-system.md` | Cross-ref ADR-015 transfer_window variants: scouting-market is the system that consumes these |
| `economy.md` | Add reader entry: scouting-market debit scout_cost + transfer_fee; classification = `transfer_market_operational` |
| `hud-ui.md` | Sidebar add "🔍 Mercado" or "🕵 Scouting" entry; new `/scouting` route definition |
| `trophies-history.md` | Already references legend transfers — verify F3 alignment with new transfer flow |

---

## 7. Tuning Knobs

```typescript
// F1 — Visibility tiers
SCOUT_DELAY_WEEKS = 1
T3_DELAY_WEEKS = 1
T3_SCOUT_DIRECTOR_THRESHOLD = 60

// F2 — Free agent acceptance
DESPERATION_DISCOUNT_PCT = 0.25
DESPERATION_WEEKS_FULL_DISCOUNT = 20

// F3 — AI club auction
AI_BARGAIN_FACTOR_MIN = 0.85
AI_BARGAIN_FACTOR_MAX = 1.20
AI_NEED_PREMIUM = 0.30      // 30% extra above expected if need_factor=1
AI_COUNTER_OFFER_MARKUP = 0.15
COUNTER_OFFER_TIMEOUT_WEEKS = 1

// F4 — Scout costs
SCOUT_COST_EUR_K = 5
DEEP_SCOUT_COST_EUR_K = 15
SCOUT_DIRECTOR_T3_COST_DISCOUNT = 0.20

// F5 — Pool size
FREE_AGENTS_VISIBLE = "ALL"  // todos los del mundo
AI_PLAYERS_CURRENT_DIV_BASE = 30
AI_PLAYERS_CURRENT_DIV_PER_LEVEL = 5
AI_PLAYERS_OTHER_DIV_BASE = 10
AI_PLAYERS_OTHER_DIV_PER_LEVEL = 3

// F6 — AI club rotation
AGE_DECLINE_THRESHOLD = 30
LOW_MORALE_THRESHOLD = 30
TRANSFER_REQUEST_PROB = 0.15
MIN_ROSTER_SIZE = 18
TARGET_ROSTER_SIZE = 22
AI_TRANSFER_BUDGET_PCT = 0.10
FOR_SALE_RATIO_AGE_DECLINE = 0.50

// Other
MAX_BIDS_PER_PLAYER = 3
COUNTER_OFFER_TIMEOUT_WEEKS = 1
NOT_FOR_SALE_PROB_PER_CLUB = 0.30
```

**Safe ranges (most sensitive):**
- `SCOUT_COST_EUR_K` ∈ [2, 15] — fuera trivializa scouting o bloquea D2 cash
- `AI_TRANSFER_BUDGET_PCT` ∈ [0.05, 0.20] — fuera distorsiona AI club market activity
- `T3_SCOUT_DIRECTOR_THRESHOLD` ∈ [50, 80] — calibra dificultad de acceso a T3

---

## 8. Acceptance Criteria

| ID | Criterion | Test type |
|---|---|---|
| AC-SCM-01 | F1: untouched player (no scout) returns T0 fuera de window, T1 dentro | Unit |
| AC-SCM-02 | F1: scouted player returns T2 si scout delay completado | Unit |
| AC-SCM-03 | F1: deep-scouted con Scout Director T2+ returns T3 tras delay | Unit |
| AC-SCM-04 | F1: deep-scout sin Scout Director T2+ stays at T2 | Unit |
| AC-SCM-05 | F1: T2/T3 info expira al cerrarse window | Integration |
| AC-SCM-06 | POST `/api/scouting/scout` con balance < cost → 402 | Integration |
| AC-SCM-07 | POST `/api/scouting/deep-scout` sin Scout Director T2+ → 403 | Integration |
| AC-SCM-08 | F2: free agent con expected_wage=10, desperation_factor=1 → acepta wage=7.5 (10×0.75) | Unit |
| AC-SCM-09 | F3: AI club acepta si fee >= expected × (1 + need × 0.3) | Unit |
| AC-SCM-10 | F3: AI club counter-offer si fee >= expected × 0.85 | Unit |
| AC-SCM-11 | F3: AI club hard reject si fee < expected × 0.85 | Unit |
| AC-SCM-12 | MAX_BIDS_PER_PLAYER respected — 4ta oferta a mismo jugador → 409 | Integration |
| AC-SCM-13 | F5: scouting_network_level=1 produces pool with 35 current_div + 13 other_div = 48 AI players | Unit |
| AC-SCM-14 | F5: scouting_network_level=5 produces 55 + 25 = 80 AI players | Unit |
| AC-SCM-15 | F6: AI club mini-loop runs on transfer_window_open event | Integration |
| AC-SCM-16 | F6: AI club with player.age > 30 has 50% prob marked for_sale | Property test |
| AC-SCM-17 | F6: AI club doesn't sell below MIN_ROSTER_SIZE | Property test |
| AC-SCM-18 | F6: AI club balance after mini-loop ≥ 0 (no bankruptcy) | Integration |
| AC-SCM-19 | Transfer execution: player.current_club changes; balance debited; cascade event emitted | Integration |
| AC-SCM-20 | Scout delay: scouted player at week N → T2 info available at week N+1 | Integration |
| AC-SCM-21 | Scout in_progress when window closes → refund 50% of cost | Integration |
| AC-SCM-22 | Determinismo: same world seed → same AI club mini-loop output | Property test (seed-based) |
| AC-SCM-23 | Player sold to club X cannot be re-scouted by previous manager within same window | Integration |
| AC-SCM-24 | UI `/scouting` filters by position / age / ovr_band / value_band | UI test |
| AC-SCM-25 | UI saved searches persist max 3 named filters | Integration |
| AC-SCM-26 | UI shows correct tier info (T0/T1/T2/T3) per player | UI test |
| AC-SCM-27 | UI free agent shows "Sin contrato — wage expectation" instead of "Club X" | UI test |
| AC-SCM-28 | Performance: `/scouting` page-load <800ms with 100 visible players | Perf |
| AC-SCM-29 | A11y: filters keyboard-navigable, screen reader announces tier info | A11y |
| AC-SCM-30 | Race: simultaneous bid by 2 managers (future MMO) — server-authoritative, one wins | Integration (foundation) |

---

## 9. Open Questions

| ID | Question | Owner |
|---|---|---|
| OQ-SCM-1 | ¿Cuántos saved searches (3) son suficientes, o el manager los acaba sustituyendo continuamente? | playtest |
| OQ-SCM-2 | ¿La info T2 muestra "morale_band" (low/mid/high) o numérica? Actual = band (más narrativa). | game-designer |
| OQ-SCM-3 | ¿Counter-offer flow requiere confirmación o auto-aplica? Actual = requiere confirm explícita. | ux-designer |
| OQ-SCM-4 | ¿Hay anuncio público del transfer al completarse, o silencioso? Pilar 2 sugiere anuncio (banner en `/city` museum). | narrative-director |
| OQ-SCM-5 | ¿`scouting_points` afecta también el coste del scout (más eficiente = menor cost)? Actual = NO. | systems-designer |
| OQ-SCM-6 | ¿Manager IA en otras divisiones tiene scouting limits o ve todo? Actual: AI clubs no scout — directamente compran del pool con valoración modelada. | game-designer |
| OQ-SCM-7 | ¿Hay agentes de jugadores como capa intermedia? Actual: NO, direct manager↔player. Considerar v1.2+. | game-designer |
| OQ-SCM-8 | ¿"Free agents" del player-management.md §7 incluye también ex-cantera del manager o sólo otros clubs? | player-management |

### Resolved (durante autonomous draft 2026-05-24)

- ✅ **OQ-PM-03** (player-management.md): `scouting-market.md` owns market presentation. Visibility tiers (T0-T3) controlled by scouting_network + Scout Director.
- ✅ **OQ-PM-04** (player-management.md): AI club rotation implemented per §3.5 — clubs IA buy/sell/promote youth each window.
- ✅ **Scope split**: scouting-market reads cascade-engine scouting nodes; manager-rpg owns the skill; staff-system owns the Scout Director role. No ownership conflict.

---

## 10. Decision gate al cierre (v1.1 Sprint 24-25)

Scouting & Transfer Market es PASS si:

- [ ] Los 4 tiers de visibilidad (T0-T3) son distinguibles a primera vista
- [ ] Counter-offer auction se siente como "negociación", no random (playtest gate)
- [ ] AI club rotation produce mercado vivo (>5 transfers per window observados en playtest 5 temporadas)
- [ ] No exploit ovious: gastar mucho en scout no rompe la economy
- [ ] Performance: `/scouting` page-load <800ms con 100 jugadores

---

## 11. Cross-references

- `design/gdd/player-management.md` §7 Mercado — superseded en presentación por esta GDD; player-management mantiene transfer_value formulas + lifecycle
- `design/gdd/cascade-engine.md` — chain C9a (scouting_budget→points) + C9b (points→squad_available) sin cambios; este GDD consume `scouting_points` para tier de visibilidad
- `design/gdd/manager-rpg.md` — `scouting_network_level` skill sin cambios; este GDD lo lee para pool size F5
- `design/gdd/staff-system.md` — añadir Scout Director role (T1/T2/T3)
- `design/gdd/event-system.md` — ADR-015 `transfer_window_open`/`close` events son el driver
- `design/gdd/trophies-history.md` — legend transfers consume completed transfer events
- `design/gdd/narrative-ai.md` (v1.2+) — scout report text generation reemplaza templates v1.1
- ADR-016 (Player Lifecycle) — autoritativo en player.transfer_value formulas + age curves
- ADR-015 (Special Event Decision Schema) — transfer window variants definidos aquí
- ADR-005 (WorldState) — nuevos campos: `scouted_players[]`, `saved_searches[]`, `pending_offers[]`, `pending_scouts[]`
