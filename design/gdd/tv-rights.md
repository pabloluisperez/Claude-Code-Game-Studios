# Derechos de Televisión

> **Status**: Approved (R7 2026-05-20)
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-20
> **Implements Pillar**: P1 (Tinkering Beats Optimization) · P3 (You Grow Like Your Club) · P4 (Calm Is The Tempo)
> **Extends**: economy.md §F2 (reemplaza la fórmula plana de TV rights)

## Overview

Los derechos de televisión son el contrato anual que determina qué canal emite los partidos del club y qué ingreso semanal fijo recibe por ello. Al inicio de cada temporada, uno o más canales hacen ofertas basadas en la división del club y la reputación del manager: un canal local siempre aparece, pero canales regionales y nacionales solo llaman si la trayectoria deportiva o el perfil del técnico lo justifican. El manager elige uno — o rechaza todos y queda sin contrato TV esa temporada. El canal firmado paga una cantidad semanal fija durante las 38 jornadas de liga. Al siguiente season-start, el contrato expira y se abre una nueva subasta: ascender de categoría o construir reputación desbloquea mejores canales y ofertas más altas. Descender o quedar sin contrato supone perder ese ingreso recurrente. El sistema reemplaza los derechos de TV automáticos de `economy.md §F2` y convierte un ingreso pasivo en una decisión activa de posicionamiento del club: NACIONAL maximiza ingresos pero acumula escrutinio mediático agresivamente, LOCAL es modesto pero reduce activamente la exposición pública del manager. REGIONAL y NACIONAL ofrecen adicionalmente opciones multi-año (2 y 3 temporadas respectivamente) con tarifa bonificada, a cambio de comprometer el posicionamiento por varias temporadas sin poder rotar a LOCAL hasta que el contrato expire o se cancele.

## Player Fantasy

El jugador siente que su relación con el mundo madura. En la primera temporada solo le llega un sobre — del canal local de su comarca, una propuesta pequeña, la única que hace cola. El jugador puede firmarla o rechazarla: el dinero no es mucho, pero es el primer contrato. Cuatro temporadas después, abre el inbox y encuentra tres sobres en lugar de uno. No hay popup que diga "has progresado". Solo están los sobres nuevos, y el segundo de pausa antes de abrir el primero: ¿qué trae? ¿qué exposición conlleva? ¿vale la pena el escrutinio que viene con firmar en grande si este año ya arrastra corrupción de otras decisiones?

En algún momento el jugador firma un contrato de **2 o 3 temporadas** — porque su relación con un canal ya no necesita renegociarse cada año. El ritual del sobre no desaparece: cambia de naturaleza. La firma de largo plazo es **un pacto sellado**, el momento en que el manager y el canal dejan de ser desconocidos y pasan a ser socios. Los años intermedios del contrato no llegan con sobre porque no necesitan llegar: la decisión ya se tomó. La narrativa de crecimiento ya no es solo "cuántos sobres llegan", es también "qué grado de compromiso tengo establecido con el mundo".

La fantasía es **descubrir cómo evoluciona tu relación con el medio** — desde el sobre tímido del canal local hasta el pacto plurianual con un canal nacional que confía en tu trayectoria. Cada estadio del crecimiento tiene su propia textura: el ritual anual del sobre cuando aún se construye reputación, y el pacto sellado cuando la reputación está establecida. Los canales se renuevan con nombres frescos cuando hay subasta; la narrativa de crecimiento es el arco completo de la relación, no solo el conteo de sobres anuales.

**Pilar principal**: P3 — You Grow Like Your Club (la reputación + la división se reflejan en qué canales te contactan, y eventualmente en si esos canales te ofrecen contratos plurianuales).
**Pilar secundario**: P1 — la elección no es trivial: LOCAL reduce corrupción pero paga poco; REGIONAL es equilibrio; NACIONAL maximiza ingresos pero puede autoinvalidarse con cualquier nivel de corrupción ≥ 3. Multi-año añade una segunda capa de trade-off: bonus económico (+5% / +10%) a cambio de comprometer el posicionamiento sin posibilidad de rotar a LOCAL hasta expiración o cancelación. Ningún tier ni duración es siempre la elección óptima.
**Pilar terciario**: P4 — las ofertas no caducan en 24h, no hay timer. La calma es una propiedad del sistema, no un objetivo declarado.

## Detailed Rules

### Core Rules

1. Los derechos de televisión se contratan **una vez por temporada**, durante la pretemporada (semana 0), mediante un evento de tipo `STOP` que bloquea el advance hasta su resolución. El jugador no puede iniciar la temporada sin haber resuelto la subasta.

2. Al inicio de cada temporada el sistema genera las ofertas disponibles según los criterios de desbloqueo del club:

| Tier | Label | Condición de acceso | Bloqueado si |
|---|---|---|---|
| `LOCAL` | Canal local | Siempre disponible | — |
| `REGIONAL` | Canal regional | D2 posición anterior ≤ 10 **OR** `manager_reputation ≥ 2` **OR** `D1 actual` | `corruption_exposure ≥ 60` |
| `NACIONAL` | Canal nacional | D1 actual **OR** `manager_reputation ≥ 4` | `corruption_exposure ≥ 60` |

Primera temporada (`prev_season_final_position = null`): **solo LOCAL disponible** — sin proxy, sin REGIONAL ni NACIONAL en T1. La primera subasta entrega exactamente un sobre. REGIONAL y NACIONAL se desbloquean a partir de la segunda temporada si se cumplen las condiciones.

**Restricción por escrutinio mediático**: si `corruption_exposure ≥ TV_SCANDAL_THRESHOLD (60)` al inicio de temporada, los canales REGIONAL y NACIONAL no extienden oferta — solo LOCAL aparece en la subasta, independientemente de la posición o reputación del manager. La restricción se re-evalúa en cada `season_start`; si la corrupción baja de 60 antes del siguiente inicio, los tiers superiores vuelven a estar disponibles.

3. El jugador puede **elegir exactamente una oferta** o **rechazar todas**. Rechazar todas deja `tv_contract_status = NONE` durante la temporada (`tv_weekly_rate_eur_k = 0`) y otorga `fan_loyalty += 10` como reconocimiento de la postura anti-comercial del manager (los aficionados valoran que el club no venda su imagen mediática). En la siguiente `tv_auction`, el sistema genera una nueva subasta normalmente. Un canal por tier en MVP (no hay múltiples canales del mismo tier).

4. El contrato firmado genera un **ingreso semanal fijo** durante las 38 jornadas de liga. El valor (`tv_weekly_rate_eur_k`) se calcula en el momento de la firma con `division_at_signing` y no cambia mid-season — incluyendo si el club asciende o desciende de división durante la temporada en curso o en temporadas posteriores dentro de un contrato multi-año.

5. Los contratos anuales (`duration_seasons = 1`) **expiran automáticamente** al final de la temporada (semana 38) y se abre nueva subasta sin auto-renovación. Los contratos multi-año **no expiran** al final de cada temporada — se renuevan automáticamente hasta completar `duration_seasons`: no se genera `tv_auction` mientras `season_in_contract < duration_seasons`. El contrato expira normalmente en la última temporada (`season_in_contract = duration_seasons`).

5b. REGIONAL puede ofertarse como **1 temporada** (tarifa base × 1.00) o **2 temporadas** (+5%, tarifa × 1.05). NACIONAL puede ofertarse como **1 temporada** (tarifa base × 1.00) o **3 temporadas** (+10%, tarifa × 1.10). LOCAL es siempre anual. El jugador elige la duración en el momento de la firma en la `tv_auction`. El contrato firmado almacena `duration_seasons ∈ {1, 2, 3}` y `season_in_contract = 1` al inicio. En cada rollover automático (semana 38 de una temporada no-final), `season_in_contract` se incrementa en 1 sin intervención del jugador.

**⚠️ Riesgo de NACIONAL multi-año**: el acumulado NACIONAL es +57.0 por temporada completa. Si `corruption_exposure > 0` al inicio, la Temporada 2 del contrato NACIONAL 3yr comienza en `corruption_start + 57` — que supera el TV_SCANDAL_THRESHOLD (60) para cualquier `corruption_start > 3.0`, cancelando el contrato en las primeras semanas de T2. El bonus (+10%) no compensa la pérdida de ingresos de las temporadas 2 y 3 si el contrato se cancela. Ver F-TV3 cliff exacto. La UI debe mostrar un indicador de **Riesgo Alto** en la oferta NACIONAL 3yr cuando `corruption_exposure > 0` al inicio de temporada (ver UI Requirements).

**⚠️ Riesgo de REGIONAL 2yr**: el acumulado REGIONAL es +19.0 por temporada completa. Con `corruption_exposure ≥ 22` al firmar, la Temporada 2 del contrato comienza en `corruption_start + 19 ≥ 41` y llega a `corruption_start + 38 ≥ 60` — cancelación durante T2. El cliff exacto: `corruption_start = 22` → cancelación en semana 38 de T2 (sin midseason offer; semana 38 > 35); `corruption_start = 23.5` → cancelación en semana 35 de T2 (con midseason offer). Para `22 ≤ corruption_start < 23.5`, la cancelación ocurre silenciosamente al final de la temporada sin posibilidad de reemplazo. La UI debe mostrar un indicador de **Riesgo** en la oferta REGIONAL 2yr cuando `corruption_exposure ≥ 22` al inicio de temporada (ver UI Requirements). La trampa de ascenso (tarifa bloqueada en `division_at_signing`) se aplica además de este riesgo de corrupción (ver Edge Cases y AC-TV-44).

6. Cuando `corruption_exposure ≥ TV_SCANDAL_THRESHOLD (60)` después de aplicar F-TV3 en el tick semanal, el canal **cancela el contrato activo** inmediatamente. Este threshold es distinto al global de escándalo (80) — los canales retiran el contrato por escrutinio mediático antes de que el escándalo sea público. Si la cancelación ocurre con al menos `MIDSEASON_OFFER_MIN_WEEKS_REMAINING (3)` semanas restantes (es decir, semana ≤ 35), el sistema generará un evento `tv_midseason_offer` (STOP) con una oferta de reemplazo al 70% para el **tier inmediatamente inferior** al cancelado (ver F-TV2). La cancelación anula las temporadas restantes de un contrato multi-año — el próximo `season_start` genera subasta normal independientemente de `duration_seasons` original. Si la cancelación ocurre en semana > 35 (menos de 3 semanas restantes), no se genera oferta de reemplazo y el club finaliza la temporada sin ingresos TV.

7. El ingreso TV en el cashflow semanal reemplaza la fórmula constante de `economy.md §F2`:
   - Si `tv_contract_status === "ACTIVE"`: `tv_weekly_eur_k = contract.weekly_rate_eur_k`
   - Si no: `tv_weekly_eur_k = 0`

8. Cada semana que el contrato está `ACTIVE`, el tick aplica un **delta de `corruption_exposure`** según el tier firmado (ver F-TV3). LOCAL **reduce** la corrupción del manager (-0.5/sem — el canal local tiene menos escrutinio; el valor se clampea en 0: `corruption_exposure` nunca cae por debajo de 0). REGIONAL y NACIONAL la incrementan (+0.5/sem y +1.5/sem respectivamente). El `TV_SCANDAL_THRESHOLD` específico (60) es inferior al threshold global de escándalo (80): los canales retiran el contrato antes de que el escándalo sea público. Firmar NACIONAL es una apuesta genuina: con corrupción ≥ 3.0 al inicio de temporada, el cruce del threshold ocurrirá durante las 38 semanas (cliff exacto en `corruption = 3.0`: cancelación en semana 38; con `corruption < 3.0` NACIONAL sobrevive toda la temporada).

