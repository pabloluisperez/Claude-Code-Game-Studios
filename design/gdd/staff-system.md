# Sistema de Staff

> **Status**: Approved (design-review R3 2026-05-18 — lean, 2 blockers resueltos + 3 recomendados aplicados)
> **Creative Director Review (CD-GDD-ALIGN)**: Completed 2026-05-18 — post-revision re-review requerida (R3).
> **Author**: Pablo + Claude Code agents
> **Last Updated**: 2026-05-18
> **Implements Pillar**: P3 (You Grow Like Your Club) · P1 (Tinkering Beats Optimization)
> **ADR References**: ADR-009 (Staff Message Routing & Granularity) · ADR-010 (Manager-RPG Progression) · ADR-008 (World Clock + Event Loop) · ADR-003 (WorldState node catalog)

## Overview

El sistema de staff es la capa de feedback que cierra el loop de 30 segundos de Cascada FC: cada vez que el jugador avanza el tiempo, los seis miembros del cuerpo técnico (jardinero, preparador físico, director comercial, director deportivo, director financiero, primer entrenador) leen su dominio del WorldState y generan observaciones que llegan al inbox del jugador. Un séptimo rol exclusivo — el Director de Comunicación — se desbloquea cuando el manager alcanza reputation.level 5 y conecta el club con el mundo mediático. Estos mensajes son el principal canal a través del cual el jugador recibe señales sobre las cascadas del club sin que el juego las exponga directamente (Pilar 1). La mecánica central del sistema es la **calidad del staff**: un preparador novato solo detecta cambios grandes ("el equipo está cansado"); un experto detecta cambios sutiles antes de que sean crisis y los contextualiza ("llevas cuatro semanas con training en 78, el equipo está perdiendo físico sin que los números lo muestren todavía"). Los miembros de mayor calidad también emiten **avisos de calendario** — ventanas de fichajes abiertas, partidos rivales importantes en televisión, eventos sociales con impacto en la afición — ampliando la visibilidad del jugador sobre el mundo más allá del estado actual del club. La calidad máxima contratables está gateada por el nivel de `reputation` del manager (`getMaxHirableStaffQuality()`, manager-rpg.md) — el staff experto es consecuencia de haberse ganado la credibilidad como manager (Pilar 3). En el MVP todos los mensajes son plantillas de texto; el extension point para enrichment via IA narrativa queda reservado para post-MVP. Arquitectura técnica completa en ADR-009.

## Player Fantasy

El jugador de Cascada FC experimenta el sistema de staff en un registro que se revela gradualmente, sin que el juego lo anuncie.

Al principio, el inbox llena con observaciones breves y poco específicas: "El campo necesita atención." "El equipo está cansado." "Las ventas de entradas van flojas." El jugador las lee, asiente, y sigue. Son pistas, pero no explican nada.

Después de varias semanas gestionando el club — superando board meetings, firmando contratos, ganando partidos — el manager puede permitirse contratar un preparador físico con trayectoria en clubes medianos. Y una semana después llega un mensaje diferente: "Llevas cuatro semanas al mismo ritmo de entrenamiento. La mejora de forma es real, pero el cuerpo está absorbiendo carga sin tiempo de recuperación suficiente. Si mantienes este ritmo, el pico de rendimiento llegará justo antes del siguiente partido — pero la semana siguiente puede haber un bajón."

El jugador no recibe ninguna notificación de que el nuevo preparador es "mejor". Solo nota que el mensaje es distinto. Más largo. Con una predicción. Y que la predicción se cumple.

La fantasía del sistema de staff es **sentirte rodeado de personas que ven lo que tú no ves todavía**, y que las personas que ves cambiar a tu alrededor son consecuencia de quién te has convertido como manager. No desbloqueas una estadística — desbloqueas una relación. El staff novato era lo mejor a lo que podías aspirar en semana 1. El staff experto es lo que mereces en temporada 2.

---

**Guía de tono por tier (referencia para el template library — Pilar 1: nunca exponer valores numéricos):**

| Tier | Registro | Ejemplo — fitness_coach |
|---|---|---|
| **T1** | Vago, observacional | "El equipo está cansado." |
| **T2** | Causal, contextualizado | "La carga de estos últimos partidos se está notando en los entrenamientos. Hay jugadores que van a menos cada semana." |
| **T3** | Proyectivo, preciso en tiempo | "Llevas cuatro semanas al mismo ritmo de entrenamiento. La mejora de forma es real, pero el cuerpo está absorbiendo carga sin tiempo de recuperación suficiente. Si mantienes este ritmo, el pico llegará justo antes del siguiente partido — la semana siguiente puede haber un bajón." |

| Tier | Registro | Ejemplo — scouting_director |
|---|---|---|
| **T1** | Vago | "Las perspectivas de captación no son las mejores." |
| **T2** | Causal | "Llevamos semanas sin actividad real de captación. Si se abre una ventana de fichajes esta temporada, llegamos con menos margen del habitual." |
| **T3** | Proyectivo | "El contexto de captación lleva deteriorándose varios ciclos. Si no reactivamos el área antes de la ventana de invierno, vamos a tener que conformarnos con opciones de mercado libre." |

**Restricciones del template library (Pilar 1):**
- ❌ Nunca: "La afición está en 62, si no ganamos baja a 55." — expone valor WorldState.
- ❌ Nunca: "El campo tiene calidad 34/100." — expone valor WorldState.
- ✅ Siempre: tendencias cualitativas, proyecciones temporales, recomendaciones sin cifras.
- Los templates son strings literales fijos — sin interpolación de variables del WorldState (OQ-STAFF-05 resuelto: sin micro-template engine en MVP).

## Detailed Rules

### Core Rules

1. El club tiene **6 posiciones de staff base** (una por rol), todas cubiertas desde el inicio por staff de tier 1. Un **7.º slot exclusivo** (`communications_director`) se desbloquea cuando el manager alcanza `reputation.level = 5` y permanece VACANTE hasta que el jugador contrate un candidato del mercado.

2. Cada miembro del staff percibe un **dominio de nodos del WorldState** específico a su rol. Después de cada advance, el worker evalúa el delta de cada nodo en el dominio del staff y genera un mensaje si el delta supera el umbral de percepción.

3. El **umbral de percepción** depende del tier (ADR-009):
   - Tier 1 (novato): detecta cambios ≥ 3× baseThresholdPct
   - Tier 2 (experimentado): detecta cambios ≥ 1.5× baseThresholdPct
   - Tier 3 (experto): detecta cambios ≥ 1× baseThresholdPct
   - **Excepción — nodos tipo contador**: `consecutive_wins` y `consecutive_losses` disparan mensaje con cualquier cambio ≥ 1 punto, independientemente del tier. Estos nodos cambian de 1 en 1 y la fórmula de porcentaje no aplica.

4. Los mensajes de **tier 1** son vagos ("el campo está deteriorándose"). Los de **tier 2** añaden contexto causal ("los jugadores están notando el estado del césped"). Los de **tier 3** incluyen recomendaciones precisas y proyecciones temporales ("invertir esta semana evitaría problemas en los próximos partidos"). **Ningún tier expone valores numéricos del WorldState** (Pilar 1).

5. El **anti-spam** limita mensajes ROUTINE a 2 por staff por semana. Los mensajes URGENT, generados por ThresholdCrossings BLOCKING del cascade engine, no tienen límite y siempre llegan. **Excepción PRIORITY_NODE**: `corruption_exposure` tiene prioridad en la selección de anti-spam — si supera su umbral efectivo, siempre ocupa uno de los 2 slots antes que otros nodos con mayor delta absoluto. El `routineCount` se resetea a 0 al inicio de cada tick (semana nueva).

6. El staff de **tier 2 y tier 3** también genera **mensajes de calendario** — avisos sobre eventos externos al WorldState: ventanas de fichajes, partidos rivales en TV, vencimientos de contratos, eventos de afición. Plantillas de calendario (`'{role}:{calendarEvent}:{qualityTier}'`) distintas a las de observación de WorldState.

