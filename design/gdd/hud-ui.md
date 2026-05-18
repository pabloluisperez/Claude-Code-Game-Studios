# HUD y UI Principal

> **Status**: Approved (R3 lean — 2026-05-18)
> **Author**: Pablo + agents
> **Last Updated**: 2026-05-18 (R3 — 2 blockers resolved: instrucciones radio buttons not combinable, COUNTER home no mostrar not desaconsejar)
> **Implements Pillar**: Pilar 4 (Calm Is The Tempo) · Pilar 3 (You Grow Like Your Club)
> **Nota**: Pilar 2 (The World Is The Scoreboard) se implementa en la canvas frontier (v1.1+). El HUD DOM en MVP no puede implementar el mundo isométrico como marcador visual — esa responsabilidad pertenece al canvas de PixiJS deferred a v1.1+.

## Overview

El HUD y UI Principal es la superficie de interacción total del manager con el club — el tablero de mando desde el que se toman todas las decisiones de gestión. Técnicamente es un sistema DOM-only en MVP (ver ADR-012), compuesto por cinco capas: HUD permanente (semana actual, estado financiero, próximo evento), paneles de decisión (plantilla, tácticas, fichajes, finanzas, staff), bandeja de entrada de mensajes del staff, modales de confirmación y eventos de carrera, y notificaciones toast efímeras. Cada vez que el jugador pulsa "Avanzar", el servidor procesa la simulación y devuelve un `AdvanceResult` que alimenta todas estas capas simultáneamente. El jugador no ve fórmulas ni nodos de cascada — ve el tiempo avanzar, lee el feedback del staff, y decide su próximo movimiento desde una posición de información incompleta y deliberadamente curada. La arquitectura técnica (z-layers, patrón `$state<GameState>` → `$effect` → PixiJS, canvas frontier para v1.1+) está documentada en ADR-012.

## Player Fantasy

El jugador abre el juego y en dos segundos sabe dónde está: la semana, el próximo partido, y si el dinero aguanta. No hay doce pestañas abiertas ni veinte estadísticas parpadeando — hay un tablero tranquilo que respira al mismo ritmo que el manager que lo maneja. Pulsa "Avanzar". El tiempo pasa. Entonces llega el mensaje del asistente técnico: algo sobre el estado del campo. Si el asistente es bueno, dice exactamente por qué importa; si es novato, solo dice que algo ha cambiado. El jugador decide si actúa o espera, cierra el panel, y pulsa "Avanzar" de nuevo. Esta es la fantasía: **el manager como piloto tranquilo que lee instrumentos calibrados para él**, no como analista leyendo logs de sistema. Cada panel tiene exactamente el nivel de detalle que la calidad del staff del jugador le ha ganado. La UI no revela más de lo que el manager merece saber. El HUD no genera la calidad de esa información — la entrega. Lo que llega es función del staff y de la reputación del manager. El HUD es el instrumento calibrado; el staff es el técnico que lo calibra.

## Detailed Design

### Core Rules

**Regla 1 — Estructura de navegación:**
La UI tiene cuatro secciones principales accesibles siempre: **Dashboard**, **Plantilla**, **Staff**, **Finanzas**. En mobile se presentan como bottom tab bar fijo. En desktop como sidebar izquierdo o top nav. Cada sección puede tener sub-vistas internas (pestañas/secciones dentro del panel).

Sub-secciones MVP:
- **Dashboard**: estado del club (posición tabla, semana, balance visual, forma reciente), próximos eventos
- **Plantilla**: lista de jugadores (ratings, fitness, morale, lesiones) + sub-vistas: **Tácticas**, **Mercado**, **Entrenamiento** (control de `training_intensity` semanal)
- **Staff**: roster de 6 empleados con tier de calidad, mensajes integrados, acciones de gestión
- **Finanzas**: balance, ingresos/gastos por categoría (TV rights, taquilla, patrocinios, nómina, transfers), contratos + sub-vista **Presupuestos** (controles de `groundskeeper_budget`, `catering_budget`, `scouting_budget`)

**Regla 2 — HUD strip permanente (z-10):**
El HUD strip es siempre visible, nunca bloqueado por paneles. Contiene, de izquierda a derecha:
- **Identidad**: nombre del club
- **Tiempo**: semana actual + temporada (ej: "Semana 12 · T1")
- **Próximo evento**: tipo + cuenta regresiva (ej: "⚽ Partido · en 3 días") — datos de `AdvanceResult.nextEventPreview`
- **Estado financiero**: ícono de estado con color semántico + balance €K (ej: "⚠️ En Riesgo · €45K")
- **Badge de mensajes URGENT no leídos**: número sobre ícono de Staff si hay mensajes URGENT sin leer (ver F4 y Regla 5)
- **Botón "Avanzar"**: única acción primaria del game loop

**Regla 3 — Indicador de estado financiero (3 estados):**
| Estado | Condición | Visual |
|--------|-----------|--------|
| `safe` | weeks_runway ≥ 7 (`warning_buffer_weeks = 7`) | Verde, sin alerta |
| `warning` | weeks_runway ≥ 3 y < 7 | Amarillo, ícono ⚠️ |
| `crisis` | weeks_runway < 3 (`critical_buffer_weeks = 3`) | Rojo, ícono de alerta |

El servidor calcula `financial_status` semanalmente y lo envía como campo del GameState. Los umbrales se aplican sobre `weeks_runway = balance_eur_k / weekly_total_costs` — recalculado cada semana. El HUD recibe `financial_status` ya clasificado; no realiza la división. La transición entre estados genera una notificación toast (no bloquea — sólo informa). Ver F1 para edge cases con balance negativo o costes cero.

**Regla 4 — Botón "Avanzar":**
- **`ready`**: disponible por defecto
- **`disabled`**: cuando hay un modal BLOCKING abierto esperando decisión obligatoria del jugador
- **`processing`**: mientras `POST /api/game/advance` está en curso (overlay z-50, sin input posible)
- Tras recibir `AdvanceResult`: HUD strip se actualiza y el jugador aterriza en Dashboard

**Etiqueta**: el botón se etiqueta genéricamente **"Avanzar"** (no con el nombre del próximo evento) — el advance es el tempo del juego, no un salto hacia un evento concreto. Esta etiqueta es intencional (Pilar 4: Calm Is The Tempo) y toma precedencia sobre el patrón "nombra el destino" de `interaction-patterns.md` (análogo a la precedencia explícita de `TOAST_MAX_SIMULTANEOUS`). El contexto del próximo evento lo proporciona el `NextEventBadge` en el mismo HUD strip.

**Regla 5 — Mensajes del staff (Inbox integrado en Staff):**
- Tras cada avance, el servidor genera mensajes vía BullMQ → Socket.IO `staff:messages-ready` (ADR-009)
- El panel Staff muestra la lista de 6 empleados. Por cada empleado:
  - Nombre, rol, tier de calidad (iconos de estrellas 1/2/3)
  - Badge con número de mensajes propios no leídos
  - Preview del último mensaje sin leer: **tier-3** muestra 2 líneas (mensaje + proyección/recomendación adicional truncada); **tier-1/2** muestran 1 línea truncada (Pilar 3 — la profundidad de información perceptible escala con la calidad del staff)
- Tap en empleado → vista de mensajes de ese empleado (más recientes primero)
- Mensajes URGENT: fondo diferenciado visualmente, sin ser alarmantes (Pilar 4)
- Badge en HUD strip = total mensajes **URGENT** sin leer de todos los empleados. Los mensajes ROUTINE son visibles en la vista de detalle del empleado (Regla 9) pero NO contribuyen al badge del HUD strip (Pilar 4: sin urgency anxiety por mensajes rutinarios).
- Badge por empleado en panel Staff = total URGENT de ese empleado sin leer

