# Playtest — Polish Sprint 12 #1 (Pablo solo)

**Date**: 2026-05-21
**Sprint**: 12 (Polish #3)
**Build**: post commit `122aad4` (mid-week pause + A11y P2 + UX polish batch)
**Player**: Pablo (solo dev, familiar con la mecánica)
**Duration target**: ~45 min
**Starting state**: Hércules CF, week 34 (clean boundary), Lunes 28 mar 2027

---

## Focus questions (a responder al final)

1. **Mid-week pause — finding E (playtest 2026-05-21 economy-tuning)**: ¿La nueva mecánica de "STOP event mid-week" cierra el dolor original — "las cosas deben poder pasar entre semana también, no solo findes"? ¿Se siente natural el halt + resume? ¿O sigue habiendo fricción?

2. **Foundation suficiente para Polish→Release**: Con esta sesión, ¿crees que el mid-week pause + orchestrator extraído + A11y completo dejan el juego en estado de poder ir a Release tras 1 sprint más? ¿O ves algo bloqueante todavía?

3. **Feel general**: ¿La sensación de "estar gestionando un club" mejora con la fecha precisa, la recaudación visible, el dropdown del usuario, el calendario con marker mid-week? ¿O alguna de estas adiciones se siente "de más"?

---

## Protocol

Tu carrera está en **Hércules CF, semana 34** lista para usar. Sugerencias para los próximos ~45 min:

### Recorrido sugerido (libre — adáptalo a lo que veas)

1. **5 min — Reconocimiento**: explora el dashboard. Mira el topbar (fecha larga), el hero (fecha + mid-week badge si aplica), el balance (k€ compacto), el dropdown del usuario.
2. **10 min — Avanzar varias semanas**: usa "Avanzar semana" 3-4 veces seguidas. Observa: ¿la animación del modal se siente bien? ¿El contraste de la píldora con la fecha funciona en todas las horas del día? Si aparece auto-pausa por titular, ¿cancela vs. continuar funciona? Si surge un STOP event natural (medical, finance), ¿el halt se siente integrado?
3. **10 min — Decisiones**: si surgen ofertas de patrocinio, decisiones de TV, mensajes urgentes del staff — actúa sobre ellos. ¿Las pantallas tienen la información que necesitas? ¿Algún caso donde "no sé qué hacer aquí"?
4. **10 min — A11y opcional**: si quieres profundizar, prueba navegar 100% por teclado durante 1-2 minutos. Tab + Enter + Escape. ¿Algún sitio donde te quedes atascado?
5. **10 min — Tu propia exploración**: lo que te llame la atención. Squad, staff, league, manager-rpg, calendar… libre.

---

## Notas de Pablo (transcritas)

### 🐛 Bugs / regressions

- **PT-1**: En Plantilla, al ordenar por Posición el orden es alfabético (DEF, DEL, MED, POR) — debe ser **POR → DEF → MED → DEL** (orden de campo). ✅ **FIXED en esta sesión.**
- **PT-2**: Match live — el botón "Reproducir en vivo" arranca automáticamente al mostrar la página (autoplay query); debería esperar a click explícito. El minuto durante el replay se ve pequeño — debe ser más prominente. ✅ **FIXED en esta sesión.**
- **PT-3**: Los resultados se muestran a veces como "mi equipo - rival" y otras como "casa - fuera" — inconsistente. Pablo: "siempre los resultados mostrar goles casa - goles fuera, intercambiarlo es confuso, como en dashboard resultado de partido". ✅ **FIXED en esta sesión.**

### 💭 Feel / UX — gaps grandes (Sprint 13 backlog)

- **PT-4** (BUG-PT-4): match live carece de 3 features del prototipo vertical slice:
  - Parada antes de evento importante
  - Confeti de gol
  - Posible intervención del VAR
- **PT-5** (BUG-PT-5): expulsión por roja no impide jugar el siguiente partido. Debería:
  - Roja directa por falta grave → 2-3 partidos de sanción
  - Doble amarilla → 1 partido

### ✨ Buenos momentos

- "Esto ya va guay" en respuesta a la pregunta 1 del foco — **el mid-week pause cierra el finding E**.
- Las mejoras de UX (fecha precisa, dropdown user, calendar mid-week marker, contrast píldora) "mejoran" el feel sin sobrar.

---

## Verdict (al final de la sesión)

### Mid-week pause cierra el finding E?
- [x] **Sí, completamente** — el dolor del playtest 2026-05-21 está resuelto
- [ ] Sí, parcialmente — el halt funciona pero falta X
- [ ] No — sigue habiendo el mismo problema, falta Y

**Notas**:
- Pablo dixit: "esto ya va guay" cuando se le preguntó por el finding E
- La cadena halt → resolución → resume se siente natural
- La píldora oscura del modal hace legible la fecha/reloj a cualquier hora

### Polish→Release readiness?
- [x] **READY WITH CONDITIONS** — falta cerrar 2 gaps grandes (PT-4 + PT-5) antes del Release
- [ ] READY — el siguiente sprint puede ser hardening + release prep
- [ ] NOT READY — todavía hay deuda funcional / de feel que justifica Sprint 13+ adicional

**Notas**:
- Sprint 12 cierra el debt arquitectural (mid-week pause + A11y completo)
- Sprint 13 debe traer PT-4 (match polish) + PT-5 (suspensión por roja) + soak test runner + Polish→Release gate-check
- Sprint 14 (opcional) hardening + release prep

### Bugs S1 (críticos, bloquean release)
- Ninguno.

### Bugs S2 (importantes, deberían fixarse pre-release)
- **BUG-PT-5**: red-card suspension not enforced (`production/qa/bugs/BUG-PT-5-red-card-suspension.md`)

### Bugs S3 (feature gap polish)
- **BUG-PT-4**: match live polish features missing (`production/qa/bugs/BUG-PT-4-match-live-polish-features.md`)

### Bugs S4 (quick wins, resueltos en sesión)
- PT-1 (squad sort), PT-2 (match auto-start + minuto), PT-3 (score casa-fuera) — todos fixados en commit post-playtest

---

## Métricas de la sesión

- Duración real: ~45 min (Part A + B + C)
- Semanas avanzadas: 1 + STOP halt mid-week + 1 resume completion
- Decisiones tomadas: 1 sintética (STOP resuelto por reset SQL)
- Auto-pausas disparadas: 1 (titular crítico durante walkthrough)
- STOP halts mid-week observados: 1 (sintético — Wednesday 24 mar)
- Crashes / errors visibles: 0

---

## Followups (acción después del playtest)

- [x] BUG-PT-4 → `production/qa/bugs/BUG-PT-4-match-live-polish-features.md`
- [x] BUG-PT-5 → `production/qa/bugs/BUG-PT-5-red-card-suspension.md`
- [x] PT-1 + PT-2 + PT-3 → fixados en commit post-playtest
- [x] Verdict mid-week → actualizar `production/qa/qa-signoff-sprint-12-2026-05-21.md` (12-4 → done)
- [x] Verdict Polish→Release → READY WITH CONDITIONS → Sprint 13 = gate prep + PT-4 + PT-5 + soak runner