7. Un puesto **vacante** no genera mensajes en ese dominio. El jugador queda ciego en esa área hasta contratar sustituto.

8. **Dos caminos de desarrollo**: (A) formación interna — desembolso único, tier mejora inmediatamente; (B) despido + contratación externa — indemnización 4 semanas + puesto vacante durante la transición. Ambos caminos requieren que `getMaxHirableStaffQuality(reputation.level)` ≥ tier objetivo. Al completarse la **Vía A**, el miembro formado genera automáticamente 1 mensaje ROUTINE con templateKey `'{role}:formation_complete:{tier_new}'` — confirma el upgrade desde su perspectiva, incluyendo su nombre.

9. **Confirmación de estabilidad**: si un miembro del staff no ha generado ningún mensaje (ROUTINE o URGENT) en las últimas 4 semanas y ningún nodo de su dominio ha superado el umbral en ese período, genera 1 mensaje ROUTINE con templateKey `'{role}:all_stable:{tier}'` (tipo STABLE_CHECK). Este mensaje **no consume slots del anti-spam ordinario**. Propósito: garantizar feedback positivo de confirmación cuando el club está estable, no solo cuando hay problemas. El contador se reinicia después de disparar STABLE_CHECK — si el dominio sigue estable en las semanas siguientes, el próximo STABLE_CHECK se genera pasadas otras 4 semanas de silencio (`STABLE_CHECK_INTERVAL_WEEKS`, ver Tuning Knobs).

10. Cada miembro del staff tiene un **nombre generado proceduralmente** al ser contratado (o asignado durante `world-gen` para los 6 slots base). El nombre se persiste en el campo `name` de `staff_members` y aparece en los mensajes del inbox. Los mensajes se identifican por nombre + rol, no solo por rol.

---

### Staff Roles & Perception Domains

| Rol (`StaffRole`) | Nombre | Dominio WorldState | Calendario (tier 2+) |
|---|---|---|---|
| `groundskeeper` | Jardinero | `field_quality`, `injury_risk` | Partido en casa esta semana (estado del campo), alertas de mantenimiento urgente |
| `fitness_coach` | Preparador físico | `team_fitness`, `training_intensity`, `injury_risk`, `squad_available_pct` | Acumulación de partidos en 7 días (riesgo de sobrecarga), inicio de temporada (evaluación física) |
| `commercial_director` | Director comercial | `fan_momentum`, `fan_attendance`, `sponsor_quality`, `ticket_price_index` | Vencimiento de contrato de patrocinador (N semanas), partido rival en TV (impacto en asistencia), eventos de afición (derby, fin de liga) |
| `scouting_director` | Director deportivo | `scouting_points`, `team_skill`, `squad_available_pct`, `corruption_exposure` | Apertura/cierre de ventana de fichajes, vencimientos de contratos de jugadores (tier 3) |
| `finance_director` | Director financiero | `sponsor_quality`, `corruption_exposure` | Vencimiento de contratos de patrocinio, advertencias de umbrales financieros |
| `head_coach` | Primer entrenador (asistente técnico) | `match_performance_index`, `player_happiness`, `staff_morale`, `team_fitness`, `consecutive_wins`, `consecutive_losses` | Análisis del próximo rival (tier 2+), oportunidad de intervención de moral cuando `player_happiness < 50` (tier 2+) |
| `communications_director` | Director de Comunicación *(slot exclusivo)* | `fan_momentum`, `fan_attendance`, `match_performance_index` | Oportunidades de rueda de prensa post-partido de alto perfil (tier 2+), alertas de cobertura mediática negativa, ventanas de `career_milestone:press_interview` (resuelve OQ-RPG-03) |

**Nota `head_coach`**: El manager (RPG) ejerce el rol estratégico. El `head_coach` es el asistente técnico — organiza entrenamientos y analiza rivales según su tier.

**Nota `communications_director`**: Slot exclusivo que solo existe cuando `reputation.level ≥ 5`. Antes de ese nivel, el slot no aparece en el HUD. Al alcanzar el nivel, aparece como VACANTE — no hay staff interino automático. En el **primer unlock**, el mercado muestra únicamente candidatos T1 para este rol — el arco de relación T1→T2→T3 aplica igual que en los 6 slots base. Una vez contratado un T1, Vía A (formación interna T1→T2, T2→T3) y Vía B funcionan normalmente. **No tiene Vía A T0→T1** porque el slot comienza VACANTE (no con un T1 preinstalado).

**Nota `corruption_exposure`**: El `scouting_director` de **tier 3** detecta acumulación antes del BLOCKING de C18 y puede proponer reducirlo activamente. Tier 1 solo reporta cuando ya es crítico.

**Nota v1.1 (2026-05-24)**: `scouting_director` tier 2/3 **adicionalmente habilita las visibility tiers del market** definidas en `scouting-market.md §3.7`:
- T2 director (skill 50-70) habilita `deep-scout` action en mercado (T2→T3 transition)
- T3 director (skill 70-100) reduce `SCOUT_DELAY_WEEKS` (1→0, instant) + 20% discount en `SCOUT_COST_EUR_K`
- Cost/perception scope del role NO cambia — sólo se extiende lo que sus tiers permiten al manager en el sistema de scouting market.

---

### Hiring Mechanics

1. El **mercado de staff** (accesible desde HUD) muestra 3-5 candidatos por rol, filtrados por `getMaxHirableStaffQuality()`. El jugador nunca ve candidatos de tier superior al que puede contratar. Los candidatos rotan cada 4 semanas.

2. **Vía A — Formación interna**: Opción "Invertir en formación" disponible cuando `reputation.level` permite el tier siguiente. Al confirmar el gasto (one-time, ver F2), el tier sube inmediatamente. Sin periodo de inactividad.

3. **Vía B — Despido + contratación**: Despido = indemnización de 4 semanas de salario del miembro actual, pagada inmediatamente. Puesto queda vacante hasta contratar. Al contratar, el nuevo staff genera mensajes desde la semana siguiente.

4. Tier 2 disponible con `reputation.level ≥ 3`. Tier 3 con `reputation.level ≥ 4 ó 5` (per `getMaxHirableStaffQuality()`).

5. El slot de `communications_director` se activa cuando `reputation.level = 5`. En el **primer unlock**, el mercado muestra únicamente candidatos T1 para este rol. Una vez contratado un T1, el mercado pasa a mostrar T2/T3 según las reglas estándar de `getMaxHirableStaffQuality()`. El slot no puede cubrirse antes — la opción no existe en el HUD.

**Nota de diseño Via A vs Via B**: la tensión económica entre ambas vías escala con el impacto de la vacante. Para roles de alto impacto (`head_coach`, `scouting_director`), una vacante de 1-4 semanas puede ser crítica — Via A tiene valor tanto narrativo como estratégico. Para `groundskeeper`, el impacto de la vacante es bajo y Via B domina económicamente. El valor de Via A para roles de bajo impacto de vacante es la **continuidad narrativa**: el staff mantiene su nombre y su historia de formación, no hay interrupción de la relación. No hay un retorno económico equivalente al coste premium.

---

### States and Transitions

```
[VACANTE] ─── contratar ──► [ACTIVO tier N]
                                │
                ┌───────────────┼──────────────────┐
                │               │                  │
       despido (4 sem.)    formar (Vía A)    continúa activo
                │               │
                ▼               ▼
           [VACANTE]   [ACTIVO tier N+1]
```

Sin estados intermedios (lesión, baja) en MVP — activo o vacante.

---

### Interactions with Other Systems