**Regla 6 — Decisión de partido (`match:decision-required`):**
Cuando el servidor pausa el partido esperando decisión táctica, emite Socket.IO `match:decision-required` con un snapshot estático del momento de pausa. Tipos de pausa (match-simulation.md): `substitution_window` (minutos 45, 60 y 75 — voluntarias, máx 3) y `injury_pause` (lesión de titular — forzada). El HUD responde:

**Snapshot estático** (datos del momento de la pausa, sin streaming en tiempo real — Pilar 4):
- Tipo de pausa (`substitution_window` / `injury_pause`) + minuto + marcador al momento de la pausa
- Formación táctica activa (preset actual: 4-4-2 / 4-3-3 / 3-5-2 / 5-3-2)
- Lista de jugadores en campo con indicador de fitness: 🟢 fresh (≥60) / 🟡 tired (30–59) / 🔴 exhausted (<30)
- Lista de jugadores en banquillo disponibles con indicador de fitness + cambios restantes del pool (0–5)
- Countdown de `match_pause_timeout_hours = 24h`

**Input del jugador (según tipo de pausa):**
- **`substitution_window`** (ventana voluntaria): decisión opcional. El jugador puede realizar cualquier combinación de:
  1. Sustitución: tap en jugador en campo (player_out) → tap en jugador del banquillo (player_in) → "Confirmar cambio" (activo solo si pool > 0 y banquillo no vacío)
  2. Cambio de formación: selector de 4 presets (4-4-2 / 4-3-3 / 3-5-2 / 5-3-2) — aplica desde el tick siguiente
  3. Cambio de instrucción táctica: PRESS_HIGH / HOLD_SHAPE / COUNTER (mutuamente exclusivos — radio buttons, un solo activo; para home team: COUNTER **no se muestra como opción** porque el servidor retorna HTTP 400 — ver match-simulation.md §COUNTER)
  No hacer nada → el asistente aplica la decisión por defecto al expirar el countdown
- **`injury_pause`** (lesión de titular): decisión requerida (o explícita abstención):
  - Seleccionar sustituto del banquillo (si pool > 0 y bench no vacío), o
  - Botón "Continuar con 10" (si no hay bench disponible o pool agotado — confirma explícitamente la situación)
  La UI no permite ignorar el panel sin interactuar — pero el botón "Avanzar" permanece habilitado; si el jugador avanza sin decidir, el asistente aplica sustitución por defecto (o continúa con 10 si no hay sustituto)

**Contexto de staff (Pilar 3)**: si el head_coach es tier-3, habrá generado un mensaje `staff:messages-ready` con una recomendación táctica al mismo tiempo que `match:decision-required`. El jugador puede consultar el panel Staff sin cerrar el panel de decisión de partido. El tier-1 solo genera una observación del marcador.

- Botón "Avanzar" permanece habilitado durante `match_decision_pending` — la decisión es opcional (en `substitution_window`); no decidir activa la decisión por defecto del asistente
- Tras decisión (o timeout): panel cierra, el partido continúa en background
- **Estado `expired`**: cuando el countdown llega a 0, los controles de input desaparecen y el texto muestra "Decisión por defecto aplicada por el asistente". El panel permanece visible (solo informativo) hasta que el jugador lo cierre manualmente.

**Regla 7 — Paneles como bottom sheets (mobile / 375px):**
Cada panel principal se presenta como bottom sheet, scrollable internamente. El HUD strip permanece visible encima del sheet. En desktop: panel ocupa la zona derecha o central.

En mobile: el bottom tab bar permanece **siempre visible** por encima del sheet. El jugador puede cambiar de panel sin cerrar el actual tocando otro ícono del tab bar.

**Implementación CSS (mobile)**: el panel se posiciona con `bottom: TAB_BAR_HEIGHT_PX` (no `bottom: 0`) para que el tab bar sea siempre visible debajo del sheet. El `max-height: 60dvh` se aplica correctamente sobre el viewport completo desde esa posición. Ver `TAB_BAR_HEIGHT_PX` en Tuning Knobs. El ADR-012 muestra `fixed bottom-0` como base — en mobile debe sumarse el offset del tab bar.

**Regla 8 — Toasts (z-40):**
Notificaciones efímeras para confirmaciones ("Fichaje completado · €8K"), errores leves ("Sin fondos suficientes"), y transiciones de estado no bloqueantes. Duración: 3–5 segundos. Máximo 2 toasts simultáneos. No interrumpen el flujo.

Cuando hay un modal BLOCKING activo (z-30): los toasts ADVISORY e INFO en cola esperan hasta que el BLOCKING se resuelva antes de mostrarse. Los toasts en cola no tienen TTL mientras esperan — no se descartan. Al resolverse el BLOCKING, los toasts pendientes se muestran con su duración normal.

**Posición en mobile**: los toasts se anclan en la parte **inferior** del viewport (bottom toast stack), con offset `TAB_BAR_HEIGHT_PX` para no solapar el tab bar. **No** en la parte superior del viewport: los toasts en top-of-viewport (z-40) solaparían el HUD strip (z-10) en mobile, ocultando parcialmente el indicador financiero y el botón Avanzar.

**Regla 9 — Navegación interna del panel Staff:**
Tap en empleado → la lista de 6 empleados se reemplaza in-place por la vista de mensajes de ese empleado (más recientes primero). El header del sheet muestra una flecha "← Staff" para regresar a la lista. La vista de detalle muestra todos los mensajes del empleado — URGENT (con fondo diferenciado) + ROUTINE — en orden cronológico inverso. Los mensajes se marcan como leídos al visualizarse (actualización optimista en cliente; el servidor confirma en el próximo advance). No hay paginación en MVP — se hace scroll.

**Regla 10 — Truncación del HUD strip en mobile (375px):**
Prioridad de visibilidad (mayor a menor): **Botón Avanzar → Indicador de estado financiero → Próximo evento → Semana+temporada → Badge de mensajes → Nombre del club**.

En 375px:
- Nombre del club: trunca a siglas (máx 4 caracteres, ej: "FCB") o se omite si no hay espacio.
- Semana+temporada: abrevia a "S12 · T1".
- Estado financiero: muestra ícono+clase sin balance €K si el espacio es crítico (el balance detallado está siempre en el panel Finanzas).
- El badge desaparece cuando es 0 usando `width:0; opacity:0` (no `display:none`) para evitar layout shift.
- El HUD strip puede renderizarse en dos líneas en mobile si la combinación estado financiero + próximo evento lo requiere.

### States and Transitions

| Estado | Descripción |
|--------|-------------|
| `idle` | HUD strip visible, Dashboard activo por defecto. |
| `panel_open(id)` | HUD + nav visibles, panel `id` activo en área de contenido. |
| `action_pending(id, action)` | Acción iniciada dentro de un panel, esperando confirmación del usuario (modal z-30). |
| `advancing` | Overlay z-50 activo. `POST /api/game/advance` en curso. Sin input. |
| `modal_blocking(type)` | Modal z-30 bloqueante. "Avanzar" deshabilitado. Requiere decisión (ej: board meeting por crisis financiera, crisis de afición). |
| `match_decision_pending` | Panel de decisión de partido visible (z-20). "Avanzar" habilitado. Countdown activo. |

**Estados combinados:**
- `modal_blocking` mientras hay `match_decision_pending` activo: el modal z-30 se superpone al panel de decisión z-20. El countdown del partido continúa en background (el servidor no espera). Al resolver el `modal_blocking`: si el timeout del partido no ha expirado → el panel de decisión re-emerge; si ha expirado → el panel aparece en estado `expired` (solo informativo).
- `action_pending(id, action)` mientras llega `match:decision-required`: el panel de decisión (z-20) se abre detrás del modal de confirmación activo (z-30). Al resolver la acción pendiente (confirmar o cancelar) → el panel de decisión pasa a primer plano si el timeout no ha expirado.
- `advancing` mientras llega `staff:messages-ready` via Socket.IO: el evento se encola y se aplica al finalizar el overlay z-50 (cuando el AdvanceResult es confirmado). El badge se actualiza al retirar el overlay.
- `match_decision_pending` mientras el jugador pulsa **Avanzar** → `advancing`: el panel de decisión (z-20) permanece activo detrás del overlay z-50 (no cierra). El countdown continúa en background — el advance de reloj y la pausa táctica son BullMQ jobs independientes (el servidor no recibe instrucciones de la decisión táctica por el hecho de avanzar el reloj). Al finalizar el advance (AdvanceResult recibido): (a) el overlay z-50 se retira; (b) si el countdown no ha expirado → el panel de decisión re-emerge en estado activo con el countdown actualizado; (c) si el countdown expiró durante el advance → el panel re-emerge en estado `expired` (solo informativo).

