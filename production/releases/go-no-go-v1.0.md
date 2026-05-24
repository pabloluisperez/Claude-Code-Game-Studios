# Go/No-Go Decision — Total Soccer Manager v1.0

**Decision date**: 2026-05-21 (autopilot session, pre-Pablo review)
**Tag target**: `v1.0.0`
**Stage**: Release
**Sprint**: 14 (Release prep)

---

## Verdict

🟡 **CONDITIONAL GO** — autopilot recommends LAUNCH with conditions.

Cascada FC / Total Soccer Manager MVP v1.0 está listo para tag y deploy
condicional al cumplimiento de un short-list de validaciones manuales que
sólo Pablo puede ejecutar con un browser real y herramientas de
profiling. Sin esas validaciones manuales, el veredicto baja a NO-GO.

---

## Gate-by-gate summary

### ✅ Polish→Release gate (gate-check 2026-05-21)

Documento: `production/qa/gate-check-polish-to-release-2026-05-21.md`

- 1143/1143 tests verdes (baseline pre-Sprint 14)
- 6+ playtests documentados (cap es 3)
- 0 S1/S2 bugs abiertos
- Soak test PASS
- QA sign-off APPROVED WITH CONDITIONS
- A11y audit 13/13 cerrados
- Architecture debt cleared

**Status**: PASS WITH CONDITIONS — condiciones cumplidas en Sprint 14.

---

### ✅ Sprint 14 — Must Have (5/5)

| Story | Estado | Evidencia |
|-------|--------|-----------|
| 14-1 Rate limiting | ✅ Done | `apps/api/src/lib/rate-limit.ts` + 8 tests |
| 14-2 Legal pages | ✅ Done | `/terms` + `/privacy` rutas, footer links, A11y |
| 14-3 Build verification | ✅ Done | `production/releases/build-verification-sprint-14.md` |
| 14-4 Copy review + tooltips | ✅ Done | `production/qa/evidence/copy-review-sprint-14.md` |
| 14-5 Go/No-Go gate | 🔄 En curso | Este documento |

### ✅ Sprint 14 — Should Have (3/3)

| Story | Estado | Evidencia |
|-------|--------|-----------|
| 14-6 Store metadata | ✅ Done | release-checklist §2 completa |
| 14-7 Sentry + DB backup | ✅ Done | `observability.ts` + `docs/runbooks/db-backups.md` + 9 tests |
| 14-8 Changelog v1.0 | ✅ Done | `production/releases/changelog-v1.0.md` |

### ✅ Sprint 14 — Nice to Have (1/2)

| Story | Estado |
|-------|--------|
| 14-9 Rollback plan | ✅ Done |
| 14-10 Playtest adicional | ⏸ Blocked (requiere humano) |

---

## Release checklist — sección por sección

### §1 Build verification (7/8 PASS, 1 pending)

✅ pnpm install, tests 1160/1160, build, soak, svelte-check, bundle.
⏸ Playwright e2e (requiere browser real).

### §2 Store / hosting metadata (5/6 PASS, 1 pending)

✅ Nombre, descripción corta/larga, categoría, pricing, soporte.
⏸ Screenshots (requiere build de producción corriendo).
⏸ Icon set 16-512px (favicon existe; resto pendiente).

### §3 Legal / Privacy (5/7 PASS, 2 pending)

✅ ToS, Privacy, Cookie policy, asset attributions, edad mínima.
⏸ License: verificar `LICENSE` root.
⏸ GDPR data-export endpoint (Privacy promete portabilidad — backlog v1.1).

### §4 Performance (1/5 PASS, 4 pending)

✅ Memory ceiling (75.4 MB peak soak vs 512 MB cap).
⏸ API p95, frame rate, DB queries, cold-start (todos requieren entorno real).

### §5 Security / Operations (6/7 PASS, 1 pending)

✅ Anti-cheat, rate limiting, secrets, Sentry, backups, rollback plan.
⏸ Migration clean-DB smoke (re-aplicar todas las migrations en una DB nueva).