| Sistema | Dirección | Dato | Cómo |
|---------|-----------|------|------|
| `cascade-engine.md` | ← lee | WorldState snapshot semanal | Worker recibe `worldStateDiff` del advance() (ADR-009) |
| `cascade-engine.md` | ← lee | `ThresholdCrossings` BLOCKING | Triggers de mensajes URGENT — bypasa anti-spam |
| `manager-rpg.md` | ← gate | `getMaxHirableStaffQuality(reputation.level)` | Filtra mercado y valida formación interna |
| `economy.md` | → escribe | Coste semanal de salario × 6 (coste fijo de personal técnico) | Categoría de coste en economy.md |
| `economy.md` | → escribe | Indemnización (4×salario) y coste de formación (one-time) | Deducción inmediata del balance |
| `event-system.md` | → genera | `squad_morale:high_streak` CalendarEvent | advance() detecta player_happiness > 70 durante 4 semanas consecutivas (resuelve **OQ-RPG-02**) |
| `event-system.md` | — | `career_milestone:press_interview` NO es un mensaje de staff | Generado por event-system.md con RNG + reputation.level ≥ 2 (resuelve **OQ-RPG-03**) |
| `hud-ui.md` | → entrega | `StaffMessage[]` vía Socket.IO push `staff:messages-ready` | Inbox del jugador |
| `hud-ui.md` | ← lee | Panel de staff: miembros actuales, tiers, salarios | Diseño UI en hud-ui.md |

**Resolución OQ-RPG-04 — `player:morale_intervention`**: Acción **explícita** disponible en el panel de jugadores cuando `player_happiness < 50`. El `head_coach` (cualquier tier) genera mensaje ROUTINE cuando player_happiness cae ("el vestuario está decaído"); tier 2-3 sugiere actuar. El manager activa "Hablar con jugador" manualmente desde el HUD → registra `player:morale_intervention` → otorga XP de `man_management`.

## Formulas

### F1: Salarios semanales de staff `STAFF_SALARY_EUR_K[role][tier]`

`weekly_staff_cost_eur_k = Σ STAFF_SALARY_EUR_K[role_i][tier_i]` para los 6 roles activos

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Rol (`StaffRole`) | `role` | enum | 6 valores | Rol del miembro de staff |
| Tier de calidad | `tier` | int | {1, 2, 3} | 1=novato, 2=experimentado, 3=experto |

**Tabla de salarios (€K/sem):**

| Rol | Tier 1 | Tier 2 | Tier 3 | Ratio T2/T1 | Ratio T3/T2 |
|-----|--------|--------|--------|-------------|-------------|
| `groundskeeper` | 0.25 | 0.50 | 0.75 | ×2.0 | ×1.5 |
| `fitness_coach` | 0.50 | 1.00 | 2.00 | ×2.0 | ×2.0 |
| `commercial_director` | 0.50 | 1.00 | 2.25 | ×2.0 | ×2.25 |
| `scouting_director` | 0.50 | 1.00 | 2.00 | ×2.0 | ×2.0 |
| `finance_director` | 0.50 | 1.00 | 2.00 | ×2.0 | ×2.0 |
| `head_coach` | 0.50 | 1.50 | 3.00 | ×3.0 | ×2.0 |
| `communications_director` *(slot exclusivo)* | 0.50 | 1.00 | 2.25 | ×2.0 | ×2.25 |
| **TOTAL (6 slots base)** | **2.75** | **6.00** | **12.00** | — | — |
| **TOTAL (7 slots activos)** | **3.25** | **7.00** | **14.25** | — | — |

**Output Range:** 2.75 €K/sem (6 slots base, todos tier 1) a 14.25 €K/sem (7 slots activos, todos tier 3). El total de 7 slots solo aplica si `reputation.level = 5` y el `communications_director` está contratado.
**Ejemplo (D2/Segunda inicio, todos tier 1):** 2.75 €K/sem → contribuye a `weekly_wage_bill_eur_k` de economy.md F0

**Notas de diseño:**
- `groundskeeper` T3 comprimido (×1.5 en vez de ×2.0): rol manual, impacto limitado a `field_quality` e `injury_risk`.
- `commercial_director` T3 ligeramente superior (2.25 vs 2.00): impacto directo en revenue de patrocinio (percibe `sponsor_quality` + `ticket_price_index`).
- `head_coach` T1→T2 ratio ×3.0: el mayor de todos. El salto de asistente novato a experimentado es el más diferencial del mercado; dominio de 6 nodos.
- `communications_director` mismo ratio que `commercial_director` (×2.0/×2.25): roles orientados a medios y relaciones públicas tienen curva salarial parecida.
- Staff tier 3 completo, 6 slots base (12.00 €K/sem) + player wages (~6 €K, target D2 inicio per economy.md) + opex (~3.25 €K) ≈ **21.25 €K/sem** — insostenible en D2 temprano. Con 7 slots activos todos en T3 (14.25 €K/sem): 14.25 + 6 + 3.25 ≈ **23.5 €K/sem**. El gate de `reputation.level ≥ 4` para tier 3 protege al jugador de este error.

---

### F2: Costes de formación interna `FORMATION_COST_EUR_K[role][transition]`

`formation_cost = FORMATION_MULTIPLIER × STAFF_SALARY_EUR_K[role][tier_current]`

`FORMATION_MULTIPLIER = 8`

La formación interna es el **precio de la certeza**: siempre cuesta más cash que la indemnización por despido, pero garantiza (1) continuidad sin vacante y (2) independencia del mercado de candidatos.

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Salario semanal tier actual | `S` | float | ver F1 | Salario del miembro antes de la formación |
| Multiplicador de formación | `FORMATION_MULTIPLIER` | int | 8 | Semanas de salario para cubrir el coste de formación |

**Tabla de costes (€K, one-time):**

| Rol | Indemnización T1 (4×S) | Form. T1→T2 (8×S) | Indemnización T2 (4×S) | Form. T2→T3 (8×S) |
|-----|-----------------------|-------------------|----------------------|-------------------|
| `groundskeeper` | 1.0 | **2.0** | 2.0 | **4.0** |
| `fitness_coach` | 2.0 | **4.0** | 4.0 | **8.0** |
| `commercial_director` | 2.0 | **4.0** | 4.0 | **8.0** |
| `scouting_director` | 2.0 | **4.0** | 4.0 | **8.0** |
| `finance_director` | 2.0 | **4.0** | 4.0 | **8.0** |
| `head_coach` | 2.0 | **4.0** | 6.0 | **12.0** |
| `communications_director` | — *(slot vacante, sin T1 base)* | **4.0** | — | **8.0** |

**Output Range:** 2.0 €K (groundskeeper T1→T2) a 12.0 €K (head_coach T2→T3). El `communications_director` no tiene fila de "indemnización T1" en esta tabla porque el slot parte de VACANTE — la columna '—' indica estado inicial, no ausencia de coste. La indemnización T1 aplica normalmente si el jugador contrató un T1 y decide despedirlo (F5: 4 × 0.50 = **2.0 €K**).
**Ejemplo (head_coach T1→T2):** Vía A = 4.0 €K one-time + head_coach sigue activo. Vía B = 2.0 €K indemnización + vacante hasta contratar sustituto (mercado rota cada 4 semanas).

---

### F3: Umbral de percepción efectivo

`effectiveThreshold(tier) = BASE_THRESHOLD_PCT × QUALITY_FACTOR[tier]`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Umbral base | `BASE_THRESHOLD_PCT` | float | [0.01–0.020] | Fracción de cambio en [0-1]; uniforme para todos los roles excepto nodos con `threshold_override` |
| Factor de calidad | `QUALITY_FACTOR[tier]` | float | {3.0, 1.5, 1.0} | T1=3.0, T2=1.5, T3=1.0 (definidos en ADR-009) |

**Output (cambio mínimo detectable sobre rango [0-100]):**

| Tier | Threshold efectivo | Mínimo pts/semana para disparar mensaje |
|------|-------------------|-----------------------------------------|
| 1 | 0.06 | **6 pts** |
| 2 | 0.03 | **3 pts** |
| 3 | 0.02 | **2 pts** |