**Transiciones:**
- `idle ↔ panel_open(id)`: tap en nav icon
- `panel_open(X) → panel_open(Y)`: tap en nav icon diferente (reemplaza el panel actual)
- `panel_open → action_pending`: iniciar acción dentro del panel
- `action_pending → panel_open`: cancelar acción
- `action_pending → panel_open + toast`: confirmar acción → llamada API → toast resultado
- `idle/panel_open → advancing`: tap "Avanzar"
- `advancing → idle (dashboard)`: AdvanceResult recibido → HUD actualizado
- `advancing → modal_blocking(boardMeeting)`: ThresholdCrossing BLOCKING en AdvanceResult → fuerza board meeting
- `modal_blocking → advancing`: decisión tomada → nuevo advance o continuación del flujo
- `idle/panel_open → match_decision_pending`: `match:decision-required` recibido vía Socket.IO
- `match_decision_pending → idle`: decisión enviada o timeout de 24h (decisión por defecto aplicada)
- `match_decision_pending → advancing`: tap "Avanzar" (el panel z-20 persiste detrás del overlay z-50; el advance es independiente de la pausa táctica)
- `advancing (con match_decision_pending activo) → match_decision_pending` (re-emerge): AdvanceResult recibido → overlay z-50 se retira → panel de decisión vuelve a primer plano (activo si countdown vivo; `expired` si expiró durante el advance)

### Interactions with Other Systems

| Sistema | Qué fluye AL HUD desde ese sistema | Qué fluye DESDE el HUD al sistema |
|---------|-------------------------------------|-----------------------------------|
| **game-clock (ADR-008)** | `AdvanceResult` → semana, próximo evento, WorldState summary | `POST /api/game/advance` (botón Avanzar) |
| **cascade-engine** | `ThresholdCrossings` en AdvanceResult → modals BLOCKING (crisis afición ≤20, crisis financiera) | El HUD recibe state solamente; no escribe en cascade |
| **economy.md** | `weekly_total_costs`, `balance_eur_k` → indicador financiero; `match_day_revenue` → panel Finanzas | Decisiones de precio de entradas, contratos de patrocinio (vía API) |
| **staff-system / ADR-009** | `staff:messages-ready` Socket.IO → badges + mensajes en panel Staff | Contratar / despedir / formar staff (vía API) |
| **match-simulation / ADR-013** | `match:decision-required` Socket.IO → panel de decisión; `match_pause_timeout_hours = 24h` → countdown | Decisión táctica del jugador vía `POST /matches/:id/decision` |
| **manager-rpg** | Career events → modal z-30 de desbloqueo/felicitación; nivel de reputation → visible en perfil del manager | Ninguno directo |
| **league-system** | Tabla de clasificación, fixtures → Dashboard (posición, próximos rivales) | Ninguno |
| **player-management** | Ratings, fitness, morale, lesiones → panel Plantilla | Decisiones de plantilla vía API (vender, entrenar, etc.) |

*El HUD no persiste ni calcula estado — solo renderiza lo que recibe del GameState server-authoritative. Todas las acciones son llamadas API.*

## Formulas

### F1: Clasificación de estado financiero

El servidor calcula y envía `financial_status: 'safe' | 'warning' | 'crisis'` como campo del `GameState`. El HUD renderiza el valor recibido directamente — no realiza ningún cálculo.

**Lógica de clasificación (ejecutada en servidor, documentada aquí para referencia):**

```
financial_status =
  'safe'    si weeks_runway ≥ 7
  'warning' si weeks_runway ≥ 3 y < 7
  'crisis'  si weeks_runway < 3

weeks_runway = balance_eur_k / weekly_total_costs_eur_k
```

**Variables (calculadas en servidor):**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `financial_status` | enum | `'safe'`, `'warning'`, `'crisis'` | Campo del `GameState` que el HUD consume directamente |
| `weeks_runway` | float | (−∞, ∞) | `balance_eur_k / weekly_total_costs_eur_k`; puede ser negativo si `balance < 0` |
| `balance_eur_k` | float | (−∞, ∞) | Balance actual en €K |
| `weekly_total_costs_eur_k` | float | [0, ∞) | Costes semanales totales |

**Output**: el campo `financial_status` en `GameState`.

**Edge cases (gestionados en servidor):**
- Si `weekly_total_costs_eur_k = 0` Y `balance_eur_k ≥ 0` → `'safe'`. No dividir por cero.
- Si `weekly_total_costs_eur_k = 0` Y `balance_eur_k < 0` → `'warning'` (club con deuda activa aunque sin gastos corrientes — señal de alerta sin ser crisis).
- Si `balance_eur_k < 0` con costes > 0: `weeks_runway` es negativo y clasifica correctamente como `'crisis'` (< 3). El HUD muestra el balance negativo visible (ej: "⚠️ Crisis · -€120K").

*Los umbrales 7 y 3 corresponden a `warning_buffer_weeks` y `critical_buffer_weeks` del registry (economy.md). Se recalculan en el servidor cada semana según `weekly_total_costs` actual. El campo `financial_status` en `GameState` requiere update del tipo `AdvanceResult` en ADR-008 (chore pendiente).*

---

### F2: Tiempo restante de decisión de partido

```
time_remaining_ms = deadline_timestamp_ms − client_now_ms
```

**Variables:**
| Variable | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| `deadline_timestamp_ms` | int | [0, ∞) | Timestamp Unix del deadline en ms (payload de `match:decision-required`) |
| `server_now_ms` | int | [0, ∞) | Timestamp del servidor en el momento de emitir `match:decision-required` — incluido en el payload para calcular offset de clock skew |
| `client_now_ms` | int | [0, ∞) | `Date.now() + clock_offset_ms` en el momento del render |
| `clock_offset_ms` | int | (−∞, ∞) | `server_now_ms − Date.now()` calculado al recibir el evento; corrige skew del reloj del cliente |
| `time_remaining_ms` | int | (−∞, 86_400_000] | Tiempo restante; valores ≤ 0 → estado `expired`; max = 24h = 86_400_000ms. Si `time_remaining_ms > 86_400_000` (deadline corrupto del servidor), clampear al máximo |

**Regla de display:**
| Tiempo restante | Formato | Color |
|-----------------|---------|-------|
| ≥ 4h | `"Xh Ym"` | neutro |
| < 4h y ≥ 30min | `"Xh Ym"` | amarillo |
| < 30min | `"MM:SS"` | rojo |

Si `time_remaining_ms ≤ 0`: panel pasa a estado `expired`. Mostrar "Decisión por defecto aplicada por el asistente". Nunca mostrar valor numérico negativo. Si el servidor responde `409 Conflict` a `POST /matches/:id/decision`, el timeout expiró en el servidor aunque el cliente muestre tiempo restante — mostrar toast "Ventana de decisión cerrada" y pasar el panel a estado `expired`.

---

### F3: Prioridad de la cola de notificaciones

```
priority_rank = { BLOCKING: 0, ADVISORY: 1, INFO: 2 }

notification_queue.sort_by = (priority_rank[n.level] ASC, n.arrived_at ASC)
```

**Variables:**
| Variable | Tipo | Valores | Descripción |
|----------|------|---------|-------------|
| `n.level` | enum | `BLOCKING, ADVISORY, INFO` | Nivel de la notificación |
| `n.arrived_at` | int | timestamp ms | Desempate dentro del mismo nivel (FIFO) |

