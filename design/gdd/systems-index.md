# Systems Index — Cascada FC

> Generado: 2026-05-16 · Última revisión: 2026-05-17 (scope summit) · Actualizar con cada nuevo GDD · Run `/review-all-gdds` al completar el set MVP.

## Scope (ver `scope-mvp.md`)

**MVP = 2 pilares**: Soccer Manager (A) + Manager-RPG (C). **DOM-only**. 8 GDDs.
**Deferred a v1.1+**: Mundo Isométrico Vivo (B), IA Narrativa Local (D). 3 GDDs.

## Instrucciones

- Añadir una fila por cada GDD al crearlo con `/design-system`
- Orden de diseño: Foundation → Core → Feature → Presentation → Polish
- Status: `Not Started` → `In Progress` → `In Review` → `Approved`
- Scope tag: `[MVP]` o `[v1.1+]` — GDDs `[v1.1+]` NO se escriben hasta MVP shipped

---

## Concept Document

| Documento | Status | Fecha | Notas |
| --------- | ------ | ----- | ----- |
| `game-concept.md` | **Approved** | 2026-05-16 | Prototype PROCEED validado · 4 design review blockers resueltos |

---

## Foundation Layer (implementar primero — de ellos depende todo)

| Sistema | GDD | Scope | Status | Bloqueado por | Descripción |
| ------- | --- | ----- | ------ | ------------- | ----------- |
| Motor de cascadas | `cascade-engine.md` | **[MVP]** | **Approved** | ADR-003 ✅ | R3 + cross-review fixes 2026-05-18: league-system añadido como writer en Interactions; fan_momentum recovery paths documentados; match-week guards C11/C14/C16b. |
| Simulación de partido | `match-simulation.md` | **[MVP]** | **Approved** | ADR-002 ✅ ADR-013 ✅ | /design-review R6 2026-05-18: APPROVED — 14 R5 blockers + 7 nuevos resueltos: F6 comment fixed, F5/Edge Case min P_attack→[0.0214,0.1812], tackle trigger opción-b, P_injury rival=50, COUNTER home→HTTP 400, worldStateDeltas/playerRatings Map→Record, Socket.IO MatchPauseEvent spec, BullMQ orphan-job guard, canonical query ORDER BY, recovery worker BullMQ `*/15` SKIP LOCKED, AC-28–32, AC header exception. Specialists: game-designer · systems-designer · qa-lead · web-backend-specialist · creative-director. |
| Economía del club | `economy.md` | **[MVP]** | **Approved** | cascade-engine.md ✅ | Cross-review fix 2026-05-18: scandal fine factor F8 1.0→0.667 (alineado con event-system F4c + registry [30,50€K]); nota de autoridad F6 añadida. |

---

## Core Layer

| Sistema | GDD | Scope | Status | Bloqueado por | Descripción |
| ------- | --- | ----- | ------ | ------------- | ----------- |
| Gestión de jugadores | `player-management.md` | **[MVP]** | **Approved** | match-simulation.md ✅ | /design-review R2 2026-05-18: APPROVED — 15 blockers resueltos (F2/F3/F6 rangos, F7 clamp, F8 forfeit threshold absoluto, F11 morale fórmula, F12 skill degradación, AC-PM-16 aritmética, +7 nuevos). 3 formaciones MVP, world-gen stub, OQ-02/04/05 resueltas. Specialists: game-designer, systems-designer, economy-designer, qa-lead, creative-director. |
| Manager RPG | `manager-rpg.md` | **[MVP]** | **Approved** | cascade-engine.md ✅, economy.md ✅ | /design-review R1 2026-05-18: APPROVED — 11 blockers resueltos (Página Manager P1 fix→staff observations, L4=Tier3+tabla corregida, L5=Director Comunicación, FA weekly multiplier, match_loss 2→5, AC-RPG-07/08/15, career event expirar penalties, OQ-01/03/05 resoluciones, man_management passive XP source). Specialists: game-designer · systems-designer · economy-designer · qa-lead · creative-director. |
| Sistema de Staff | `staff-system.md` | **[MVP]** | **Approved** | manager-rpg.md ✅ | /design-review R3 lean 2026-05-18: APPROVED — 2 blockers resueltos (F3 range [0.01–0.03]→[0.01–0.020] sincronizado con Tuning Knobs; AC-STAFF-15 umbral T2 de 0.06→0.03) + 3 recomendados (event-system.md stale note actualizada; MARKET_CANDIDATES default clarificado; "Detailed Design"→"Detailed Rules"). Sin especialistas (lean). |
| Progresión de ciudad | `city-progression.md` | `[v1.1+]` | Deferred | economy.md | 4 tiers con criterios de activación, assets por tier. **Deferred** por scope-mvp.md |

