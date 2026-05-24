CREATE TABLE IF NOT EXISTS "tv_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"season" integer NOT NULL,
	"tier" text NOT NULL,
	"duration_seasons" integer NOT NULL,
	"season_in_contract" integer DEFAULT 1 NOT NULL,
	"weekly_rate_eur_k" numeric(10, 2) NOT NULL,
	"division_at_signing" text NOT NULL,
	"status" text DEFAULT 'NONE' NOT NULL,
	"signed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tv_contracts_playthrough_season_unique" UNIQUE("playthrough_id","season")
);
--> statement-breakpoint
ALTER TABLE "manager_profiles" ADD COLUMN "fan_loyalty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tv_contracts" ADD CONSTRAINT "tv_contracts_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_contracts_playthrough_status" ON "tv_contracts" USING btree ("playthrough_id","status");--> statement-breakpoint
-- Partial UNIQUE index on calendar_events: idempotent generation of tv_auction + tv_midseason_offer per (playthrough, season).
-- Per ADR-019 §6 — DB-level guard supplementing the application-level COUNT check in AC-TV-10.
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_tv_unique_per_season"
ON "calendar_events" ("playthrough_id", "season", "type")
WHERE "type" IN ('tv_auction', 'tv_midseason_offer');