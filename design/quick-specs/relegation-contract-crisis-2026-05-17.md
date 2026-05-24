# Quick Design Spec: Relegation Financial Review

**Type**: Addition
**System**: economy.md (Club Economy)
**GDD Reference**: `design/gdd/economy.md` — §7 Board Meeting de Rescate, §9 Catch-up mechanic
**Date**: 2026-05-17

## Change Summary

Cuando el club del jugador desciende de D1 a D2, los contratos de jugadores
firmados con salarios de D1 generan un déficit estructural que los mecanismos
reactivos actuales (Board Meeting, Catch-up) no pueden cubrir. Esta addition
añade un evento BLOCKING proactivo de pre-temporada — el "Relegation Financial
Review" — con tres opciones de resolución antes de que empiece la primera
jornada de D2.

## Motivation

Un club que baja de D1 a D2 experimenta una caída drástica en ingresos base
(de ~7.11€K/sem en TV a ~0.53€K/sem) mientras mantiene la nómina de D1.
El Board Meeting de crisis ya existe pero se dispara demasiado tarde
(cuando el balance ya es negativo), y el Catch-up mechanic (50% nómina ×
4 semanas ≈ 80€K de alivio) es insuficiente para un déficit que puede
superar los 15-20€K/sem durante 38 semanas (~570-760€K).

El descenso debe ser económicamente dramático pero manejable — el jugador
necesita una decisión difícil con consecuencias reales, no un game-over
silencioso por nómina impagable.

## Design Delta

**Comportamiento actual** (economy.md §7):

> El Board Meeting se dispara cuando `balance_eur_k < CRITICAL_BALANCE_THRESHOLD_EUR_K`.
> El manager elige entre vender un jugador o aceptar un préstamo de emergencia.

Esta addition añade, **antes** del Board Meeting habitual, un evento
específico de pre-temporada post-descenso:

---

**Nuevo comportamiento:**

### Trigger

Al ejecutar `processSeasonEnd()`, si el club del jugador es relegado de D1 a D2 Y:

`weekly_wage_bill_eur_k > RELEGATION_WAGE_RISK_FACTOR × (tv_rights_annual_d2_eur_k / 38)`

…donde `RELEGATION_WAGE_RISK_FACTOR = 10.0` (un wage bill superior a 10× los
TV rights semanales de D2 indica riesgo estructural), se genera un evento
`relegation_financial_review` de tipo BLOCKING insertado en `calendar_events`
para la semana 0 de la nueva temporada D2 (pre-temporada, antes del primer fixture).

Con valores MVP: si `weekly_wage_bill_eur_k > 10 × 0.53 = 5.3€K`, se dispara.
En la práctica, cualquier club que haya firmado jugadores de D1 activará este trigger.

### El evento: Relegation Financial Review

El event-system entrega al jugador un briefing del director financiero con
el déficit proyectado. El manager DEBE elegir una de tres opciones antes de
que el advance loop pueda continuar (igual que el Board Meeting).

**Opción A — Pacto de Nómina de Solidaridad:**
El director deportivo negocia con el vestuario. Durante las primeras
`RELEGATION_WAGE_CUT_WEEKS` semanas (default: 12), el `weekly_wage_bill_eur_k`
se reduce en `RELEGATION_WAGE_CUT_PCT` (default: 20%).
- Narrative frame: "El vestuario acepta el sacrificio — quieren demostrar que pueden volver."
- Ventaja: preserva la plantilla completa, reducción inmediata de costes.
- Riesgo: morale penalty `player_happiness -= RELEGATION_MORALE_PENALTY` para
  toda la plantilla durante las 12 semanas (cascade PlayerDecision).
- No genera deuda. Es un gesto temporal.

