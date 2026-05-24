# Cross-GDD Review Report — Cascada FC
**Fecha:** 2026-05-17
**GDDs Revisados:** 3 (`cascade-engine.md`, `match-simulation.md`, `economy.md`)
**Sistemas cubiertos:** Cascade Engine, Simulación de Partido, Economía del Club
**Pillares:** P1 (Tinkering), P2 (World=Scoreboard, deferred), P3 (You Grow, partial), P4 (Calm)
**Registry baseline:** 23 entries — PASS (verificado por /consistency-check 2026-05-17)

---

## Consistency Issues

### Blocking (resolver antes de epics / vertical slice)

**🔴 C-01 — match-simulation.md: Contradicción FSM vs 24h timeout**
Dos secciones del mismo GDD se contradicen directamente:
- *States and Transitions* (FSM): `"Sin timeout: si el manager no responde, la pausa espera indefinidamente (P4). No hay decisión automática forzada por tiempo real."`
- *Edge Cases* + *Tuning Knobs* + AC-18: definen `MATCH_PAUSE_TIMEOUT_HOURS = 24` con acción por defecto "no hacer nada"

El FSM era incorrecto. **FIXED 2026-05-17** — FSM actualizado para reflejar el 24h timeout con nota de reconciliación con P4.

**🔴 C-02 — economy.md F1: label de rango incorrecto ("D1" → debe ser D3)**
`"Rango del output: 0 a ~21.6 €K (D1, 100% asistencia, precio máximo)"`
D1 real: 12,000 × 18€ × 1.5 / 1,000 = **324 €K**, no 21.6 €K. El valor 21.6 €K corresponde a D3. **FIXED 2026-05-17** — label corregido a "(D3, 90% asistencia, precio base)".

**🔴 C-03 — cascade-engine.md Dependencies section incompleto: 4 nodos vs 7 reales**
La sección *Dependencies downstream* listaba 4 nodos para match-simulation. La realidad declarada en Interactions y en match-simulation.md es 7 nodos: `team_fitness, team_skill, squad_available_pct, field_quality, fan_attendance, staff_morale, player_happiness`. **FIXED 2026-05-17** — Dependencies section completada.

### Warnings (deberían resolverse, no bloquean)

**⚠️ C-04 — match-simulation.md F8: mpi_delta solo definido en perspectiva home**
La fórmula F8 usa "winner === 'home'" y "winner === 'away'" desde la perspectiva del equipo del manager. No especifica si existe un mpi_delta separado para el equipo rival. Si el WorldState es per-club, el rival necesita su propio mpi. Si no, añadir nota: "match_performance_index solo se trackea para el club del manager."

**⚠️ C-05 — Responsable de `scandal_fine_eur_k` no documentado**
economy.md define F8. cascade-engine.md detecta el crossing. Ningún GDD especifica quién triggea F8. Clarificar: "Al detectar ThresholdCrossing BLOCKING corruption_exposure>80, el event-system invoca economy.computeScandal() que aplica F8."

**⚠️ C-06 — match_performance_index: rango de nodo no documentado**
El nodo recibe deltas de match-sim (±30), C11 (±8), C14 (±6 ±noise), C16b (±7). Delta máximo: +51 / −51 por tick. No hay rango [min, max] explícito. Añadir al NodeId catalog: `match_performance_index | [0-100] | 50` y documentar si hay cap de delta por tick.

**⚠️ C-07 — economy.md F1 carece de AC con cálculo por división**
Añadir: `"GIVEN D1 club (capacity=12000, TICKET_PRICE_BASE=18€), fan_attendance=80, ticket_price_index=50, is_home_match=1, THEN match_day_revenue ≈ 172.8 €K"`.

**⚠️ C-08 — cascade-engine.md carece de AC para ThresholdCrossing en mismo tick que PlayerDecision**
Falta AC para: "GIVEN corruption_exposure=79, WHEN PlayerDecision añade +2, THEN ThresholdCrossing BLOCKING en Paso 5 de ESTE tick (no el siguiente)."