9. **Rechazar todas las ofertas modifica `fan_loyalty` con efecto económico sobre asistencia** (ver F-TV4). El +10 fan_loyalty del rechazo se traduce en un multiplicador de `fan_attendance` de +5% durante toda la temporada hasta el siguiente reset estacional. Es la mecánica que convierte el rechazo en decisión P1 calculable: el manager intercambia ingreso TV directo (20–201 €K/año según tier disponible) por un boost de asistencia que recompensa clubs con base de aficionados ya leal y aforos cercanos al lleno.

### Cuándo elegir cada tier

LOCAL es el **instrumento de gestión de riesgo a largo plazo**, no la opción de clubs pequeños. Los tres casos donde LOCAL es la elección racional sobre REGIONAL:

1. **Recuperación activa**: el manager tiene `corruption_exposure ≥ 41`. Solo LOCAL garantiza reducción real antes del próximo `season_start`; REGIONAL seguiría acumulando (+19/temporada) y podría cruzar el threshold en 1–2 temporadas. Una temporada de LOCAL (−19.0) puede devolver al manager a rangos donde REGIONAL/NACIONAL vuelven a estar disponibles.
2. **Preparación para NACIONAL**: el manager planea firmar NACIONAL la próxima temporada y necesita `corruption_exposure < 3.0` al inicio. Si su corrupción actual es, por ejemplo, 5.0, REGIONAL la llevaría a 24.0 al final del año — aún peligrosa. LOCAL la reduce a máximo `max(0, 5.0 − 19.0) = 0`. LOCAL es el único camino de reducción activa.
3. **Posicionamiento anti-comercial con aforo elevado**: el rechazo total (NONE, no firmar LOCAL) otorga fan_loyalty +10 — la decisión óptima cuando `fan_attendance × ticket_price × home_matches ≥ 400 €K/año` y el +5% de attendance compensa los 20 €K de TV perdidos.

Para managers con `corruption_exposure ≈ 0` y sin planes de NACIONAL el año siguiente, REGIONAL es la elección económicamente superior (3.35× ingreso en D2). LOCAL no es una opción "default" — es una opción especializada de gestión de riesgo multi-temporada.

### Tick Order (Weekly Tick)

Cada tick semanal procesa las acciones de TV y cascade-engine en este orden canónico:

1. Capturar `prev_corruption_tv = corruption_exposure` (antes del delta TV)
2. **F-TV3 paso A — delta TV**: `corruption_exposure = max(0, prev_corruption_tv + CORRUPTION_DELTA_PER_WEEK[tier])` — solo si `tv_contract_status = ACTIVE`
3. **F-TV3 paso B — threshold TV-only**: evaluar `threshold_crossed_upward_tv = (prev_corruption_tv < TV_SCANDAL_THRESHOLD) AND (corruption_exposure >= TV_SCANDAL_THRESHOLD)` — solo si `tv_contract_status = ACTIVE`
4. Si `threshold_crossed_upward_tv = true`: `tv_contract_status = CANCELLED`; anular temporadas restantes si multi-año; generar `tv_midseason_offer` (tier = TIER_BELOW[cancelled_tier], semana ≤ 35)
5. Calcular revenue TV para el cashflow: `tv_weekly_eur_k = contract.weekly_rate_eur_k` si `ACTIVE`, `0` en cualquier otro estado
6. **Cascade-engine paso A — inyecciones externas**: cascade-engine procesa eventos externos al sistema TV (sobornos, eventos de prensa, etc.) que también modifican `corruption_exposure`. Capturar `prev_corruption_cascade = corruption_exposure` (valor tras paso 2). Aplicar las inyecciones: `corruption_exposure = Math.min(CORRUPTION_MAX, Math.max(0, prev_corruption_cascade + external_delta))`. **Invariante de precisión**: `external_delta` debe estar truncado a `numeric(5,2)` (`.toFixed(2)`) antes de este cómputo — igual que el delta de F-TV3 en paso 2. Si el cascade-engine provee un float sin truncar, la operación puede producir un valor en memoria (e.g., `59.9999...`) que difiere del valor que la DB escribiría (`60.00`), causando un false-negative permanente en el predicado del paso 7. El implementador debe garantizar esta invariante en el tick pipeline.
7. **Cascade-engine paso B — threshold post-cascade**: evaluar `threshold_crossed_upward_cascade = (prev_corruption_cascade < TV_SCANDAL_THRESHOLD) AND (corruption_exposure >= TV_SCANDAL_THRESHOLD)` — solo si `tv_contract_status = ACTIVE` (es decir, no cancelado ya en paso 4)
8. Si `threshold_crossed_upward_cascade = true`: aplicar la misma rama de cancelación que el paso 4 (`status = CANCELLED`, anular multi-año, generar `tv_midseason_offer` si semana ≤ 35). El revenue TV ya está calculado en paso 5; si el contrato estaba ACTIVE durante el paso 5, ese revenue se preserva (la cancelación cascade afecta solo a ticks futuros).

**La semana de cancelación por F-TV3 (paso 4) genera revenue = 0** — el check de cancelación ocurre antes del cálculo de revenue en el mismo tick. **La cancelación por cascade-engine (paso 8) NO retroactiva el revenue** — el ingreso del paso 5 se computa antes de la inyección externa, por lo que la semana de cancelación cascade sí cobra (el corte aplica desde el siguiente tick).

**Prioridad semana 38**: el tick semanal completo (pasos 1–8) ejecuta antes de que `season_end` procese la transición ACTIVE→EXPIRED. Si el threshold TV se cruza en el tick de semana 38 (por F-TV3 o por cascade-engine), el contrato transiciona a CANCELLED (no EXPIRED), la cancelación sigue la rama `current_week = 38 > 35` (sin oferta de reemplazo), y a continuación `season_end` trata el estado CANCELLED como no-op. En `season_start` de la temporada siguiente, CANCELLED→NONE aplica normalmente.

**Almacenamiento de `corruption_exposure` en DB**: `numeric(5,2)` (rango 0.00–999.99, 2 decimales). El predicado `threshold_crossed_upward` opera sobre valores con precisión fija; no hay drift IEEE 754 entre ticks porque cada paso (2, 6) hace round-trip a DB con la columna de precisión fija. Implementación: `corruption_exposure` se lee/escribe siempre con `.toFixed(2)` antes de evaluar cualquier comparación con threshold.

### States and Transitions

| Estado | Revenue/sem | Descripción |
|---|---|---|
| `NONE` | 0 | Antes de subasta o tras reset de temporada |
| `ACTIVE` | `weekly_rate_eur_k` | Contrato vigente — ingreso semanal fijo |
| `CANCELLED` | 0 | Cancelado por escrutinio mediático; slot disponible para reemplazo mid-season |
| `EXPIRED` | 0 | Semana 38 completada; estado transitorio antes del reset |

**Transiciones:**

**Campos del contrato:** `tier`, `duration_seasons ∈ {1,2,3}`, `season_in_contract ∈ [1..duration_seasons]`, `weekly_rate_eur_k`, `division_at_signing`.

| Desde | Hacia | Trigger |
|---|---|---|
| `NONE` | `ACTIVE` | Jugador firma oferta en `tv_auction` (`season_in_contract = 1`) |
| `NONE` | `NONE` | Jugador rechaza todas las ofertas en `tv_auction` (intencional — evento `consumed=true`, estado sin cambio) |
| `ACTIVE` | `ACTIVE` | Semana 38 (`season_end`) con `season_in_contract < duration_seasons` — rollover automático: `season_in_contract += 1`, no se genera `tv_auction` |
| `ACTIVE` | `EXPIRED` | Semana 38 (`season_end`) con `season_in_contract = duration_seasons` |
| `ACTIVE` | `CANCELLED` | `threshold_crossed_upward = true` en tick semanal (ver F-TV3) — anula temporadas restantes si multi-año |
| `CANCELLED` | `ACTIVE` | Jugador firma `tv_midseason_offer` (solo si semana ≤ 35; nuevo contrato tiene `duration_seasons = 1`) |
| `CANCELLED` | `CANCELLED` | Jugador rechaza `tv_midseason_offer` (mid-season) — estado sin cambio, `fan_loyalty += 10`, evento `consumed=true`, advance desbloqueado (ver AC-TV-24) |
| `CANCELLED` | `CANCELLED` | `season_end` (semana 38) — no-op; el reset ocurre en `season_start` |
| `CANCELLED` | `NONE` | `season_start` reset de temporada (el estado CANCELLED no se propaga a la siguiente temporada) |
| `EXPIRED` | `NONE` | `season_start` reset de temporada |

### Interactions with Other Systems

| Sistema | Dirección | Datos |
|---|---|---|
| `economy.md §F2` | OUT | Reemplaza la constante plana; lee `contract.weekly_rate_eur_k` en el cashflow semanal |
| `event-system.md` | IN | Genera `tv_auction` (STOP, season-start) y `tv_midseason_offer` (STOP, condicional) |
| `manager-rpg.md` | IN | `manager_reputation` como criterio de desbloqueo de tiers; firma REGIONAL (+10 XP) / NACIONAL (+25 XP) a `financial_acumen` |
| `league-system.md` | IN — ⚠️ BREAKING CHANGE | `current_division` y `prev_season_final_position` para evaluar condiciones de desbloqueo. `§F6` y `getTVRightsWeekly()` deben deprecarse al implementar. |
| `cascade-engine.md` | Bidireccional | OUT: `corruption_exposure += CORRUPTION_DELTA_PER_WEEK[tier]` cada tick activo (F-TV3); LOCAL aplica delta negativo (-0.5/sem). IN: nuevo threshold node `TV_SCANDAL_THRESHOLD = 60` (distinto del threshold global 80) cancela el contrato activo cuando se cruza al alza. Cascade-engine inyecta corruption externa post-F-TV3 (paso 6 del Tick Order); re-eval threshold en paso 7. |

## Formulas

### F-TV1: Tarifa semanal del contrato

`tv_weekly_rate_eur_k = TV_BASE_EUR_K[tier] × DIVISION_MULTIPLIER[division_at_signing] × DURATION_MULTIPLIER[duration_seasons]`

**Variables:**

| Variable | Símbolo | Tipo | Rango | Descripción |
|---|---|---|---|---|
| Tier del canal | `tier` | enum | LOCAL/REGIONAL/NACIONAL | Tier del canal elegido en la subasta |
| Base semanal del tier | `TV_BASE_EUR_K[tier]` | int (centavos) | 53–530 ¢K | Constante por tier en centavos — ver tabla de calibración |
| Multiplicador de división | `DIVISION_MULTIPLIER[div]` | float | 1.0–1.35 | D2=1.0, D1=1.35 (firmar en D1 vale ~35% más) |
| Multiplicador de duración | `DURATION_MULTIPLIER[n]` | float | 1.00–1.10 | 1 año=1.00, 2 años=1.05 (+5%), 3 años=1.10 (+10%) |
| Resultado | `tv_weekly_rate_eur_k` | float | 0.53–7.87 €K/sem | Ingreso semanal fijo; bloqueado para todas las temporadas del contrato |