**Regla de presentación:**
- BLOCKING → modal z-30 (bloquea hasta decisión del jugador)
- ADVISORY → toast z-40 (3–5s, no bloquea)
- INFO → toast z-40 (3s, desaparece solo)
- 2+ BLOCKING simultáneos: se muestran secuencialmente (el segundo espera a que el primero se resuelva)

**Regla de cola mixta (BLOCKING + ADVISORY/INFO simultáneos):**
Cuando hay un modal BLOCKING activo: las notificaciones ADVISORY e INFO en cola esperan — no se muestran como toasts hasta que el BLOCKING se resuelva. Los toasts en cola **no tienen TTL mientras esperan** (no se descartan). Al resolverse el BLOCKING, los toasts pendientes se muestran con su duración normal. Consecuencia: un toast de cambio de estado financiero (Regla 3) que llega junto con un BLOCKING modal se encola detrás del modal.

---

### F4: Badge de mensajes URGENT no leídos

```
total_unread_badge = Σ per_staff_urgent_badge[staffId] for all staffIds
per_staff_urgent_badge[staffId] = count(messages where staffId = X AND is_read = false AND level = 'URGENT')
```

**Lógica de badge (Pilar 4):**
- El badge en el HUD strip refleja solo mensajes **URGENT** sin leer. Los mensajes ROUTINE son visibles en la vista de detalle del empleado (Regla 9) pero no contribuyen al badge del HUD strip.
- El badge individual de cada empleado en el panel Staff también muestra solo sus URGENT sin leer.
- La vista de detalle del empleado muestra todos los mensajes (URGENT + ROUTINE) — el conteo completo es visible al entrar al detalle.

**Origen**: mensajes recibidos vía `staff:messages-ready` Socket.IO, almacenados en estado reactivo Svelte cliente. El cliente filtra por `level = 'URGENT'` y `is_read = false`. El array `StaffMessage[]` se inicializa en mount y reconexión desde `GET /api/game/messages?since={semana_actual - 1}` (ADR-009) — no solo desde el `GameState` del HTTP response.

**Output range**: [0, ∞). Si `total_unread_badge > 99`: mostrar "99+".

## Edge Cases

- **Si `weekly_total_costs_eur_k = 0` Y `balance_eur_k ≥ 0`**: clasificar como `'safe'`. No calcular `weeks_runway` (evitar división por cero).
- **Si `weekly_total_costs_eur_k = 0` Y `balance_eur_k < 0`**: clasificar como `'warning'` (club con deuda activa aunque sin gastos corrientes).
- **Si `balance_eur_k < 0` con costes > 0**: `weeks_runway` negativo → clasifica como `'crisis'`. El indicador muestra el balance negativo (ej: "⚠️ Crisis · -€120K"). Este caso es intencional y correcto.
- **Si `AdvanceResult.nextEventPreview` es `null`**: mostrar "Próximo evento: desconocido" en el HUD strip. No dejar el campo vacío.
- **Si `match:decision-required` llega mientras hay otro panel abierto**: el panel de decisión de partido (z-20) reemplaza el panel actual. Cerrar el sheet de decisión devuelve al panel anterior.
- **Si `time_remaining_ms ≤ 0` en el countdown de partido**: el panel pasa a estado `expired` — el botón de acción táctica desaparece, el countdown se reemplaza por "Decisión por defecto aplicada por el asistente". No mostrar valores numéricos negativos. El panel permanece visible (solo informativo) hasta que el jugador lo cierre manualmente. El botón Avanzar permanece en estado `ready`.
- **MVP limitation — Race condition REST/Socket.IO**: el BLOCKING modal generado por un ThresholdCrossing (en `AdvanceResult` HTTP) puede aparecer ~500ms antes que el mensaje del staff que explica la causa (que llega vía `staff:messages-ready` Socket.IO). El badge del HUD strip se actualizará al llegar `staff:messages-ready`, incluso si el modal ya está visible. El jugador puede cerrar el modal y abrir el panel Staff para leer el contexto. Esto es una limitación de MVP aceptada y documentada — la solución completa (sincronización o deep-link) está deferred a v1.1.
- **Si 2 BLOCKING notifications llegan simultáneamente** (ej: crisis financiera + fan_momentum ≤ 20 en el mismo AdvanceResult): presentar en orden de `arrived_at` (FIFO). El segundo modal espera en cola; nunca apilar dos modals BLOCKING simultáneamente.
- **Si `total_unread_badge > 99`**: mostrar "99+" en el badge. La lista real de mensajes no se trunca.
- **Si el servidor responde con error en `POST /api/game/advance`**: toast de error (z-40) + botón "Avanzar" vuelve a `ready`. El estado del juego no cambia (garantizado por transacción del servidor per ADR-008).
- **Si un `modal_blocking` llega mientras hay un panel abierto**: el modal (z-30) se superpone al panel (z-20). El panel permanece en background. Tras resolver el modal, el jugador regresa al panel anterior.
- **Si la conexión Socket.IO se interrumpe durante `advancing`**: mostrar toast "Reconectando…" (z-40, sin timeout — permanece hasta reconexión o error definitivo). El overlay z-50 permanece activo. Tras reconexión: (1) `GET /api/game/state` para sincronizar el GameState; (2) `GET /api/game/messages?since={semana_actual - 1}` para recuperar mensajes URGENT no leídos (ADR-009) — el badge se recalcula desde los mensajes recuperados. El overlay z-50 se retira ÚNICAMENTE cuando la respuesta de `GET /api/game/state` confirma `turn_number ≥ turn_number_pre_advance`. Si después de 15s no se puede reconectar, el overlay persiste y muestra "Error de conexión — recarga la página".
- **Si el jugador rota la pantalla (portrait → landscape) con un bottom sheet abierto**: el panel re-renderiza dentro de los nuevos límites de `60dvh`. No colapsar ni cerrar el panel en la rotación.

## Dependencies

### Dependencias upstream (el HUD recibe datos de estos sistemas)

| Sistema | Tipo | Interfaz | Naturaleza |
|---------|------|----------|------------|
| **cascade-engine.md** | Hard | `ThresholdCrossings[]` en `AdvanceResult`; `WorldState` snapshot | Hard: el HUD no puede mostrar estado del mundo sin cascade-engine |
| **economy.md** | Hard | `balance_eur_k`, `weekly_total_costs_eur_k`, `match_day_revenue` en GameState | Hard: el indicador financiero requiere estos valores |
| **match-simulation.md** | Hard | Socket.IO `match:decision-required` + `deadline_timestamp_ms` + `match_pause_timeout_hours` | Hard: panel de decisión de partido |
| **staff-system.md** | Hard | Socket.IO `staff:messages-ready` → `StaffMessage[]` | Hard: panel Staff y badges de mensajes |
| **player-management.md** | Soft | Ratings, fitness, morale, lesiones de cada jugador en GameState | Soft: panel Plantilla informativo; HUD base funciona sin él |
| **manager-rpg.md** | Soft | Career events en `AdvanceResult.eventsTriggered`; `reputation.level` | Soft: modals de carrera son opcionales al game loop base |
| **league-system.md** | Soft | Tabla de clasificación, fixtures próximos | Soft: Dashboard funciona parcialmente sin standings |
| **event-system.md** | Soft | `CalendarEvent[]` consumidos en `AdvanceResult.eventsTriggered` | Soft: el HUD muestra eventos pero puede funcionar con lista vacía |

### ADRs que gobiernan este sistema

| ADR | Restricción |
|-----|------------|
| **ADR-012** (UI Architecture) | MVP = DOM-only. Z-layer system. Bottom sheets en mobile (`max-height: 60dvh`). `pointer-events: none` en HUD container. No `transform` / `filter` en wrappers de layout. |
| **ADR-008** (World Clock) | `POST /api/game/advance` es el único trigger de avance. `AdvanceResult` es el payload central del HUD. |
| **ADR-009** (Staff Messages) | `staff:messages-ready` Socket.IO. Mensajes persistidos en DB; recuperables via `GET /api/game/messages?since={week}` en reconexión. |
| **ADR-013** (Match Session) | `match:decision-required` Socket.IO. `match_pause_timeout_hours = 24h`. `POST /matches/:id/decision`. |

