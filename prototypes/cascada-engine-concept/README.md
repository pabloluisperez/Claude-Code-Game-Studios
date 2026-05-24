---
status: concluded
verdict: PROCEED
date: 2026-05-16
full-report: ./REPORT.md
---

# Cascada Engine — Concept Prototype

> **Status**: Concluded (2026-05-16) — Verdict **PROCEED**
> **Full report**: [REPORT.md](./REPORT.md)

## Hypothesis

Si el jugador ajusta variables opacas y ve efectos en cascada reportados vía mensajes contextualizados de empleados del club, querrá seguir experimentando voluntariamente — sin que nadie le explique qué hace cada slider.

**Success criterion**: ≥3 ajustes en variables distintas en 10 min sin pedir explicación del sistema.

## How to Run

Double-click `prototype.html` — standalone HTML, sin servidor, sin dependencias, sin build step. Funciona en cualquier navegador moderno.

## Status

**Concluded.** Hypothesis CONFIRMED. Findings incorporated into MVP GDDs:

- `design/gdd/cascade-engine.md` — fan momentum, contraintuitive cascades, narrative texture
- `design/gdd/economy.md` — momentum/inertia en pricing
- `design/gdd/event-system.md` — calendario predecible vs imprevisto
- `design/gdd/staff-system.md` + `manager-rpg.md` — staff-as-UI (recomienda valores)

## Key Findings (resumen)

1. **Verdict del jugador**: *"Super divertido"* — engagement confirmado.
2. **Cascadas contraintuitivas enganchan más** que las lineales (ej: demasiado descanso → peor física).
3. **Narrative texture es mecánica, no polish** — *"al bajar el catering se trajeron tappers los jugadores"* hace legible el efecto numérico.
4. **Delays multi-semana son feature, no fricción** — el jugador los percibe como capa estratégica.
5. **Refinement crítico**: cascada actual es Markov-1; producción debe ser path-dependent (fan momentum acumulado).
6. **Bridge descubierto**: staff es la interfaz natural del motor de cascadas → conecta con Manager-RPG.

Detalle completo, citas del playtest, y métricas en [REPORT.md](./REPORT.md).

## Do Not Extend

This prototype is **throwaway code**. Per `.claude/rules/prototype-code.md`:

- ❌ Never refactor `prototype.html` into production code
- ❌ Never import from `prototypes/` in `apps/`, `packages/`, or anywhere else
- ✅ Use REPORT.md findings to inform production GDDs and implementation
- ✅ Production cascade engine will be rewritten from scratch in `packages/shared/src/sim/` per ADR-003

The next concept-level validation is `/vertical-slice` — a production-quality end-to-end build (1 temporada, 1 club) before committing to full Production.
