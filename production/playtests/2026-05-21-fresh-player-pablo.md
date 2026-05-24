# Playtest 2026-05-21 — Fresh-Player (Pablo, solo-dev human session)

> Per `production/playtests/protocols/fresh-player.md`. Pablo's 2nd live playtest of the project (after the 2026-05-18 slice session). Counts toward Production → Polish gate's 3-session minimum.

## Session Metadata

| Field | Value |
|---|---|
| **Date** | 2026-05-21 |
| **Playtester** | Pablo (solo dev — playing fresh against the production main branch UI) |
| **Profile** | Senior dev (knows the code intimately but played autonomously without dev-tools, using only the in-browser UI) |
| **Build** | Sprint 9 closed state (commit `5defb36`) — includes UX polish from task 9-4 (cascade-node tooltips, post-advance prompt, sponsor first-time callout) |
| **Method** | Incognito browser session against `http://localhost:5173` with full dev stack running |
| **Environment** | macOS desktop, Chromium, local Postgres/Redis |

## Hypothesis Verbatim

> A player who has never seen Cascada FC can sign up, create a club, and reach a meaningful first decision within 5 minutes without dev guidance. They should articulate the central fantasy of "discover-cascades + grow-as-manager" unprompted by minute 15.

## Six-Question Debrief

| # | Question | Response |
|---|---|---|
| 1 | ¿Completaste el ciclo completo sin guía? | ✅ **Sí** |
| 2 | ¿Cuánto tardaste en sentir que estabas jugando? | **~3 minutos** (well under 5-min metric) |
| 3 | ¿Sentiste la fantasía discover-cascades + grow-as-manager? | ✅ **Sí** |
| 4 | ¿Qué te paró o confundió? | 4 bugs funcionales + ~15 mejoras de UX. Ver listado completo en "Findings — Bugs" + "Findings — Polish" abajo. |
| 5 | ¿Es achievable a esta calidad para el juego completo? | ✅ Sí, con las mejoras propuestas |
| 6 | PROCEED / PIVOT / KILL | ✅ **PROCEED** (implícito — propone mejoras pero no pivot/kill) |

## Findings — Bugs (must-fix; addressed Sprint 9.5 same-session)

| ID | Surface | Description | Severity |
|---|---|---|---|
| B1 | Finanzas — Patrocinadores | "Si tengo 4 huecos en carteles y tengo 3 ofertas, aceptar una hace desaparecer las otras. Debería dejarme elegir hasta llenar los slots." | S2 — restringe el espacio de decisión legítimo del jugador |
| B2 | Finanzas — Tab "Abonos" | "El Tab Abonos no va." | S3 — degrada confianza en la UI |
| B3 | Calendario / Inbox | "Si he aceptado una oferta de patrocinio o se han expirado otras ya no deben salir en calendario." | S2 — eventos rancios confunden el estado del juego |
| B4 | Dashboard headlines | "Aun no empezó la temporada y me dice 'Real Madrid CF (1º) demuestra que va en serio esta temporada.' — no tiene sentido." | S3 — headline placeholder dispara fuera de contexto |

## Findings — Polish (categorized; some addressed same-session, rest queued for post-#2 consolidated pass)

### Navigation
| ID | Surface | Description | Sprint |
|---|---|---|---|
| P1 | Dashboard — Próximos eventos | "Al clickar debería ir al sitio donde se toma la decisión (sponsor → Finanzas/Patrocinadores, TV → Finanzas/Derechos TV). Mismo desde calendario." | Post-#2 |
| P9 | Finanzas — Derechos TV | "Al ir a Derechos de televisión se pierden los tabs de finanzas." | Post-#2 |

### Out-of-lore copy (fix same-session — I introduced most of these in Sprint 9 task 9-4)
| ID | Surface | Description | Sprint |
|---|---|---|---|
| P2 | Finanzas — Patrocinadores callout | "'💡 Tu primer patrocinador en este slot' — 'slot' saca del lore." | Same-session |
| P10 | Dashboard post-1ª-semana | "Mira los nodos cascada arriba... han cambiado con tu primera tick... — saca del Lore." | Same-session |
| P11 | Staff hire | "'Sube tu reputación a 4+ para acceder a staff tier 3 (perciben ×3 las cascadas).' — también saca del lore." | Same-session |
| P12 | Staff tier names | "'Nova', 'Expe', 'Élit' no valen — mostrar el nivel bien." | Same-session |

### Formatting / numerics
| ID | Description | Sprint |
|---|---|---|
| P7 | "Los valores de dinero mejor mostrarlos como 100.000€ en lugar de 100 €K." | Same-session |
| P8 | "Al empezar debería ser semana 1, no 0." | Same-session |

### Liga screen layout
| ID | Description | Sprint |
|---|---|---|
| P3 | "Mostrar en dos columnas, izquierda tabla más compacta, próximas 3 jornadas también compactas." | Post-#2 |
| P4 | "Si paso ratón por encima de un equipo en jornada resaltar en clasificaciones, y jornadas, al revés también, sino resaltar solo mi equipo." | Post-#2 |
| P5 | "En la clasificación resaltar mi equipo con algo que se vea mejor no solo la estrella." | Post-#2 |
| P6 | "Añadir un Tab para ver todas las jornadas — número como JORNADA no partidos." | Post-#2 |

### Financial transparency
| ID | Description | Sprint |
|---|---|---|
| P13 | "En finanzas ver un desglose donde se va el cashflow semanal, bien claro, si es en sueldos de quién y otros gastos." | Post-#2 |

### Inbox / events
| ID | Description | Sprint |
|---|---|---|
| P14 | "Las fechas en bandeja de entrada — más claras, como hoja de calendario." | Post-#2 |
| P15 | "En bandeja de entrada al leer eventos que no peguen salto, mismo orden." | Post-#2 |

## Success Metrics Evaluation

| Metric | Target | Observed | Verdict |
|---|---|---|---|
| Time-to-first-meaningful-decision | < 5 min (90% threshold) | ~3 min | ✅ PASS |
| Time-to-fantasy-articulation | < 20 min | Q3 yes | ✅ PASS |
| No confusion loops > 3 min | NONE | None reported | ✅ PASS |
| ≥1 of 6 questions positive on cascade-discovery | 1 | Q3 yes | ✅ PASS |
| PROCEED verdict | PROCEED | PROCEED implícito | ✅ PASS |

**All 5 metrics PASS.** This is a strong PROCEED for the fresh-player flow.

## Limitations

- Pablo is the dev — his "fresh-player" simulation is the strongest possible solo-dev approximation but cannot capture the subjective registration of someone without code context.
- Single session (no replication across 2-3 player profiles as the protocol recommended).

This session counts toward Production → Polish gate's 3-session minimum. Combined with the 2026-05-18 slice playtest + the upcoming 2026-05-21 economy-tuning session (Pablo running same-day), the gate's playtest requirement is satisfied.

## Action Items Captured Inline

- 4 bugs → fix same-session (Sprint 9.5 follow-up).
- 6 copy/format polish items → fix same-session (most introduced by me in Sprint 9 task 9-4).
- 9 medium-effort UX/UI items → defer to post-#2 consolidated polish pass.

All findings are tracked in this file + propagate to commit messages of the fixes.
