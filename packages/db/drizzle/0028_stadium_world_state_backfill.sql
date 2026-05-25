-- v1.1 Sprint 22 / Story STADIUM-UPGRADES-001
-- Idempotent backfill for existing world_snapshots rows.
-- The ALTER TABLE in 0027 added NOT NULL DEFAULT 0, so existing rows are already set.
-- This migration is a safety net for any edge case where columns somehow exist as NULL
-- (e.g., migration partially applied + retried). Safe to re-run.

UPDATE "world_snapshots"
SET
	"stadium_upgrade_count" = COALESCE("stadium_upgrade_count", 0),
	"training_facility_level" = COALESCE("training_facility_level", 0),
	"youth_academy_level" = COALESCE("youth_academy_level", 0)
WHERE
	"stadium_upgrade_count" IS NULL
	OR "training_facility_level" IS NULL
	OR "youth_academy_level" IS NULL;
