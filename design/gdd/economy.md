# Economía del Club

> **Status**: Approved (post /design-review + revisión en sesión 2026-05-17 — ver design/gdd/reviews/economy-review-log.md)
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-17
> **Implements Pillar**: P1 (Tinkering Beats Optimization) · P4 (Calm Is The Tempo)

## Overview

El sistema económico del club es el substrato financiero de todas las decisiones de gestión. Calcula ingresos — taquilla (asistencia × precio de entrada), derechos de televisión (contrato anual con canal — ver `tv-rights.md`), patrocinio semanal (`sponsor_quality`) y traspasos — y gastos — nómina semanal de plantilla y staff, presupuestos operativos (campo, catering, scouting), inversiones en infraestructura del estadio y multas — produciendo un balance disponible que determina qué puede permitirse el manager semana a semana. El sistema recibe `fan_attendance`, `fan_momentum` y `sponsor_quality` del motor de cascadas; sus propios nodos económicos son independientes y se persisten entre sesiones vía ADR-005. Es la capa que convierte los resultados deportivos en capacidad o incapacidad de mejorar el club: ganar llena las gradas, las gradas pagan la nómina, la nómina retiene a los jugadores clave, los jugadores clave ganan más partidos. Cada división tiene un multiplicador fijo sobre los derechos de TV y el techo de patrocinio — ascender vale dinero real. Cuando el balance cae por debajo de un umbral crítico, la directiva convoca una reunión de emergencia con opciones de rescate; no hay game-over, hay una historia nueva de supervivencia.

## Player Fantasy

El jugador de Cascada FC vive la economía en dos registros simultáneos: el del gestor que hace malabarismos cada fin de mes, y el del arquitecto que sabe que la inversión de hoy es el jugador estrella de dentro de tres temporadas.

Al inicio, la economía es **supervivencia**. La nómina es más cara que los ingresos de taquilla. Subir el precio de entradas para cuadrar cuentas es tentador — pero el jugador que ya descubrió la cascada de `fan_momentum` sabe que ese atajo tiene un coste diferido. La satisfacción no es "tener dinero"; es llegar al domingo con balance positivo y sin haber sacrificado nada que no se pudiera recuperar.

Al crecer, la economía es **construcción**. El ascenso de división multiplica los derechos de TV. El patrocinador que firmaste hace seis semanas —cuando el club no valía nada— ahora renueva por el doble. La nómina de los jugadores buenos ya está pagada con el revenue de las gradas llenas. Ese ciclo virtuoso — ganar → lleno → cobrar → contratar → ganar — es la promesa del sistema económico, y el jugador la siente en sus propios números, no en ningún tooltip.

La economía tiene su propio momento "ajá": *"ah, por eso la directiva me está llamando — bajé el catering para ahorrar, el staff se desmoralizó, el equipo rindió peor, las gradas se vaciaron, y ahora no llego a la nómina."* Es el mismo descubrimiento causal del motor de cascadas, pero con dinero real del club como marcador.

## Detailed Design

### Core Rules

1. El ciclo económico se evalúa **una vez por semana**, sincronizado con el tick del cascade-engine. El cálculo ocurre después de que el cascade produce su `TickResult`, leyendo los valores del `nextState`.

2. El estado económico del club (`ClubFinances`) es independiente del WorldState del cascade-engine. Contiene: `balance_eur_k` (balance en miles de €), `weekly_wage_bill_eur_k` (nómina semanal total de plantilla + staff), `debt_outstanding_eur_k` (deuda pendiente de préstamos), `weekly_debt_repayment_eur_k` (cuota semanal de amortización). Persistido en Postgres vía ADR-005.

3. **Ingresos semanales:**
   - **Taquilla** *(semana de partido únicamente)*: `fan_attendance × STADIUM_CAPACITY_BASE × ticket_price_eur × (1 + HOME_ADVANTAGE_BONUS si es partido local)`. Solo genera ingreso la semana que hay partido de liga o copa.
   - **Patrocinio**: suma del `revenue_weekly_eur_k` de los contratos activos en los 2 slots (camiseta + estadio). Valor fijo según el `SPONSOR_TIER` y el nivel del club en el momento de la firma.
   - **Derechos de TV**: ingreso semanal fijo del contrato activo con un canal de televisión. Fuente de verdad: `tv-rights.md`. El valor es `tv_contract.weekly_rate_eur_k` (ó 0 si no hay contrato activo). Ver F2 para el cálculo histórico de referencia.
   - **Traspasos (entrada)**: delta extraordinario inmediato al `balance_eur_k` al completar la venta de un jugador.

4. **Gastos semanales:**
   - **Nómina**: suma de todos los contratos activos (plantilla + staff). Gasto semanal recurrente.
   - **Presupuestos operativos**: los valores `[0–100]` de `groundskeeper_budget`, `catering_budget`, `scouting_budget` en el WorldState se convierten a coste real mediante `budget_eur_k = node_value × BUDGET_EUR_K_PER_100`. Éste es el puente entre el slider de operación del jugador y el balance del club.
   - **Inversiones en infraestructura del estadio**: delta extraordinario negativo al completar una mejora.
   - **Traspasos (salida)**: delta extraordinario negativo al completar la compra de un jugador.
   - **Multas y penalizaciones**: delta extraordinario negativo generado por el event-system (incomparecencia, sanciones de fair play).
   - **Cuota de deuda**: `weekly_debt_repayment_eur_k` si hay deuda activa. Gasto obligatorio que no puede omitirse.

5. El manager controla `ticket_price_index` ([0–100] del WorldState del cascade) en cualquier momento sin restricción temporal. La economía traduce ese índice a precio real: `ticket_price_eur = TICKET_PRICE_BASE × (0.5 + ticket_price_index / 100)`. El cascade ya modela las consecuencias en `fan_attendance` (C8) y `fan_momentum` (C15).

6. **Patrocinadores — 2 slots (camiseta + estadio):**
   - Cada slot admite un contrato activo. Contratos duran 1 temporada (38 semanas de liga).
   - `revenue_weekly_eur_k` de cada contrato depende del `SPONSOR_TIER` (1–5) del patrocinador y del nivel del club en el momento de la firma.
   - Firmar un patrocinio es una PlayerDecision que también actualiza `sponsor_quality` en el WorldState del cascade-engine vía el event-system.
   - Al final de la temporada el event-system genera ofertas de renovación que reflejan el nivel actual del club. Ascender mejora las ofertas; descender las empeora.
   - Un slot vacío no genera ingreso de patrocinio. El manager es responsable de mantener los slots ocupados.
   - **Tabla de mapeo nivel del club → tiers de patrocinador disponibles:**

| Condición del club | Tiers disponibles en oferta |
|---|---|
| Primera temporada (sin historial) | 1–2 |
| D2, posición 11–20 (zona baja) | 1–2 |
| D2, posición 1–10 (zona alta) | 1–3 |
| D1, posición 11–20 (zona baja) | 2–4 |
| D1, posición 1–10 (zona alta) | 3–5 |
| Modificador: `manager_reputation ≥ 3.0` | +1 tier máximo (hasta tier 5) |

El event-system evalúa esta tabla en el momento de generar la oferta (al inicio de temporada o post-ascenso). El tier específico ofrecido dentro del rango disponible se determina con PRNG seeded para evitar `Math.random()`.

7. **Board Meeting de Rescate:**
   - Se dispara cuando `balance_eur_k < CRITICAL_BALANCE_THRESHOLD_EUR_K`.
   - Genera un ThresholdCrossing económico BLOCKING que detiene el advance loop.
   - El manager DEBE elegir entre: (a) vender un jugador ahora (caja inmediata), o (b) aceptar un préstamo de emergencia (caja inmediata + cuota semanal + interés). Si hay 2 préstamos activos, la opción (b) no está disponible (ver §8).
   - El board meeting no puede descartarse ni ignorarse. Sin elección, el juego no avanza.
   - **Sliders read-only durante BLOCKING:** Mientras el ThresholdCrossing BLOCKING está activo y pendiente de resolución, los sliders de `groundskeeper_budget`, `catering_budget` y `scouting_budget` son read-only. Esta restricción impide que el manager manipule `weekly_total_costs` para reducir artificialmente el umbral CRITICAL y "escapar" de la crisis sin elegir una opción de rescate. El slider de `ticket_price_index` permanece editable (no afecta weekly_total_costs).

