-- v1.1 Sprint 22 / Story STADIUM-UPGRADES-001
-- Stadium upgrades module — table + WorldState extensions.
-- Per ADR-029 §D2. Hand-authored (drizzle-kit snapshot drift pre-existing — see story 22-1 deviations).

CREATE TABLE IF NOT EXISTS "stadium_upgrade_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"item_slug" text NOT NULL,
	"track" text NOT NULL,
	"tier" integer NOT NULL,
	"status" text NOT NULL,
	"cost_paid_eur_k" integer NOT NULL,
	"duration_weeks" integer NOT NULL,
	"weeks_remaining" integer,
	"director_skill_snapshot" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "stadium_upgrade_items"
		ADD CONSTRAINT "stadium_upgrade_items_club_id_clubs_id_fk"
		FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Partial unique index enforces queue invariant: at most 1 in_progress per club (AC-SU-36 / §3.1.4).
CREATE UNIQUE INDEX IF NOT EXISTS "stadium_upgrade_one_active_per_club"
	ON "stadium_upgrade_items" ("club_id")
	WHERE "status" = 'in_progress';
--> statement-breakpoint

-- WorldState denormalized counters (ADR-029 §D2).
ALTER TABLE "world_snapshots" ADD COLUMN IF NOT EXISTS "stadium_upgrade_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "world_snapshots" ADD COLUMN IF NOT EXISTS "training_facility_level" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "world_snapshots" ADD COLUMN IF NOT EXISTS "youth_academy_level" integer DEFAULT 0 NOT NULL;