---

## Game Design Issues

### Blocking (resolver antes del vertical slice)

**🔴 D-01 — Espiral negativa sin catch-up mechanic**
D3 economics en defaults producen ~−10.5 €K/semana. Starting balance 250 €K se agota en ~24 semanas. El préstamo (F6) añade ~11 €K/semana de cuota, agravando la espiral. No existe ningún mechanic que rompa el ciclo negativo excepto "ganar más partidos". OQ-ECO-02 reconoce este riesgo pero no tiene respuesta.
→ **Recomendación:** Añadir al menos un mecanismo de catch-up antes de que event-system.md se escriba: (a) loan amount más generoso en primer board meeting (LOAN_BUFFER_WEEKS = 8), o (b) evento de "Directiva congela nómina de emergencia" disponible solo la primera vez, o (c) opción de venta de infraestructura. Registrar la decisión en OQ-ECO-02.

**🔴 D-02 — Sin scaling de rivales por división**
match-simulation.md no define cómo se distribuyen los stats (skill, fitness, morale) de los equipos rivales por división. El simulador no puede producir dificultad consistente por división sin esta especificación.
→ **Recomendación:** Añadir en match-simulation.md o en league-system.md (cuando se escriba) una tabla de `opponent_skill_distribution_by_division`: D3 skill medio [40-60], D2 [50-70], D1 [60-80]. Puede ser un Quick Design Spec inmediato.

**🔴 D-03 — Groundskeeper dominant strategy: coste trivial vs beneficio mayor**
`BUDGET_EUR_K_AT_100[groundskeeper] = 0.9 €K/semana` (5.2% del coste total D3). Maximizar groundskeeper elimina la zona contraintuitiva C1b. Una vez descubierta, la respuesta óptima es bloquear el slider al 100 y nunca tocarlo. Viola P1 a largo plazo.
→ **Recomendación:** Aumentar `BUDGET_EUR_K_AT_100[groundskeeper]` de 0.9 a 2.5-3.0 €K/semana. Tuning knob — sin impacto en arquitectura.

**🔴 D-04 — Training sweet spot es solución estática post-descubrimiento**
C4 (parábola, sweet spot 40-60) enseña una contraintuitiva poderosa al principio. Pero una vez aprendida, "mantener en 50" es siempre óptimo. No hay escenario donde desviarse sea estratégicamente correcto. Viola P1 en el largo plazo.
→ **Recomendación:** Hacer el sweet spot dinámico: el óptimo cambia por temporada (pretemporada: 65-70, mid-season: 45-55) o es revelado parcialmente por un preparador físico de nivel alto (P3 connection).

### Warnings (deben abordarse, no bloquean escritura de GDDs)

**⚠️ D-05 — C6 tiene delay efectivo de 1 semana pese a estar marcado como delay:0**
Evaluation model: C6 (Step 2) lee prevState.mpi. match-sim mpi_delta se aplica en Step 3. fan_momentum reacciona siempre con 1 semana de retraso al resultado del partido. Puede ser intencional (fans leen la prensa la semana siguiente). Si no es intencional, requiere aplicar match-sim worldStateDeltas antes de Step 2.

**⚠️ D-06 — injury_risk no tiene edge de decay propio**
match-sim puede añadir hasta +15 por partido. C1b da −6/semana solo cuando el campo es excelente (>75). Sin campo excelente, injury_risk puede acumularse crónicamente. Añadir un edge de decay natural (similar a C18a para corruption_exposure): `delta_injury_risk = -K_ir_decay × injury_risk`.

**⚠️ D-07 — match_performance_index: posible double-counting**
match-sim incorpora field_quality (F3) y player_happiness (vía morale) en el resultado del partido → mpi_delta. Las cascadas C14 (field_quality → mpi) y C16b (player_happiness → mpi) TAMBIÉN escriben a mpi. Ambos factores afectan fan_momentum dos veces. Determinar si es intencional y documentarlo como nota de diseño.