### Nota de consistencia bidireccional

Las siguientes entradas del registry ya listan `hud-ui.md` en `referenced_by`: `match_day_revenue`, `financial_state_thresholds`, `warning_buffer_weeks`, `critical_buffer_weeks`. La constante `fan_momentum_blocking_threshold_low` (cascade-engine.md) referencia event-system + hud-ui en sus notas pero hud-ui.md no está aún en su array `referenced_by` — se corregirá en la actualización del registry (Fase 5).

## Tuning Knobs

| Knob | Default | Rango seguro | Efecto si alto | Efecto si bajo |
|------|---------|-------------|----------------|----------------|
| `TOAST_DURATION_MS` | 4000 ms | [2000, 8000] | Toasts bloquean visión del HUD demasiado tiempo | Desaparecen antes de que el jugador los lea |
| `TOAST_MAX_SIMULTANEOUS` | 2 | [1, 3] | Demasiados toasts → sensación de spam | El segundo evento espera demasiado en cola |
| `COUNTDOWN_URGENT_THRESHOLD_HOURS` | 4h | [1, 6] | Urgencia visual aparece demasiado pronto (falsa alarma) | El jugador no nota que el tiempo se acaba |
| `COUNTDOWN_CRITICAL_THRESHOLD_MINUTES` | 30 min | [10, 60] | Modo crítico (rojo, MM:SS) demasiado temprano | El jugador pierde la cuenta cuando queda poco |
| `MESSAGE_BADGE_MAX_DISPLAY` | 99 | [50, 999] | Sin impacto visual real | Muestra "X+" demasiado pronto |
| `PANEL_TRANSITION_DURATION_MS` | 150 ms | [100, **200 max**] | Viola Pilar 4 si > 200ms | Transición imperceptible (sin sensación de apertura) |
| `ADVANCE_OVERLAY_MINIMUM_DURATION_MS` | 300 ms | [200, 600] | Overlay aparece demasiado tiempo en avances rápidos | Parpadeo: overlay desaparece antes de verse |
| `TAB_BAR_HEIGHT_PX` | 56 px | [48, 72] | Tab bar demasiado alto → recorta espacio útil del sheet | Panel solapa el tab bar → tab bar no visible (layout bug) |

**Notas:**
- `PANEL_TRANSITION_DURATION_MS` tiene hard cap de 200ms per ADR-012 (Pilar 4). No subir por encima bajo ninguna circunstancia. ADR-012 prohíbe `transform` en **contenedores de layout** (`+layout.svelte`, divs de z-layer fijos) — los componentes de panel SÍ pueden usar `transform: translateY` en sus propias animaciones de apertura/cierre.
- Los knobs de countdown son de presentación pura — no afectan el timeout de servidor (`match_pause_timeout_hours = 24h`, fijo).
- `ADVANCE_OVERLAY_MINIMUM_DURATION_MS` previene parpadeos en avances rápidos. No afecta el tiempo real de procesamiento. **Implementar en el event handler del botón Avanzar con `async/await + Date.now()`** — no usar `$effect` de Svelte 5 (el cleanup automático de effects puede producir timers huérfanos si `advancing` cambia durante el intervalo de 300ms).
- `TOAST_MAX_SIMULTANEOUS = 2` es la fuente de verdad para este sistema. `interaction-patterns.md` menciona máx 3 — este valor (2) toma precedencia aquí (Pilar 4).

## Visual/Audio Requirements

**Tono**: "Tablero analógico cálido, no app limpia". Los paneles DOM no compiten visualmente con el canvas — son documentos de gestión bien diseñados. Fondo base `#F5F0E8` (blanco-cálido, "papel analógico"). Corner radius `2px` en todos los componentes de acción (art bible §3.3). El jugador debe sentir que está mirando un cuaderno de equipo, no un SaaS dashboard.

**Paleta semántica de estados (vinculante, WCAG ≥ 4.5:1 garantizado sobre `#F5F0E8`):**

| Estado | Color | Hex | Ratio contraste |
|--------|-------|-----|----------------|
| `safe` | Verde oscuro-terroso | `#2D6A4F` | ≈10.7:1 |
| `warning` | Ámbar oscuro | `#8C5A00` | ≈8.0:1 |
| `crisis` | Rojo oscuro | `#8B1A1A` | ≈14.6:1 |

El color es canal **secundario**. Canal primario: icono (✓ / ⚠️ / ✕) + texto de estado. Saturación máxima en DOM: 70%. Ningún estado pulsa ni anima en loop (art bible: prohibición explícita de pulsantes).

**Indicador financiero Crisis**: en estado Safe y Warning: sin borde visible. En estado Crisis: `border-left: 3px solid #8B1A1A`. Único gesto visual que escala con urgencia. No anima.

**Tipografía**: sin pixel fonts en la UI de gestión DOM. Fuente sans-serif funcional (Inter / IBM Plex Sans / system font). Los pixel fonts quedan reservados para overlays dentro del canvas en v1.1+.

**Animaciones de transición**: `ease-out` 150–200ms. Hard cap: 200ms (ADR-012 / Pilar 4). Nunca: `bounce`, `spring`, ni loops de animación.

**Audio**: Sin requisitos de audio para el HUD DOM en MVP. Los SFX de UI se definen en el GDD de audio cuando se diseñe.

> 📌 **Asset Spec** — Reglas visuales definidas. Tras aprobación del art bible, ejecutar `/asset-spec system:hud-ui` para especificar iconografía, paleta de componentes y requisitos de fuente.

## UI Requirements

**Componentes y estados requeridos:**

| Componente | Estados | Notas de implementación |
|------------|---------|------------------------|
| `FinancialStatusIndicator` | `safe`, `warning`, `crisis` | Colores de Visual/Audio. `border-left` solo en crisis. |
| `AdvanceButton` | `ready`, `disabled`, `processing` | En `processing`: spinner + texto "Avanzando…". Usar `aria-disabled` además de `disabled`. **CRÍTICO**: el HUD container tiene `pointer-events:none` (ADR-012) — este botón y TODOS los elementos interactivos del HUD strip DEBEN tener `pointer-events-auto` explícito (clase Tailwind: `pointer-events-auto`). |
| `NextEventBadge` | `null`, `match`, `deadline`, `meeting`, `season_end` | Null state: mostrar "Próximo evento: desconocido" (AC-HUD-24). |
| `StaffMessageBadge` | `0`, `1-99`, `99+` | Cuenta solo mensajes URGENT sin leer. Desaparece a `0` con `width:0; opacity:0` (no `display:none`) para evitar layout shift. |
| `MatchDecisionPanel` | `active` (countdown corriendo), `expired` (timeout) | Bottom sheet. **Snapshot estático**: minuto + marcador + formación activa + lista de jugadores en campo con fitness_bucket (🟢/🟡/🔴) + lista de banquillo con fitness_bucket + cambios restantes en pool — sin streaming. **Input (substitution_window)**: (1) selector player_out (tap en campo) + player_in (tap en banquillo) + botón "Confirmar cambio" (disabled si pool=0 o bench vacío); (2) selector de formación (4 presets); (3) selector de instrucción (PRESS_HIGH/HOLD_SHAPE/COUNTER) **mutuamente exclusivos — radio buttons, no checkboxes**; solo una instrucción puede estar activa; para partidos del club como local: COUNTER no se muestra (el servidor retorna 400 para COUNTER home — match-simulation.md). **Input (injury_pause)**: selector de sustituto o botón "Continuar con 10". **Countdown con rAF**: usar `requestAnimationFrame` con `bind:this` + `el.textContent = formatRemaining(ms)` directo al DOM (no via `$state` — evita 60 re-renders/segundo). **Handoff a `expired`**: cuando `time_remaining_ms ≤ 0` dentro del tick del rAF loop, (1) establecer `let active = false` (flag local que para el loop), (2) llamar `cancelAnimationFrame(rafId)`, (3) flippear `expired = $state(true)` para que Svelte renderice el estado `expired` y elimine el elemento del countdown del DOM; (4) el ref `bind:this` debe guardarse contra null al inicio de cada tick: `if (!active || !el) return;`. El `return () => { active = false; cancelAnimationFrame(rafId); }` del `onMount` también usa el flag. En estado `expired`: sin controles de input, texto "Decisión por defecto aplicada por el asistente". |
| `HUDStrip` | `full` (≥640px), `compact` (<640px) | En `compact` (375px): truncar nombre del club a siglas (máx 4 chars); abreviar semana a "S12 · T1"; estado financiero puede omitir balance €K si espacio crítico. Prioridad display: Avanzar → Estado → Próximo evento → Semana → Badge → Nombre. |
| `StaffEmployeeDetail` | `list` (6 empleados), `detail(staffId)` (mensajes de un empleado) | Navegación in-place dentro del bottom sheet. Estado `detail`: header con "← Staff", todos los mensajes URGENT+ROUTINE del empleado, más recientes primero. Mensajes marcados leídos al visualizarse (optimista). |
| `NotificationToast` | `info`, `advisory`, `blocking` | Blocking → modal z-30 (bloquea). Advisory/Info → toast z-40 (no bloquea). |