**Implementación de la tarifa (fórmula canónica — sin drift IEEE 754):** Almacenar `TV_BASE_CENTS` como enteros en centavos (53, 175, 530). `DIVISION_MULTIPLIER_CENTS[D2] = 100`, `DIVISION_MULTIPLIER_CENTS[D1] = 135`. `DURATION_MULTIPLIER_CENTS[1] = 100`, `DURATION_MULTIPLIER_CENTS[2] = 105`, `DURATION_MULTIPLIER_CENTS[3] = 110`.

```
tv_weekly_rate_eur_k = Math.round(TV_BASE_CENTS[tier] * DIVISION_MULTIPLIER_CENTS[div] * DURATION_MULTIPLIER_CENTS[duration] / 10000) / 100
```

**Tabla de calibración — contratos anuales (1 año, DURATION_MULTIPLIER_CENTS = 100):**

| Tier | `TV_BASE_CENTS` | D2 rate/sem | D2 anual (~×38) | D1 rate/sem | D1 anual (~×38) |
|---|---|---|---|---|---|
| `LOCAL` | 53 | 0.53 €K | ~20 €K | 0.72 €K | ~27 €K |
| `REGIONAL` | 175 | 1.75 €K | ~67 €K | 2.36 €K | ~90 €K |
| `NACIONAL` | 530 | 5.30 €K | ~201 €K | 7.16 €K | ~272 €K |

> LOCAL D2 = 0.53 €K/sem conserva exactamente los 20 €K/año registrados en `entities.yaml` (tv_rights_annual_d2_eur_k). NACIONAL D1 ≈ 272 €K/año ≈ el valor registrado de 270 €K (diferencia de redondeo).

**Tabla de calibración — contratos multi-año (solo REGIONAL y NACIONAL):**

| Tier | Duración | `DURATION_MULTIPLIER_CENTS` | D2 rate/sem | D1 rate/sem |
|---|---|---|---|---|
| `REGIONAL` | 2 años | 105 | 1.84 €K | 2.48 €K |
| `NACIONAL` | 3 años | 110 | 5.83 €K | 7.87 €K |

**Verificación aritmética (casos 1-año — resultados preservados):**

| Tier | Div | Cálculo | Resultado |
|---|---|---|---|
| LOCAL | D2 | Math.round(53×100×100/10000)/100 = Math.round(53)/100 | **0.53 €K** |
| LOCAL | D1 | Math.round(53×135×100/10000)/100 = Math.round(71.55)/100 = 72/100 | **0.72 €K** |
| REGIONAL | D2 | Math.round(175×100×100/10000)/100 = Math.round(175)/100 | **1.75 €K** |
| REGIONAL | D1 | Math.round(175×135×100/10000)/100 = Math.round(236.25)/100 = 236/100 | **2.36 €K** |
| NACIONAL | D2 | Math.round(530×100×100/10000)/100 = Math.round(530)/100 | **5.30 €K** |
| NACIONAL | D1 | Math.round(530×135×100/10000)/100 = Math.round(715.5)/100 = 716/100 | **7.16 €K** |

**Verificación aritmética (casos multi-año):**

| Tier | Duración | Div | Cálculo | Resultado |
|---|---|---|---|---|
| REGIONAL | 2 años | D2 | Math.round(175×100×105/10000)/100 = Math.round(183.75)/100 = 184/100 | **1.84 €K** |
| REGIONAL | 2 años | D1 | Math.round(175×135×105/10000)/100 = Math.round(248.0625)/100 = 248/100 | **2.48 €K** |
| NACIONAL | 3 años | D2 | Math.round(530×100×110/10000)/100 = Math.round(583)/100 | **5.83 €K** |
| NACIONAL | 3 años | D1 | Math.round(530×135×110/10000)/100 = Math.round(787.05)/100 = 787/100 | **7.87 €K** |

**Regla de almacenamiento**: el valor se almacena con exactamente 2 decimales en DB (numeric(10,2)). Para contratos multi-año, el mismo `weekly_rate_eur_k` aplica en todas las temporadas del contrato sin recalcular.

**Guards de validación (obligatorios antes de computar la fórmula):**
- `division ∈ {D1, D2}`: si no, lanzar `RangeError("Unknown division: " + division)`. No asumir valor por defecto.
- `duration_seasons ∈ {1, 2, 3}`: si no, lanzar `RangeError("Invalid duration: " + duration_seasons)`.
- Combinaciones ilegales: LOCAL solo puede ser `duration_seasons = 1`; REGIONAL solo puede ser `duration_seasons ∈ {1, 2}`; NACIONAL solo puede ser `duration_seasons ∈ {1, 3}`. Cualquier otra combinación lanza `RangeError("Illegal tier+duration: " + tier + "/" + duration_seasons)`.

---

### F-TV2: Tarifa y tier de reemplazo mid-season

El contrato de reemplazo es **siempre anual** (`duration_seasons = 1`) y cubre las semanas restantes de la temporada en curso. El tier ofertado es **exactamente un nivel inferior** al tier cancelado:

```
midseason_tier = TIER_BELOW[cancelled_tier]
TIER_BELOW = { NACIONAL: "REGIONAL", REGIONAL: "LOCAL", LOCAL: "LOCAL" }
```

| Tier cancelado | Tier mid-season ofertado |
|---|---|
| `NACIONAL` | `REGIONAL` |
| `REGIONAL` | `LOCAL` |
| `LOCAL` | `LOCAL` (caso teórico — LOCAL no puede cancelarse por escrutinio; ver F-TV3) |

No se re-evalúan condiciones de desbloqueo, reputation ni corruption para determinar el tier mid-season — está fijo por la regla TIER_BELOW.

```
tv_midseason_rate_eur_k = Math.round(TV_BASE_CENTS[midseason_tier] × DIVISION_MULTIPLIER_CENTS[current_division_at_cancellation] × MID_SEASON_PENALTY_FACTOR_CENTS / 10000) / 100
```

- `MID_SEASON_PENALTY_FACTOR_CENTS = 70` (= 0.70 × 100; tuning knob)
- `current_division_at_cancellation`: división del club en el momento de la cancelación (no `division_at_signing` del contrato original)
- Solo aplica si contrato cancelado por escrutinio mediático AND `38 − current_week ≥ MIDSEASON_OFFER_MIN_WEEKS_REMAINING (3)` (semana ≤ 35)
- El contrato mid-season cubre exactamente las semanas restantes: `38 − current_week`

**Tasas de reemplazo (verificadas):**

| Caso | Cálculo | Resultado |
|---|---|---|
| NACIONAL cancelado, D2 → REGIONAL mid-season | Math.round(175×100×70/10000)/100 = Math.round(122.5)/100 = 123/100 | **1.23 €K/sem** |
| NACIONAL cancelado, D1 → REGIONAL mid-season | Math.round(175×135×70/10000)/100 = Math.round(165.375)/100 = 165/100 | **1.65 €K/sem** |
| REGIONAL cancelado, D2 → LOCAL mid-season | Math.round(53×100×70/10000)/100 = Math.round(37.1)/100 = 37/100 | **0.37 €K/sem** |
| REGIONAL cancelado, D1 → LOCAL mid-season | Math.round(53×135×70/10000)/100 = Math.round(50.085)/100 = 50/100 | **0.50 €K/sem** |

**Ejemplo — NACIONAL cancelado en semana 15, club en D1:**
`midseason_tier = REGIONAL`, rate = 1.65 €K/sem, duración = 38−15 = 23 semanas. Total: 1.65 × 23 = 37.95 €K.

**Invariante de diseño:** El tier mid-season siempre es inferior al cancelado. No existe camino donde una cancelación mejore el tier firmado.

### F-TV3: Delta semanal de `corruption_exposure` por tier activo

`corruption_delta_per_week = CORRUPTION_DELTA_PER_WEEK[tier]`

`TV_SCANDAL_THRESHOLD = 60` (constante; distinto del threshold global de escándalo = 80)

Aplicado en cada tick semanal mientras `tv_contract_status = ACTIVE`, **antes** de la evaluación del threshold TV (ver Tick Order, paso 2):

```
// CORRUPTION_MAX = 100 — alineado con cascade_node_default_range [0, 100] del entities registry
corruption_exposure = Math.min(CORRUPTION_MAX, Math.max(0, corruption_exposure + CORRUPTION_DELTA_PER_WEEK[tier]))
```

El valor se clampea en 0 (floor) y en 100 (ceiling, alineado con el registry) — `corruption_exposure` nunca cae por debajo de 0 ni supera 100. Un manager ya limpio (corruption_exposure = 0) con LOCAL activo no acumula "escudo negativo".

| Tier | `CORRUPTION_DELTA_PER_WEEK` | Acumulado temporada completa (×38) |
|---|---|---|
| `LOCAL` | -0.5 | -19.0 |
| `REGIONAL` | +0.5 | +19.0 |
| `NACIONAL` | +1.5 | +57.0 |

**Predicado de cancelación (definición formal — canónica para implementación):**
```
prev_corruption = corruption_exposure antes de aplicar el delta de este tick
new_corruption  = max(0, prev_corruption + CORRUPTION_DELTA_PER_WEEK[tier])
threshold_crossed_upward = (prev_corruption < TV_SCANDAL_THRESHOLD) AND (new_corruption >= TV_SCANDAL_THRESHOLD)
```
Solo si `threshold_crossed_upward = true` el contrato se cancela. Si `prev_corruption >= TV_SCANDAL_THRESHOLD` ya antes del tick (contrato firmado con corrupción alta o sin reset entre ticks), `threshold_crossed_upward = false` aunque `new_corruption` siga ≥ 60 — no se genera cancelación ni segundo evento.

**Re-evaluación post-cascade** (ver Tick Order, paso 7): el mismo predicado `threshold_crossed_upward` se evalúa de nuevo después de las inyecciones externas de cascade-engine, con `prev_corruption_cascade` = valor tras paso 2 de F-TV3. Solo se evalúa si `tv_contract_status` sigue ACTIVE tras paso 4.

**Umbral de cancelación TV**: después de aplicar el delta, si `threshold_crossed_upward = true`, el contrato se cancela.

**Cliff exacto en `corruption = 3.0`** (corrección R5): un manager con `corruption_exposure < 3.0` al inicio de temporada que firma NACIONAL **sobrevive las 38 semanas**: con corruption=2.9, semana de cruce = `⌈(60−2.9)/1.5⌉ = 39 > 38`, valor final = `2.9 + 38 × 1.5 = 59.9 < 60`. Con `corruption = 3.0`, semana de cruce = 38, valor final = `3.0 + 38 × 1.5 = 60.0 ≥ 60` → cancelación en semana 38 (revenue semana 38 = 0, sin midseason offer porque 38 > 35). El umbral seguro es **estrictamente** `corruption_exposure < 3.0`, no `corruption_exposure ≤ 3`.

**Ejemplo — NACIONAL en riesgo real**: Manager con `corruption_exposure = 5` firma NACIONAL en pretemporada. Semana de cruce: `⌈(60 − 5) / 1.5⌉ = ⌈36.67⌉ = 37`. En semana 37: `5 + 37 × 1.5 = 60.5 ≥ 60` → contrato cancelado. Semana 37 > 35 → sin oferta de reemplazo. Pérdida: ingresos de semanas 37 y 38. Incluso managers relativamente limpios enfrentan riesgo real con NACIONAL.

