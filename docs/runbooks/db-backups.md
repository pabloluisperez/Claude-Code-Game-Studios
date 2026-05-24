# Database Backup Runbook

**Owner**: Pablo (ops)
**Last updated**: 2026-05-21 (Sprint 14 — Release prep)
**Related story**: 14-7

## Scope

Daily logical backups of the Postgres database that backs the production
Total Soccer Manager deployment. Backups are the basis for the rollback plan
(`production/releases/rollback-plan.md`).

## Tool

`pg_dump` shipped with the Postgres client (matches the server major version,
currently 17.x).

## What to back up

Everything in the application schema. Skip `pg_stat_statements` and similar
operational extensions.

```
pg_dump --format=custom --no-owner --no-privileges \
        --exclude-extension=pg_stat_statements \
        --file=/var/backups/smt/smt-YYYY-MM-DD.dump \
        "$DATABASE_URL"
```

Use `--format=custom` so `pg_restore` can do selective restores if needed.

## Schedule

- Daily at **04:30 UTC** (just after the daily world-tick BullMQ job at 04:00 UTC
  has run and committed).
- Retain: 14 daily backups + 1 weekly Sunday backup for 6 months.

The host can drive this via cron, systemd-timer, or the platform's managed
backup feature (Railway / Fly.io / Render all offer scheduled backups).

## Storage location

- Primary: encrypted S3-compatible object storage with versioning enabled.
- Secondary: a separate region or provider (durability).
- Local disk on the host is acceptable as a tier-3 cache only.

Set the storage object policy to **block public access** and require SSE-S3
or SSE-KMS encryption at rest.

## Verification (weekly)

Every Sunday after the new dump lands:

1. Spin up a throwaway Postgres instance (Docker locally is fine).
2. Run `pg_restore --dbname=postgres --clean --create dump-of-the-day.dump`.
3. Verify row counts of `users`, `playthroughs`, `world_snapshots` are within
   expected bounds.
4. Document the verification in `production/qa/evidence/backup-restore-YYYY-WW.md`.

A backup that was never restored is a backup that does not exist.

## Restore procedure (incident)

See `production/releases/rollback-plan.md`. Quick reference:

```
pg_restore --clean --create --dbname=postgres path/to/dump
```

Always restore into a fresh DB (`--create`), then flip the application's
`DATABASE_URL` to the restored DB rather than overwriting the live one in
place. This keeps a forensic copy of the corrupted state.

## Monitoring

- Alert if no backup landed in object storage for **>26h** (grace beyond the
  24h cadence).
- Alert if Sunday verification job exits non-zero.
- Alerts route to the same Sentry org as the application errors (story 14-7).