**Opción B — Venta de Pre-Temporada:**
El sistema identifica automáticamente los 2 jugadores con contrato más alto
(`top_2_wage_earners`) y genera su venta inmediata a `RELEGATION_FIRE_SALE_RATE`
(default: 80%) de su valor de mercado. El manager no elige quiénes se venden
(MVP simplification — player-management.md está pendiente de diseño).
- Ventaja: reducción permanente de nómina + caja inmediata.
- Riesgo: `team_skill` cae (jugadores más caros = típicamente los mejores),
  y `fan_momentum -= RELEGATION_FAN_MOMENTUM_PENALTY` (la hinchada lo percibe como rendición).
- Nota de implementación: la selección de jugadores depende de
  `player-management.md`. En MVP, el fire sale opera sobre los 2 registros de
  mayor `weekly_wage_eur_k` en la tabla `player_contracts`.

**Opción C — Voto de Confianza del Propietario:**
El propietario inyecta `RELEGATION_OWNER_INJECTION_EUR_K` (default: 150€K)
como un bridge loan sin intereses, repagable a `RELEGATION_OWNER_WEEKLY_REPAYMENT_EUR_K`
(default: 4€K/sem) durante `RELEGATION_OWNER_LOAN_WEEKS` semanas (default: 38).
- Disponible solo si `manager_reputation >= RELEGATION_OWNER_MIN_REPUTATION`
  (default: 2.0 — el propietario solo confía en un manager con historial).
- Narrative frame: "El propietario apuesta por ti. No le falles."
- Ventaja: no toca la plantilla, no reduce morale.
- Riesgo: añade 4€K/sem de repago obligatorio. Si el balance vuelve a Crisis
  con este repago activo, el siguiente Board Meeting no ofrece la Opción C
  (ya usada). El flag `owner_injection_used_this_season` bloquea también el
  Catch-up mechanic el mismo año.
- Si `manager_reputation < 2.0`: la Opción C no aparece. Solo A y B disponibles.

### Interacción con mecanismos existentes

- El Relegation Financial Review se ejecuta **antes** de que empiece la temporada
  D2, en la pre-temporada (semana 0). No reemplaza al Board Meeting — si el
  balance sigue cayendo durante la temporada, el Board Meeting se activa normalmente.
- El Catch-up mechanic (50% nómina × 4 semanas) sigue disponible durante la
  temporada D2 si el jugador eligió Opción A o B, y el balance llega a estado
  "En Riesgo" en las primeras 15 semanas.
- El Catch-up mechanic NO está disponible el mismo año si el jugador usó la
  Opción C (`owner_injection_used_this_season = true`).

## New Rules / Values

`relegation_financial_review` es un nuevo tipo de `calendar_event` con los
siguientes campos adicionales en `metadata`:
- `projected_weekly_deficit_eur_k`: déficit calculado en el momento de la generación
- `top_2_wage_earner_ids`: IDs de los jugadores seleccionados para Opción B
- `option_c_available`: boolean (basado en `manager_reputation`)
- `option_chosen`: null hasta que el manager decida
- `owner_injection_used_this_season`: boolean, persiste en `club_finances`

## Affected Systems

| Sistema | Impacto | Acción requerida |
|---|---|---|
| `economy.md` | Nuevo mecanismo de pre-temporada post-descenso | Añadir §10 en Detailed Design + nuevas Tuning Knobs |
| `event-system.md` | Nuevo tipo de evento BLOCKING + template narrativo | Añadir plantilla `relegation_financial_review` al template library |
| `cascade-engine.md` | Opción A escribe `player_happiness -= 5` como PlayerDecision | Sin cambios de arquitectura — usa flujo existente |
| `league-system.md` | Trigger viene de `processSeasonEnd()` | OQ-LGS-06 queda resuelta — añadir referencia a este spec |
| `player-management.md` | Opción B necesita `player_contracts` con `weekly_wage_eur_k` | Dependencia forward — MVP simplification documentada arriba |

## Tuning Knobs