**Ejemplo:** `team_fitness` baja 72→68 (−4 pts, delta=0.04). Tier 2: 0.04 > 0.03 → mensaje generado ✓. Tier 1: 0.04 < 0.06 → sin mensaje. Tier 3: 0.04 > 0.02 → mensaje generado ✓.

**Contrato de cobertura validado con cascade-engine.md:** `BASE_THRESHOLD_PCT=0.02` garantiza que tier 1 detecta la cadena C1b (`groundskeeper_budget → injury_risk`, delta máximo = 6.25 pts > umbral T1 6 pts ✓). Subir `BASE_THRESHOLD_PCT` por encima de 0.021 hace que T1 sea ciego a C1b — no subir por encima de 0.02 para preservar este contrato.

---

**Excepciones por nodo — Counter Nodes:**

Los nodos `consecutive_wins` y `consecutive_losses` son contadores [0-10] que incrementan de 1 en 1. La fórmula de porcentaje no aplica. Usan `threshold_override = 1`: cualquier cambio ≥ 1 dispara mensaje, independientemente del tier.

```
// StaffPerceptionConfig ADR-009 extension
threshold_override: {
  consecutive_wins: 1,
  consecutive_losses: 1,
}
```

**Excepción — Priority Node:**

`corruption_exposure` tiene prioridad en la selección del anti-spam. Si supera su umbral efectivo en un tick donde más de 2 nodos del dominio del `scouting_director` disparan, `corruption_exposure` siempre ocupa uno de los 2 slots ROUTINE antes que nodos de mayor delta sin prioridad. Garantiza la detección temprana de C18 (BLOCKING) que el GDD promete para tier 3.

```
priority_nodes: ['corruption_exposure']
```

---

### F4: Coste total de staff semanal

`weekly_staff_cost_eur_k = Σ_i STAFF_SALARY_EUR_K[role_i][tier_i]`

Integración en economy.md F0: `weekly_wage_bill_eur_k = player_wages_eur_k + weekly_staff_cost_eur_k`

---

### F5: Indemnización por despido

`severance_eur_k = SEVERANCE_WEEKS × STAFF_SALARY_EUR_K[role][tier_current]`

| Variable | Símbolo | Tipo | Rango | Descripción |
|----------|---------|------|-------|-------------|
| Semanas de indemnización | `SEVERANCE_WEEKS` | int | 4 | Constante fija. 4 semanas de salario actual |

**Tabla de indemnizaciones (€K):**

| Rol | T1 | T2 | T3 |
|-----|----|----|-----|
| `groundskeeper` | 1.0 | 2.0 | 3.0 |
| `fitness_coach` | 2.0 | 4.0 | 8.0 |
| `commercial_director` | 2.0 | 4.0 | 9.0 |
| `scouting_director` | 2.0 | 4.0 | 8.0 |
| `finance_director` | 2.0 | 4.0 | 8.0 |
| `head_coach` | 2.0 | 6.0 | 12.0 |
| `communications_director` | 2.0 | 4.0 | 9.0 |

**Output Range:** 1.0 €K (groundskeeper T1) a 12.0 €K (head_coach T3). El `communications_director` T3 tiene 9.0 €K (igual que `commercial_director` T3).

## Edge Cases

- **Si el jugador despide a un miembro del staff y el balance disponible es menor que la indemnización**: la acción de despido está bloqueada por la UI hasta que el balance cubra la indemnización completa. El jugador no puede entrar en deuda para despedir.

- **Si el mercado de candidatos no tiene ningún candidato disponible del tier deseado en la rotación actual**: el jugador no puede contratar ese tier en las próximas 4 semanas. El puesto queda vacante si decidió despedir. No se reabre el contrato del despedido. El mercado rota a la semana 5 con nuevos candidatos. **Garantía de rotación**: cada rotación de mercado incluye al menos 1 candidato por cada tier ≤ `getMaxHirableStaffQuality(reputation.level)` para cada rol. Si la rotación actual tiene menos de `MARKET_CANDIDATES_PER_ROLE_PER_TIER`, la siguiente rotación siempre cubre el mínimo de 1 por tier disponible — no es posible tener 2 rotaciones consecutivas sin candidatos del tier deseado.

- **Si se intenta formar a un miembro de staff al tier siguiente pero `getMaxHirableStaffQuality(reputation.level)` no permite ese tier**: la opción de formación no aparece en la UI. El jugador no puede circunvalar el gate de reputación formando internamente.

- **Si un puesto queda vacante en la semana de un partido importante**: sin mensajes de ese rol esa semana. No hay excepción ni staff interino automático.

- **Si `player_happiness` cae por debajo de 50 pero el jugador tiene `head_coach` vacante**: el mensaje de aviso de `player:morale_intervention` no llega. La acción "Hablar con jugador" sigue disponible en el panel de jugadores — no requiere el mensaje del head_coach para estar accesible.

- **Si múltiples nodos del dominio de un staff cambian significativamente en el mismo tick**: el anti-spam (máx. 2 ROUTINE/semana) limita a los 2 cambios con mayor delta normalizado. Los restantes se silencian esa semana. Los mensajes URGENT de ThresholdCrossings BLOCKING nunca se silencian.

- **Si el mismo nodo genera URGENT y ROUTINE para el mismo staff en el mismo tick**: el URGENT se entrega siempre. El ROUTINE sobre el mismo nodo se omite. El contador de anti-spam no se incrementa para el mensaje omitido.

- **Si `catering_budget` cae y nadie en el staff lo percibe directamente**: ningún rol tiene `catering_budget` en su dominio. Los efectos downstream (C5a: `team_fitness`, C5b: `staff_morale`) sí son percibidos por `fitness_coach` y `head_coach` respectivamente, semanas más tarde. La cascada es detectable; la causa directa permanece opaca (Pilar 1).

- **Si el jugador asciende de división en mitad de la temporada**: los salarios de staff no cambian de división — son contratos de temporada. El incremento de costes aplica a la **siguiente temporada**. Sin shock económico inmediato en el ascenso.

- **Si `corruption_exposure` llega a BLOCKING (C18) pero el `scouting_director` está vacante**: el URGENT llega igualmente — proviene del ThresholdCrossing del cascade engine, no de staff-system. Staff-system añade granularidad preventiva; no es el único canal de alertas críticas.

- **Si `corruption_exposure` dispara URGENT y también supera su umbral ROUTINE en el mismo tick (priority_node + URGENT simultáneos)**: el URGENT satisface la garantía de prioridad del nodo — `corruption_exposure` no ocupa adicionalmente uno de los 2 slots ROUTINE. Los 2 slots ROUTINE del tick se asignan a los demás nodos del dominio con mayor delta descendente. Esto evita que el URGENT provoque la pérdida de un slot ROUTINE de otro nodo que de otro modo se habría entregado.

- **Si el jugador intenta formar un staff de tier 2 a tier 3 con `reputation.level < 4`**: la opción de formación T2→T3 no está disponible en la UI. La formación interna usa el mismo gate que la contratación externa (`getMaxHirableStaffQuality()`).

- **Si el jugador alcanza `reputation.level = 5` por primera vez**: el slot de `communications_director` aparece como VACANTE en el panel de staff con indicador visual de "nuevo slot disponible". El jugador recibe una notificación del sistema (no del staff — el `communications_director` no existe todavía para enviar mensajes). No hay staff interino automático. El jugador decide si contratar y cuándo. El mercado muestra solo candidatos T1 en este primer unlock; T2/T3 se desbloquean con las reglas estándar una vez el slot tiene un T1 activo.