**Ejemplo — LOCAL como escudo y recovery**: Manager con `corruption_exposure = 72` en pretemporada firma LOCAL. Acumulado al final de temporada: `72 − 38 × 0.5 = 53` — bajo el TV_SCANDAL_THRESHOLD (60). Una sola temporada de LOCAL devuelve al manager al rango donde REGIONAL/NACIONAL vuelven a estar disponibles. Manager con `corruption_exposure = 55` firmando LOCAL acaba en `55 − 38 × 0.5 = 36` — recovery sustancial en una temporada.

**Ejemplo — floor en acción**: Manager con `corruption_exposure = 0.3` firma LOCAL. En semana 1: `max(0, 0.3 − 0.5) = max(0, −0.2) = 0`. A partir de semana 1 y el resto de la temporada, `corruption_exposure = 0` se mantiene sin cambio (el clamp aplica cada tick).

**Nota de diseño (P1)**: NACIONAL puede autoinvalidarse para cualquier manager con `corruption_exposure ≥ 3.0` al inicio de temporada (el cliff exacto). LOCAL es la única opción que **reduce** la corrupción (-19.0 en una temporada completa), convirtiendo la elección de tier en una decisión de gestión de riesgo multi-temporada con tres opciones genuinamente distintas: limpiar (LOCAL, -19/temporada, recovery real desde valores altos), equilibrio (REGIONAL, +19/temporada, viable indefinidamente bajo umbral), máximo ingreso con riesgo real (NACIONAL, +57/temporada, requiere corruption < 3.0 al inicio para sobrevivir).

---

### F-TV4: Efecto económico del rechazo (`fan_loyalty` → `fan_attendance`)

Cuando el jugador rechaza todas las ofertas de `tv_auction` (AC-TV-21) o de `tv_midseason_offer` (AC-TV-24), `fan_loyalty` incrementa en +10 (cap total: 50 — máximo 5 rechazos acumulables a lo largo de toda la partida). Este valor modifica multiplicativamente `fan_attendance` durante el cálculo de matchday revenue:

```
fan_attendance_effective = min(1.0, fan_attendance × (1 + fan_loyalty × FAN_LOYALTY_ATTENDANCE_FACTOR))
FAN_LOYALTY_ATTENDANCE_FACTOR = 0.005   (= 0.5% por punto de loyalty)
```

El clamp en `1.0` garantiza que `fan_attendance_effective` nunca supera aforo completo (100%), alineando el output con el `output_range` de `match_day_revenue` en entities.yaml.

**Verificación numérica:**
- `fan_loyalty = 0` (sin rechazos): multiplicador = 1.00 (sin efecto) → clamp no aplica
- `fan_loyalty = 10` (un rechazo): `fan_attendance × 1.05` → clamp aplica si `fan_attendance > 0.952`
- `fan_loyalty = 30` (tres rechazos): `fan_attendance × 1.15` → clamp aplica si `fan_attendance > 0.870`
- `fan_loyalty = 50` (cap, cinco rechazos): `fan_attendance × 1.25` → clamp aplica si `fan_attendance > 0.800`

**Decay temporal**: `fan_loyalty` no decae automáticamente, pero solo se otorga mediante rechazo de ofertas TV (no hay otras fuentes en MVP). Las fuentes futuras (e.g., decisiones anti-comerciales en otros sistemas) seguirán la misma escala.

**Decisión P1**: rechazar LOCAL D2 (20 €K/año TV) vale la pena si el club tiene `fan_attendance × ticket_price × matches_home` ≥ 400 €K/año, donde +5% = +20 €K matchday compensa exactamente lo perdido en TV. En la práctica esto ocurre en clubs D2 zona alta con aforos llenos o en D1 — exactamente el público que el GDD describe como "valoran la postura anti-comercial".

**Implementación**: la multiplicación ocurre en el cálculo de matchday revenue (probablemente en `economy.md §F3` o en cascade-engine.md C8 — la autoridad final del nodo `fan_attendance`). Este GDD declara la fórmula; el GDD destino debe leerla. Marca BREAKING CHANGE menor: `fan_attendance` consumers existentes ahora pasan por F-TV4 cuando se computa el revenue de taquilla.

---

## Edge Cases

- **Si `prev_season_final_position = null` (primera temporada):** solo LOCAL disponible — el proxy de posición queda eliminado. La primera subasta de cualquier club entrega exactamente un sobre. REGIONAL y NACIONAL requieren al menos una temporada completada para evaluarse.
- **Si el club está en D1 la primera temporada:** solo LOCAL disponible (regla T1 = solo LOCAL aplica a todas las divisiones, sin excepción). Desde T2, si el club sigue en D1, NACIONAL está disponible.
- **Si `manager_reputation ≥ 4` pero el club está en D2:** NACIONAL disponible aunque el club no haya ascendido. Intencional — la reputación del manager puede compensar la división (Pilar P3).
- **Si la cancelación ocurre en semana > 35** (menos de 3 semanas restantes): no se genera `tv_midseason_offer`. El club termina las semanas restantes con `tv_weekly_rate_eur_k = 0`. Sin penalización adicional — el ingreso perdido es la consecuencia suficiente. Para cancelaciones en semanas 31–35 (3–7 semanas restantes), sí se genera `tv_midseason_offer` al 70%.
- **Si hay descenso de D1 a D2 al final de temporada:** el contrato ya expiró en semana 38 (`season_end` = fin del contrato). En la temporada siguiente, en D2, las condiciones de desbloqueo se re-evalúan sin memoria del contrato anterior.
- **Si `tv_auction` se genera y el club ya tiene `tv_contract_status = ACTIVE`** (bug de doble evento): el servidor rechaza con `409 Conflict`. Solo puede haber un contrato activo por temporada.
- **Si `DIVISION_MULTIPLIER` recibe una división fuera de `{D1, D2}`** (D3+ en versiones futuras): lanzar `RangeError` explícito — no asumir un valor por defecto. Fuerza actualización del GDD al añadir divisiones.
- **Si `corruption_exposure ≥ TV_SCANDAL_THRESHOLD (60)` al inicio de temporada (antes de la subasta):** el evento `tv_auction` se genera, pero REGIONAL y NACIONAL **no aparecen en la oferta** — solo LOCAL. El manager con escrutinio ≥ 60 no genera interés de canales premium. Si firma LOCAL, el delta negativo (-0.5/sem; clampeado en 0) reduce la corrupción; si la reduce por debajo de 60 antes del `season_start` siguiente, los tiers superiores estarán disponibles en la próxima temporada. Si rechaza, recibe `fan_loyalty += 10` (con efecto F-TV4 sobre `fan_attendance`) pero la corrupción no cambia.
- **Si `corruption_exposure = 0` y el contrato es LOCAL activo:** el clamp de F-TV3 (`max(0, ...)`) aplica cada tick — la corrupción se mantiene en 0 sin acumular valores negativos.
- **Si el jugador firma LOCAL y luego el sistema sube su reputation mid-season:** la subasta ya fue resuelta; los tiers de la temporada en curso no cambian. El nuevo tier accesible estará disponible en la subasta del año siguiente.
- **Si el jugador rechaza todas las ofertas de `tv_auction`:** `tv_contract_status` permanece `NONE`, el evento queda `consumed = true`, y el advance se desbloquea. El club opera sin ingresos TV esa temporada. La siguiente `season_start` genera una nueva subasta normalmente.
- **Si el manager sube de reputation mid-season y ocurre cancelación por escrutinio mediático:** la oferta `tv_midseason_offer` siempre aplica la regla TIER_BELOW — el tier ofertado es el inmediatamente inferior al cancelado, independientemente de la reputación o división actuales. No se re-evalúan condiciones de desbloqueo. La reputación ganada mid-season afecta la subasta de la siguiente temporada, no el reemplazo actual.
- **Si `tv_contract_status = CANCELLED` al llegar `season_start`** (escrutinio mediático ocurrió en semana > 30 sin replacement): el reset transiciona `CANCELLED → NONE` igual que `EXPIRED → NONE`. La siguiente temporada comienza sin contrato activo y se genera subasta normal.
- **Si el jugador rechaza `tv_midseason_offer`:** `tv_contract_status` permanece `CANCELLED`, el evento queda `consumed = true`, y el advance se desbloquea. El club completa la temporada sin ingresos TV. El estado CANCELLED se resetea a NONE en `season_start` de la siguiente temporada.
- **Si un contrato multi-año (duration_seasons > 1) se cancela por escrutinio mediático:** las temporadas restantes quedan anuladas — `duration_seasons` pierde su efecto. `season_in_contract` no se incrementa. El próximo `season_start` trata el estado CANCELLED → NONE y genera `tv_auction` normal, igual que para contratos anuales.
- **Si el club cambia de división entre temporadas dentro de un contrato multi-año:** la tarifa `tv_weekly_rate_eur_k` permanece bloqueada en el valor calculado al inicio (`division_at_signing`). No se recalcula en el rollover de `season_end`. Un NACIONAL firmado en D1 (7.87 €K/sem con multi-año) conserva esa tarifa aunque el club descienda a D2 en el año 2.
- **Si un contrato REGIONAL 2-años llega a semana 38 en su año 1 (season_in_contract = 1 < duration_seasons = 2):** el contrato se renueva automáticamente para año 2 (`season_in_contract = 2`); no se genera `tv_auction`; `tv_weekly_rate_eur_k` permanece invariante. La corrupción del manager NO se resetea entre temporadas del multi-año — continúa acumulándose desde donde terminó el año anterior.

- **Si el club asciende de D2 a D1 mid-contract en un multi-año (REGIONAL 2yr o NACIONAL 3yr firmado en D2):** la tarifa `tv_weekly_rate_eur_k` permanece bloqueada en `division_at_signing = D2`. Es el simétrico del caso de descenso documentado: REGIONAL 2yr firmado en D2 (1.84 €K/sem) que asciende a D1 sigue cobrando 1.84 €K/sem hasta expirar, aunque el club ya califica para REGIONAL D1 (2.36 €K/sem) o incluso NACIONAL D1 (7.16 €K/sem) en una subasta hipotética. Esto es la "trampa de ascenso" — un trade-off intencional del multi-año: aceptar el bonus +5%/+10% del momento de firma significa renunciar a las mejoras de tarifa por progresión deportiva durante toda la duración del contrato.

- **Si cascade-engine inyecta `corruption_exposure` mientras LOCAL está ACTIVE:** LOCAL no puede cancelarse por su propio delta (-0.5/sem) porque el delta es negativo. Sin embargo, una inyección externa de cascade-engine (eventos de prensa, escándalos de fichajes) sí puede cruzar `TV_SCANDAL_THRESHOLD` al alza durante el paso 7 del Tick Order, incluso con LOCAL activo. En ese caso LOCAL se cancela, `midseason_tier = TIER_BELOW[LOCAL] = LOCAL`, y la oferta de reemplazo es otro contrato LOCAL al 70% (0.37 €K/sem en D2, 0.50 €K/sem en D1). Es el caso "LOCAL cancelado por cascade externo" — el "caso teórico" de la tabla TIER_BELOW se materializa solo cuando el cruce ocurre vía cascade-engine, nunca vía F-TV3 directo.