**⚠️ D-08 — P1 débil en economy post-discovery**
Las decisiones clave de economy (firmar mejor sponsor, mantener ticket_price en ~50, evitar crisis) se vuelven mecánicas una vez que el ciclo es comprendido. No hay ongoing tinkering en economy post-discovery.
→ Considerar: variabilidad en ofertas de sponsors, o precio dinámico donde el mercado cambia por contexto (derbi local, etc.).

**⚠️ D-09 — Player attention budget en el límite**
Semana con partido: 6 vectores de atención simultáneos (resultado + mensajes staff + estado financiero + sliders + ThresholdCrossings + pausas). hud-ui.md debe implementar priorización: un solo mensaje del staff por tick (el de mayor urgencia), con inbox de mensajes diferidos para restantes ADVISORY.

**⚠️ D-10 — P2 no deliverable en MVP (conocido, scoped)**
"The World Is The Scoreboard" está deferred a v1.1+. El MVP no entregará esta promesa visual. Documentar en game-concept.md que el MVP scope cut afecta P2.

---

## Cross-System Scenario Issues

**Escenarios analizados: 4**

**⚠️ S-01 — Forfeit cascade spiral (match-sim + cascade + economy)**
Un único forfeit (squad_available_pct ≤ 63) puede desencadenar en 1-2 semanas: mpi_delta=−30 → C6 fan_momentum −28 → posible BLOCKING crossing de fan_momentum (si estaba cerca de 20) → board meeting forzado + economy sin taquilla esa semana. 3 sistemas producen consecuencias severas simultáneas de un único evento. El efecto compuesto puede parecer "injusto" en lugar de "emergente" para el jugador novel. No es un bug, pero hud-ui.md debe preparar messaging educativo para este escenario.

**⚠️ S-02 — Scandal timing ambiguity (cascade + economy)**
corruption_exposure > 80 se detecta en Step 5. Los deltas del escándalo (fan_momentum −30, scandal_fine) deben aplicarse... ¿en el mismo tick (special-casing Step 3 post-Step5) o en el siguiente tick? El edge case dice "al final de esa semana" pero el Step 3 ya corrió. Necesita clarificación en cascade-engine.md antes de implementar C18.

**ℹ️ S-03 — C15 delayed effects no cancelables (intencional, documentado)**
Effects ya encolados en DelayedEffectsBuffer no pueden cancelarse retroactivamente. Es una feature de diseño correcta que contribuye a P1. No requiere acción.

---

## GDDs Flagged for Revision

| GDD | Razón | Tipo | Prioridad |
|-----|-------|------|-----------|
| `match-simulation.md` | C-01: FSM corregido in-session; D-02: sin rival scaling | Consistency+Design | Blocking |
| `economy.md` | C-02: label corregido in-session; D-01: sin catch-up mechanic | Consistency+Design | Blocking |
| `cascade-engine.md` | C-03: Dependencies corregido in-session; D-03/D-04: dominant strategies | Consistency+Design | Blocking |

---

## Verdict: 🟡 CONCERNS

**Blocking issues encontrados: 6**
- 3 correcciones de documentación: **FIXED en esta sesión** (C-01, C-02, C-03)
- 3 decisiones de diseño pendientes: D-01 (catch-up mechanic), D-02 (rival scaling), D-03/D-04 (dominant strategies via tuning)

**Warnings encontrados: 11**
Deben abordarse antes del vertical slice pero no bloquean la escritura de los próximos GDDs (manager-rpg.md, staff-system.md, event-system.md).

**Required before re-run clean PASS:**
1. Resolver OQ-ECO-02 (catch-up mechanic — decisión de diseño)
2. Escribir Quick Design Spec de `opponent_skill_distribution_by_division`
3. Ajustar Tuning Knob: `BUDGET_EUR_K_AT_100[groundskeeper]` de 0.9 → 2.5-3.0 €K/sem
4. Decidir si C4 sweet spot debe hacerse dinámico (diseño) o dejarse como está (consciente de la limitación)