8. **Deuda (préstamo de emergencia):**
   - Solo se crea si el manager acepta la opción (b) en un board meeting.
   - Se amortiza a `WEEKLY_DEBT_REPAYMENT_EUR_K` cada semana (gasto obligatorio sobre la nómina).
   - Si el balance vuelve a caer a Crisis con un préstamo activo, el segundo board meeting ofrece la opción de un segundo préstamo con `effective_rate` mayor (ver F6).
   - **Tope de 2 préstamos activos simultáneos:** Si el balance cae a Crisis con 2 préstamos activos, el board meeting solo ofrece la opción (a) — vender jugadores. La opción de préstamo no está disponible. Esta restricción evita que el 3er préstamo lleve al club a un espiral matemáticamente inescapable (~47€K/sem de cuotas vs ingresos D2 de ~9€K en semana de visita).

9. **Catch-up mechanic — Congelación de nómina de emergencia (evento único):**
   - Disponible **una sola vez por temporada** cuando `balance_eur_k` cae en estado `En Riesgo` (no Crisis) durante las primeras 15 semanas de temporada.
   - La directiva ofrece diferir el **50% de la nómina** durante **4 semanas** consecutivas → alivio de ~`0.5 × weekly_wage_bill_eur_k × 4` €K sin intereses ni deuda.
   - El diferimiento se cancela automáticamente al final de la semana 4; las semanas 5 y 6 recuperan el pago normal sin cuota extra (la deuda diferida queda condonada — es un gesto de la directiva, no un préstamo).
   - Condicional: solo disponible si el club no tiene deuda activa de préstamo en ese momento.
   - Gestionado por `event-system.md` como `WageFreeze` event — economy solo registra los 4 semanas de `actual_wage_bill = 0.5 × weekly_wage_bill`.
   - **Diseño intent**: permite que un jugador con ~50% de victorias en D3 sobreviva su primera temporada completa. El diferimiento da ~4-6 semanas adicionales de runway sin incentivo perverso (sin deuda, el jugador sigue gestionando su economía en lugar de ignorarla).
   - **Interacción con Relegation Financial Review:** Si el jugador eligió la Opción C (Voto de Confianza del Propietario) en la pre-temporada post-descenso, el Catch-up mechanic NO está disponible ese año (`owner_injection_used_this_season = true`).

10. **Relegation Financial Review — crisis de pre-temporada post-descenso:**
   - Se genera por `processSeasonEnd()` cuando el club del jugador es relegado de D1 a D2 y `weekly_wage_bill_eur_k > RELEGATION_WAGE_RISK_FACTOR × (tv_rights_annual_d2_eur_k / 38)`.
   - Es un evento BLOCKING de pre-temporada (semana 0 de la nueva D2) — el advance loop no puede continuar hasta que el manager elige una opción.
   - **Opción A — Pacto de Nómina de Solidaridad:** El vestuario acepta una reducción del `RELEGATION_WAGE_CUT_PCT` (20%) de la nómina durante `RELEGATION_WAGE_CUT_WEEKS` (12) semanas. Genera `player_happiness -= RELEGATION_MORALE_PENALTY` como PlayerDecision en el cascade tick de semana 1.
   - **Opción B — Venta de Pre-Temporada:** Venta automática de los 2 jugadores con mayor contrato al `RELEGATION_FIRE_SALE_RATE` (80%) del market value. `fan_momentum -= RELEGATION_FAN_MOMENTUM_PENALTY` en cascade tick de semana 1. Dependencia forward: `player-management.md` (simplification MVP: top-2 por wage).
   - **Opción C — Voto de Confianza del Propietario:** Inyección de `RELEGATION_OWNER_INJECTION_EUR_K` (150€K) sin interés, repagable a `RELEGATION_OWNER_WEEKLY_REPAYMENT_EUR_K` (4€K) durante `RELEGATION_OWNER_LOAN_WEEKS` (38) semanas. Solo disponible si `manager_reputation >= RELEGATION_OWNER_MIN_REPUTATION` (2.0).
   - Spec completo: `design/quick-specs/relegation-contract-crisis-2026-05-17.md`.

---

### States and Transitions

| Estado del Club | Condición | Comportamiento |
|-----------------|-----------|----------------|
| `Solvente` | `balance_eur_k > WARNING_THRESHOLD_EUR_K` | Normal. Sin restricciones. |
| `En Riesgo` | `balance_eur_k ≤ WARNING_THRESHOLD_EUR_K` y `> CRITICAL_THRESHOLD_EUR_K` | El engine económico emite ThresholdCrossing ADVISORY directamente al event-system. El jugador recibe esta alerta independientemente del estado del `finance_director`. Sin restricciones de gasto. *(El `finance_director` activo aporta señales derivadas sobre `sponsor_quality` y `corruption_exposure` via staff-system, pero el ADVISORY de balance lo genera el engine, no el worker de staff — ver staff-system.md §Notas de bidireccionalidad.)* |
| `Crisis` | `balance_eur_k ≤ CRITICAL_THRESHOLD_EUR_K` | Board meeting BLOCKING generado. Manager debe elegir opción de rescate antes de avanzar. |
| `Insolvente técnica` | No alcanzable en MVP | El board meeting siempre ofrece al menos una opción viable. No hay game-over económico. |

Las transiciones son instantáneas: el estado se recalcula al final de cada tick semanal tras aplicar todos los ingresos y gastos.

---

### Interactions with Other Systems

**← `cascade-engine.md`** *(economy lee; cascade calcula)*
- **Lee**: `fan_attendance` (para taquilla), `fan_momentum` (contexto para messaging de director financiero), `sponsor_quality` (para validar coherencia con contratos activos)
- **No escribe** al WorldState del cascade directamente
- **Contrato**: el cascade produce su TickResult → economy lee el nextState → calcula ClubFinances → persiste

**→ `event-system.md`** *(economy genera eventos; event-system los rutea)*
- **Genera**: ThresholdCrossings económicos BLOCKING (crisis de balance), mensajes ADVISORY (En Riesgo), ofertas de patrocinador al final de temporada
- **Recibe**: resolución del board meeting (opción elegida → delta en ClubFinances), multas (delta negativo), firma de patrocinador (delta positivo en balance + actualización de `sponsor_quality` via PlayerDecision)

**← `player-management.md`** *(economy lee contratos de jugadores)*
- **Lee**: contratos activos de jugadores → suma para `weekly_wage_bill_eur_k`. Valor de mercado de jugadores disponibles para la opción de venta del board meeting
- **Recibe**: ingreso/gasto de traspaso como PlayerDecision

**← `staff-system.md`** *(economy lee contratos de staff)*
- **Lee**: contratos activos de staff → contribuyen a `weekly_wage_bill_eur_k`

**← `league-system.md`** *(economy lee división actual)*
- **Lee**: `current_division` del club → determina `DIVISION_TV_MULTIPLIER` aplicable

**→ `hud-ui.md`** *(economy expone sus datos para el DOM)*
- **Expone**: `balance_eur_k`, `weekly_wage_bill_eur_k`, `weekly_income_projection_eur_k`, `debt_outstanding_eur_k`, estado del club (Solvente/En Riesgo/Crisis), resumen de contratos activos de patrocinio

**← `manager-rpg.md`** *(influencia pasiva sobre ofertas de patrocinador)*
- **Recibe (via event-system)**: modificador de oferta de patrocinador basado en la reputación del manager. Definido en manager-rpg.md — economy solo consume el valor final de la oferta.

### Contrato de eventos para narrativa causal

Para que `hud-ui.md` y `event-system.md` puedan cerrar el bucle causal del "momento ajá" (bajé-catering → equipo-rindió-peor → gradas-vacías → no-llego-a-nómina), economy debe emitir el siguiente contrato de datos al final de cada tick:

