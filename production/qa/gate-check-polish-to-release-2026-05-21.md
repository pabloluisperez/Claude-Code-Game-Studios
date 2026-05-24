# Gate Check — Polish → Release (2026-05-21)

**Verdict**: ✅ **PASS WITH CONDITIONS**

**Date**: 2026-05-21
**Run by**: autopilot session (Sprint 13 closeout)
**Current stage**: `Polish`
**Target stage**: `Release`

---

## Polish phase summary

3 sprints en fase Polish (Sprint 10 → Sprint 13). Cumulative growth:

| Sprint | Stories closed | Tests delta | Critical features shipped |
|--------|----------------|-------------|---------------------------|
| 10 | 5/6 | 998 (baseline) | Tick-model ADR-020 + difficulty curve + recovery levers + A11y audit + orchestrator extract (partial) |
| 11 | 4/5 | +48 (→ 1046) | Orchestrator full extract + A11y P1 batch + day-by-day foundation |
| 12 | 5/5 | +45 (→ 1091) | Mid-week pause + A11y P2 + Pablo playtest verdict READY WITH CONDITIONS |
| 13 | 7/7 | +52 (→ 1143) | Suspension + financial fix + match polish + soak runner + Polish→Release gate |

---

## Gate requirements (per gate-check protocol)

### 1. Tests verdes ✅
- 1143/1143 automated tests pass
- 0 type errors across 928 TypeScript files
- 5 deliberate `it.todo` items (all Sprint 12 deferrals closed in Sprint 13 task 13-6)

### 2. Playtests documentados ≥ 3 ✅ (exceeded — 6 documentados)
- 2026-05-18 slice (Pablo)
- 2026-05-21 fresh-player (Pablo)
- 2026-05-21 fresh-player (agent walkthrough)
- 2026-05-21 economy-tuning (Pablo)
- 2026-05-21 economy-tuning (agent paper-trace)
- 2026-05-21 polish-sprint-12 (Pablo — Polish #1 verdict READY WITH CONDITIONS)

### 3. No S1/S2 bugs abiertos ✅
- BUG-FIN-1 (S1) — ✅ CLOSED Sprint 13 task 13-2
- BUG-PT-5 (S2) — ✅ CLOSED Sprint 13 task 13-1
- BUG-PT-4 (S3) — ✅ CLOSED (parcial) Sprint 13 task 13-5
- Lista en `production/qa/bugs/`: 2 items, ambos marcados CLOSED

### 4. Soak test pass ✅
- `production/qa/soak-runs/2026-05-21-sprint13-validation/summary.md`
- 5 temporadas (190 ticks) ejecutadas
- 0.1s duration
- Peak RSS 74.4 MB (threshold 512 MB)
- 0 NaN/Infinity/exception
- Verdict: PASS

### 5. QA sign-off Sprint final ✅
- `production/qa/qa-signoff-sprint-13-2026-05-21.md` APPROVED WITH CONDITIONS

### 6. A11y audit complete ✅
- 13/13 findings cerrados (P0 + P1 + P2)
- WCAG 2.1 AA PASS scope (verificado Sprint 12 walkthrough)

### 7. Architecture debt cleared ✅
- Mid-week pause (ADR-020) — ✅ shipped Sprint 12 (STOP halt) + Sprint 13 (live DB integration)
- Orchestrator full extraction (Sprint 11 partial) — ✅ completed
- Day-by-day tick foundation — ✅ shipped Sprint 11 + Sprint 12

### 8. Release artifacts existen ⚠ (conditions)
- `production/releases/release-checklist.md` — ✅ DRAFT existe (Sprint 13 task 13-7)
- Build verification: pasa (Sprint 13 smoke)
- Store metadata: TBD — Sprint 14
- Legal/Privacy: TBD — Sprint 14
- Marketing materials: TBD — Sprint 14

---

## Conditions for full release (Sprint 14 scope)

1. **Release checklist completion** — rellenar 8 secciones esqueleto:
   - Store / hosting metadata (nombre, descripción, screenshots, pricing)
   - Legal / Privacy (ToS, Privacy Policy, asset attributions)
   - Performance final (Lighthouse, EXPLAIN ANALYZE de queries críticas)
   - Security / Operations (rate limiting, Sentry, backups)
   - Content / Polish (onboarding flow, tooltips, copy review)
   - Marketing / Comms (changelog v1.0, trailer opcional, launch post)
   - Polish→Release gate sign-off ✓ (este documento)
   - Go/No-Go decision

2. **Optional**: 1 playtest sesión adicional (foco: match polish + suspensión)

3. **Optional**: balance review formal (la soak validation cubre determinismo;
   un review manual del feel económico recomendable)

4. **Optional**: browser e2e expansion (happy-path covering suspension trigger
   + confeti visual)

---

## Decision

✅ **STAGE ADVANCE**: `Polish` → `Release`

Cascada FC MVP entra en stage **Release**. Sprint 14 (release prep) ejecutará
los items del checklist hasta el go-live decision. Sprint 15 (opcional)
arranca el plan de live-ops post-launch.

---

## Sign-off

- **Autopilot session**: ✅ stage advance approved
- **Pablo (owner)**: pending review (este documento queda committed para
  consultar antes de avanzar stage.txt; si Pablo aprueba, el siguiente paso
  es `echo "Release" > production/stage.txt` y arrancar Sprint 14 con
  `/sprint-plan new`)