---

## Feature Layer

| Sistema | GDD | Scope | Status | Bloqueado por | Descripción |
| ------- | --- | ----- | ------ | ------------- | ----------- |
| Sistema de eventos | `event-system.md` | **[MVP]** | **Approved** | cascade-engine.md ✅ | Cross-review fix 2026-05-18: F4d referencia economy.md F6 como autoritativo; nota sobre resource flow entre BLOCKING secuenciales añadida; floor garantizado de "Campaña promocional" documentado. |
| IA narrativa | `narrative-ai.md` | `[v1.2+]` | Deferred | staff-system.md | llama.cpp server-side: resúmenes, rumores, prensa; AC de calidad output. **Deferred** por scope-mvp.md (spike llama.cpp pendiente) |
| Sistema de liga | `league-system.md` | **[MVP]** | **Approved** | match-simulation.md ✅ | 2 divisiones × 20 clubs reales (Primera/Segunda España), 38 matchdays, 3 asc/desc, derbis reales. ADR-011 requiere update (16→20 clubs). Datos reales = licencias pendientes. /design-review 2026-05-17: 18 bloqueantes resueltos (F3 iterativo, F4 ceiling, forfeit denominador, derby draw+1, 5 ACs nuevos, 6 UX blockers, OQ-LGS-06 contratos descenso). |

---

## Presentation Layer

| Sistema | GDD | Scope | Status | Bloqueado por | Descripción |
| ------- | --- | ----- | ------ | ------------- | ----------- |
| Mundo isométrico | `isometric-world.md` | `[v1.1+]` | Deferred | city-progression.md | Tile-based pixel art, state variants, day/night, animaciones. **Deferred** por scope-mvp.md |
| HUD y UI principal | `hud-ui.md` | **[MVP]** | **Approved** | Todos los Core GDDs ✅ | /design-review R3 lean 2026-05-18: APPROVED — 2 blockers (instrucciones radio buttons not combinable; COUNTER home no mostrar not desaconsejar) + AC-HUD-13 radio group semantics. Inconsistencias con match-simulation.md aprobado en la misma sesión. |

---

## ADRs escritos (status post-/architecture-review 2026-05-16 run 2)

| ADR | Status | Bloquea |
| --- | ------ | ------- |
| ADR-001: Web stack | **Accepted** | — |
| ADR-002: Determinismo del simulador | **Accepted** | match-simulation.md |
| ADR-003: Topología del grafo de cascadas | **Accepted** (revised — TickResult extended with thresholdCrossings per ADR-008) | cascade-engine.md |
| ADR-004: Arquitectura IA narrativa (llama.cpp) | **Accepted (deferred — v1.2+)** | narrative-ai.md |
| ADR-005: Persistencia WorldState + Save Game | **Accepted** | cascade-engine.md, economy.md |
| ADR-006: Renderizado isométrico PixiJS 8 | **Accepted (deferred — v1.1+)** | isometric-world.md, hud-ui.md (canvas frontier) |
| ADR-007: Sport-agnostic match simulation | **Accepted** | match-simulation.md |
| ADR-008: World Clock + Event Loop | **Accepted** | event-system.md, league-system.md, hud-ui.md |
| ADR-009: Staff Message Routing & Granularity | **Accepted** | staff-system.md, hud-ui.md |
| ADR-010: Manager-RPG Progression Model | **Accepted** | manager-rpg.md |
| ADR-011: League / Competition Schema | **Accepted** | league-system.md |
| ADR-012: UI Architecture (DOM ↔ Canvas Frontier) | **Accepted (MVP usa solo lado DOM)** | hud-ui.md, isometric-world.md (v1.1+) |

> **Sin ADR gaps arquitectónicos pendientes**. Próximo paso: escribir el primer system GDD MVP (`cascade-engine.md`).
> ADR-004 y ADR-006 quedan Accepted pero deferred — la implementación se desbloquea en v1.1+/v1.2+ según `scope-mvp.md` §7.1/§7.2.