```typescript
interface EconomyWeeklySummary {
  balance_new_eur_k: number;
  balance_delta_eur_k: number; // positivo = ingreso neto, negativo = pérdida
  breakdown: {
    taquilla_eur_k: number;      // 0 si semana de visita
    tv_rights_eur_k: number;
    patrocinio_eur_k: number;
    nomina_eur_k: number;         // negativo
    opex_eur_k: number;           // negativo — suma de los 3 presupuestos
    deuda_repayment_eur_k: number; // negativo si hay préstamo activo
    extraordinarios_eur_k: number; // multas, traspasos, infraestructura
  };
  state: 'Solvente' | 'EnRiesgo' | 'Crisis';
  state_changed: boolean;          // true si el estado cambió respecto al tick anterior
  is_home_match_week: boolean;     // el HUD puede mostrar "próxima semana: visitante"
  next_3_weeks_home_schedule: boolean[]; // horizonte de taquilla próximo
}
```

El `breakdown` permite al HUD y al event-system identificar el slider que causó el problema y generar el mensaje de diagnóstico causal ("tu catering bajó → player_happiness cayó → rendimiento cayó → asistencia cayó → estas aquí").

## Formulas

Todas las funciones económicas son **funciones puras** sin `Math.random()`. Cuando hay aleatoriedad (ruido de mercado) se usa el seeded PRNG del contexto de simulación.

---

### F0: Costes semanales totales del club

`weekly_total_costs_eur_k = weekly_wage_bill_eur_k + total_opex_eur_k + weekly_debt_repayment_eur_k`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Nómina semanal | `W` | float | 10–200 €K | Suma de contratos activos (plantilla + staff) |
| Costes operativos totales | `OPEX` | float | 0–6.5 €K | Suma de los 3 presupuestos operativos (ver F4) |
| Cuota semanal de deuda | `D` | float | 0–20 €K | 0 si no hay deuda activa |

**Rango del output:** ~10 €K/sem (club D2 mínimo) a ~60+ €K/sem (club D1 grande)
**Ejemplo (D2 inicio, defaults):** 15 + 3.25 + 0 = **18.25 €K/sem**

---

### F1: Ingresos de taquilla por partido (match_day_revenue)

> **⚠️ Actualizado 2026-05-20**: integrado el multiplicador F-TV4 de `tv-rights.md`. La asistencia base del cascade (`fan_attendance`) se amplifica por `fan_loyalty` antes del cálculo de taquilla.

`fan_attendance_effective = min(1.0, fan_attendance × (1 + fan_loyalty × FAN_LOYALTY_ATTENDANCE_FACTOR))` *(donde `fan_attendance` se interpreta como fracción [0, 1] equivalente a `fan_attendance_pct / 100`)*

`match_day_revenue_eur_k = fan_attendance_effective × STADIUM_CAPACITY_BASE × ticket_price_eur / 1000 × is_home_match`

Donde `ticket_price_eur = TICKET_PRICE_BASE × (0.5 + ticket_price_index / 100)`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| % asistencia normalizado | `fan_attendance` | float | 0–100 | Calculado por cascade-engine (C8). Representa % del aforo que asiste |
| Lealtad acumulada por rechazos TV | `fan_loyalty` | int | 0–50 | Columna `managers.fan_loyalty`. Owner: `tv-rights.md`. +10 por cada rechazo de oferta TV (cap 50). |
| Factor de amplificación por loyalty | `FAN_LOYALTY_ATTENDANCE_FACTOR` | float | 0.005 (locked) | Per `tv-rights.md §F-TV4`: 0.5% adicional por punto de loyalty |
| Asistencia efectiva tras F-TV4 | `fan_attendance_effective` | float | 0.0–1.0 | Resultado clampeado en 1.0 (no se puede superar el aforo) |
| Aforo del estadio | `STADIUM_CAPACITY_BASE` | int | Tabla por div. | Espectadores máximos. Constante de división (ver tabla) |
| Precio de entrada en € | `ticket_price_eur` | float | `TICKET_PRICE_BASE × 0.5` a `× 1.5` | Derivado de `ticket_price_index` del WorldState |
| Partido en casa | `is_home_match` | int | {0, 1} | 1 = local (genera taquilla); 0 = visitante (0 ingresos) |

**Constantes por división:**

| División | `STADIUM_CAPACITY_BASE` | `TICKET_PRICE_BASE` |
|----------|------------------------|---------------------|
| D2 (Segunda) | 6 000 | 12 € |
| D1 (Primera) | 12 000 | 18 € |

**Rango del output:** 0 (partido visitante o asistencia 0) a ~108 €K (D2, 100% asistencia, precio máximo) · D1: ~324 €K (100% asistencia, precio máximo)
**Ejemplo D2, `fan_attendance=40`, `fan_loyalty=0`, precio justo, en casa:**
`fan_attendance_effective = min(1.0, 0.40 × 1.0) = 0.40` → `0.40 × 6000 × 12 / 1000 × 1 = 28.8 €K`
**Ejemplo D2, `fan_attendance=40`, `fan_loyalty=30` (tres rechazos), precio justo, en casa:**
`fan_attendance_effective = min(1.0, 0.40 × 1.15) = 0.46` → `0.46 × 6000 × 12 / 1000 × 1 = 33.12 €K` (+4.32 €K vs. baseline, +15%)

---

### F2: Derechos de TV semanales (weekly_tv_rights)

> **⚠️ Actualizado 2026-05-20**: La fórmula plana original queda como referencia histórica. La fuente de verdad para el cálculo es ahora `tv-rights.md §F-TV1`. El valor real en runtime es `tv_contract.weekly_rate_eur_k` del contrato activo (0 si sin contrato).

**Fórmula de referencia (histórica — pre tv-rights.md):**

`weekly_tv_rights_eur_k = TV_RIGHTS_ANNUAL_EUR_K[division] / SEASON_LENGTH_WEEKS`

| División | `TV_RIGHTS_ANNUAL_EUR_K` | Revenue semanal de referencia |
|----------|--------------------------|-------------------------------|
| D2 (Segunda) | 20 €K | ~0.53 €K/sem |
| D1 (Primera) | 270 €K | ~7.11 €K/sem |

Los valores 20 €K (D2) y 270 €K (D1) corresponden al canal LOCAL en D2 y al canal NACIONAL en D1 respectivamente — los techos conservados en `tv-rights.md §F-TV1`. Los ACs que citan estos valores siguen siendo válidos para el escenario de contrato LOCAL/D2 o NACIONAL/D1.

**Nota código**: `TV_RIGHTS_SEGUNDA = 3 €K/sem` y `TV_RIGHTS_PRIMERA = 8 €K/sem` en `constants.ts` son incorrectos respecto a este GDD (equivalen a 114/304 €K/año vs. 20/270 del registry). Deben corregirse al implementar `tv-rights` (ver `OQ-TV-02`).

---

### F3: Revenue semanal de patrocinador (sponsor_weekly_revenue)

`sponsor_weekly_revenue_eur_k = SPONSOR_BASE_WEEKLY_EUR_K[tier] × SLOT_MULTIPLIER[slot] × LEVEL_MODIFIER`

Donde `LEVEL_MODIFIER = 0.8 + (0.4 × (division_factor + position_factor) / 2)`
Con `division_factor = (3 − division) / 2` → D1: 1.0 · D2: 0.5
Y `position_factor = max(0, (CLUBS_PER_DIVISION + 1 − final_position) / CLUBS_PER_DIVISION)` = `max(0, (21 − final_position) / 20)` para liga de 20 clubs. Rango: D2 pos=1 → 1.0 · D2 pos=20 → 0.05.
**Primera temporada:** usar `final_position = 10` como proxy (mediana de 20 clubs).

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Tier del patrocinador | `tier` | int | 1–5 | 1 = pequeño negocio local; 5 = multinacional |
| Revenue base semanal por tier | `SPONSOR_BASE_WEEKLY_EUR_K` | tabla | 0.7–28 €K | Ver tabla |
| Tipo de slot | `slot` | enum | jersey/stadium | Jersey = 1.3×; Stadium = 1.0× |
| Modificador de nivel del club | `LEVEL_MODIFIER` | float | [0.90, 1.20] | D2: [0.90, 1.10] · D1: [1.01, 1.20]. Calculado en el momento de la firma. |

