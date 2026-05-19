CREATE TABLE IF NOT EXISTS "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"season" integer NOT NULL,
	"type" text NOT NULL,
	"priority" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_pending_week" ON "calendar_events" USING btree ("playthrough_id","week","status");