**Accesibilidad mínima (WCAG 2.1 AA):**
- Todos los botones interactivos tienen `aria-label` descriptivo
- Estado del botón Avanzar comunica cambios via `aria-live="polite"` (processing, error)
- Badges tienen texto alternativo para screen readers (ej: `aria-label="3 mensajes sin leer"`)
- Contraste mínimo 4.5:1 para todo texto (garantizado por hexes del art bible — Visual/Audio)
- Modals BLOCKING con `role="dialog"`, `aria-modal="true"` y focus trap activo

**Responsive breakpoints:**

| Breakpoint | Comportamiento |
|------------|----------------|
| `< 640px` (mobile) | Bottom tab bar en inferior. Paneles como bottom sheets max-height 60dvh. |
| `640px–1024px` (tablet) | Nav lateral izquierdo colapsado (solo iconos). Paneles como sheets laterales. |
| `> 1024px` (desktop) | Nav lateral expandido (iconos + labels). Paneles como sidebars a la derecha. |

**Nota de canvas (v1.1+)**: El HUD strip se posiciona arriba y el tab bar abajo, dejando el espacio central para el canvas futuro. Esta posición se respeta ya en MVP aunque el canvas sea un fondo plano — garantiza que la migración a v1.1+ no requiera reestructurar el layout base.

> 📌 **UX Flag — HUD y UI Principal**: Este sistema tiene UI requirements. En Fase 4 (Pre-Production), ejecutar `/ux-design` para crear UX spec de las pantallas Dashboard, Plantilla, Staff y Finanzas **antes** de escribir epics. Las stories con UI deben citar `design/ux/[screen].md`, no este GDD directamente.

## Acceptance Criteria

*Tests unitarios en `tests/unit/` salvo donde se indique explícitamente.*

### R1 — Estructura de navegación

**AC-HUD-01** (UI)
GIVEN el jugador está en cualquier estado (idle, panel_open, match_decision_pending), WHEN observa la barra de navegación, THEN los cuatro iconos de navegación (Dashboard, Plantilla, Staff, Finanzas) están presentes en el DOM, visibles con contraste WCAG ≥ 4.5:1, tienen `aria-disabled=false`, y responden a tap/click con apertura del panel correspondiente (verificar que el panel activo cambia en el DOM).

**AC-HUD-02** (UI)
GIVEN el panel Plantilla está abierto, WHEN el jugador toca el icono de Finanzas, THEN el panel Finanzas reemplaza al de Plantilla; no quedan ambos abiertos simultáneamente.

### R2 — HUD strip permanente

**AC-HUD-03** (UI)
GIVEN un panel de navegación está abierto como bottom sheet, WHEN el jugador hace scroll dentro del panel, THEN el HUD strip (semana, próximo evento, estado financiero, badge, botón Avanzar) permanece visible sobre el panel y no es ocluido.

**AC-HUD-04** (UI)
GIVEN un modal BLOCKING está activo (z-30), WHEN el jugador observa el HUD strip, THEN: (1) el botón Avanzar está deshabilitado (`aria-disabled=true`); (2) los siguientes elementos del strip permanecen visibles sobre el modal: nombre del club, semana+temporada, indicador de estado financiero, badge de mensajes, e ícono de próximo evento.

### R3 — Estado financiero / F1 (Logic — BLOCKING)

**AC-HUD-05** (Logic)
GIVEN `weeks_runway = balance_eur_k / weekly_total_costs_eur_k` y `weeks_runway ≥ 7`, WHEN se evalúa el estado financiero, THEN el indicador muestra clase `safe` (verde, sin icono de alerta).

**AC-HUD-06** (Logic)
GIVEN `weeks_runway ∈ [3, 7)` (≥ 3 y < 7), WHEN se evalúa el estado financiero, THEN el indicador muestra clase `warning` (amarillo, icono ⚠️).

**AC-HUD-07** (Logic)
GIVEN `weeks_runway < 3`, WHEN se evalúa el estado financiero, THEN el indicador muestra clase `crisis` (rojo, icono de alerta).

**AC-HUD-08** (Logic)
GIVEN `weekly_total_costs_eur_k = 0`, WHEN se evalúa el estado financiero, THEN el resultado es `safe` y no se produce división por cero ni error de runtime.

### R4 — Botón Avanzar

**AC-HUD-09** (UI)
GIVEN no hay modal BLOCKING activo y no hay un avance en curso, WHEN el jugador observa el HUD strip, THEN el botón Avanzar está en estado `ready`: no tiene atributo `disabled`, tiene `aria-disabled=false`, `pointer-events-auto` está activo, y responde a tap/click disparando `POST /api/game/advance`.

**AC-HUD-10** (UI)
GIVEN un modal BLOCKING está activo, WHEN el jugador intenta pulsar el botón Avanzar, THEN el botón está en estado `disabled` y no se lanza ninguna llamada a `POST /api/game/advance`.

**AC-HUD-11** (UI)
GIVEN el jugador pulsa Avanzar exitosamente, WHEN `POST /api/game/advance` está en curso, THEN: (1) el botón pasa a estado `processing` con atributo `disabled` y `aria-disabled=true`; (2) el overlay z-50 aparece con `pointer-events:all` cubriendo toda la pantalla; (3) ningún botón de navegación, botón de panel, ni el propio botón Avanzar responde a tap/click mientras el overlay está activo (verificar con Playwright que intentar click en nav ícono no cambia el panel activo); (4) el estado se mantiene hasta recibir `AdvanceResult` exitoso o respuesta de error HTTP.

### R5 — Mensajes del staff (Integration — BLOCKING)

**AC-HUD-12** (Integration)
GIVEN el servidor emite `staff:messages-ready` con exactamente 3 mensajes URGENT sin leer (2 del asistente técnico, 1 del responsable económico) y 5 mensajes ROUTINE sin leer (ignorados para el badge), WHEN el cliente recibe el evento, THEN: (1) el badge del HUD strip muestra '3' (no '8'); (2) en el panel Staff, el asistente técnico muestra badge '2' y preview del URGENT más reciente; (3) el responsable económico muestra badge '1' y preview de su URGENT; (4) los demás empleados (sin mensajes URGENT) muestran badge oculto (0).

### R6 — Decisión de partido (Integration — BLOCKING)