| Tier | Revenue base/sem | Perfil del patrocinador |
|------|-----------------|------------------------|
| 1 | 0.7 €K | Negocio local |
| 2 | 1.8 €K | PYME regional |
| 3 | 5.0 €K | Empresa mediana |
| 4 | 12.0 €K | Marca nacional |
| 5 | 28.0 €K | Multinacional |

**Mapeo sponsor_quality ↔ SPONSOR_TIER** (actualizado por el event-system al firmar):

| Tier firmado | `sponsor_quality` asignado |
|---|---|
| Sin patrocinador | 0 |
| Tier 1 | 15 |
| Tier 2 | 30 |
| Tier 3 | 50 |
| Tier 4 | 70 |
| Tier 5 | 90 |

**Rango del output:** ~0.64 €K/sem (tier 1, estadio, D2 colista) a ~43.7 €K/sem (tier 5, jersey, D1 líder)
**Ejemplo D2 (Segunda) inicio, pos=10, tier 1, camiseta:**
`division_factor=(3-2)/2=0.5 · position_factor=(21-10)/20=0.55 · LEVEL_MODIFIER=0.8+0.4×(0.5+0.55)/2=1.01`
→ `0.7 × 1.3 × 1.01 ≈ 0.92 €K/sem`

---

### F4: Coste de presupuestos operativos (budget_eur_k)

`budget_eur_k = (node_value / 100) × BUDGET_EUR_K_AT_100`
`total_opex_eur_k = groundskeeper_budget_cost + catering_budget_cost + scouting_budget_cost`

| Presupuesto | `BUDGET_EUR_K_AT_100` | Coste a node=50 | Coste a node=100 |
|-------------|----------------------|-----------------|------------------|
| `groundskeeper_budget` | 2.5 €K/sem | 1.25 €K | 2.5 €K |
| `catering_budget` | 1.0 €K/sem | 0.50 €K | 1.0 €K |
| `scouting_budget` | 3.0 €K/sem | 1.50 €K | 3.0 €K |

**Total a defaults (node=50):** 3.25 €K/sem — groundskeeper(1.25) + catering(0.50) + scouting(1.50)
**Total al máximo (node=100):** 6.50 €K/sem — groundskeeper(2.50) + catering(1.00) + scouting(3.00)
**Ejemplo scouting al máximo para una ventana de fichajes:** `(100/100) × 3.0 = 3.0 €K/sem` (+1.5 €K vs default)
**Nota de balance (2026-05-17):** `BUDGET_EUR_K_AT_100[groundskeeper]` subido de 0.9 a 2.5 €K/sem para crear trade-off real vs. nómina — groundskeeper al máximo ahora representa ~14% del coste total D2 (vs 5% antes). Resolver la dominant strategy D-03 de /review-all-gdds.

---

### F5: Umbrales de estado financiero

`WARNING_THRESHOLD_EUR_K = WARNING_BUFFER_WEEKS × weekly_total_costs_eur_k`
`CRITICAL_THRESHOLD_EUR_K = CRITICAL_BUFFER_WEEKS × weekly_total_costs_eur_k`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Semanas de aviso | `WARNING_BUFFER_WEEKS` | float | 6–8 sem | Semanas de costes totales que cubre el umbral WARNING. Valor: **7** |
| Semanas de crisis | `CRITICAL_BUFFER_WEEKS` | float | 3–4 sem | Semanas de costes totales que cubre el umbral CRITICAL. Valor: **3** |
| Costes semanales totales | `weekly_total_costs_eur_k` | float | ~10–60 €K | Calculado por F0. Se recalcula cada tick |

**Rango del output (D2 inicio, costs=18.25 €K/sem):**
WARNING: 7 × 18.25 = **127.75 €K** | CRITICAL: 3 × 18.25 = **54.75 €K**
Balance inicial (250 €K) > WARNING → estado Solvente desde el día 1 ✔
**Ejemplo gestión austera:** Si el club reduce nómina a 12 €K/sem → WARNING baja a ~107 €K, CRITICAL a ~46 €K.

**Orden canónico del tick económico** (pseudocódigo — el implementador DEBE seguir este orden para resultados deterministas):
```
1. Lee cascade.TickResult.nextState (fan_attendance, fan_momentum, sponsor_quality)
2. Calcula costs_base = weekly_wage_bill + total_opex + weekly_debt_repayment_existing
3. Calcula ingresos = taquilla(is_home_match) + tv_rights + sponsor_revenue + traspasos_delta
4. Aplica multas y penalizaciones extraordinarias (escándalo, incomparecencia)
5. balance_new = balance_old + ingresos - costs_base - multas
6. Recalcula WARNING y CRITICAL usando costs_base (del paso 2, no se recalcula)
7. Evalúa estado: Solvente / En Riesgo / Crisis basado en balance_new vs umbrales
8. Emite ThresholdCrossings si el estado cambió respecto al tick anterior
```
*El préstamo de emergencia (si se acepta en el board meeting) aplica DESPUÉS del tick normal, en el mismo ciclo de avance, incrementando `balance_new` y actualizando `weekly_debt_repayment` para el siguiente tick.*

---

### F6: Préstamo de emergencia (emergency_loan)

`effective_rate = base_interest_rate × LOAN_PENALTY_MULTIPLIER^(loan_number − 1)`
`total_cost_eur_k = loan_amount_eur_k × (1 + effective_rate)`
`weekly_repayment_eur_k = total_cost_eur_k / LOAN_REPAYMENT_WEEKS`

Cantidad del préstamo calculada automáticamente:
`loan_amount_eur_k = max(CRITICAL_THRESHOLD − balance, 0) + LOAN_BUFFER_WEEKS × weekly_total_costs_eur_k`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Tasa de interés base | `base_interest_rate` | float | 0.10–0.20 | Interés total del primer préstamo. Valor: **0.15** (15%) |
| Multiplicador de penalización | `LOAN_PENALTY_MULTIPLIER` | float | 1.5–2.5 | Factor de penalización por cada préstamo adicional. Valor: **2.0** |
| Número de préstamo | `loan_number` | int | 1, 2, 3… | 1 = primer préstamo. El coste crece exponencialmente |
| Semanas de amortización | `LOAN_REPAYMENT_WEEKS` | int | 8–12 | Duración del préstamo. Valor: **10** |
| Semanas de buffer post-préstamo | `LOAN_BUFFER_WEEKS` | int | 3–5 | Margen adicional sobre el CRITICAL que cubre el préstamo. Valor: **4** |

| Préstamo # | `effective_rate` | Cuota semanal (préstamo de €100 K) |
|---|---|---|
| 1 | 15% | 11.5 €K/sem |
| 2 | 30% | 13.0 €K/sem |
| 3 | 60% | 16.0 €K/sem |

**Rango del output (cuota semanal):** ~5 €K/sem (club pequeño, 1er préstamo) a ~20+ €K/sem (club grande, 3er préstamo)
**Ejemplo D3 en crisis:** balance €30 K, costs €18 K → préstamo = (54−30) + 4×18 = **€96 K** → cuota 1er préstamo: 96×1.15/10 = **11.0 €K/sem**

---

### F7: Valor de mercado de un jugador (transfer_value)

*Definida en `player-management.md` — economy importa el valor final sin recalcular.*
Economy consume: `getTransferValue(playerId) → float €K` (interfaz definida en player-management.md).

---

### F8: Impacto económico del escándalo de corrupción

`scandal_fine_eur_k = SCANDAL_FINE_BASE_EUR_K × (1 + FINE_SEVERITY_FACTOR × (corruption_exposure − 80) / 20)`