- **Si el jugador confirma formaciones internas simultáneas cuyo coste total supera el `WARNING_THRESHOLD_EUR_K` de balance**: la UI muestra una advertencia previa con desglose de costes y balance resultante post-formación ("Este gasto llevaría tu balance a X €K"). La advertencia es informativa — el jugador puede proceder. El bloqueo solo aplica si el coste total supera `CRITICAL_BALANCE_THRESHOLD_EUR_K` (regla idéntica al despido). Propósito: evitar que el jugador dispare un board meeting BLOCKING al ejercer la recompensa de reputation level 3.

- **Si un miembro del staff lleva 4 semanas sin generar mensajes y el dominio está estable**: genera 1 mensaje STABLE_CHECK ROUTINE (`'{role}:all_stable:{tier}'`). Este mensaje no consume slots del anti-spam. Si en esa misma semana hay un delta que sí supera el umbral, el STABLE_CHECK **no se genera** (hay nueva información más relevante). El STABLE_CHECK solo se genera cuando no hay otras señales activas.

- **Si el `communications_director` está contratado y el manager recibe CE-3 ("Oferta soñada")**: el `communications_director` tier 2+ genera un mensaje de calendario con la ventana de `career_milestone:press_interview` abierta ese tick. Tier 1 no genera este mensaje de calendario (solo recibe si existe el event-system ThresholdCrossing correspondiente).

## Dependencies

### Dependencias upstream (staff-system depende de)

| Sistema | GDD | Tipo | Interfaz requerida |
|---------|-----|------|--------------------|
| Motor de Cascadas | `cascade-engine.md` | **Hard** | `WorldState` snapshot post-advance: `worldStateDiff` (delta por nodo) + `ThresholdCrossings` BLOCKING como triggers de mensajes URGENT. El NodeId catalog completo determina los dominios de percepción por rol |
| Manager RPG | `manager-rpg.md` | **Hard** | `getMaxHirableStaffQuality(reputation.level)` → gate de tier máximo contratables o formables. `canHireDirectorDeComunicacion(reputation.level)` → true si level ≥ 5, desbloquea el 7.º slot. Pure functions exportadas desde `packages/shared/` |
| Economía del Club | `economy.md` | **Soft** | `weekly_wage_bill_eur_k` incluye suma de salarios activos de staff (F1). Indemnizaciones y costes de formación son deducciones del `balance_eur_k`. Economy lee el total de staff vía `ClubFinances.staffWageBill` |
| ADR-009 | — | **Hard** | Define arquitectura completa: `StaffPerceptionConfig`, `StaffMessage`, `StaffMessagesReadyEvent`, BullMQ worker, Socket.IO push, schema `staff_messages` |
| ADR-010 | — | **Soft** | `manager_profiles` tabla: fuente de `reputation.level` para `getMaxHirableStaffQuality()`. Advance() trackea semanas consecutivas de `player_happiness > 70` para `squad_morale:high_streak` |

### Dependencias downstream (otros sistemas dependen de staff-system)

| Sistema | GDD | Qué necesitan | Contrato de datos |
|---------|-----|--------------|------------------|
| HUD y UI principal | `hud-ui.md` | `StaffMessage[]` para el inbox panel; panel de staff con miembros actuales, tiers y salarios | Socket.IO `staff:messages-ready` → `StaffMessagesReadyEvent`; `GET /api/game/staff` para gestión |
| Sistema de Eventos | `event-system.md` | `squad_morale:high_streak` CalendarEvent (4 semanas `player_happiness > 70`); `player:morale_intervention` event desde HUD | CalendarEvent `squad_morale:high_streak`; `player:morale_intervention` con `{ playerId }` |

### Notas de bidireccionalidad

- **`cascade-engine.md`**: no depende de staff-system — mensajes son efecto lateral del advance, no input. Añadir mención en §Interactions al formalizar el epic.
- **`manager-rpg.md`**: ya lista `staff-system.md` como downstream. Bidireccionalidad confirmada.
- **`economy.md`**: debe añadir en §Interactions: "`← staff-system.md`: contribuye a `weekly_wage_bill_eur_k` (salarios) y genera deltas en `balance_eur_k` (indemnizaciones, formación)." **Adicionalmente**: economy.md debe corregir la frase "Director financiero genera mensaje ADVISORY via staff-system" en §States and Transitions. El ADVISORY "En Riesgo" proviene del ThresholdCrossing del engine económico — llega al jugador vía event-system, independientemente de si el `finance_director` está activo o vacante. El valor real del `finance_director` es la detección temprana de degradación de `sponsor_quality` (precede caídas de revenue semanas antes de que aparezcan en el balance) y la percepción de `corruption_exposure` desde perspectiva de riesgo reputacional. **Chore pendiente 1**: economy.md §States and Transitions necesita esta corrección antes de crear epics. **Chore pendiente 2**: economy.md F0 no incluye una fila para D3 como división de inicio. Staff-system usa D3 como contexto primario en sus notas de sostenibilidad (F1). Añadir fila D3 a economy.md F0 antes de crear epics para alinear los rangos de nómina entre ambos GDDs.
- **`event-system.md`**: **Bidireccionalidad confirmada** (2026-05-18). event-system.md está Approved y lista `squad_morale:high_streak` y `player:morale_intervention` como inputs recibidos desde staff-system.

## Tuning Knobs

| Knob | Valor default | Rango seguro | Si sube demasiado | Si baja demasiado |
|------|--------------|--------------|-------------------|-------------------|
| `BASE_THRESHOLD_PCT` | 0.02 | [0.01–**0.020**] | Tier 1 Y Tier 3 generan mensajes ante cualquier oscilación mínima — inbox se satura (T3 dispara en cambios de 1 pt con 0.01) | Tier 1 nunca detecta C1b ni cascadas de bajo delta — staff novato silencioso incluso ante problemas reales. El upper bound 0.020 preserva el contrato C1b (ver INVARIANT más abajo); cualquier valor > 0.020 hace T1 ciego a C1b |
| `QUALITY_FACTOR[tier1]` | 3.0 | [2.0–4.0] | Tier 1 nunca detecta nada — contratarlo no tiene valor de feedback | Tier 1 detecta tanto como tier 3 — la diferencia de calidad desaparece |
| `QUALITY_FACTOR[tier2]` | 1.5 | [1.2–2.0] | Tier 2 casi igual de ciego que tier 1 | Tier 2 casi igual que tier 3 — gap de calidad demasiado pequeño |
| `MAX_ROUTINE_MESSAGES_PER_STAFF` | 2 | [1–4] | Inbox overflow: 12 mensajes/semana (6 staff × 2 ROUTINE) ya puede ser mucho | 6 mensajes/semana (6 staff × 1) puede no cubrir cambios en múltiples nodos de un mismo rol |
| `STAFF_SALARY_EUR_K[groundskeeper][T1]` | 0.25 | [0.15–0.40] | Groundskeeper tan caro como los otros roles — jerarquía salarial pierde sentido | Tan barato que el jugador lo maximiza sin pensar |
| `STAFF_SALARY_EUR_K[head_coach][T3]` | 3.00 | [2.00–4.50] | Head coach tier 3 en D3 colapsa la economía — insostenible | Head coach experto no se siente como el gran fichaje que es |
| `FORMATION_MULTIPLIER` | 8 | [5–12] | Formación nunca vale la pena vs. despedir y contratar | Formación es trivialmente más barata que despedir — Vía B desaparece del decision space |
| `SEVERANCE_WEEKS` | 4 | [2–6] | Despedir staff es prohibitivamente caro — el jugador nunca puede mejorar su equipo | Sin coste real de despido — el jugador rota staff cada semana sin consecuencias |
| `MARKET_ROTATION_WEEKS` | 4 | [2–6] | Candidatos disponibles demasiado tiempo — no hay presión temporal para decidir | Rotación semanal — el jugador nunca ve al candidato que quiere dos semanas seguidas |
| `MARKET_CANDIDATES_PER_ROLE_PER_TIER` | 4 *(worker elige aleatorio en [3,5] por rotación)* | [2–6] | Demasiados candidatos — la elección pierde significado | Muy pocos — el jugador a veces no tiene opción de tier deseado disponible |
| `STABLE_CHECK_INTERVAL_WEEKS` | 4 | [2–6] | STABLE_CHECK demasiado frecuente — pierde significado como confirmación de estabilidad real | Demasiado tiempo sin confirmación positiva — el jugador interpreta silencio como fallo del sistema |