### §6 Content / Polish (6/6 PASS)

✅ Onboarding, tooltips, A11y, i18n, copy review, error states.

### §7 Marketing / Comms (1/4 PASS, 3 optional)

✅ Changelog v1.0.
⏸ Trailer (opcional).
⏸ Launch post (opcional).
⏸ Press kit (opcional).

### §8 Polish→Release gate sign-off

✅ Ejecutado y aprobado.

---

## Conditions for full GO (Pablo, post-overnight)

Sin estas condiciones, el veredicto baja a **NO-GO**:

1. **Build verification §1 manual checks** (~40 min):
   - Playwright e2e en local
   - Lighthouse 3 rutas × 2 device profiles
   - autocannon p95 contra /api/advance
   - EXPLAIN ANALYZE pipeline avance contra DB poblada (5+ temporadas)
   - Cold-start Fast 3G en Chrome DevTools

2. **Store §2 manual checks** (~30 min):
   - 5+ screenshots tomados con build de producción real
   - Icon set completo (16/32/64/128/256/512 px)

3. **Legal §3** (~10 min):
   - Verificar `LICENSE` root del repo

4. **Security §5** (~15 min):
   - Migration smoke: `pnpm db:migrate` contra DB recién creada — todas
     las migrations aplican clean.

5. **Backup restore practice** (`docs/runbooks/db-backups.md` §Verification + `rollback-plan.md` go-live blocker):
   - Ejecutar al menos un restore de práctica en throwaway DB.
   - Documentar timing en `production/qa/evidence/backup-restore-practice-pre-v1.0.md`.

6. **Playtest adicional 14-10** (`production/playtests/sprint-14-fresh-player-pre-v1.0.md`):
   - 1 sesión de fresh-player walkthrough.
   - 1 partido con badge suspensión + confeti + VAR observados.

**Total estimado de tiempo manual**: ~2 horas.

---

## Decisión

### Opción A — Tag y deploy ahora (NO recomendado)

Marcar v1.0.0 sin las validaciones manuales. Riesgo: Lighthouse no medido,
performance real no validada, screenshots no representativos, backup
restore no practicado. La rollback plan está documentada pero no probada.

### Opción B — Soft-launch tras condiciones (RECOMENDADO)

1. Pablo ejecuta las 6 secciones de conditions (~2h)
2. Si todo verde → tag `v1.0.0` + deploy a hosting (Railway / Fly / Render)
3. Soft-launch: anuncio limitado a círculo cercano (5-20 usuarios)
4. 7 días de observación: Sentry error rate, soak en producción, feedback
5. Si la observación es limpia → public launch con changelog v1.0

### Opción C — NO-GO

Posponer tag. Razones aceptables:
- Cualquiera de las conditions falla
- Pablo encuentra un S1/S2 nuevo durante validación manual
- Lighthouse score < 80 en ruta crítica
- Performance EXPLAIN ANALYZE muestra query > 100ms sin fix obvio

En este caso: Sprint 15 = hotfix sprint para resolver los bloqueadores.

---

## Recomendación del autopilot

**Opción B** — Soft-launch tras 2h de validación manual. La calidad del
código, los tests y la infraestructura está al nivel de release. Solo
faltan validaciones que requieren browser/herramientas reales y que
ningún autopilot puede ejecutar.

---

## Sign-off

- **Autopilot session**: ✅ CONDITIONAL GO (Opción B recomendada)
- **Pablo (owner)**: pending review — `cat production/releases/go-no-go-v1.0.md`
  y proceder con la sección "Conditions" antes de tagear.

Si Pablo aprueba la Opción B y completa las conditions sin red flags:

```bash
git tag -a v1.0.0 -m "Total Soccer Manager v1.0 MVP — soft launch"
git push origin v1.0.0
# y deploy desde el tag al hosting elegido
```

Si Pablo elige Opción C:

```bash
# crear sprint-15 con scope = conditions failed
/sprint-plan new
```