El escándalo cancela automáticamente el contrato activo del **slot de camiseta** (si existe). El slot queda vacío el resto de la temporada.

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Nivel de exposición al evento | `corruption_exposure` | float | 80–100 | Valor del nodo WorldState al cruzar el threshold BLOCKING |
| Multa base | `SCANDAL_FINE_BASE_EUR_K` | float | 20–50 | Multa mínima al superar el umbral. Valor: **30 €K** |
| Factor de severidad | `FINE_SEVERITY_FACTOR` | float | 0.5–1.0 | Escala la multa según la magnitud del escándalo. Valor: **0.667** |

**Rango del output:** 30 €K (exposure=80) a 50 €K (exposure=100)
**Ejemplo (exposure=90):** `30 × (1 + 0.667 × 10/20) = 30 × 1.333 ≈ 40 €K`
**Nota de autoridad**: F6 (emergency_loan_amount) es la fórmula autoritativa para el monto del préstamo de emergencia. event-system.md F4d referencia F6. (R3 cross-review 2026-05-18)
**Nota MVP:** Solo el slot de camiseta cancela. El slot de estadio cancela en v1.1+ si exposure > 90.
**Cliff intencional + señal previa:** El salto de 0€K a 30€K en exposure=80 es una decisión de diseño deliberada — el escándalo es un punto de inflexión dramático. Para preservar SDT:Autonomía, el event-system emite un NOTIFY ADVISORY del staff de compliance cuando `corruption_exposure ≥ 60` ("Señales de riesgo reputacional detectadas"). El jugador tiene ~4-6 semanas para actuar antes del threshold 80.

## Edge Cases

- **Si `fan_attendance = 0` en la semana del partido**: `match_day_revenue = 0`. El club no cancela el partido — la liga sigue disputándose con gradas vacías. No hay penalización adicional en el sistema económico (la penalización de fan_momentum ya la gestiona cascade-engine).

- **Si el partido es visitante (`is_home_match = 0`)**: `match_day_revenue = 0` independientemente de la asistencia. La variable `fan_attendance` del cascade refleja el estado emocional de la afición, no la localización del partido. Economy aplica el flag `is_home_match` para filtrar el ingreso.

- **Si un slot de patrocinador está vacío**: el `revenue_weekly_eur_k` de ese slot es 0. `sponsor_quality` en el cascade recibe 0 desde ese slot, eliminando el efecto de C17 sobre `player_happiness`. El coste es indirecto (jugadores menos felices), no una penalización directa en el balance.

- **Si la firma de un nuevo patrocinador sube `sponsor_quality`**: el evento escribe el nuevo valor al WorldState vía PlayerDecision en el tick de esa semana (Paso 3 del ciclo cascade). El efecto de C17 sobre `player_happiness` se siente en el siguiente tick (delay: 1 semana).

- **Si el jugador acepta un préstamo y el balance vuelve a caer al CRITICAL en la misma semana**: no es posible por diseño — el préstamo siempre lleva el balance a CRITICAL + `LOAN_BUFFER_WEEKS × costs`. Si vuelve a CRITICAL en semanas posteriores, se dispara un segundo board meeting con `loan_number = 2` (tasa 30%).

- **Si el club está en Crisis y el jugador elige "vender jugador" pero ningún jugador tiene comprador activo**: el event-system garantiza al menos una oferta de compra antes de disparar el board meeting. Si no hay compradores (edge case extremo), el sistema fuerza la opción del préstamo como única salida. El board meeting no puede quedarse sin opciones.

- **Si `corruption_exposure` llega a 80 y el club no tiene patrocinador en el slot de camiseta**: la multa de F8 aplica igualmente (`scandal_fine_eur_k`), pero no hay contrato que cancelar. El slot continúa vacío. El impacto económico es solo la multa + la caída de asistencia vía `fan_momentum −30`.

- **Si el club está en Crisis y sufre un escándalo en el mismo tick**: se aplican en orden: primero el tick económico normal (nómina + ingresos + multa de escándalo), luego si el balance resultante sigue por debajo de CRITICAL, el board meeting de crisis se dispara en el **siguiente tick**. Un tick solo puede tener un BLOCKING event activo.

- **Si `SEASON_LENGTH_WEEKS` aumenta por copa u otras competiciones**: los derechos de TV se calculan sobre el total anual fijo ÷ 38 — la copa no afecta el prorrateo de TV rights. Los contratos de patrocinador (también 38 semanas de liga) tampoco se extienden. Las semanas adicionales de copa son "extra" sin impacto en estos cálculos.

- **Si el manager sube `ticket_price_index` a 100 con `fan_momentum` bajo**: cascade C8 ya modela el colapso de asistencia y C15 la erosión de momentum con delay de 2 semanas. Economy calcula el revenue sobre la `fan_attendance` resultante (muy baja). No se necesita edge case adicional — cascade lo maneja.

- **Si `weekly_total_costs_eur_k` cae a 0 por un bug**: `WARNING_THRESHOLD` y `CRITICAL_THRESHOLD` serían 0, poniendo al club siempre en "Solvente". Condición no alcanzable en práctica (siempre hay nómina mínima de plantilla). Si ocurriera, el estado cae a Solvente sin consecuencias — defensivamente correcto.

## Dependencies

### Dependencias upstream (este sistema depende de)

| Sistema | GDD | Tipo | Interfaz específica |
|---------|-----|------|---------------------|
| Motor de Cascadas | `cascade-engine.md` | **Hard** | Lee `fan_attendance`, `fan_momentum`, `sponsor_quality` del WorldState post-tick cada semana |
| Sistema de Liga | `league-system.md` | **Hard** | Lee `current_division` del club para calcular TV rights (`DIVISION_TV_MULTIPLIER`) |
| Gestión de Jugadores | `player-management.md` | **Hard** | Lee contratos activos (nómina) y valor de mercado vía `getTransferValue(playerId)` para opciones del board meeting |
| Sistema de Staff | `staff-system.md` | **Hard** | Lee contratos activos de staff para incluirlos en `weekly_wage_bill_eur_k` |

### Dependencias downstream (otros sistemas dependen de este)

| Sistema | GDD | Qué esperan de economy | Contrato de datos |
|---------|-----|------------------------|------------------|
| Sistema de Eventos | `event-system.md` | Recibe ThresholdCrossings económicos (BLOCKING/ADVISORY), genera board meetings, rutea ofertas de patrocinador y multas; aplica resoluciones como deltas en ClubFinances | Economy envía `EconomyThresholdCrossing { type: 'economy', level: 'BLOCKING'\|'ADVISORY', state: FinancialState, options: RescueOption[] }` |
| HUD y UI principal | `hud-ui.md` | Balance actual, nómina semanal, proyección de ingresos, deuda activa, estado financiero, resumen de contratos de patrocinio | Economy expone `ClubFinances` snapshot + `WeeklyIncomeProjection` para renderizado DOM |
| Manager-RPG | `manager-rpg.md` | El nivel económico del club influye en eventos de carrera del manager y su reputación | Economy expone `club_division` + estado financiero como contexto para eventos del RPG (via event-system) |
| Progresión de Ciudad | `city-progression.md` (v1.1+) | Los tiers de ciudad se activan con umbrales de nivel económico del club | Economy deberá exponer `season_revenue_total_eur_k` como criterio de activación de tier |

### Notas de bidireccionalidad

- **cascade-engine.md** ya documenta esta dependencia en su sección Interactions. Al finalizar este GDD, actualizar `referenced_by` de `fan_attendance`, `fan_momentum` y `sponsor_quality` en el registry.
- **match-simulation.md** no tiene dependencia directa con economy.md — match-sim escribe al WorldState del cascade, y economy lee los outputs del cascade post-tick. La relación es indirecta vía cascade.
- **event-system.md** y **hud-ui.md** aún no están escritos. Al escribirlos, deben referenciar economy.md en sus secciones de Dependencies.

## Tuning Knobs