**INVARIANT de acoplamiento (no violar):**
`BASE_THRESHOLD_PCT × QUALITY_FACTOR[T1] ≤ 0.0625` — garantiza que T1 detecta el delta máximo de la cadena C1b (6.25 pts sobre escala [0-100]). A los defaults (0.02 × 3.0 = 0.06), el margen es de 0.0025. Cualquier combinación que supere 0.0625 hace T1 ciego a C1b independientemente del valor individual de cada parámetro.

**Knobs que interactúan entre sí:**
- `BASE_THRESHOLD_PCT` + `QUALITY_FACTOR[tier1]`: definen conjuntamente cuándo el staff novato empieza a ser útil. Ajustar solo uno sin verificar el INVARIANT de acoplamiento rompe el contrato C1b y/o la progresión de calidad.
- `STAFF_SALARY_EUR_K[head_coach][T*]` + economy.md `weekly_wage_bill_eur_k`: el head_coach es el mayor coste individual de staff. Cualquier ajuste de su salario tier 3 debe re-verificar el ejemplo F0 de economy.md (D3 runway).
- `MAX_ROUTINE_MESSAGES_PER_STAFF` + ADR-009 `TEMPLATE_FALLBACK`: si se sube el límite, se necesitan más templates para cubrir los nuevos slots. Sin templates adicionales, el fallback genérico se dispara más frecuentemente, degradando la calidad del feedback.

## Visual/Audio Requirements

El staff-system es un sistema server-side de percepción y mensajes — no tiene VFX ni animaciones propias. Sus requisitos visuales son los del inbox y el panel de staff en el HUD:

- **Indicador de mensajes nuevos**: badge/contador en el ícono del inbox visible desde el HUD principal. El jugador sabe que llegaron mensajes sin necesidad de abrirlos.
- **Distinción de prioridad**: mensajes URGENT visualmente diferenciados de ROUTINE (color, icono, posición en la lista — diseño exacto en `hud-ui.md`).
- **Sin VFX**: la llegada de mensajes es silenciosa visualmente. No hay flash, animación de entrada, ni partículas. Calm Is The Tempo (Pilar 4).

**Audio (minimal):**
- Un sonido sutil al llegar mensajes nuevos al inbox (post-advance). Distinto del sonido de resultado de partido. Corto, cálido, no intrusivo.
- Mensajes URGENT pueden tener un sonido diferenciado (más prominente). Diseño exacto en `event-system.md`.

## UI Requirements

1. **Inbox de mensajes de staff**: panel accesible desde el HUD. Muestra `StaffMessage[]` ordenados por semana (más recientes primero). Por cada mensaje: nombre del rol, icono del rol, texto del mensaje, indicador URGENT/ROUTINE, estado leído/no leído. Los mensajes se marcan como leídos al visualizarse.

2. **Panel de gestión de staff**: accesible desde el HUD. Muestra las 6 posiciones con: nombre del staff actual, tier badge (1/2/3 o VACANTE), salario semanal, botones de acción (Invertir en formación si disponible, Despedir, Ver mensajes recientes de este staff).

3. **Mercado de candidatos**: sub-panel de gestión de staff. Para cada posición: lista de 3-5 candidatos con nombre, tier, salario semanal y botón "Contratar". Los candidatos de tier no disponible (gate de reputación) **no aparecen** — el jugador no ve lo que aún no puede alcanzar.

4. **Estado de carga post-advance**: entre el retorno de `/advance` y la llegada del Socket.IO `staff:messages-ready`, el inbox muestra un estado "cargando mensajes..." El gap típico es <500ms pero la UI debe manejarlo gracefully sin parpadeos.

5. **Morale intervention action**: cuando `player_happiness < 50`, el panel de jugadores muestra el botón "Hablar con jugador" para los jugadores relevantes. La acción dispara `player:morale_intervention`. El botón aparece independientemente del estado del `head_coach` (no requiere el mensaje del staff para estar accesible).

6. **Desbloqueo del 7.º slot (communications_director)**: cuando `reputation.level` alcanza 5, una notificación del sistema (badge/toast no intrusivo) informa al jugador que hay un nuevo rol disponible en su cuerpo técnico. El panel de staff muestra 7 filas, con el `communications_director` en estado VACANTE y un indicador visual de "nuevo slot disponible". El indicador desaparece una vez que el jugador abre el panel de staff post-unlock.

7. **Advertencia de coste de formación masiva**: si el jugador activa una formación interna que, junto con otras acciones pendientes, superaría el `WARNING_THRESHOLD_EUR_K`, la UI muestra un modal de advertencia con desglose de costes y balance resultante estimado antes de confirmar. El jugador puede proceder si así lo decide.

> 📌 **UX Flag — Staff System**: Este sistema tiene requisitos de UI. En Pre-Production, correr `/ux-design staff-inbox` para la pantalla del inbox, `/ux-design staff-management` para el panel de gestión (con 7 slots y adaptación mobile 375px), y verificar que las 7 filas del panel de staff son viables a 375px antes de escribir las epics. Las stories de UI deben referenciar `design/ux/staff-inbox.md` y `design/ux/staff-management.md`, no este GDD directamente.

## Acceptance Criteria

*Todos los ACs `[UNIT]` van en `packages/shared/src/sim/` o equivalente. Los `[INTEGRATION]` requieren Postgres real (no mocks). Los `[E2E]` requieren stack completo con Socket.IO activo. `[UNIT]` e `[INTEGRATION]` son BLOCKING antes de marcar cualquier historia de staff-system como Done.*

**AC-STAFF-01** `[UNIT]` — Tier 1 no genera mensaje si el delta es menor de 6 pts
GIVEN un miembro de staff de tier 1 con `BASE_THRESHOLD_PCT=0.02` y `QUALITY_FACTOR[1]=3.0`, WHEN se evalúa un `worldStateDiff` donde un nodo de su dominio cambió 5 puntos (delta=0.05), THEN no se genera ningún `StaffMessage` para ese nodo en esa semana. WHEN cambia 6 puntos (delta=0.06), THEN sí se genera 1 mensaje (0.06 ≥ 0.06).

**AC-STAFF-02** `[UNIT]` — Tier 2 detecta delta de 4 pts; tier 1 no (umbral diferencial)
GIVEN un `fitness_coach` tier 1 y otro tier 2 evaluando el mismo `worldStateDiff`, WHEN `team_fitness` cae de 72 a 68 (delta=4 pts, 0.04 en [0-1]), THEN el tier 2 genera exactamente 1 mensaje ROUTINE (0.04 ≥ 0.03 ✓) y el tier 1 no genera ningún mensaje (0.04 < 0.06).

**AC-STAFF-03** `[UNIT]` — Anti-spam: se entregan los 2 mensajes de mayor delta absoluto, el resto se silencia
GIVEN un `head_coach` tier 2 con 6 nodos en su dominio, WHEN en un tick tres nodos estándar (no counter nodes) superan el umbral — `match_performance_index` cae 9 pts, `player_happiness` cae 7 pts, `team_fitness` cae 5 pts — THEN se generan exactamente 2 mensajes ROUTINE (los de delta 9 y 7) y el de delta 5 se silencia. El `routineCount` queda en 2.

**AC-STAFF-04** `[UNIT]` — Mensajes URGENT nunca limitados por anti-spam
GIVEN un `scouting_director` que ya emitió 2 mensajes ROUTINE en la semana actual, WHEN el cascade engine emite un `ThresholdCrossing` BLOCKING en un nodo de su dominio, THEN se genera 1 mensaje URGENT adicional (total 3 en la semana: 2 ROUTINE + 1 URGENT). El límite de 2 no aplica a URGENT.

