# Cross-GDD Review Report R2 — Cascada FC (Confirmación post-fixes)
**Fecha**: 2026-05-18
**GDDs revisados**: 9 sistemas + game-concept (10 total)
**Modo**: full (confirmation R2 — todos los fixes del R1 FAIL aplicados)

---

## Status de los 6 Blockers del R1

| Blocker R1 | Estado en R2 |
|-----------|-------------|
| B-01: F4d fórmula = F6 | ✅ RESUELTO — fórmula coincide; AC-EVT-28 28→27 €K también corregido |
| B-02: Forfeit pct ≤63% canónico | ✅ RESUELTO — player-management.md actualizado con SQUAD_REGISTERED_SIZE=25 fijo |
| B-03: financial_acumen lock at signing | ✅ RESUELTO |
| B-04: player_happiness F9b → B-06 nuevo | ⚠️ F9b añadida como delta (no absoluta) — resuelve B-06 |
| B-05: form/stamina ranges | ✅ RESUELTO |
| D-01: K_loss_base 8.0 / fan_momentum validation | ✅ RESUELTO — documentado como challenge intencional, no trap |

---

## Nuevo Blocker Encontrado y Resuelto en R2

🔴 **[B-06] F9b conflicto con C17 — RESUELTO**

La F9b añadida en R1 era una sobreescritura absoluta (`player_happiness = mean(morale)`). Esto sobreescribía el delta de C17 (`sponsor_quality → player_happiness`) en el mismo tick.

**Resolución aplicada**: F9b ahora es una PlayerDecision delta:
`player_happiness_delta = round(mean(morale for starting_11)) − prevState.player_happiness`

C17 (Paso 2), F9b y man_management (Paso 3) se acumulan aditivamente. Clampeado en Paso 4. Sin sobreescritura.

---

## Quick Fixes Aplicados en R2

- **W-NEW-01**: event-system.md AC-EVT-28 loan_amount 28→27 €K ✅
- **W-NEW-02**: entities.yaml effective_rating output_range [25,100]→[13,96] ✅
- **W-NEW-03**: player-management.md F8 denominator = `SQUAD_REGISTERED_SIZE=25` fijo (no squad_size dinámico); AC-PM-11 actualizado ✅

---

## Status de Issues Anteriores

| Issue | Nuevo estado |
|-------|-------------|
| W-05: scandal "cooperar" flat 30K vs F8 | ✅ CERRADO — 30 €K es el valor correcto de F8 en exposure=80 (el trigger point). Falso positivo del R1. |
| D-01: fan_momentum trap | ✅ RESUELTO — déficit ~28-40 pts/temporada es diseño intencional para 50% WR, documentado. |
| D-04: squad_morale:high_streak undefined | ✅ RESUELTO — F9b (delta) define la aggregation que permite el trigger. |
| W-04: "Reducir estructura staff" dep | STILL OPEN — OQ-EVT-01. No bloqueante para architecture. |
| W-08: ADR-011 16→20 clubs | STILL OPEN — Chore antes del epic de league-system. |
| W-10: hud-ui.md AC COUNTER home | STILL OPEN — Advisory. |

---

## Consistency Checks R2

### Blocking
Ninguno ✅

### Warnings (residuales documentados, no bloqueantes para architecture)
- W-04: event-system → staff-system dep (forced dismissal path) — OQ-EVT-01 open
- W-08: ADR-011 necesita update 16→20 clubs (chore antes del epic league-system)
- W-10: hud-ui.md missing AC: COUNTER hidden for home team

---

## Game Design Issues R2

### Blocking
Ninguno ✅

### Warnings residuales (expected, ya documentados)
- D-02: slider sweet spot post-discovery (intencional per P1)
- D-03: man_management XP time-gated (parcialmente mitigado con event sources activos)
- D-05: IA clubs static squads — scope intencional MVP
- D-06: 8 levers cognitivos (mitigado por staff-system inbox + 4 panels HUD)

### Nuevos warnings de diseño (bajos, advisory)
- financial_acumen holdout strategy: NO dominante (coste de slot vacío > beneficio del +12% FA)
- player_happiness lag de 1 semana sobre MPI via C16b (documentar en Edge Cases)

---

## GDDs Flagged for Revision

Ninguno — todos los blockers resueltos.

---

## Verdict: PASS

**0 blockers. Warnings menores documentados, ninguno bloquea architecture.**

El set completo de 9 GDDs MVP está internamente consistente y listo para /create-architecture.

### Próximos pasos recomendados:
1. ADR-013 sync chore (UNIQUE INDEX + PRNG Option A→B) — antes de /create-epics
2. ADR-011 update 16→20 clubs — antes del epic de league-system
3. /create-architecture o /create-epics según preferencia del equipo