- **Si el cap de `fan_loyalty` (50) ya está alcanzado y el jugador rechaza otra oferta de TV:** `fan_loyalty` permanece en 50 (no sobrepasa el cap). El rechazo sigue siendo válido — el evento queda `consumed = true` — pero el +10 nominal no se aplica. Este escenario es raro (requiere 5+ rechazos acumulados en partidas largas) pero el cap previene runaway attendance.

## Dependencies

| Sistema | Tipo | Dirección | Descripción |
|---|---|---|---|
| `economy.md` | **Hard** | Bidireccional | TV rights es una fuente de ingreso del cashflow semanal (F2). Este GDD reemplaza la fórmula plana de `economy.md §F2`. Economy.md debe actualizarse para leer `contract.weekly_rate_eur_k` en lugar de la constante `TV_RIGHTS_ANNUAL_EUR_K / 38`. |
| `event-system.md` | **Hard** | IN | Genera los eventos `tv_auction` (STOP, season-start) y `tv_midseason_offer` (STOP, condicional por cancelación). Sin event-system la subasta no puede presentarse al jugador. |
| `manager-rpg.md` | **Hard** | IN | `manager_reputation ∈ [1..5]` es criterio de desbloqueo de tiers REGIONAL (≥2) y NACIONAL (≥4). Las firmas REGIONAL (+10 XP) y NACIONAL (+25 XP) otorgan XP a `financial_acumen`. |
| `league-system.md` | **Hard** | IN — ⚠️ BREAKING CHANGE | `current_division` y `prev_season_final_position` se leen para evaluar condiciones de desbloqueo en la subasta. **Al implementar tv-rights**: eliminar `getTVRightsWeekly()` y las constantes `TV_RIGHTS_SEGUNDA`/`TV_RIGHTS_PRIMERA` del código (`league-system.md §F6`). Los ACs `AC-LGS-18/19` deben marcarse deprecated — usan la fórmula plana (3 €K/sem D2, 8 €K/sem D1) incompatible con este GDD. |
| `cascade-engine.md` | **Hard** | Bidireccional | OUT: `corruption_exposure += CORRUPTION_DELTA_PER_WEEK[tier]` cada tick activo (F-TV3); LOCAL aplica delta negativo (-0.5/sem). IN: nuevo threshold node `TV_SCANDAL_THRESHOLD = 60` (distinto del threshold global de escándalo = 80) — cuando `corruption_exposure` cruza 60 al alza mientras el contrato está ACTIVE, el canal cancela el contrato. **Ordering canónico (post-F-TV3)**: cascade-engine inyecta corruption externa en paso 6 del Tick Order (después de F-TV3 paso 2); se re-evalúa threshold en paso 7. Sin esta conexión, el trade-off P1 no funciona. **BREAKING CHANGE menor**: F-TV4 introduce `fan_loyalty × 0.005` como multiplicador de `fan_attendance` en cálculo de matchday revenue. El nodo `fan_attendance` (C8) sigue siendo del cascade, pero sus consumers ahora pasan por F-TV4. |

## Tuning Knobs

| Knob | Valor MVP | Rango seguro | Qué rompe si va muy alto | Qué rompe si va muy bajo |
|---|---|---|---|---|
| `TV_BASE_EUR_K[LOCAL]` | 0.53 €K/sem | 0.20–1.00 | La taquilla pierde importancia como ingreso principal en D2 | Los partidos en casa se vuelven la única fuente viable — fragilidad ante semanas de visita |
| `TV_BASE_EUR_K[REGIONAL]` | 1.75 €K/sem | 0.80–3.50 | REGIONAL supera la taquilla D2 → decisiones de asistencia dejan de importar | Sin incentivo para desbloquear REGIONAL sobre LOCAL |
| `TV_BASE_EUR_K[NACIONAL]` | 5.30 €K/sem | 2.50–9.00 | Ascender a D1 con NACIONAL hace irrelevantes las demás decisiones económicas | El ascenso a D1 no se siente transformador económicamente |
| `DIVISION_MULTIPLIER[D1]` | 1.35 | 1.10–1.60 | Rompe el balance económico post-ascenso | Sin diferencia perceptible entre firmar el mismo tier en D1 vs. D2 |
| `MID_SEASON_PENALTY_FACTOR` | 0.70 | 0.50–0.90 | El escrutinio tiene poco coste económico (el canal paga casi igual) | El jugador prefiere no firmar reemplazo — pierde semanas de TV sin motivo estratégico |
| `MIDSEASON_OFFER_MIN_WEEKS_REMAINING` | 3 | 1–8 | Demasiado alto → cancelaciones tardías sin penalización (free upgrade) | Demasiado bajo → ofertas de reemplazo de 1–2 semanas sin valor real; ruido de UX |
| `REGIONAL_MIN_POSITION` | ≤ 10 de 20 | ≤ 5 a ≤ 20 | REGIONAL accesible para todos → se vuelve el tier por defecto sin esfuerzo | REGIONAL inaccesible para clubs mediocres → incentivo demasiado estrecho |
| `TV_SCANDAL_THRESHOLD` | 60 | 40–75 | Umbral demasiado alto → NACIONAL raramente se cancela, trade-off P1 débil | Umbral demasiado bajo → REGIONAL también es peligroso para managers limpios |
| `LOCAL_CORRUPTION_SHIELD` | -0.5/sem | -0.2 a -0.8 | LOCAL reduce la corrupción tan rápido que se convierte en elección óptima siempre | Sin beneficio real de limpieza — LOCAL sigue siendo dominated por REGIONAL |
| `FAN_LOYALTY_ATTENDANCE_FACTOR` | 0.005 (0.5%/punto) | 0.002–0.010 | Rechazar TV se vuelve dominante sobre firmar tier alto en cualquier club con aforo lleno | El rechazo es flavor sin valor económico — P1 se rompe |
| `FAN_LOYALTY_CAP` | 50 (5 rechazos × 10) | 30–100 | Cap demasiado alto → runaway attendance multiplier (>+50%) | Cap demasiado bajo → 1-2 rechazos saturan el mechanic |
| `CORRUPTION_DELTA_PER_WEEK[REGIONAL]` | +0.5 | 0.0–1.5 | Trade-off demasiado alto → REGIONAL raramente elegida; todos firman LOCAL | Sin penalización real → P1 no satisfecho entre LOCAL y REGIONAL |
| `CORRUPTION_DELTA_PER_WEEK[NACIONAL]` | +1.5 | 0.5–3.0 | NACIONAL garantiza cancelaciones tempranas → inelegible para casi todos | El escrutinio nacional no presiona suficientemente |
| `DURATION_MULTIPLIER[2]` | 1.05 (+5%) | 1.00–1.15 | REGIONAL 2-años demasiado lucrativo sobre REGIONAL 1-año — la flexibilidad anual pierde valor | Sin incentivo económico para comprometer 2 temporadas |
| `DURATION_MULTIPLIER[3]` | 1.10 (+10%) | 1.05–1.25 | NACIONAL 3-años dominante sobre NACIONAL 1-año; la corrupción bloqueada no compensa el bonus | El bonus de 3 años no recompensa suficientemente el riesgo de corrupción acumulada sin salida |

**Invariantes que no deben romperse:**
- Ratio `TV_BASE_EUR_K[NACIONAL] / TV_BASE_EUR_K[LOCAL]` ≥ 8× — arco económico de progresión. Con valores MVP: 5.30 / 0.53 = 10×. ✔
- `CORRUPTION_DELTA_PER_WEEK[NACIONAL] / CORRUPTION_DELTA_PER_WEEK[REGIONAL]` ≥ 2× — el riesgo debe escalar proporcionalmente al ingreso extra. Con valores MVP: 1.5 / 0.5 = 3×. ✔
- `TV_SCANDAL_THRESHOLD` debe ser < `SCANDAL_THRESHOLD` global (80) — la TV cancela antes de que el escándalo sea público. ✔ (60 < 80)
- Con `LOCAL_CORRUPTION_SHIELD` en valor MVP, un manager con `corruption_exposure ≤ 60` firmando LOCAL nunca cruza el threshold TV al alza (LOCAL solo reduce). ✔

## Visual/Audio Requirements

Sistema de ingresos — sin VFX ni audio directo. El jugador no "ve" los derechos de TV; los siente en el balance.

Único momento visual relevante: el sobre del evento `tv_auction` en inbox podría variar visualmente según tier disponible (sobre sencillo = solo LOCAL, sobre con logo más elaborado = REGIONAL/NACIONAL visibles). Decisión pertenece a la UX spec del inbox, no a este GDD.

## UI Requirements

> 📌 **UX Flag — TV Rights**: Este sistema tiene UI en `/finance`. En Pre-Production, run `/ux-design tv-rights` antes de escribir las stories. Las stories que referencien UI de TV rights deben citar `design/ux/tv-rights.md`.

- Panel en `/finance` que muestre: contrato activo (tier, nombre del canal, tarifa semanal, semanas restantes de la temporada actual, temporada actual dentro del contrato si multi-año — e.g., "Año 2 de 3"), o estado "Sin contrato TV esta temporada" si no hay activo.
- Evento `tv_auction` en inbox/calendar: lista de ofertas disponibles. Cada tier muestra: nombre del canal, duración (1 año o multi-año), tarifa semanal calculada (con bonus multi-año claramente marcado), y delta de corrupción semanal. El jugador selecciona una oferta (tier + duración) y confirma.
- **Indicador de riesgo — NACIONAL 3yr**: cuando `corruption_exposure > 0` al inicio de temporada, mostrar un indicador visible de **Riesgo Alto** (ej. etiqueta o icono de advertencia) junto a la tarifa y bonus multi-año de NACIONAL 3yr. El indicador permite al jugador descubrir el riesgo de cancelación en T2 sin necesidad de leer las fórmulas. El contenido exacto (texto, iconografía, color) pertenece a la UX spec (`design/ux/tv-rights.md`).
- **Indicador de riesgo — REGIONAL 2yr**: cuando `corruption_exposure ≥ 22` al inicio de temporada, mostrar un indicador visible de **Riesgo** junto a la oferta REGIONAL 2yr. El threshold 22 es el punto a partir del cual T2 terminará con cancelación (semana 36–38, sin midseason offer). Simétrico al indicador de NACIONAL 3yr — ambos casos representan contratos que el manager firma con riesgo real de pérdida de revenue en años posteriores del contrato. El contenido exacto pertenece a la UX spec (`design/ux/tv-rights.md`).
- Evento `tv_midseason_offer`: muestra tier ofertado (siempre un nivel inferior al cancelado), tarifa al 70% del tier base, semanas restantes de la temporada en curso. Sin opciones de duración — siempre es anual.

## Acceptance Criteria

**AC-TV-01** — GIVEN `season_start` ejecuta con cualquier combinación de `(division ∈ {D1,D2}, manager_reputation ∈ [1..5], prev_season_final_position ∈ {1..20})` (segunda temporada o posterior), WHEN el sistema genera `tv_auction`, THEN `tv_auction.offers` contiene **al menos** un elemento con `tier = "LOCAL"`. [El caso `prev_season_final_position = null` está cubierto exclusivamente por AC-TV-12.]

**AC-TV-02** — GIVEN el manager terminó la temporada anterior en D2 con `prev_season_final_position ≤ 10` y `manager_reputation < 2`, WHEN se genera la subasta, THEN `tv_auction.offers` contiene un elemento con `tier = "REGIONAL"`.