| Knob | Valor default | Rango seguro | ¿Qué rompe si sube demasiado? | ¿Qué rompe si baja demasiado? |
|------|--------------|--------------|-------------------------------|-------------------------------|
| `STADIUM_CAPACITY_BASE[D2]` | 6 000 | 4 000–8 000 | Revenue de taquilla D2 se vuelve demasiado fácil; reduce tensión económica inicial | Revenue tan bajo que la asistencia pierde relevancia |
| `TICKET_PRICE_BASE[D2]` | 12 € | 8–16 € | Con precios altos, subir el slider de precio da poco beneficio marginal | El revenue de taquilla es tan bajo que la asistencia pierde relevancia económica |
| `TV_RIGHTS_ANNUAL_EUR_K[D2]` | 20 €K | 10–35 €K | TV demasiado alta → taquilla pierde importancia como fuente principal → resultados deportivos dejan de afectar la economía | TV tan baja que la supervivencia D2 depende exclusivamente de taquilla → frágil ante semanas de visita |
| `TV_RIGHTS_ANNUAL_EUR_K[D1]` | 270 €K | 150–400 €K | Ascender a D1 hace al club tan rico que las decisiones económicas dejan de importar | El ascenso a D1 no se siente económicamente transformador |
| `WARNING_BUFFER_WEEKS` | 7 sem | 5–9 sem | El jugador recibe mensajes de aviso con el balance aún muy saneado → warning spam | El jugador llega a Crisis sin aviso previo suficiente para reaccionar |
| `CRITICAL_BUFFER_WEEKS` | 3 sem | 2–5 sem | El board meeting se dispara demasiado pronto → el jugador percibe que el juego le frena artificialmente | El board meeting se dispara cuando ya es demasiado tarde para cualquier remedio sin préstamo |
| `base_interest_rate` | 0.15 | 0.08–0.25 | Deuda tan cara que el primer préstamo es prácticamente impagable → jugador sin opciones reales | Préstamo tan barato que el jugador lo usa estratégicamente en lugar de como última opción |
| `LOAN_PENALTY_MULTIPLIER` | 2.0 | 1.3–3.0 | El tercer préstamo tiene cuotas inasumibles → game over encubierto | Los préstamos múltiples no tienen coste diferencial → deuda sin consecuencias narrativas |
| `LOAN_REPAYMENT_WEEKS` | 10 sem | 7–14 sem | La cuota semanal es tan alta que absorbe todos los ingresos | La deuda dura demasiado → el jugador siente que nunca sale del hoyo |
| `SCANDAL_FINE_BASE_EUR_K` | 30 €K | 15–60 €K | El escándalo es catastrófico para clubs D3 con poco colchón | El escándalo parece sin consecuencias → elimina el coste real de la corrupción |
| `SPONSOR_BASE_WEEKLY_EUR_K[1]` | 0.7 €K | 0.4–1.2 €K | El patrocinador tier 1 cubre demasiada nómina → reduce la presión de necesitar resultados | El tier 1 es tan irrelevante que el jugador ignora los patrocinadores durante temporadas |
| `BUDGET_EUR_K_AT_100[scouting]` | 3.0 €K | 1.5–5.0 €K | Maximizar scouting es tan caro que el jugador nunca lo sube → la cascada C9 queda inactiva | Maximizar scouting es tan barato que no hay trade-off entre información y coste |
| `LOAN_BUFFER_WEEKS` | 4 | [3, 6] | El préstamo cubre el gap + N semanas de runway adicional. Demasiado alto → el préstamo da tanto colchón que el Board Meeting pierde urgencia | Demasiado bajo → el club vuelve a Crisis la semana siguiente de tomar el préstamo |
| `INITIAL_BALANCE_EUR_K` | 250 | [150, 400] | Balance de inicio demasiado alto → el jugador nunca siente tensión económica en las primeras semanas | Demasiado bajo → el jugador entra en Crisis sin oportunidad de aprender la causalidad |
| `CORRUPTION_ADVISORY_THRESHOLD` | 60 | [50, 75] | El NOTIFY ADVISORY llega demasiado pronto → warning spam | El jugador no tiene tiempo suficiente para reaccionar antes del cliff en 80 |

**Tuning Knobs del Relegation Financial Review** (spec: `design/quick-specs/relegation-contract-crisis-2026-05-17.md`):

| Knob | Valor MVP | Rango seguro | Descripción |
|---|---|---|---|
| `RELEGATION_WAGE_RISK_FACTOR` | 10.0 | [5, 20] | Sensibilidad del trigger. A 10×, cualquier D1-squad activa el review. |
| `RELEGATION_WAGE_CUT_PCT` | 20% | [10%, 35%] | Reducción de nómina por Opción A (Pacto de Solidaridad). |
| `RELEGATION_WAGE_CUT_WEEKS` | 12 | [8, 20] | Duración del pacto de nómina (semanas). |
| `RELEGATION_MORALE_PENALTY` | 5 | [2, 10] | player_happiness penalty por Opción A. |
| `RELEGATION_FIRE_SALE_RATE` | 80% | [65%, 90%] | Descuento sobre market value en venta pre-temporada (Opción B). |
| `RELEGATION_FAN_MOMENTUM_PENALTY` | 10 | [5, 15] | fan_momentum penalty por Opción B. |
| `RELEGATION_OWNER_INJECTION_EUR_K` | 150 | [80, 300] | Monto de inyección del propietario en Opción C. |
| `RELEGATION_OWNER_WEEKLY_REPAYMENT_EUR_K` | 4 | [2, 8] | Cuota semanal de repago de la inyección. |
| `RELEGATION_OWNER_LOAN_WEEKS` | 38 | [20, 52] | Plazo de repago (default: una temporada). |
| `RELEGATION_OWNER_MIN_REPUTATION` | 2.0 | [1.5, 3.0] | Reputación mínima para acceder a Opción C. |

**Knobs que interactúan entre sí:**
- `WARNING_BUFFER_WEEKS` y `CRITICAL_BUFFER_WEEKS` deben mantener una diferencia de al menos 3 semanas para que el jugador tenga tiempo de reaccionar entre estados.
- `TICKET_PRICE_BASE` y `STADIUM_CAPACITY_BASE` en la misma división afectan el mismo output (F1). Solo ajustar uno a la vez durante el balance pass.
- `TV_RIGHTS_ANNUAL_EUR_K[D1]` y `TV_RIGHTS_ANNUAL_EUR_K[D2]` deben mantener ratio D1/D2 ≥ 3× para que el salto de D2 a D1 siga siendo transformador. Con valores MVP: 270/20 = 13.5× ✔
- `LOAN_BUFFER_WEEKS` debe ser menor que `CRITICAL_BUFFER_WEEKS` (3 sem) + `WARNING_BUFFER_WEEKS` (7 sem): si el buffer es ≥ 10 semanas, el préstamo lleva el balance a "Solvente" de golpe, eliminando la tensión post-crisis.

## Visual/Audio Requirements

[To be designed]

## UI Requirements

[To be designed]

## Acceptance Criteria

*Clasificación: Logic (fórmulas deterministas) + Integration (cross-system con cascade, event-system). Tests marcados `[UNIT]` son automatizables con Vitest. Tests `[INTEGRATION]` requieren DB o cascade real. Tests `[MANUAL]` requieren walkthrough documentado.*

---

**AC-ECO-01** `[UNIT]`
GIVEN dos TickResults: `prevState.fan_attendance=40` y `nextState.fan_attendance=70` (subió en el tick), WHEN `computeWeeklyFinances(nextState, is_home_match=1)` se ejecuta, THEN `match_day_revenue_eur_k` es consistente con `fan_attendance=70` — concretamente ≥ `(70/100 × STADIUM_CAPACITY_D2 × TICKET_PRICE_BASE_D2 × 0.5 / 1000)`. Verificar que pasar `prevState` produce un resultado diferente (revenue menor con fan_attendance=40).

**AC-ECO-02** `[UNIT]`
GIVEN un club D2 (Segunda) con `weekly_wage_bill_eur_k = 15`, todos los presupuestos operativos en node=50 (groundskeeper=1.25 + catering=0.50 + scouting=1.50 = 3.25), y sin deuda activa, WHEN se calcula `weekly_total_costs_eur_k`, THEN el resultado es exactamente **18.25 €K** (tolerancia ±0.01 €K).