| Knob | MVP | Rango seguro | Categoría | Descripción |
|---|---|---|---|---|
| `RELEGATION_WAGE_RISK_FACTOR` | 10.0 | [5, 20] | gate | Sensibilidad del trigger. A 10x, cualquier D1-squad activa el review. |
| `RELEGATION_WAGE_CUT_PCT` | 20% | [10%, 35%] | balance | Reducción de nómina por Opción A. |
| `RELEGATION_WAGE_CUT_WEEKS` | 12 | [8, 20] | curve | Duración del pacto de solidaridad. |
| `RELEGATION_MORALE_PENALTY` | 5 | [2, 10] | feel | player_happiness penalty por Opción A. |
| `RELEGATION_FIRE_SALE_RATE` | 80% | [65%, 90%] | balance | Descuento sobre market value en Opción B. |
| `RELEGATION_FAN_MOMENTUM_PENALTY` | 10 | [5, 15] | feel | fan_momentum penalty por Opción B. |
| `RELEGATION_OWNER_INJECTION_EUR_K` | 150 | [80, 300] | balance | Monto de la inyección del propietario en Opción C. |
| `RELEGATION_OWNER_WEEKLY_REPAYMENT_EUR_K` | 4 | [2, 8] | curve | Cuota semanal de repago de la inyección. |
| `RELEGATION_OWNER_LOAN_WEEKS` | 38 | [20, 52] | curve | Plazo de repago (default: una temporada completa). |
| `RELEGATION_OWNER_MIN_REPUTATION` | 2.0 | [1.5, 3.0] | gate | Reputación mínima del manager para acceder a Opción C. |

Todos los valores deben vivir en el registry de entidades — no hardcodeados.

## Acceptance Criteria

- [ ] **AC-RCR-01** GIVEN `processSeasonEnd()` con el club del jugador relegado de D1 a D2 y `weekly_wage_bill_eur_k = 40` (> 10 × 0.53 = 5.3), WHEN completa la transacción, THEN existe un `calendar_event` de tipo `relegation_financial_review` en la semana 0 de la nueva temporada D2.
- [ ] **AC-RCR-02** GIVEN el evento `relegation_financial_review` está activo, WHEN el jugador intenta avanzar sin elegir opción, THEN el advance loop permanece bloqueado.
- [ ] **AC-RCR-03** GIVEN el jugador elige Opción A, WHEN el evento es consumido, THEN `weekly_wage_bill_eur_k` se reduce en 20% para las semanas 1-12 de la temporada D2, y `player_happiness -= 5` se aplica como PlayerDecision en el cascade tick de la semana 1.
- [ ] **AC-RCR-04** GIVEN el jugador elige Opción B, WHEN el evento es consumido, THEN los 2 contratos de mayor `weekly_wage_eur_k` están cancelados, el balance recibe ingreso de venta (`market_value × 0.80`), y `fan_momentum -= 10` en el cascade tick de la semana 1.
- [ ] **AC-RCR-05** GIVEN `manager_reputation = 1.5` (< 2.0), WHEN se genera el evento, THEN `metadata.option_c_available = false` y Opción C no aparece en la UI.
- [ ] **AC-RCR-06** GIVEN el jugador elige Opción C con `manager_reputation >= 2.0`, WHEN el evento es consumido, THEN `balance_eur_k += 150` y se registra `club_finances.relegation_loan_repayment_eur_k = 4` activo durante 38 semanas.
- [ ] **AC-RCR-07** GIVEN el jugador eligió Opción C en la pre-temporada, WHEN el balance llega a estado "En Riesgo" durante las primeras 15 semanas, THEN el Catch-up mechanic NO está disponible.
- [ ] **AC-RCR-08** GIVEN el club NO es relegado en `processSeasonEnd()`, WHEN completa, THEN no se genera ningún evento `relegation_financial_review`.

## GDD Update Required?

**Sí** — `design/gdd/economy.md`:
1. Añadir §10 "Relegation Financial Review" en Detailed Design con la descripción completa.
2. Añadir las 10 nuevas Tuning Knobs de este spec.
3. En Interactions with Other Systems, actualizar la sección `← league-system.md` para incluir el trigger de relegación.

`design/gdd/league-system.md`:
1. OQ-LGS-06 — marcar como resuelta con referencia a este spec.