**AC-STAFF-05** `[UNIT]` — Puesto vacante no genera mensajes
GIVEN la posición `finance_director` está VACANTE, WHEN el advance produce cambios en `sponsor_quality` y `corruption_exposure` que superarían cualquier umbral, THEN no se genera ningún `StaffMessage` para el rol `finance_director` en ese tick.

**AC-STAFF-06** `[UNIT]` — Gate de reputación bloquea contratación de tier superior
GIVEN un manager con `reputation.level=2` (maxHirableQuality=1), WHEN se intenta contratar o formar a tier 2, THEN la operación es rechazada con error `REPUTATION_GATE_INSUFFICIENT` y el estado del staff no cambia.

**AC-STAFF-07** `[UNIT]` — Gate: tier 2 se desbloquea en level 3; tier 3 en level 4-5
GIVEN los 5 niveles posibles de `reputation.level`, WHEN se invoca `getMaxHirableStaffQuality(level)`, THEN level 1→1, level 2→1, level 3→2, level 4→3, level 5→3.

**AC-STAFF-08** `[UNIT]` — F2: coste de formación = FORMATION_MULTIPLIER(8) × salario actual
GIVEN `groundskeeper` T1 con salario 0.25 €K/sem, WHEN se calcula el coste de formación T1→T2, THEN resultado = 8×0.25 = **2.0 €K**. Para `head_coach` T2→T3 (salario 1.50): 8×1.50 = **12.0 €K**.

**AC-STAFF-09** `[UNIT]` — F5: indemnización = SEVERANCE_WEEKS(4) × salario actual
GIVEN `head_coach` T2 con salario 1.50 €K/sem, WHEN se calcula la indemnización por despido, THEN resultado = 4×1.50 = **6.0 €K**. Para `groundskeeper` T1: 4×0.25 = **1.0 €K**.

**AC-STAFF-10** `[UNIT]` — F1: tabla de salarios — totales mínimo y máximo
GIVEN los 6 roles activos todos en tier 1, WHEN se calcula `weekly_staff_cost_eur_k`, THEN resultado = **2.75 €K/sem** (0.25+0.50+0.50+0.50+0.50+0.50). Con todos en tier 3: **12.00 €K/sem** (0.75+2.00+2.25+2.00+2.00+3.00).

**AC-STAFF-11** `[UNIT]` — URGENT y ROUTINE sobre el mismo nodo: solo se entrega URGENT
GIVEN un `fitness_coach` tier 2 con 0 mensajes ROUTINE en la semana, WHEN el mismo nodo genera un ThresholdCrossing BLOCKING (URGENT) y un delta ordinario superior al umbral (ROUTINE) en el mismo tick, THEN se entrega 1 mensaje URGENT y 0 mensajes ROUTINE para ese nodo. El `routineCount` permanece en 0.

**AC-STAFF-12** `[UNIT]` — F3: effectiveThreshold = 0.02 × QUALITY_FACTOR
GIVEN `BASE_THRESHOLD_PCT=0.02` y `QUALITY_FACTOR={1:3.0, 2:1.5, 3:1.0}`, WHEN se calcula `effectiveThreshold(tier)` para los 3 tiers, THEN `effectiveThreshold(1)=0.06`, `effectiveThreshold(2)=0.03`, `effectiveThreshold(3)=0.02`. T1 dispara con delta ≥ 6 pts (0.06≥0.06 ✓); 5 pts no (0.05<0.06). T2 dispara con delta ≥ 3 pts (0.03≥0.03 ✓); 2 pts no (0.02<0.03). T3 dispara con delta ≥ 2 pts (0.02≥0.02 ✓); 1 pt no (0.01<0.02). Todos los umbrales usan comparación ≥ (mayor-o-igual).

**AC-STAFF-13** `[INTEGRATION]` — Formación interna: tier sube en el mismo request y el balance se deduce
GIVEN club con `balance_eur_k=20.0`, `groundskeeper` en T1, `reputation.level=3`, WHEN el jugador confirma la formación interna (coste=2.0 €K), THEN (1) el groundskeeper queda en T2 dentro de la misma transacción DB, (2) `balance_eur_k` pasa a 18.0 €K, (3) el puesto nunca entra en VACANTE durante la transición.

**AC-STAFF-14** `[INTEGRATION]` — Despido bloqueado si el balance no cubre la indemnización
GIVEN club con `balance_eur_k=5.5` y `head_coach` T2 (indemnización=6.0 €K), WHEN se intenta el despido, THEN la operación es rechazada con error `INSUFFICIENT_BALANCE_FOR_SEVERANCE` y el estado del staff no cambia. Balance permanece en 5.5 €K.

**AC-STAFF-15** `[E2E]` — Pipeline completo: advance → percepción → StaffMessage → Socket.IO push
GIVEN un `fitness_coach` tier 2 activo y `team_fitness` en 72, WHEN el cascade advance produce `worldStateDiff['team_fitness'] = -7` (baja a 65, delta=0.07 > umbral T2 de 0.03), THEN (1) el BullMQ worker procesa el diff, (2) se genera exactamente 1 StaffMessage ROUTINE para `fitness_coach`, (3) el mensaje persiste en `staff_messages` en Postgres, (4) el evento `staff:messages-ready` llega al cliente vía Socket.IO.

**AC-STAFF-16** `[UNIT]` — Determinismo: mismos inputs producen idénticos outputs
GIVEN el mismo `worldStateDiff` `{ team_fitness: -7, injury_risk: +5 }`, el mismo `StaffPerceptionConfig` de un `fitness_coach` tier 2, y el mismo estado de anti-spam (1 mensaje previo — routineCount=1), WHEN se ejecuta la función de evaluación dos veces de forma independiente (sin `Math.random()`, sin timestamps), THEN ambas ejecuciones producen arrays `StaffMessage[]` idénticos en templateKey, priority y nodeId.

**AC-STAFF-17** `[UNIT]` — Counter nodes (consecutive_wins/losses) disparan con delta ≥ 1
GIVEN un `head_coach` tier 1 con `threshold_override = {consecutive_wins: 1, consecutive_losses: 1}`, WHEN el advance produce `worldStateDiff['consecutive_losses'] = +1` (una derrota nueva), THEN se genera exactamente 1 mensaje ROUTINE para `consecutive_losses` aunque el delta absoluto (1 pt) sea menor que el umbral estándar tier 1 (6 pts).

**AC-STAFF-18** `[UNIT]` — Priority node: corruption_exposure no silenciado por anti-spam
GIVEN un `scouting_director` tier 3 con `priority_nodes = ['corruption_exposure']`, WHEN en el mismo tick `scouting_points` cae 8 pts y `team_skill` cae 6 pts y `corruption_exposure` sube 4 pts (supera umbral T3=2 pts), THEN los 2 slots ROUTINE incluyen el mensaje de `corruption_exposure` (por prioridad) más el de `scouting_points` (mayor delta restante). El mensaje de `team_skill` se silencia.

**AC-STAFF-19** `[UNIT]` — Anti-spam reset: routineCount = 0 al inicio del tick siguiente
GIVEN un `head_coach` tier 2 con `routineCount = 2` al final de la semana N, WHEN se inicia la evaluación de la semana N+1, THEN `routineCount = 0` antes de procesar cualquier delta del nuevo tick. La evaluación del nuevo tick comienza con contador limpio.

**AC-STAFF-20** `[INTEGRATION]` — Happy path despido: balance deducido, puesto VACANTE, sin mensajes
GIVEN club con `balance_eur_k = 20.0` y `fitness_coach` T1 (indemnización = 2.0 €K), WHEN se confirma el despido, THEN (1) `balance_eur_k = 18.0`, (2) puesto `fitness_coach` en estado VACANTE, (3) ambos cambios en la misma transacción DB, (4) el advance siguiente no genera `StaffMessage` para el rol `fitness_coach`.