**AC-TV-03** — GIVEN `manager_reputation = 2` y `prev_season_final_position > 10` en D2, WHEN se genera la subasta, THEN `tv_auction.offers` contiene un elemento con `tier = "REGIONAL"` (reputación como vía alternativa al ranking deportivo).

**AC-TV-04** — GIVEN el manager está en D1 con `manager_reputation < 4`, WHEN se genera la subasta, THEN `tv_auction.offers` contiene un elemento con `tier = "NACIONAL"`.

**AC-TV-05** — GIVEN `manager_reputation = 4` y el club está en D2, WHEN se genera la subasta, THEN `tv_auction.offers` contiene un elemento con `tier = "NACIONAL"` (sin necesidad de estar en D1).

**AC-TV-06** — GIVEN `manager_reputation = 1` y `prev_season_final_position = 15` en D2, WHEN se genera la subasta, THEN `tv_auction.offers.length = 1` y el único elemento tiene `tier = "LOCAL"`.

**AC-TV-07** — GIVEN el manager firma canal REGIONAL 1-año con el club en D2, WHEN avanza la semana, THEN `tv_weekly_rate_eur_k = 1.75` (`Math.round(175×100×100/10000)/100 = Math.round(175)/100 = 1.75`).

**AC-TV-08** — GIVEN el manager firma canal NACIONAL 1-año con el club en D1, WHEN avanza la semana, THEN `tv_weekly_rate_eur_k = 7.16` (`Math.round(530×135×100/10000)/100 = Math.round(715.5)/100 = 716/100 = 7.16`).

**AC-TV-09** — GIVEN `tv_contract_status = NONE` (sin contrato activo o por rechazo voluntario), WHEN se calcula el cashflow semanal, THEN `tv_weekly_eur_k = 0.0` exacto.

**AC-TV-10** — GIVEN contrato `ACTIVE` con `tier = "NACIONAL"` y `current_week ≤ 35` (remaining_weeks ≥ 3), WHEN el tick semanal aplica F-TV3 y `threshold_crossed_upward = true` (el contrato pasa de ACTIVE a CANCELLED en este tick), THEN: `tv_contract_status = "CANCELLED"`, `tv_weekly_rate_eur_k = 0`, y se genera exactamente un evento STOP `tv_midseason_offer` con `tier = "REGIONAL"` (TIER_BELOW[NACIONAL]). La tarifa del midseason offer: `Math.round(175 × DIVISION_MULTIPLIER_CENTS[current_division] × 70 / 10000) / 100` — para D2: 1.23 €K/sem; para D1: 1.65 €K/sem. **Assert observable de guard idempotente**: tras la cancelación, ejecutar 3 ticks adicionales con `corruption_exposure ≥ 60` y verificar `SELECT COUNT(*) FROM events WHERE type = 'tv_midseason_offer' AND season_id = current_season` = 1 (exactamente uno, no se generan duplicados). El estado `CANCELLED` bloquea el paso 2 del Tick Order (la condición `tv_contract_status = ACTIVE` no se cumple), por lo que `threshold_crossed_upward` no se evalúa en ticks posteriores.

**AC-TV-11** — GIVEN contrato `ACTIVE` y `current_week > 35` (remaining_weeks < 3), WHEN el tick semanal aplica F-TV3 y `corruption_exposure` cruza `TV_SCANDAL_THRESHOLD (60)` al alza por primera vez, THEN `tv_contract_status = "CANCELLED"`, no se genera `tv_midseason_offer`, y el club finaliza las semanas restantes con `tv_weekly_rate_eur_k = 0`.

**AC-TV-12** — GIVEN `prev_season_final_position = null` (primera temporada) y club en cualquier división, WHEN se genera la subasta, THEN `tv_auction.offers.length = 1` y el único elemento tiene `tier = "LOCAL"` — REGIONAL y NACIONAL no están disponibles en T1.

**AC-TV-13** — Dos casos:
- **13a (1 año o última temporada multi-año):** GIVEN contrato ACTIVE en semana 38 con `season_in_contract = duration_seasons`, WHEN se ejecuta `season_end`, THEN `tv_contract_status = "EXPIRED"` y `tv_weekly_rate_eur_k = 0`. WHEN se ejecuta `season_start` de la temporada siguiente (`season_id = S+1`), THEN `tv_contract_status = "NONE"` y se genera exactamente un `tv_auction` con `season_id = S+1`.
- **13b (rollover multi-año):** GIVEN contrato ACTIVE en semana 38 con `season_in_contract < duration_seasons` (e.g., `season_in_contract = 1`, `duration_seasons = 2`), WHEN se ejecuta `season_end`, THEN `tv_contract_status` permanece `"ACTIVE"`, `season_in_contract` se incrementa en 1 (`= 2`), `tv_weekly_rate_eur_k` sin cambio. WHEN se ejecuta `season_start` de la temporada siguiente, THEN **no se genera** `tv_auction` con `season_id = S+1`.

**AC-TV-14** — GIVEN escrutinio mediático procesado durante la semana 20 (cashflow de semana 20 es 0 porque la cancelación ocurre antes del cálculo de revenue en el mismo tick — ver Tick Order), WHEN el jugador firma `tv_midseason_offer`, THEN el contrato mid-season tiene `duration = 38 − 20 = 18` semanas, aplicable desde semana 21 inclusive. Total esperado de ingresos: `midseason_rate × 18`.

**AC-TV-15** — GIVEN `tv_contract_status = "ACTIVE"` con `contract.season_id = S`, WHEN el sistema intenta generar `tv_auction` con `season_id = S`, THEN el servidor responde HTTP `409 Conflict` con body `{ error: "tv_auction_already_exists", season_id: S }` y no inserta ningún registro. Para `season_id = S+1`, la nueva subasta se genera normalmente.

**AC-TV-16** — GIVEN `manager.financial_acumen_xp = X` antes de la firma, WHEN el jugador firma una oferta REGIONAL, THEN `manager.financial_acumen_xp = X + 10`.

**AC-TV-17** — GIVEN `manager.financial_acumen_xp = X` antes de la firma, WHEN el jugador firma una oferta NACIONAL, THEN `manager.financial_acumen_xp = X + 25`.

**AC-TV-18** — GIVEN el jugador firma LOCAL, WHEN se completa la acción, THEN `manager.financial_acumen_xp` no cambia y `fan_loyalty` no cambia.
**AC-TV-18b** — GIVEN el jugador rechaza todas las ofertas de `tv_auction`, WHEN el evento queda `consumed = true`, THEN `manager.financial_acumen_xp` no cambia y `fan_loyalty += 10` exacto.

**AC-TV-19** — GIVEN `season_start` ejecuta para una nueva temporada, WHEN el sistema genera `tv_auction`, THEN el evento tiene `type = "STOP"` y `scheduled_week = 0`. WHEN `POST /api/game/advance` se llama con el evento pendiente (`consumed = false`), THEN el servidor responde HTTP `409 Conflict` con body `{ blocked: true, reason: "pending_stop_event", event_type: "tv_auction" }`. El endpoint responde `200 OK` una vez que el evento tiene `consumed = true`.

**AC-TV-20** — GIVEN contrato ACTIVE y `current_week = 35` exactamente (remaining_weeks = 3), WHEN `corruption_exposure` cruza `TV_SCANDAL_THRESHOLD (60)` al alza, THEN se aplica la rama de AC-TV-10 (oferta de reemplazo generada para 3 semanas restantes), no la de AC-TV-11. GIVEN `current_week = 36` (remaining_weeks = 2), THEN se aplica la rama de AC-TV-11 (sin oferta de reemplazo).

**AC-TV-21** — GIVEN el jugador rechaza todas las ofertas disponibles en `tv_auction`, WHEN el evento queda `consumed = true`, THEN `tv_contract_status = "NONE"` (sin cambio), `tv_weekly_rate_eur_k = 0`, `fan_loyalty += 10`, y `POST /api/game/advance` se desbloquea normalmente para la semana 1.

**AC-TV-22a** *(Logic — unit testable)* — GIVEN un tick semanal con `tv_contract_status = "ACTIVE"` y `tier = "LOCAL"`, WHEN `applyTVCorruptionDelta(tier, prevCorruption, status)` ejecuta (función pura exportada — ver ADR-019 §4 Key Interfaces), THEN retorna `prevCorruption - 0.5` (clampeado a 0). GIVEN `tier = "REGIONAL"`, THEN retorna `prevCorruption + 0.5`. GIVEN `tier = "NACIONAL"`, THEN retorna `prevCorruption + 1.5`. GIVEN `status ≠ "ACTIVE"`, THEN retorna `prevCorruption` sin cambio (delta = `0`).

**AC-TV-22b** *(Integration — requiere tick pipeline completo)* — GIVEN tick semanal completo con contrato NACIONAL ACTIVE y `corruption_exposure = 59.0` al inicio del tick, WHEN el tick ejecuta, THEN: (1) `tv_contract_status = "CANCELLED"` (59.0 + 1.5 = 60.5 ≥ 60 → threshold cruzado); (2) `tv_weekly_rate_eur_k = 0` (cancelación en paso 4, antes del cálculo de revenue en paso 5). GIVEN `corruption_exposure = 58.0` bajo idénticas condiciones, THEN: `tv_contract_status = "ACTIVE"` (58.0 + 1.5 = 59.5 < 60 → sin cruce) y `tv_weekly_rate_eur_k = 7.16` (revenue calculado normalmente). Este par de casos prueba el ordering (delta aplicado antes del threshold check) sin requerir instrumentación de estado interno mid-función.

**AC-TV-23** — GIVEN contrato REGIONAL ACTIVE cancelado por escrutinio mediático en semana 25 (≤ 35), WHEN se genera `tv_midseason_offer`, THEN: (a) el tier ofertado es `"LOCAL"` (TIER_BELOW[REGIONAL] = LOCAL); (b) la tarifa: `Math.round(53 × DIVISION_MULTIPLIER_CENTS[current_division] × 70 / 10000) / 100` — para D2: `Math.round(53×100×70/10000)/100 = Math.round(37.1)/100 = 37/100 = 0.37 €K/sem`; para D1: `Math.round(53×135×70/10000)/100 = Math.round(50.085)/100 = 50/100 = 0.50 €K/sem`; (c) la duración cubre exactamente `38−25 = 13` semanas restantes; (d) el contrato mid-season tiene `duration_seasons = 1` (siempre anual).

**AC-TV-24** — GIVEN `tv_contract_status = "CANCELLED"`, `fan_loyalty = X`, y existe un evento `tv_midseason_offer` activo (STOP), WHEN el jugador rechaza todas las ofertas del `tv_midseason_offer`, THEN: `tv_contract_status` permanece `"CANCELLED"` (sin cambio), `tv_weekly_rate_eur_k = 0`, `fan_loyalty = min(50, X + 10)` (cap aplicado), el evento queda `consumed = true`, y `POST /api/game/advance` se desbloquea normalmente. El club completa la temporada sin ingresos TV.

**AC-TV-25** — GIVEN `tv_contract_status = "CANCELLED"` al ejecutar `season_start` (escrutinio ocurrió en semana > 30 sin replacement o jugador rechazó el midseason offer), WHEN `season_start` del `season_id = S+1` ejecuta, THEN `tv_contract_status = "NONE"` y se genera exactamente un `tv_auction` con `season_id = S+1`. El estado CANCELLED no se propaga a la temporada siguiente.