**AC-ECO-03** `[UNIT]`
GIVEN un club D2 (`STADIUM_CAPACITY_BASE=6000`, `TICKET_PRICE_BASE=12€`), `fan_attendance=40`, `ticket_price_index=50`, y `is_home_match=1`, WHEN se calcula `match_day_revenue_eur_k`, THEN el resultado es exactamente **28.8 €K** (`(40/100) × 6000 × (12×1.0) / 1000 × 1 = 28.8`). Si el output es ~28,800, el implementador olvidó el divisor `/1000` (conversión €→€K).

**AC-ECO-04** `[UNIT]`
GIVEN cualquier club en cualquier división con `is_home_match=0`, WHEN se calcula `match_day_revenue_eur_k` independientemente de `fan_attendance` y `ticket_price_index`, THEN el resultado es exactamente **0.0 €K**.

**~~AC-ECO-05~~** `[UNIT]` ⚠️ **DEPRECATED 2026-05-20** — `getTVRightsWeekly()` fue eliminada del código en commit `bf37f61` (BREAKING CHANGE de `tv-rights.md`). La autoridad para el TV revenue semanal es ahora `tv_contract.weekly_rate_eur_k` del contrato firmado (per F-TV1). Los valores `0.5263 €K/sem` (D2) y `7.105 €K/sem` (D1) corresponden a LOCAL/D2 y NACIONAL/D1 respectivamente — ver los ACs de `tv-rights.md` (AC-TV-01..07) para los tests vivos. Conservado aquí como referencia histórica.

**AC-ECO-06** `[UNIT]`
GIVEN un contrato firmado en D2 (Segunda) primera temporada (proxy `final_position=10`), tier 1, slot camiseta:
`division_factor=(3-2)/2=0.5 · position_factor=(21-10)/20=0.55 · LEVEL_MODIFIER=0.8+0.4×(0.5+0.55)/2=1.01`
WHEN se calcula `sponsor_weekly_revenue_eur_k`, THEN el resultado está en el rango **[0.91, 0.93] €K/sem** (0.7×1.3×1.01=0.919€K). GIVEN el mismo tier 1 en slot estadio, THEN el resultado está en **[0.70, 0.72] €K/sem** (0.7×1.0×1.01=0.707€K).

**AC-ECO-07** `[UNIT]`
GIVEN `scouting_budget` node=100 (`BUDGET_EUR_K_AT_100=3.0`), WHEN se calcula `budget_eur_k` para ese nodo, THEN el resultado es exactamente **3.0 €K/sem**. GIVEN los tres presupuestos en node=100, THEN `total_opex_eur_k = 6.5 €K/sem` (groundskeeper=2.5 + catering=1.0 + scouting=3.0). GIVEN cualquier presupuesto en node=0, THEN `budget_eur_k = 0.0 €K/sem`.

**AC-ECO-08** `[UNIT]`
GIVEN `weekly_total_costs_eur_k = 18.25 €K` (D3 default), WHEN se calculan los umbrales, THEN `WARNING_THRESHOLD_EUR_K = 127.75 €K` (±0.1) y `CRITICAL_THRESHOLD_EUR_K = 54.75 €K` (±0.1).

**AC-ECO-09** `[UNIT]`
GIVEN `weekly_total_costs_eur_k` cambia de 18.25 a 12.0 (el manager reduce nómina), WHEN se recalculan los umbrales en el siguiente tick, THEN `WARNING_THRESHOLD` cae a **84.0 €K** y `CRITICAL_THRESHOLD` a **36.0 €K** — los umbrales son dinámicos, no cacheados.

**AC-ECO-10** `[UNIT]`
GIVEN un club con `balance_eur_k = 140.0` y `weekly_total_costs = 18.25`, WHEN se evalúa el estado financiero, THEN el estado es `Solvente` (140 > 127.75). GIVEN el balance baja a `110.0 €K`, THEN el estado es `En Riesgo` y se genera exactamente 1 ThresholdCrossing ADVISORY (ningún BLOCKING). GIVEN el balance baja a `50.0 €K`, THEN el estado es `Crisis` y se genera exactamente 1 ThresholdCrossing BLOCKING.

**AC-ECO-11** `[INTEGRATION]`
GIVEN un club en estado `Crisis` con ThresholdCrossing BLOCKING persistido en `game_events` (`status='pending'`), WHEN `POST /api/advance-week` se llama sin PlayerDecision de rescate, THEN la respuesta es HTTP 409 con `{ blocked: true, reason: 'economy:BLOCKING', options: RescueOption[] }` Y la columna `current_week` en la tabla `seasons` no avanza (verificar en BD post-request). GIVEN el manager envía `POST /api/advance-week` con `{ decision: 'emergency_loan' }`, THEN HTTP 200, `club_finances.balance_eur_k` aumenta en `loan_amount_eur_k`, y `club_finances.weekly_debt_repayment_eur_k > 0` — ambos verificables en la BD tras el tick.

**AC-ECO-12** `[UNIT]`
GIVEN un club D2 en crisis con `balance = 30.0 €K`, `CRITICAL_THRESHOLD = 54.75 €K` (3 × 18.25), `weekly_total_costs = 18.25`, `LOAN_BUFFER_WEEKS = 4`, primer préstamo (`loan_number=1`):
`loan_amount = max(54.75 − 30.0, 0) + 4 × 18.25 = 24.75 + 73.00 = 97.75 €K` (exacto)
WHEN se calcula el préstamo, THEN `loan_amount_eur_k = 97.75 €K` (tolerancia ±0.01 €K — solo precisión float), `effective_rate = 0.15`, `total_cost = 97.75 × 1.15 = 112.4125 €K`, `weekly_repayment = 112.4125 / 10 = 11.24 €K/sem` (±0.01 €K).

**AC-ECO-13** `[UNIT]`
GIVEN el mismo club toma un segundo préstamo (`loan_number=2`), WHEN se calcula `effective_rate`, THEN `effective_rate = 0.30` (el doble del primer préstamo). GIVEN un tercer préstamo (`loan_number=3`), THEN `effective_rate = 0.60` (cuatro veces el primero).

**AC-ECO-14** `[UNIT]`
GIVEN `corruption_exposure = 90`, `SCANDAL_FINE_BASE_EUR_K = 30`, `FINE_SEVERITY_FACTOR = 0.667`, WHEN se calcula `scandal_fine_eur_k`, THEN el resultado es aproximadamente **40.0 €K** (`30 × (1 + 0.667 × 10/20) = 30 × 1.333 ≈ 40.0 €K`). (R3: actualizado de 1.0/45.0 €K → 0.667/40.0 €K para alinear con event-system.md F4c y registry range [30, 50 €K].) GIVEN el club tiene contrato activo en slot camiseta, WHEN se aplica el escándalo, THEN el slot camiseta queda cancelado, el slot estadio permanece intacto, y `sponsor_quality` del WorldState se actualiza via PlayerDecision en ese tick. GIVEN sin patrocinador en slot camiseta, THEN la multa aplica igualmente sin error.

**AC-ECO-15** `[INTEGRATION]`
GIVEN partido en casa (D2), tick base con `ticket_price_index=50` y `fan_attendance_prevState=50`, GIVEN cascade C8 reduce `fan_attendance` a 35 cuando `ticket_price_index=80` (mock del cascade con valor fijo 35), WHEN economy calcula F1 con `fan_attendance=35` y `ticket_price_index=80`, THEN `match_day_revenue_eur_k = (35/100) × 6000 × (12×1.3) / 1000 = 32.76 €K` — inferior al revenue con index=50 y fan_attendance=50: `(50/100) × 6000 × (12×1.0) / 1000 = 36.0 €K`. La diferencia debe ser ≥ 3.0 €K para confirmar que la subida de precio no compensó la pérdida de asistencia.