**AC-HUD-13** (Integration)
GIVEN el jugador tiene el panel Plantilla abierto, WHEN el servidor emite `match:decision-required` vía Socket.IO con `deadline_timestamp_ms` válido y un snapshot estático (minuto, marcador, formación activa, jugadores en campo con `fitness_bucket`, jugadores en banquillo con `fitness_bucket`, pool restante), THEN: (1) el panel de decisión de partido (z-20, bottom sheet) aparece sobre el panel Plantilla; (2) el panel muestra: minuto de pausa, marcador estático, formación activa, lista de jugadores en campo con indicadores 🟢/🟡/🔴, lista de banquillo con indicadores de fitness y cambios restantes; (3) para `substitution_window`: se muestran los controles de input (selector player_out, selector player_in, selector de formación, selector de instrucción como radio group — seleccionar uno deselecciona el anterior; para partidos de local: COUNTER no aparece como opción); para `injury_pause`: se muestra el selector de sustituto o el botón "Continuar con 10"; (4) el countdown activo se muestra calculado desde `deadline_timestamp_ms - (Date.now() + clock_offset_ms)`; (5) el botón Avanzar en el HUD strip permanece en estado `ready`.

**AC-HUD-14** (UI)
GIVEN el panel de decisión de partido está visible, WHEN el jugador cierra el panel manualmente, THEN la UI regresa al panel anterior; la decisión por defecto del asistente se aplica en el servidor al expirar el timeout, independientemente de si el panel está visible.

### R7 — Bottom sheets mobile

**AC-HUD-15** (UI)
GIVEN la viewport es de 375px de ancho, WHEN el jugador abre cualquier panel de navegación, THEN el panel se renderiza como bottom sheet con `max-height: 60dvh`, es scrollable internamente, y el HUD strip permanece visible por encima.

**AC-HUD-16** (UI)
GIVEN un bottom sheet está abierto en portrait, WHEN el jugador rota el dispositivo a landscape, THEN el panel re-renderiza dentro de los nuevos límites de `60dvh` sin cerrarse ni colapsar.

### R8 — Toasts

**AC-HUD-17a** (Logic — BLOCKING)
GIVEN se producen 3 o más eventos de notificación ADVISORY en rápida sucesión, WHEN el sistema procesa la cola, THEN se muestran como máximo `TOAST_MAX_SIMULTANEOUS` (default: 2) toasts simultáneamente; los toasts adicionales esperan en cola FIFO y se muestran al desaparecer uno de los activos.

**AC-HUD-17b** (UI — ADVISORY)
GIVEN un toast ADVISORY está siendo mostrado, WHEN el tester cronometra su duración, THEN el toast desaparece automáticamente entre 3 y 5 segundos después de aparecer (configurable via `TOAST_DURATION_MS`). Verificar con timer manual en dispositivo real — no apto para CI por variación de CPU.

### F2 — Countdown de decisión de partido (Logic — BLOCKING)

**AC-HUD-18** (Logic)
GIVEN los valores de `deadline_timestamp_ms` y `client_now_ms`:
- WHEN `time_remaining_ms ≥ 4h` → mostrar `"Xh Ym"` color neutro
- WHEN `time_remaining_ms ∈ [30min, 4h)` → mostrar `"Xh Ym"` color amarillo
- WHEN `time_remaining_ms < 30min` → mostrar `"MM:SS"` color rojo
- WHEN `time_remaining_ms ≤ 0` → mostrar "Tiempo agotado — decisión por defecto aplicada"; nunca un valor numérico negativo

### F3 — Prioridad de cola de notificaciones (Logic — BLOCKING)

**AC-HUD-19** (Logic)
GIVEN llegan simultáneamente una notificación BLOCKING, una ADVISORY y una INFO en el mismo AdvanceResult, WHEN el sistema procesa la cola, THEN la notificación BLOCKING se presenta primero como modal z-30; las de tipo ADVISORY e INFO esperan y se muestran como toast solo después de que el modal BLOCKING sea resuelto.

**AC-HUD-20** (Logic)
GIVEN llegan 2 notificaciones BLOCKING simultáneas, WHEN el sistema presenta la cola, THEN se muestra primero la de menor `arrived_at`; la segunda permanece en cola y aparece solo al resolver la primera. Nunca se apilan 2 modals BLOCKING simultáneamente.

### F4 — Badge de mensajes no leídos (Logic — BLOCKING)

**AC-HUD-21** (Logic)
GIVEN el array `StaffMessage[]` contiene mensajes con `is_read = false` para múltiples empleados (mezcla de URGENT y ROUTINE), WHEN el cliente calcula `total_unread_badge`, THEN el valor es `Σ per_staff_urgent_badge[staffId]` filtrando solo mensajes con `level = 'URGENT'` — los mensajes ROUTINE no contribuyen al badge. WHEN `total_unread_badge > 99` → badge muestra "99+"; la lista real de mensajes (incluyendo ROUTINE) no se trunca en la vista de detalle del empleado.

### Edge cases críticos

**AC-HUD-22** (Integration — BLOCKING)
GIVEN el servidor responde con error HTTP 4xx/5xx en `POST /api/game/advance`, WHEN el cliente recibe el error, THEN: (1) se muestra un toast de error (z-40) con mensaje descriptivo; (2) el overlay z-50 desaparece; (3) el botón Avanzar regresa a estado `ready`; (4) el objeto `GameState` en el store de Svelte NO muta — verificar tomando `$state.snapshot(gameState)` antes del POST y confirmando **igualdad estructural (deep equality, no referencial — dos snapshots son objetos distintos)** con el snapshot posterior al error (invariante de arquitectura server-authoritative).

**AC-HUD-23a** (Integration — BLOCKING)
GIVEN la conexión Socket.IO se interrumpe mientras el overlay z-50 está activo (evento `disconnect` del socket), WHEN se detecta la desconexión, THEN: (1) toast "Reconectando…" aparece (z-40, sin auto-dismiss — permanece hasta reconexión o error definitivo; no desaparece por sí solo); (2) el overlay z-50 permanece activo bloqueando toda interacción; (3) ningún botón ni control de navegación responde a input durante la desconexión.

**AC-HUD-23b** (Integration — BLOCKING)
GIVEN la conexión Socket.IO se interrumpe y luego se restaura mientras el overlay z-50 está activo, WHEN se restablece la conexión, THEN: (1) el cliente llama secuencialmente `GET /api/game/state` y después `GET /api/game/messages?since={semana_actual - 1}` (en ese orden, no en paralelo); (2) el overlay z-50 se retira ÚNICAMENTE cuando la respuesta de `GET /api/game/state` es HTTP 200 Y `response.turn_number >= turn_number_pre_advance`; (3) si `turn_number < turn_number_pre_advance` (el advance no completó en el servidor), el overlay persiste esperando; (4) el badge de mensajes se recalcula desde los mensajes recuperados por `GET /api/game/messages`.

**AC-HUD-23c** (Integration — BLOCKING)
GIVEN la conexión Socket.IO se interrumpe durante advancing y no se restaura, WHEN transcurren 15 segundos sin reconexión exitosa, THEN el overlay z-50 persiste y muestra "Error de conexión — recarga la página" (el toast "Reconectando…" puede permanecer o ser reemplazado por este mensaje). El overlay NUNCA desaparece automáticamente en este estado — requiere acción del usuario (recargar la página). Nota: usar timer mockeado en tests de integración para no esperar los 15s reales.

**AC-HUD-24** (UI)
GIVEN `AdvanceResult.nextEventPreview = null`, WHEN el HUD strip renderiza el campo de próximo evento, THEN muestra "Próximo evento: desconocido"; el campo no queda vacío ni lanza error de render.

**AC-HUD-25** (Logic — BLOCKING)
GIVEN el panel de decisión de partido está visible con un countdown activo, WHEN `time_remaining_ms` llega a 0 (o el jugador abre el panel con un deadline ya expirado), THEN: (1) el panel cambia a estado `expired`: el botón de acción táctica desaparece; el countdown es reemplazado por el texto "Decisión por defecto aplicada por el asistente"; (2) el botón Avanzar en el HUD strip permanece en estado `ready`; (3) el panel permanece visible hasta que el jugador lo cierre manualmente; (4) en ningún caso se muestra un valor numérico negativo en el countdown; (5) si el servidor responde `409 Conflict` a `POST /matches/:id/decision`, el panel pasa a estado `expired` y muestra toast "Ventana de decisión cerrada".

