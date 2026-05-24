CREATE TABLE IF NOT EXISTS "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tier" integer NOT NULL,
	"weekly_eur_k" integer NOT NULL,
	"quality_contribution" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cancellation_reason" text,
	"started_week" integer NOT NULL,
	"ends_week" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sponsors_club_status" ON "sponsors" USING btree ("playthrough_id","club_id","status");