**AC-TV-26** — GIVEN el manager firma canal LOCAL 1-año con el club en D1, WHEN avanza la semana, THEN `tv_weekly_rate_eur_k = 0.72` (`Math.round(53×135×100/10000)/100 = Math.round(71.55)/100 = 72/100 = 0.72`).

**AC-TV-27** — GIVEN el manager firma canal NACIONAL 1-año con el club en D2 (accesible via `manager_reputation ≥ 4`), WHEN avanza la semana, THEN `tv_weekly_rate_eur_k = 5.30` (`Math.round(530×100×100/10000)/100 = Math.round(530)/100 = 5.30`).

**AC-TV-28** — GIVEN el manager firma canal REGIONAL 1-año con el club en D1, WHEN avanza la semana, THEN `tv_weekly_rate_eur_k = 2.36` (`Math.round(175×135×100/10000)/100 = Math.round(236.25)/100 = 236/100 = 2.36`).

**AC-TV-29** *(Integration)* — GIVEN contrato ACTIVE con tier REGIONAL y `corruption_exposure = 59.5` al inicio del tick, WHEN el tick semanal aplica F-TV3 (delta = +0.5), THEN `corruption_exposure = 60.0`, el threshold TV se cruza al alza, `tv_contract_status = "CANCELLED"`, y el revenue TV de ese tick = 0 (cancelación antes del cálculo de revenue).

**AC-TV-30** *(Logic)* — GIVEN contrato LOCAL ACTIVE y `corruption_exposure = 60.5` al inicio del tick, WHEN el tick semanal aplica F-TV3 (delta = -0.5), THEN `corruption_exposure = 60.0` — el valor DECRECE pero sigue ≥ 60. `threshold_crossed_upward = (60.5 < 60) AND (60.0 >= 60) = false AND true = false` — no se produce cruce al alza; el contrato LOCAL permanece ACTIVE.

**AC-TV-31** — GIVEN `season_start` ejecuta y `corruption_exposure ≥ TV_SCANDAL_THRESHOLD (60)` al inicio de temporada, WHEN el sistema genera `tv_auction`, THEN `tv_auction.offers.length = 1` y el único elemento tiene `tier = "LOCAL"` — REGIONAL y NACIONAL no aparecen independientemente de `manager_reputation` o `prev_season_final_position`.

**AC-TV-32** *(Logic — pure unit test del predicado)* — GIVEN una invocación directa de la función `evaluateThresholdCrossings(prev: number, next: number, threshold: number)` con los siguientes inputs, WHEN ejecuta, THEN devuelve los siguientes outputs:

| prev | next | threshold | esperado |
|---|---|---|---|
| 59.5 | 60.0 | 60 | `true` (cruce al alza) |
| 59.5 | 60.5 | 60 | `true` (cruce al alza) |
| 60.0 | 60.5 | 60 | `false` (prev ya ≥ umbral) |
| 65.0 | 65.5 | 60 | `false` (prev ya ≥ umbral) |
| 60.5 | 60.0 | 60 | `false` (cruce a la baja, no upward) |
| 60.5 | 60.2 | 60 | `false` (descenso, ambos ≥ umbral) |
| 50.0 | 55.0 | 60 | `false` (ambos < umbral) |

Verifica que el predicado opera correctamente en todos los casos límite y de estado inválido, sin necesidad de bypass de capa de aplicación ni fixtures de DB. El test es 100% determinista y aislado de cualquier infraestructura.

**AC-TV-33** *(Logic)* — GIVEN contrato LOCAL ACTIVE y `corruption_exposure = 0.3` al inicio del tick, WHEN el tick semanal aplica F-TV3 (delta = -0.5), THEN `corruption_exposure = max(0, 0.3 - 0.5) = max(0, -0.2) = 0`. El valor no cae a -0.2; el clamp en 0 aplica.

**AC-TV-34** *(Logic)* — GIVEN contrato LOCAL ACTIVE y `corruption_exposure = 0` al inicio del tick, WHEN el tick semanal aplica F-TV3 (delta = -0.5), THEN `corruption_exposure = max(0, 0 - 0.5) = 0`. El valor se mantiene en 0; no hay cruce al alza del threshold TV.

**AC-TV-35** *(Logic)* — GIVEN el manager firma REGIONAL 2-años con el club en D2, WHEN avanza la semana, THEN `tv_weekly_rate_eur_k = 1.84` (`Math.round(175×100×105/10000)/100 = Math.round(183.75)/100 = 184/100 = 1.84`). GIVEN el manager firma NACIONAL 3-años con el club en D2, THEN `tv_weekly_rate_eur_k = 5.83` (`Math.round(530×100×110/10000)/100 = Math.round(583)/100 = 5.83`). GIVEN el manager firma NACIONAL 3-años con el club en D1, THEN `tv_weekly_rate_eur_k = 7.87` (`Math.round(530×135×110/10000)/100 = Math.round(787.05)/100 = 787/100 = 7.87`).

**AC-TV-36** *(Integration)* — GIVEN manager firmó REGIONAL 2-años en temporada S (`season_in_contract = 1`, `duration_seasons = 2`), WHEN `season_end` de temporada S ejecuta, THEN `tv_contract_status` permanece `"ACTIVE"`, `season_in_contract = 2`, `tv_weekly_rate_eur_k` sin cambio. WHEN `season_start` de temporada S+1 ejecuta, THEN **no se genera** `tv_auction` con `season_id = S+1`.

**AC-TV-37** *(Integration)* — GIVEN manager firmó REGIONAL 2-años en temporada S (`season_in_contract = 1`), WHEN `season_end` de temporada S+1 ejecuta (`season_in_contract = 2 = duration_seasons`), THEN `tv_contract_status = "EXPIRED"`. WHEN `season_start` de temporada S+2 ejecuta, THEN `tv_contract_status = "NONE"` y se genera exactamente un `tv_auction` con `season_id = S+2`.

**AC-TV-38** *(Logic)* — GIVEN contrato NACIONAL 1-año ACTIVE firmado en D1 con `tv_weekly_rate_eur_k = 7.16` y `division_at_signing = "D1"`, WHEN el sistema de liga registra descenso del club a D2 en semana 20 mid-season, THEN `tv_weekly_rate_eur_k` permanece `7.16` hasta semana 38 — la tarifa no se recalcula. El contrato refleja `division_at_signing`, no la división actual.

**AC-TV-39** *(Integration — week-38 race condition)* — GIVEN contrato NACIONAL ACTIVE en semana 38 y `corruption_exposure = 59.5` al inicio del tick, WHEN el tick de semana 38 aplica F-TV3 (delta = +1.5), THEN `new_corruption = 61.0`, `threshold_crossed_upward = true` (59.5 < 60 AND 61.0 ≥ 60), `tv_contract_status = "CANCELLED"` (no `"EXPIRED"`), no se genera `tv_midseason_offer` (semana 38 > 35), revenue TV semana 38 = 0. WHEN `season_end` procesa a continuación, THEN `tv_contract_status` permanece `"CANCELLED"` (no-op). WHEN `season_start` temporada S+1 ejecuta, THEN `tv_contract_status = "NONE"` y se genera `tv_auction`.

**AC-TV-40** *(Integration — cascade-engine IN direction, post-F-TV3 ordering)* — GIVEN contrato NACIONAL ACTIVE con `corruption_exposure = 57.0` al inicio del tick (antes del paso 2), WHEN el tick semanal ejecuta el orden canónico:
- **Paso 2** (F-TV3 delta TV): `corruption_exposure = max(0, 57.0 + 1.5) = 58.5`
- **Paso 3** (threshold TV): `prev_tv = 57.0 < 60 AND new_tv = 58.5 < 60` → `threshold_crossed_upward_tv = false` (no cancelación TV-only)
- **Paso 5** (revenue): `tv_weekly_eur_k = 7.16` (NACIONAL D1 ACTIVE, revenue completo)
- **Paso 6** (cascade-engine): inyecta `external_delta = +4` → `corruption_exposure = max(0, 58.5 + 4) = 62.5`
- **Paso 7** (threshold post-cascade): `prev_cascade = 58.5 < 60 AND new_cascade = 62.5 >= 60` → `threshold_crossed_upward_cascade = true`
- **Paso 8** (cancelación cascade): `tv_contract_status = "CANCELLED"`, si `current_week ≤ 35` se genera `tv_midseason_offer` con `tier = "REGIONAL"` (TIER_BELOW[NACIONAL])

THEN: al final del tick, `corruption_exposure = 62.5`, `tv_contract_status = "CANCELLED"`, revenue de este tick = 7.16 €K (preservado del paso 5, la cancelación cascade no es retroactiva), y existe exactamente un `tv_midseason_offer` pendiente si `current_week ≤ 35`. A partir del siguiente tick, revenue = 0.

**Comparación con AC-TV-39 (cancelación por F-TV3)**: en AC-TV-39 el revenue del tick de cancelación = 0 porque el paso 4 cancela antes del paso 5. En AC-TV-40 el revenue se preserva porque la cancelación ocurre en paso 8, después del paso 5. **Esta asimetría es intencional**: las cancelaciones por escrutinio mediático interno (F-TV3) cortan el ingreso del mismo tick, mientras que las cancelaciones por evento externo (cascade-engine) cortan el ingreso desde el tick siguiente.

**AC-TV-41** *(Integration — multi-year cancellation)* — GIVEN manager firmó NACIONAL 3-años en temporada S (`season_in_contract = 1`), WHEN escrutinio mediático cancela el contrato en semana 20 de temporada S (≤ 35), THEN `tv_contract_status = "CANCELLED"`, las temporadas 2 y 3 del contrato quedan anuladas, se genera `tv_midseason_offer` con `tier = "REGIONAL"`. WHEN `season_start` de temporada S+1 ejecuta, THEN `tv_contract_status = "NONE"` y se genera `tv_auction` normal (`duration_seasons` del contrato cancelado no influye).

**AC-TV-42** *(Logic — REGIONAL 2yr D1 rate)* — GIVEN el manager firma REGIONAL 2-años con el club en D1 (accesible vía `manager_reputation ≥ 2`), WHEN avanza la semana, THEN `tv_weekly_rate_eur_k = 2.48` (`Math.round(175 × 135 × 105 / 10000) / 100 = Math.round(248.0625) / 100 = 248/100 = 2.48`).

**AC-TV-43** *(Logic — double-sign rejection)* — GIVEN `tv_contract_status = "ACTIVE"` (jugador ya firmó una oferta en `tv_auction` o `tv_midseason_offer`), WHEN el cliente envía una segunda petición de firma de contrato (POST a `/api/tv/sign`) con un nuevo `offer_id`, THEN el servidor responde HTTP `409 Conflict` con body `{ error: "tv_contract_already_active", current_status: "ACTIVE", current_tier: <tier>, season_id: <S>, season_in_contract: <n> }` y no modifica el estado del contrato existente. El cliente debe gestionar el caso en UI (deshabilitar el botón de firma cuando ya hay contrato activo).