**AC-HUD-26** (Logic — BLOCKING)
GIVEN el servidor calcula `financial_status` para un club con `balance_eur_k = -120` y `weekly_total_costs_eur_k = 40`, WHEN el HUD renderiza el indicador financiero, THEN: (1) el estado mostrado es `crisis` (weeks_runway = -3 < 3); (2) el indicador muestra el balance negativo (ej: "⚠️ Crisis · -€120K"). GIVEN `weekly_total_costs_eur_k = 0` y `balance_eur_k = -50`, THEN el estado mostrado es `warning` (no `safe`).

### R9 — Navegación interna Staff + marcado optimista (Regla 9)

**AC-HUD-27** (Integration — BLOCKING)
GIVEN el panel Staff está abierto con un empleado que tiene 1 mensaje URGENT y 2 ROUTINE sin leer, WHEN el jugador toca el nombre del empleado, THEN: (1) la lista de 6 empleados es reemplazada in-place por la vista de detalle de ese empleado, con header "← Staff" visible; (2) los mensajes aparecen en cronológico inverso (más recientes primero), mostrando tanto URGENT (con fondo diferenciado) como ROUTINE; (3) tras visualizar los mensajes, el badge individual del empleado en la vista de lista decrementaría a 0 (actualización optimista: el cliente marca `is_read = true` en el estado local sin esperar confirmación del servidor); (4) tap en "← Staff" restaura la lista de 6 empleados; (5) el badge del HUD strip se actualiza para reflejar la lectura de los mensajes URGENT.

### R10 — Truncación del HUD strip en mobile (Regla 10)

**AC-HUD-28** (Logic — BLOCKING)
GIVEN un viewport de 375px y nombre de club que excede 4 caracteres, badge de mensajes = 0, y estado financiero `warning`, WHEN el HUD strip renderiza en pantalla completa, THEN: (1) el nombre del club aparece truncado a ≤ 4 caracteres (siglas) o se omite completamente; (2) el campo de semana+temporada aparece en formato abreviado ("S12 · T1", no "Semana 12 · T1"); (3) el badge de mensajes tiene `width: 0; opacity: 0` (no `display: none`) para evitar layout shift; (4) el indicador de estado financiero es visible (como mínimo el ícono ⚠️); (5) el botón Avanzar es visible y responde a tap.

### F6 — Estado combinado modal_blocking + match_decision_pending

**AC-HUD-29** (Integration — BLOCKING)
GIVEN el panel de decisión de partido está activo (`match_decision_pending`) con countdown activo y tiempo restante > 0, WHEN llega una notificación BLOCKING (ej: ThresholdCrossing de crisis financiera) que genera un modal z-30, THEN: (1) el modal BLOCKING z-30 aparece sobre el panel de decisión z-20; (2) el countdown del partido continúa en background (el servidor no espera la resolución del modal); (3) CASE A — al resolver el modal BLOCKING antes de que expire el countdown: el panel de decisión re-emerge en estado activo con el countdown actualizado (menos tiempo restante); (4) CASE B — al resolver el modal BLOCKING después de que el countdown haya expirado: el panel de decisión re-emerge en estado `expired` ("Decisión por defecto aplicada por el asistente", sin controles de input); (5) en ningún caso se muestran dos modals BLOCKING simultáneamente.

---

| Gate | ACs |
|------|-----|
| **BLOCKING (unit test)** | AC-HUD-05, 06, 07, 08, 17a, 18, 19, 20, 21, 25, 26, 28 |
| **BLOCKING (integration test)** | AC-HUD-09, 10, 11, 12, 13, 22, 23a, 23b, 23c, 27, 29 |
| **ADVISORY (UI walkthrough)** | AC-HUD-01, 02, 03, 04, 14, 15, 16, 17b, 24 |

## Open Questions

| # | Pregunta | Owner | Estado |
|---|----------|-------|--------|
| OQ-HUD-01 | ¿Cómo se ve el panel Dashboard exactamente? ¿Qué KPIs muestra, en qué orden, con qué jerarquía visual? | UX designer + Pablo | Abierta — resolver en `/ux-design Dashboard` |
| OQ-HUD-02 | ¿El panel Plantilla muestra la formación como grid visual (11 posiciones en campo) o como lista plana? ¿Cambia en mobile vs desktop? | UX designer + Pablo | Abierta — resolver en `/ux-design Plantilla` |
| OQ-HUD-03 | ¿Cuando la ventana de transferencias está cerrada: el panel Mercado es navegable (read-only) o completamente oculto? | game-designer | Abierta — depende de league-system integration |
| OQ-HUD-04 | ~~¿El panel de decisión de partido muestra el marcador actual (streaming del resultado) o solo aparece en las ventanas de decisión?~~ | Pablo | **Resuelta (2026-05-18)**: snapshot estático — el panel muestra el marcador al momento de la pausa táctica del servidor. Sin streaming en tiempo real (Pilar 4). AC-HUD-13 actualizado. |
| OQ-HUD-05 | ¿El HUD strip muestra alguna indicación de XP/nivel del manager (Manager-RPG) o eso queda en un panel dedicado? | game-designer | Abierta — potencial tensión con Pilar 1 (opacidad de progresión) |
| OQ-HUD-06 | Canvas frontier MVP: ¿el fondo detrás de los paneles DOM es color sólido (branding) o un placeholder estático (sprite de ciudad en estado inicial)? | art-director + Pablo | Abierta — afecta percepción de "mundo vivo" desde el día 1 |
| OQ-HUD-07 | **MVP limitation — Race condition REST/Socket.IO**: los BLOCKING modals del cascade-engine pueden aparecer ~500ms antes que los mensajes del staff que explican la causa. En MVP se documenta como limitación aceptada (ver Edge Cases). Soluciones completas (delay modal + esperar `staff:messages-ready`, o deep-link server-side en ThresholdCrossing) están deferred a v1.1. | tech-lead | Abierta (MVP limitation documentada — no bloqueante para implementación) |
| OQ-HUD-08 | ¿Cómo aprende el jugador el loop "Avanzar → leer Staff → actuar" en la primera sesión? Empty states en **todos los paneles**: Dashboard (0 partidos, sin datos), Staff (6 empleados con 0 mensajes — ¿qué muestra el preview slot?), Plantilla (¿son visibles los ratings en semana 1 o requieren staff tier-N?), Finanzas (0 ingresos de taquilla/transfers). El estado t=0 del GameState determina qué muestra cada panel. | UX designer + Pablo | **Bloqueante antes del sprint** — resolver en `/ux-design` antes de implementar cualquier panel. La pregunta incluye la decisión Pilar 3: ¿los ratings de jugadores son visibles desde el día 1? |
| OQ-HUD-09 | **Input control taxonomy** (post-vertical-slice 2026-05-18 — Pablo's playtest). Los inputs numéricos del jugador deben usar el control apropiado a la naturaleza de la decisión, no un slider 0-100 genérico: (a) **categórico → button group** (intensidad de entrenamiento: Descanso/Suave/Normal/Fuerte/Brutal; instrucciones de partido: HOLD/PRESS/COUNTER); (b) **cuantitativo con unidad natural → discrete slider en unidad real** (precio entrada en € con step 5€, presupuestos en €K, etc.); (c) **selección de items → dropdown / select** (formaciones, jugadores). El slice valida el patrón híbrido. La UI muestra siempre la unidad natural del jugador; la traducción a índice [0,100] (cuando aplique) vive en la frontera UI↔API. | UX designer + game-designer | **Resuelta de raíz por playtest** — formalizar en `/ux-design` antes del sprint UI. Afecta especificación de cada panel de decisión. |