**AC-ECO-16** `[INTEGRATION]`
GIVEN economy genera un ThresholdCrossing BLOCKING (Crisis), WHEN el event-system lo recibe, THEN el evento contiene `{ type: 'economy', level: 'BLOCKING', state: 'Crisis', options: RescueOption[] }` con al menos 1 opción disponible. GIVEN ThresholdCrossing ADVISORY (En Riesgo), THEN el evento es `{ type: 'economy', level: 'ADVISORY', state: 'EnRiesgo' }` sin opciones de rescue.

**AC-ECO-17a** `[UNIT]`
GIVEN un club con ambos slots de patrocinador vacíos, WHEN se calcula el ingreso total de patrocinio semanal, THEN el resultado es exactamente **0.0 €K/sem**.

**AC-ECO-17b** `[INTEGRATION]`
GIVEN PlayerDecision `{ type: 'sponsor_sign', tier: 2, slot: 'jersey' }` procesada en el tick de semana N, WHEN la BD se consulta tras el tick de semana N, THEN `WorldState.sponsor_quality` aún tiene el valor pre-firma (delay: la actualización aplica en N+1). WHEN se consulta tras el tick de semana N+1, THEN `WorldState.sponsor_quality = 30`.

**AC-ECO-18** `[INTEGRATION]`
GIVEN `weekly_repayment_eur_k = 11.2413 €K` (valor con 4 decimales como produce F6), WHEN se persiste en Postgres y se recarga, THEN el valor leído difiere del original en menos de **0.0001 €K** — verifica que el schema Drizzle NO usa `NUMERIC(10,2)` (que truncaría a 11.24 perdiendo información). El tipo correcto es `DOUBLE PRECISION` o `REAL` para este campo.

**AC-ECO-19** `[UNIT]`
GIVEN un club D2 (Segunda) recién creado con `balance_eur_k = INITIAL_BALANCE_EUR_K = 250.0` y costes por defecto (`weekly_total_costs ≈ 18.25 €K`), WHEN se evalúa el estado financiero en la semana 1, THEN el estado es `Solvente` (250 > WARNING ≈ 127.75) y no se genera ningún ThresholdCrossing.

**AC-ECO-20** `[UNIT]`
GIVEN club D2, `balance_eur_k = 70.0`, semana de visita (`is_home_match=0`, taquilla=0), `weekly_tv_rights=0.526€K`, `weekly_total_costs=18.25€K`, escándalo en ese tick con `corruption_exposure=90` → `scandal_fine_eur_k≈40.0€K` (F8 con FINE_SEVERITY_FACTOR=0.667), WHEN se aplica el tick económico completo siguiendo el orden canónico (§F5), THEN `balance_post = 70.0 + 0.526 − 18.25 − 40.0 = 12.276 €K` (±0.05). THEN el estado evaluado es `Crisis` (12.276 < CRITICAL=54.75). THEN el ThresholdCrossing BLOCKING se programa para el **siguiente tick** — en ese mismo tick el evento NO se emite. (R3: fine actualizado de 45.0→40.0 €K por cambio en FINE_SEVERITY_FACTOR.)

**AC-ECO-21** `[UNIT]` — Catch-up mechanic elegibilidad
GIVEN un club en estado `EnRiesgo` en la semana 8 (≤ 15), sin deuda activa y sin `owner_injection_used_this_season`, WHEN se evalúan las condiciones de la catch-up mechanic, THEN la congelación está disponible. GIVEN el mismo club pero en semana 20 (> 15), THEN no está disponible. GIVEN el mismo club en semana 8 pero con deuda activa (`weekly_debt_repayment_eur_k > 0`), THEN no está disponible. GIVEN el mismo club en semana 8, sin deuda, pero `owner_injection_used_this_season = true`, THEN no está disponible.

**AC-ECO-22** `[INTEGRATION]` — Relegation Financial Review trigger
GIVEN `processSeasonEnd()` con el club del jugador relegado de D1 a D2 y `weekly_wage_bill_eur_k = 40` (> `10 × (20/38) = 5.26€K`), WHEN completa, THEN existe exactamente 1 `calendar_event` de tipo `relegation_financial_review` con `week=0` de la nueva temporada D2 y `metadata.option_c_available` correctamente calculado según `manager_reputation`. (Spec completo: `design/quick-specs/relegation-contract-crisis-2026-05-17.md`)

**AC-ECO-23** `[INTEGRATION]` — Sponsor renewal al final de temporada
GIVEN `processSeasonEnd()` con el club del jugador en D2, posición 5 (zona alta), WHEN completa, THEN `game_events` contiene exactamente 2 eventos de tipo `sponsor_offer` (uno por slot disponible), cada uno con `metadata.available_tiers = [1,2,3]` (D2 top half según tabla §6) y `metadata.expires_at` definido. GIVEN el club tiene slot de camiseta vacío (sin contrato activo), THEN el evento de `sponsor_offer` para ese slot tiene `metadata.current_revenue = 0`.

## Open Questions

| ID | Pregunta | Bloqueante para | Target resolución |
|----|----------|-----------------|-------------------|
| OQ-ECO-01 | ¿La fórmula F7 (transfer_value) vive en `player-management.md` o necesita una versión simplificada en `economy.md` para el board meeting de crisis antes de que ese GDD se escriba? | Implementación de board meeting de rescate | Al escribir `player-management.md` |
| OQ-ECO-02 | **[DECISIÓN TOMADA 2026-05-17]** D3 debe ser "supervivencia gestionable": un jugador con ~50% de victorias NO debe entrar en Crisis en su primera temporada. Consecuencia: la nómina D3 de inicio debe calibrarse en `player-management.md` a ~5-8 €K/sem (no los 15 €K del AC-02 de ejemplo, que es solo ilustrativo). El balance inicial de 250 €K puede mantenerse si la nómina está bien calibrada. **Catch-up mechanic añadido (ver §7.1)**: evento único "Congelación de nómina de emergencia" gestionado por event-system.md. Verificar con `/balance-check` post-implementación de player-management.md. | Balance pass pre-vertical-slice | Al escribir `player-management.md` |
| OQ-ECO-03 | ¿Cómo determina el event-system qué jugadores están disponibles para venta en el board meeting de crisis? ¿Solo los out-of-form, o cualquier jugador? La interfaz con `player-management.md` necesita especificarse. | Implementación de opciones del board meeting | Al escribir `player-management.md` |
| OQ-ECO-04 | ¿La cancelación del patrocinador de camiseta por escándalo aplica también si el escándalo ocurre en el último mes de contrato (quedan < 4 semanas)? El impacto sería mínimo y podría parecer injusto al jugador. | Equilibrio percibido de penalizaciones | `event-system.md` GDD |
| OQ-ECO-05 | ¿El sistema económico de MVP necesita modelar pagos diferidos de traspasos (fee en cuotas, cláusulas de rendimiento)? Fuera de scope ahora, pero afecta si `player-management.md` los diseña así. | Contrato de interfaz con player-management | Al escribir `player-management.md` |
| OQ-ECO-06 | **MAX_TICKET_EUR + MARKET_TICKET_EUR por club** (post-vertical-slice 2026-05-18 — Pablo's playtest). El slice hardcoded MARKET=10€, MAX=25€ para Real Pueblo (Segunda humilde, estadio 3000). Producción necesita una fórmula: `MAX_TICKET_EUR = f(stadium_capacity, division_tier, fan_culture_index)` y `MARKET_TICKET_EUR = MAX × ~0.4`. Estos valores aparecen en la UI del jugador (slider de precio en €) y determinan el step (5€ Segunda, posiblemente 10€ o 20€ Primera). El cascade engine sigue usando `ticket_price_index ∈ [0,100]` internamente; la traducción es UI-only. **Constraint**: el umbral de erosión `T_price_danger = 65` debe seguir teniendo sentido en € — con MARKET=10€ cae en 13€ (legible: "por encima de 13€ la afición se acuerda"). | Implementación de panel Dashboard (sprint UI) | Pre-sprint UI — formalizar fórmula durante `/ux-design Dashboard` |