**AC-TV-44** *(Integration — promotion D2→D1 within multi-year)* — GIVEN manager firmó REGIONAL 2-años en D2 (`division_at_signing = "D2"`, `tv_weekly_rate_eur_k = 1.84`), WHEN el sistema de liga registra ascenso a D1 al final de la temporada S (con `season_in_contract = 1 < duration_seasons = 2`), THEN en el rollover `season_in_contract = 2`, `tv_weekly_rate_eur_k` permanece `1.84` (no se recalcula a la tarifa D1 de 2.36 €K/sem que el club teóricamente calificaría). El contrato refleja `division_at_signing`, no la división actual. Es la trampa de ascenso documentada en Edge Cases.

**AC-TV-45** *(Integration — cross-season corruption accumulation in multi-year)* — GIVEN manager firmó REGIONAL 2-años en temporada S con `corruption_exposure = 0` al inicio (suma de F-TV3 durante temporada S = `38 × 0.5 = 19`), WHEN finaliza la semana 38 de temporada S, THEN `corruption_exposure = 19.0` y `tv_contract_status` permanece `"ACTIVE"` (rollover automático a `season_in_contract = 2`). WHEN inicia el tick 1 de temporada S+1, THEN `corruption_exposure = 19.0` (no se resetea al rollover) y el delta REGIONAL +0.5 se aplica desde ese valor. El acumulado al final de temporada S+1 será `19.0 + 19.0 = 38.0`, todavía bajo `TV_SCANDAL_THRESHOLD (60)`.

**AC-TV-46** *(Logic — fan_loyalty pathway, F-TV4)* — GIVEN `fan_loyalty = 0`, WHEN el jugador rechaza todas las ofertas de `tv_auction`, THEN `fan_loyalty = 10`. GIVEN el cálculo de matchday revenue ejecuta esa misma temporada con `fan_attendance = 0.60`, THEN `fan_attendance_effective = 0.60 × (1 + 10 × 0.005) = 0.60 × 1.05 = 0.63` (boost de +5%). GIVEN `fan_loyalty = 50` (cap) y el jugador rechaza otra oferta, THEN `fan_loyalty` permanece `50` (no excede el cap). GIVEN `fan_loyalty = 50` con `fan_attendance = 0.60`, THEN `fan_attendance_effective = 0.60 × 1.25 = 0.75` (boost de +25%).

**AC-TV-47** *(Integration — LOCAL cancelado por cascade-engine)* — GIVEN contrato LOCAL ACTIVE con `corruption_exposure = 58.0` y `current_week = 20` (≤ 35), WHEN el tick semanal ejecuta el orden canónico: paso 2 (F-TV3 delta LOCAL = -0.5) → `corruption_exposure = Math.min(100, Math.max(0, 58.0 - 0.5)) = 57.5`; paso 3 (threshold TV): `(58.0 < 60) AND (57.5 >= 60) = false` — sin cancelación por F-TV3; paso 6 (cascade-engine) inyecta `external_delta = +4.0` → `corruption_exposure = Math.min(100, Math.max(0, 57.5 + 4.0)) = 61.5`; paso 7 (threshold post-cascade): `prev_cascade = 57.5 < 60 AND new_cascade = 61.5 >= 60` → `threshold_crossed_upward_cascade = true`, THEN: `tv_contract_status = "CANCELLED"`, se genera exactamente un `tv_midseason_offer` con `tier = "LOCAL"` (TIER_BELOW[LOCAL] = LOCAL) y tarifa `Math.round(53 × DIVISION_MULTIPLIER_CENTS[div] × 70 / 10000) / 100`. Este es el único escenario donde el tier ofertado mid-season = tier cancelado.

**AC-TV-48** *(Integration — NACIONAL 3yr D2, promotion D2→D1 in year 2)* — GIVEN manager firmó NACIONAL 3-años en D2 (`division_at_signing = "D2"`, `tv_weekly_rate_eur_k = 5.83`, `season_in_contract = 1`), WHEN el sistema de liga registra ascenso a D1 al final de la temporada S y ejecuta el rollover automático (`season_in_contract = 2`), THEN `tv_weekly_rate_eur_k` permanece `5.83` (no se recalcula al valor D1 de 7.87 €K/sem). La trampa de ascenso aplica también a NACIONAL 3yr: `division_at_signing` es inmutable para toda la duración del contrato.

**AC-TV-49** — GIVEN el manager está en D1 (segunda temporada o posterior, prev_season también fue D1), `manager_reputation = 1` (< 2) y `corruption_exposure < 60`, WHEN se genera la subasta, THEN `tv_auction.offers` contiene `tier = "LOCAL"`, `tier = "REGIONAL"` (por condición `D1 actual` añadida en R6) y `tier = "NACIONAL"` (por condición `D1 actual`) — los tres tiers están disponibles. `offers.length = 3`. Sin la condición `D1 actual` en REGIONAL, este escenario producía LOCAL+NACIONAL sin REGIONAL (gap contraintuitivo corregido en R6).

**AC-TV-50** *(Logic — F-TV1 guard: combinación ilegal LOCAL 2yr)* — GIVEN el cliente envía `POST /api/tv/sign` con `{ tier: "LOCAL", duration_seasons: 2, offer_id: <valid_offer_id> }`, WHEN el servidor valida la combinación tier+duration, THEN el servidor responde HTTP `400 Bad Request` con body `{ error: "illegal_tier_duration", tier: "LOCAL", duration_seasons: 2, message: "LOCAL contracts must have duration_seasons = 1" }` y no crea ningún contrato ni modifica `tv_contract_status`. El guard de F-TV1 (`RangeError("Illegal tier+duration: LOCAL/2")`) debe propagarse como HTTP 400 — no como 500 ni como error silencioso.

**AC-TV-51** *(Logic — F-TV1 guard: combinación ilegal REGIONAL 3yr)* — GIVEN el cliente envía `POST /api/tv/sign` con `{ tier: "REGIONAL", duration_seasons: 3, offer_id: <valid_offer_id> }`, WHEN el servidor valida la combinación tier+duration, THEN el servidor responde HTTP `400 Bad Request` con body `{ error: "illegal_tier_duration", tier: "REGIONAL", duration_seasons: 3, message: "REGIONAL contracts must have duration_seasons ∈ {1, 2}" }` y no crea ningún contrato. Análogamente, `{ tier: "NACIONAL", duration_seasons: 2 }` debe también responder HTTP 400 (NACIONAL solo permite duration_seasons ∈ {1, 3}).

**AC-TV-52** *(Logic — NACIONAL cliff exacto en corruption=3.0)* — GIVEN contrato NACIONAL 1yr ACTIVE con `corruption_exposure = 3.0` al inicio de la temporada (tick de semana 1), WHEN el tick semanal aplica F-TV3 acumulativamente durante 38 semanas, THEN el cruce del threshold ocurre exactamente en semana 38: `3.0 + 38 × 1.5 = 60.0 ≥ 60` → `threshold_crossed_upward = true` en semana 38, `tv_contract_status = "CANCELLED"`, revenue semana 38 = 0 (cancelación en paso 4 antes de paso 5), no se genera `tv_midseason_offer` (semana 38 > 35). GIVEN `corruption_exposure = 2.9` al inicio, WHEN avanza la temporada completa, THEN no hay cancelación: `2.9 + 38 × 1.5 = 59.9 < 60` → `tv_contract_status` permanece `"ACTIVE"` hasta semana 38, donde transiciona a `"EXPIRED"` normalmente. Este par verifica el cliff estrictamente en `corruption_exposure < 3.0`.

**AC-TV-53** *(Integration — NACIONAL 3yr ciclo completo sin cancelación)* — GIVEN manager firma NACIONAL 3-años con `corruption_exposure = 0.0` al inicio de temporada S y club en D2 (`tv_weekly_rate_eur_k = 5.83`, `season_in_contract = 1`):
- **Temporada S**: tick acumula `0 + 38 × 1.5 = 57.0 < 60` → sin cancelación. `season_end`: `season_in_contract = 2`, sin `tv_auction`.
- **Temporada S+1**: tick parte de `57.0`, acumula `57.0 + 38 × 1.5 = 114.0` → pero `CORRUPTION_MAX = 100`, clamp: valor final = `100.0`. El threshold (60) se cruza en esta temporada. Semana de cruce: `(60 - 57.0) / 1.5 = 2` → `threshold_crossed_upward = true` en semana 2 de T2.
THEN: NACIONAL 3yr NO completa las 3 temporadas con `corruption_exposure = 0` al inicio — la acumulación de T1 (57.0) garantiza cancelación en T2 semana 2. Este AC confirma que el happy path completo de NACIONAL 3yr solo es posible si `corruption_exposure` se resetea entre temporadas (comportamiento que NO ocurre — la corrupción no se resetea en rollover multi-año). **Nota de diseño**: NACIONAL 3yr no tiene happy path completo sin cancelación a menos que el manager reduzca la corrupción externamente a < 3.0 antes de cada rollover — lo cual es mecánicamente imposible con NACIONAL activo (+1.5/sem). El contrato NACIONAL 3yr se cancela garantizadamente en T2. Esto es el riesgo documentado en Rule 5b; este AC lo verifica numéricamente.

**AC-TV-54** *(Integration — rechazo en T1)* — GIVEN `prev_season_final_position = null` (primera temporada), `tv_contract_status = NONE`, WHEN el sistema genera `tv_auction` en `season_start` de T1 y el jugador rechaza la única oferta disponible (`tier = "LOCAL"`), THEN: `tv_contract_status` permanece `"NONE"`, `fan_loyalty += 10` (valor inicial: 10 si era 0), el evento `tv_auction` queda `consumed = true`, y `POST /api/game/advance` se desbloquea normalmente para la semana 1. En `season_start` de T2, el sistema genera una nueva `tv_auction` con las condiciones de desbloqueo re-evaluadas normalmente (`prev_season_final_position` ya tiene valor de T1, etc.).

## Open Questions

- **~~OQ-TV-01~~** ✅ **RESUELTO** (2026-05-20): Canales generados por temporada — sin tabla `tv_channels` en DB. Solo se almacenan `tier + tarifa`. La Player Fantasy fue actualizada para no depender de persistencia de nombre/narrador. El arco narrativo es el conteo de sobres, no el reconocimiento del canal.
- **~~OQ-TV-02~~** ✅ **RESUELTO** (2026-05-20): BREAKING CHANGE ejecutado en commit `bf37f61`. `getTVRightsWeekly()` y constantes `TV_RIGHTS_SEGUNDA/PRIMERA` eliminadas del código. ACs marcados deprecated en `league-system.md §F6` (AC-LGS-18/19) y `economy.md` (AC-ECO-05).
- **~~OQ-TV-03~~** ✅ **RESUELTO** (2026-05-20): Decisión — F-TV4 se aplica como modificador en **`economy.md §F1`** (matchday revenue), no como nodo derivado en cascade-engine. Rationale: `fan_loyalty` no es nodo de WorldState (vive en `managers.fan_loyalty`); mantenerlo fuera del cascade preserva la pureza del grafo. `entities.yaml` ya tiene la entrada (añadida 2026-05-20). `economy.md §F1` actualizado con la fórmula explícita en este mismo commit.
- **~~OQ-TV-04~~** ✅ **RESUELTO** (2026-05-20): `ADR-019: TV Rights Implementation Contract` escrito y cubre los 8 puntos enumerados en R6. Ver `docs/architecture/ADR-019-tv-rights-implementation-contract.md`. ⚠️ El header del ADR aún dice `Proposed` aunque el epic + código shipped — pendiente bump a `Accepted` por separado (no bloquea el cierre del epic; tracked como drift menor).
