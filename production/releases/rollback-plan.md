# Rollback Plan — Total Soccer Manager v1.0

**Owner**: Pablo (solo dev)
**Last updated**: 2026-05-21 (Sprint 14, story 14-9)
**Status**: ACTIVE for v1.0 release window

This plan tells you exactly what to do — and what NOT to do — when a
post-release incident exceeds the in-place fix threshold. It assumes you
already have the artifacts from `production/releases/release-checklist.md`
§5 (Sentry, backups, secrets) in place.

---

## Decision matrix — fix-forward vs rollback

| Symptom | Severity | First response |
|---------|----------|----------------|
| Soft visual bug in one route | S3 | Fix-forward on next deploy. No rollback. |
| Save/load corrupts a single playthrough | S2 | Fix-forward + offer affected user a restore from backup. No rollback of the whole DB. |
| Auth broken for all users | S1 | **Rollback** within 60 minutes if no fast fix; otherwise post status + push targeted hotfix. |
| Match-simulation determinism broken (matches replay differently) | S1 | **Rollback** — every minute live amplifies divergence in playthroughs. |
| DB schema migration applied successfully but causes corruption | S1 | **Rollback CODE first** (revert app to previous tag); only restore DB from backup if data is unrecoverable. |
| Sentry shows >5% of users hitting unhandled error | S1 | **Rollback** if rate climbs after deploy moment. |
| Container/process crashes on boot post-deploy | S1 | **Rollback** immediately (auto-rollback if platform supports). |

**Target rollback time**: **< 60 minutes** from incident declaration to
production back on the prior tag.

---

## Pre-conditions checked at every release

Before tagging `vX.Y.Z`, confirm:

1. The previous tag (`v(X.Y.Z-1)` or last green tag) is still deployed
   somewhere or buildable from the tag.
2. A backup taken **immediately before** the deploy (NOT just the daily
   04:30 UTC backup) exists and was verified to restore in a throwaway DB.
   This is the "pre-deploy snapshot" — it is the rollback anchor.
3. The deploy platform (Railway / Fly.io / Render / VPS) has a clear path
   to re-deploy a prior tag — documented in `docs/runbooks/deploy.md`
   (TBD by ops).
4. Sentry has alerting on error rate > 5% for the 10 minutes post-deploy.

If any of these is not green, **DO NOT DEPLOY**.

---

## Procedure A — Code-only rollback (most common)

Use when: incident is in application code, DB schema is unchanged or the
new schema is forward-compatible with the previous app version.

1. **Declare incident** (Sentry alert or user report). Post status to the
   ops channel: "Incident, considering rollback to vX.Y.Z-1".
2. **Capture forensics**: copy current logs + Sentry incident link to
   `production/incidents/YYYY-MM-DD-HHMM-summary.md`.
3. **Re-deploy prior tag**:
   - Railway/Fly.io/Render: select the previous successful deploy in the
     dashboard and click "redeploy".
   - VPS: `git checkout vX.Y.Z-1 && pnpm install && pnpm build && pm2 restart`.
4. **Verify**:
   - `GET /health` returns 200.
   - Login + dashboard load.
   - Sentry error rate drops below 1%.
5. **Post-mortem** within 24h. Write to `production/postmortems/`.

Target: < 30 minutes for steps 3-4 on a managed platform.

---

## Procedure B — DB rollback (data corruption only)

Use ONLY when: data corruption is confirmed and a forward-fix cannot recover
the affected rows.

1. **Stop writes**: scale the app to 0 instances, or put it behind a
   maintenance page. New writes during restore = data divergence.
2. **Capture current state**: take a fresh `pg_dump` of the corrupted DB
   into a *separate* file — `pre-restore-corrupted-YYYY-MM-DD.dump`. Keep
   forensically.
3. **Restore into a FRESH database**:
   ```
   createdb smt_restored
   pg_restore --clean --if-exists --no-owner --no-privileges \
              --dbname=smt_restored \
              /path/to/last-good-pre-deploy-backup.dump
   ```
4. **Verify row counts** of `users`, `playthroughs`, `world_snapshots` in
   the restored DB against the daily backup table (expect ≤ 24h of loss).
5. **Flip `DATABASE_URL`**: change app env to point at `smt_restored`.
   Do NOT overwrite the corrupted DB in place — keep it for forensics.
6. **Restart app** + verify health.
7. **Communicate**: post-mortem MUST acknowledge any data loss between
   the backup snapshot and the corruption event.

Target: < 60 minutes — most time is the `pg_restore` for a populated DB.

---

## What NOT to do during a rollback

- **Do NOT** `git push --force` to fix history. The deployed tag is the
  immutable record.
- **Do NOT** edit production DB rows manually mid-incident — even to "fix
  one user". Restore from backup or write a script.
- **Do NOT** delete the corrupted DB. Keep it for at least 30 days for
  forensics + GDPR data-subject access requests.
- **Do NOT** skip the post-mortem. The next incident always builds on
  patterns from the last one.
- **Do NOT** disable Sentry to silence alarms. Lower the noise floor with
  filters, never the floor itself.

---

## Communication template

Status update for affected players (paste into a user-facing notice):

```
Estamos investigando un problema que afecta a [auth / partidos / dashboard].
Mientras tanto el juego puede estar [no disponible / con errores intermitentes].
Estamos trabajando en una solución. Próxima actualización en [10 / 30] min.
```

If a rollback happens with data loss:

```
Hemos restaurado el servicio desde una copia de seguridad de [hora del backup].
Cualquier progreso entre [hora del backup] y [hora del incidente] se ha perdido.
Lo sentimos profundamente. Detalles técnicos en [link al post-mortem].
```

---

## Asset attributions (release-checklist §3)

Para el MVP v1.0, los activos de terceros usados son:

| Asset | Uso | Origen | Licencia | Acción de atribución |
|-------|-----|--------|----------|----------------------|
| Lucide icons | Iconos UI (dashboard, sidebar, topbar) | https://lucide.dev | ISC | Atribución en pie de página /credits o en el README público |
| daisyUI | Componentes Tailwind | https://daisyui.com | MIT | Atribución no obligatoria; mencionar en colofón |
| Tailwind CSS | Sistema de utilidades CSS | https://tailwindcss.com | MIT | Atribución no obligatoria |
| SvelteKit | Framework | https://kit.svelte.dev | MIT | Atribución no obligatoria |
| Hono | API server | https://hono.dev | MIT | Atribución no obligatoria |

**Acción**: añadir a `production/releases/credits.md` (Sprint 14 follow-up
opcional) o exponer en `/credits` cuando se haga la landing page. Sin
imágenes ni audio de terceros en MVP — todo el contenido visual son emojis
del sistema operativo del cliente y texto.

---

## Sign-off

- Code rollback procedure (A): documented, ready.
- DB rollback procedure (B): documented, depends on operator having
  practiced a restore on the throwaway DB at least once (story 14-7
  runbook §Verification).
- Communication templates: documented.
- Asset attributions: documented.

**Go-live blocker**: at least one practice restore (procedure B steps 3-4)
must be executed and timed BEFORE v1.0 is tagged. Record the timing in
`production/qa/evidence/backup-restore-practice-pre-v1.0.md`.