**AC-STAFF-21** `[INTEGRATION]` — Contratación desde VACANTE: nuevo staff activo en advance siguiente
GIVEN puesto `fitness_coach` VACANTE, WHEN el jugador contrata un candidato T1 del mercado, THEN (1) `fitness_coach` en estado ACTIVO con el tier del candidato, (2) en el advance de la semana siguiente, la percepción de `fitness_coach` se evalúa normalmente con el nuevo staff. No genera mensajes en el mismo tick de contratación.

**AC-STAFF-22** `[UNIT]` — Gate T2→T3: bloqueado con reputation.level = 3
GIVEN un `scouting_director` T2 y `reputation.level = 3` (`getMaxHirableStaffQuality(3) = 2`), WHEN se intenta la formación T2→T3, THEN rechazado con error `REPUTATION_GATE_INSUFFICIENT` y el tier permanece en 2.

**AC-STAFF-23** `[UNIT]` — Vía A: genera mensaje formation_complete al subir de tier
GIVEN un `groundskeeper` T1 con nombre 'Martín García', WHEN se confirma la formación T1→T2 (coste 2.0 €K), THEN (1) el tier sube a 2 en la misma transacción, (2) se genera automáticamente 1 `StaffMessage` ROUTINE con `templateKey = 'groundskeeper:formation_complete:2'`, (3) el mensaje incluye el nombre 'Martín García' en el texto renderizado.

**AC-STAFF-24** `[UNIT]` — STABLE_CHECK: mensaje de confirmación después de 4 semanas estables
GIVEN un `commercial_director` T1 activo que no ha generado mensajes en las últimas 4 semanas y ningún nodo de su dominio ha superado el umbral en ese período, WHEN se evalúa el tick de la semana 5, THEN se genera 1 mensaje ROUTINE con `templateKey = 'commercial_director:all_stable:1'`. El mensaje no consume slots del anti-spam ordinario (`routineCount` no incrementa). *(Nota: si el contador `stableWeeksCount` se hidrata desde DB en lugar de pasarse como parámetro de entrada, reclasificar a `[INTEGRATION]`. Resoluble al diseñar el epic de advance().)*

**AC-STAFF-25** `[UNIT]` — Tier 1 no genera mensajes de calendario; tier 2 sí
GIVEN un `commercial_director` T1 y otro T2 evaluando el mismo tick con `calendarEventsThisWeek = [{ type: 'sponsor_expiry', weeksUntil: 2 }]`, WHEN se evalúan los mensajes de calendario de ambos, THEN el T2 genera exactamente 1 mensaje con `templateKey = 'commercial_director:sponsor_expiry:2'` y el T1 no genera ningún mensaje de calendario (la rama calendar-aware requiere `staff.tier >= 2`).

**AC-STAFF-26** `[UNIT]` — Gate T2→T3 bloquea contratación externa (Vía B) si reputation insuficiente
GIVEN un `scouting_director` con puesto VACANTE y `reputation.level = 3` (`getMaxHirableStaffQuality(3) = 2`), WHEN el jugador intenta contratar un candidato T3 del mercado (Vía B), THEN la operación es rechazada con error `REPUTATION_GATE_INSUFFICIENT` y el puesto permanece VACANTE. (Complementa AC-STAFF-22 que cubre el mismo gate para Vía A.)

## Schema Frozen Decisions

Las siguientes decisiones están tomadas y deben implementarse en la primera migración del epic. No requieren aprobación adicional.

1. **Idempotency constraint**: `UNIQUE INDEX ON staff_messages (playthrough_id, week_number, staff_id, template_key)`. El worker usa `INSERT ... ON CONFLICT DO NOTHING`. En retry, las filas ya insertadas se ignoran. El campo `content` se persiste del primer insert (no se re-renderiza en retries con interpolación).

2. **Extensibilidad de `StaffRole`**: el campo `role` en `staff_members` usa `text` con validación a nivel de aplicación en `packages/shared/src/types/staff.ts` (type `StaffRole` como union literal). No usar `CHECK` constraint de DB — permite añadir roles futuros (e.g., 8.º slot en v1.2) sin `ALTER TABLE`.

3. **Anti-spam counter persistence en crash+retry**: el BullMQ worker hidrata `routineCount` al inicio de cada staff member procesado: `SELECT COUNT(*) FROM staff_messages WHERE playthrough_id=? AND week_number=? AND staff_id=? AND priority='ROUTINE'`. Garantiza que un crash+retry no inserta >2 ROUTINE.

4. **Calendar events field en `StaffMessageJobData`**: añadir campo opcional `calendarEventsThisWeek?: CalendarEventForStaff[]`. Vacío array `[]` para ticks sin eventos. El worker evalúa mensajes de calendario en rama separada de la percepción WorldState, activada solo si `staff.tier >= 2`. Templates usan keyspace `'{role}:{calendarEvent}:{qualityTier}'`.

5. **Staff member name**: campo `name: text().notNull()` en `staff_members`. Generado en `world-gen` para los 6 slots base. Generado al contratar para el 7.º slot y reemplazos. El campo `name` se incluye en el objeto `StaffMessage` para que el inbox lo muestre.

---

## Open Questions

| ID | Pregunta | Bloqueante para | Target resolución |
|----|----------|-----------------|-------------------|
| OQ-STAFF-01 | ¿Cuántos templates de texto se necesitan para MVP mínimo viable? El espacio completo es ~360+ keys (7 roles × ~10 nodos × 2 direcciones × 3 tiers + templates de calendario + STABLE_CHECK + formation_complete). **Criterio mínimo definido**: ≥2 templates por rol por nodo activo: al menos 1 de degradación/alerta y al menos 1 de confirmación positiva (STABLE_CHECK incluido). El subconjunto exacto que cubre el 80% de advances típicos se define al escribir el epic. | Implementación del template library (`packages/shared`) | Antes del epic staff-system |
| OQ-STAFF-02 | ¿Cuál es el catálogo concreto de eventos de calendario que disparan mensajes de tier 2+ por rol? (ej: ¿apertura de ventana de verano vs. invierno genera templates distintos?) | Implementación de calendar-aware messages | Al escribir event-system.md |
| ~~OQ-STAFF-03~~ | ~~¿Los candidatos del mercado de staff tienen nombres/perfiles narrativos generados proceduralmente, o son strings genéricos?~~ **RESUELTO** (2026-05-18, /design-review): staff members tienen nombre proceduralmente generado al ser contratados. Campo `name: text().notNull()` en `staff_members`. Los 6 slots base reciben nombres durante `world-gen`. El `communications_director` recibe nombre al contratar. Sin traits adicionales en MVP. La individualidad se manifiesta vía el mensaje `formation_complete` al completar Vía A. La generación de nombres pertenece a `world-gen` (packages/shared). | — | ✅ Cerrado |
| OQ-STAFF-04 | ¿El `squad_morale:high_streak` se resuelve con un contador en `manager_profiles` (ADR-010), con un nodo adicional en WorldState, o calculado on-the-fly desde los últimos 4 snapshots en DB? Impacta la implementación de advance(). | Implementación de man_management XP trigger (OQ-RPG-02 resuelto conceptualmente) | Al diseñar el epic de advance() |
| ~~OQ-STAFF-05~~ | ~~¿El template engine admite interpolación de variables?~~ **RESUELTO** (2026-05-18, /design-review R2): Templates son **strings literales fijos** — sin interpolación de variables del WorldState. T3 usa prosa cualitativa rica pero nunca inyecta valores numéricos. El Pilar 1 (no exponer valores del WorldState) aplica universalmente a todos los tiers. Sin micro-template engine en `packages/shared` para MVP. | — | ✅ Cerrado |
